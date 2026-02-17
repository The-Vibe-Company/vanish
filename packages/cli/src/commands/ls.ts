import { loadConfig } from '../lib/config.js';

interface UploadItem {
  id: string;
  filename: string;
  size_bytes: number;
  url: string;
  expires_at: string | null;
  created_at: string;
  expired: boolean;
}

export async function lsCommand(options: { json?: boolean }): Promise<void> {
  const config = loadConfig();

  if (!config.api_key) {
    console.error('Not logged in. Use `vanish login` first.');
    process.exit(1);
  }

  try {
    const response = await fetch(`${config.api_url}/uploads`, {
      headers: { Authorization: `Bearer ${config.api_key}` },
    });

    if (!response.ok) {
      const err = await response.json() as { error: string };
      console.error(`Error: ${err.error}`);
      process.exit(1);
    }

    const data = await response.json() as { uploads: UploadItem[] };

    if (options.json) {
      console.log(JSON.stringify(data.uploads, null, 2));
      return;
    }

    if (data.uploads.length === 0) {
      console.log('No uploads found.');
      return;
    }

    // Simple table output
    console.log(`${'ID'.padEnd(14)} ${'FILENAME'.padEnd(30)} ${'SIZE'.padEnd(10)} ${'EXPIRES'.padEnd(22)} URL`);
    console.log('-'.repeat(100));

    for (const u of data.uploads) {
      const size = formatBytes(u.size_bytes);
      const expires = u.expires_at
        ? new Date(u.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'never';
      const filename = u.filename.length > 28 ? u.filename.slice(0, 25) + '...' : u.filename;

      console.log(`${u.id.padEnd(14)} ${filename.padEnd(30)} ${size.padEnd(10)} ${expires.padEnd(22)} ${u.url}`);
    }

    console.log(`\n${data.uploads.length} upload(s)`);
  } catch (err) {
    console.error('Failed to connect:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
