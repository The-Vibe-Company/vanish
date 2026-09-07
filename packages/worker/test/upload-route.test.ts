import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';
import type { Env, Upload } from '../src/types.js';

describe('upload and serve routes', () => {
  let db: UploadDB;
  let bucket: UploadBucket;
  let env: Env;

  beforeEach(() => {
    db = new UploadDB();
    bucket = new UploadBucket();
    env = {
      DB: db as unknown as D1Database,
      BUCKET: bucket as unknown as R2Bucket,
      BASE_URL: 'https://vanish.sh',
      SELF_HOSTED: 'false',
      DEFAULT_TIER: 'free',
    };
  });

  it('serves temporary uploads with noindex and abuse headers', async () => {
    const upload = await request(env, '/upload', {
      method: 'POST',
      headers: {
        'X-Filename': 'preview.png',
        'Content-Type': 'application/octet-stream',
      },
      body: 'png',
    });
    expect(upload.status).toBe(201);
    const created = await upload.json() as { id: string; tier: string; deletable: boolean };
    expect(created).toMatchObject({ tier: 'anonymous', deletable: false });
    expect(bucket.lastPutWasStream).toBe(true);

    const served = await request(env, `/f/${created.id}.png`);

    expect(served.status).toBe(200);
    expect(served.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
    expect(served.headers.get('Link')).toContain('mailto:abuse@vanish.sh');
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await served.text()).toBe('png');
  });

  it('serves active content uploads as attachments', async () => {
    const upload = await request(env, '/upload', {
      method: 'POST',
      headers: {
        'X-Filename': 'vector.svg',
        'Content-Type': 'application/octet-stream',
      },
      body: '<svg></svg>',
    });
    expect(upload.status).toBe(201);
    const created = await upload.json() as { id: string };

    const served = await request(env, `/f/${created.id}.svg`);

    expect(served.status).toBe(200);
    expect(served.headers.get('Content-Disposition')).toContain('attachment;');
  });

  it('rejects an oversized upload from Content-Length before writing to R2', async () => {
    const response = await request(env, '/upload', {
      method: 'POST',
      headers: {
        'X-Filename': 'preview.png',
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(300 * 1024 * 1024 + 1),
      },
      body: 'png',
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: 'file_too_large', maxBytes: 300 * 1024 * 1024 });
    expect(bucket.objects.size).toBe(0);
  });

  it('requires Content-Length before streaming an upload', async () => {
    const response = await worker.fetch(new Request('https://vanish.sh/upload', {
      method: 'POST',
      headers: {
        'X-Filename': 'preview.png',
        'Content-Type': 'application/octet-stream',
      },
      body: 'png',
    }), env, {
      waitUntil: () => undefined,
      passThroughOnException: () => undefined,
    } as unknown as ExecutionContext);

    expect(response.status).toBe(411);
    expect(await response.json()).toMatchObject({ code: 'length_required' });
    expect(bucket.objects.size).toBe(0);
  });

  it('serves document uploads as original bytes for browser navigations', async () => {
    const body = await new Response('%PDF-1').arrayBuffer();
    const expiresAt = '2030-01-02T03:04:05.000Z';
    bucket.objects.set('doc123', { body, contentType: 'application/pdf' });
    db.uploads.set('doc123', {
      id: 'doc123',
      user_id: 'user1',
      filename: 'report.pdf',
      content_type: 'application/pdf',
      size_bytes: body.byteLength,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
      deleted_at: null,
    });

    const viewer = await request(env, '/f/doc123.pdf', {
      headers: browserHeaders(),
    });

    expect(viewer.status).toBe(200);
    expect(viewer.headers.get('Content-Type')).toContain('application/pdf');
    expect(viewer.headers.get('Vary')).toBeNull();
    expect(await viewer.text()).toBe('%PDF-1');
  });
});

function request(env: Env, path: string, init?: RequestInit) {
  return worker.fetch(new Request(`https://vanish.sh${path}`, withContentLength(init)), env, {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext);
}

function withContentLength(init?: RequestInit): RequestInit | undefined {
  if (!init?.body) return init;
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Length') && typeof init.body === 'string') {
    headers.set('Content-Length', String(new TextEncoder().encode(init.body).byteLength));
  }
  return { ...init, headers };
}

function browserHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    ...headers,
  };
}

class UploadBucket {
  objects = new Map<string, { body: ArrayBuffer; contentType?: string }>();
  lastPutWasStream = false;

  async put(key: string, body: ArrayBuffer | ReadableStream<Uint8Array>, options?: R2PutOptions): Promise<void> {
    this.lastPutWasStream = body instanceof ReadableStream;
    this.objects.set(key, {
      body: await new Response(body).arrayBuffer(),
      contentType: options?.httpMetadata?.contentType,
    });
  }

  async get(key: string): Promise<{ body: ReadableStream | null } | null> {
    const object = this.objects.get(key);
    if (!object) return null;
    return { body: new Response(object.body).body };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

class UploadDB {
  uploads = new Map<string, Upload>();
  rateLimits: Array<{ identifier: string; action: string }> = [];

  prepare(sql: string): UploadStatement {
    return new UploadStatement(this, sql);
  }
}

class UploadStatement {
  private args: unknown[] = [];

  constructor(private db: UploadDB, private sql: string) {}

  bind(...args: unknown[]): UploadStatement {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const sql = normalizeSql(this.sql);

    if (sql.includes('FROM api_keys ak JOIN users u')) {
      return null;
    }

    if (sql.includes('SELECT COUNT(*) as count FROM rate_limits')) {
      const [identifier, action] = this.args as [string, string];
      return { count: this.db.rateLimits.filter(r => r.identifier === identifier && r.action === action).length } as T;
    }

    if (sql.includes('SELECT * FROM uploads WHERE id = ?')) {
      const [id] = this.args as [string];
      return (this.db.uploads.get(id) || null) as T | null;
    }

    throw new Error(`Unhandled first query: ${sql}`);
  }

  async run(): Promise<void> {
    const sql = normalizeSql(this.sql);

    if (sql.includes('INSERT INTO rate_limits')) {
      const [identifier, action] = this.args as [string, string];
      this.db.rateLimits.push({ identifier, action });
      return;
    }

    if (sql.includes('INSERT INTO uploads')) {
      const [id, userId, filename, contentType, sizeBytes, expiresAt] = this.args as [
        string,
        string | null,
        string,
        string,
        number,
        string,
      ];
      this.db.uploads.set(id, {
        id,
        user_id: userId,
        filename,
        content_type: contentType,
        size_bytes: sizeBytes,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        deleted_at: null,
      });
      return;
    }

    if (sql.includes('UPDATE uploads SET deleted_at')) {
      const [id] = this.args as [string];
      const upload = this.db.uploads.get(id);
      if (upload) upload.deleted_at = new Date().toISOString();
      return;
    }

    throw new Error(`Unhandled run query: ${sql}`);
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}
