import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import bundleRoutes from '../src/routes/bundles.js';
import type { Bundle, Env } from '../src/types.js';

describe('bundle file uploads', () => {
  it('streams a sized anonymous bundle file to R2', async () => {
    const bundle = anonymousBundle();
    const bucket = new BundleBucket();
    const env = bundleEnv(bundle, bucket);

    const response = await bundleApp().fetch(new Request(`https://vanish.sh/bundles/${bundle.id}/files?path=preview.png`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': '3',
        'X-Bundle-Token': bundle.upload_token!,
      },
      body: 'png',
    }), env, executionContext());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, path: 'preview.png', size: 3 });
    expect(bucket.lastPutWasStream).toBe(true);
    expect(bucket.lastSize).toBe(3);
  });

  it('rejects an oversized anonymous bundle file before writing to R2', async () => {
    const bundle = anonymousBundle();
    const bucket = new BundleBucket();
    const env = bundleEnv(bundle, bucket);

    const response = await bundleApp().fetch(new Request(`https://vanish.sh/bundles/${bundle.id}/files?path=preview.png`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(300 * 1024 * 1024 + 1),
        'X-Bundle-Token': bundle.upload_token!,
      },
      body: 'png',
    }), env, executionContext());

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: 'file_too_large', maxBytes: 300 * 1024 * 1024 });
    expect(bucket.lastPutWasStream).toBe(false);
  });
});

function bundleApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => {
    c.set('user', null);
    c.set('tier', 'anonymous');
    await next();
  });
  app.route('/', bundleRoutes);
  return app;
}

function anonymousBundle(): Bundle {
  return {
    id: 'bundle123',
    user_id: null,
    name: 'screenshots',
    upload_token: 'vnbd_test',
    size_bytes: 0,
    file_count: 0,
    expected_file_count: 1,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    published_at: null,
    created_at: new Date().toISOString(),
    deleted_at: null,
  };
}

function bundleEnv(bundle: Bundle, bucket: BundleBucket): Env {
  return {
    DB: new BundleDB(bundle) as unknown as D1Database,
    BUCKET: bucket as unknown as R2Bucket,
    BASE_URL: 'https://vanish.sh',
    SELF_HOSTED: 'false',
    DEFAULT_TIER: 'free',
  };
}

function executionContext(): ExecutionContext {
  return {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext;
}

class BundleBucket {
  lastPutWasStream = false;
  lastSize = 0;

  async put(_key: string, body: ReadableStream<Uint8Array>): Promise<void> {
    this.lastPutWasStream = body instanceof ReadableStream;
    this.lastSize = (await new Response(body).arrayBuffer()).byteLength;
  }

  async delete(): Promise<void> {}
}

class BundleDB {
  constructor(private bundle: Bundle) {}

  prepare(sql: string): BundleStatement {
    return new BundleStatement(this.bundle, sql);
  }

  async batch(): Promise<Array<{ meta: { changes: number } }>> {
    return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }];
  }
}

class BundleStatement {
  constructor(private bundle: Bundle, private sql: string) {}

  bind(): BundleStatement {
    return this;
  }

  async first<T>(): Promise<T | null> {
    const normalized = this.sql.replace(/\s+/g, ' ');
    if (normalized.includes('FROM bundles') && normalized.includes('WHERE id = ?')) {
      return this.bundle as T;
    }
    if (normalized.includes('FROM bundle_files')) {
      return null;
    }
    throw new Error(`Unhandled query: ${normalized}`);
  }
}
