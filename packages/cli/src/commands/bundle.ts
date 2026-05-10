import { existsSync, statSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import type { CreateBundleResult } from '../lib/api-client.js';
import { loadConfig } from '../lib/config.js';
import { VanishClient } from '../lib/api-client.js';
import { copyToClipboard } from '../lib/clipboard.js';
import { Spinner, formatBytes } from '../lib/progress.js';
import { fail, failWithUnknownError } from '../lib/output.js';

export interface BundleOptions {
  json?: boolean;
  clipboard?: boolean;
  days?: number;
  idempotencyKey?: string;
  name?: string;
}

interface BundleFile {
  absPath: string;
  bundlePath: string;
  size: number;
}

export async function bundleCommand(files: string[], options: BundleOptions): Promise<void> {
  if (files.length === 0) {
    fail('Error: No files specified', options, 'missing_files');
  }

  const bundleFiles = files.map(file => {
    const absPath = resolve(file);
    try {
      if (!existsSync(absPath)) {
        fail(`Error: File not found: ${absPath}`, options, 'file_not_found');
      }
      const stat = statSync(absPath);
      if (!stat.isFile()) {
        fail(`Error: Not a file: ${absPath}`, options, 'not_a_file');
      }
      return {
        absPath,
        bundlePath: toBundlePath(file, absPath),
        size: stat.size,
      };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('exit ')) {
        throw err;
      }
      fail(
        `Error: Failed to read file metadata for ${absPath}: ${err instanceof Error ? err.message : String(err)}`,
        options,
        'file_stat_failed',
      );
    }
  });

  const seenPaths = new Set<string>();
  for (const file of bundleFiles) {
    if (seenPaths.has(file.bundlePath)) {
      fail(`Error: Duplicate bundle path: ${file.bundlePath}`, options, 'duplicate_bundle_path');
    }
    seenPaths.add(file.bundlePath);
  }

  const totalBytes = bundleFiles.reduce((sum, file) => sum + file.size, 0);
  const config = loadConfig();
  const client = new VanishClient(config);
  const spinner = new Spinner(`Creating bundle (${bundleFiles.length} files, ${formatBytes(totalBytes)})`);
  let draft: CreateBundleResult | null = null;

  try {
    spinner.start();
    draft = await client.createBundle({
      name: options.name || buildBundleName(bundleFiles),
      fileCount: bundleFiles.length,
      totalBytes,
      days: options.days,
    }, {
      idempotencyKey: options.idempotencyKey ? `${options.idempotencyKey}:bundle` : undefined,
    });

    for (let i = 0; i < bundleFiles.length; i++) {
      const file = bundleFiles[i];
      spinner.update(`Uploading ${file.bundlePath} (${i + 1}/${bundleFiles.length})`);
      await client.uploadBundleFile(draft.id, draft.token, file.absPath, file.bundlePath);
    }

    spinner.update('Publishing bundle');
    const published = await client.publishBundle(draft.id, draft.token, options.idempotencyKey
      ? { idempotencyKey: `${options.idempotencyKey}:publish` }
      : undefined);
    spinner.stop();

    const result = {
      url: published.url,
      id: published.id,
      size: published.size,
      fileCount: published.fileCount,
      expires: published.expires,
      expiresInHours: published.expires ? hoursUntil(published.expires) : null,
      deleteCommand: config.api_key ? `curl -X DELETE -H "Authorization: Bearer $VANISH_API_KEY" ${config.api_url}/bundles/${published.id}` : undefined,
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(published.url);
    }

    if (options.clipboard !== false && !options.json) {
      const copied = copyToClipboard(published.url);
      if (copied) {
        process.stderr.write('Copied to clipboard.\n');
      }
    }
  } catch (err) {
    spinner.stop();
    if (draft) {
      try {
        await client.deleteBundle(draft.id, draft.token);
      } catch {
        // Best effort cleanup. Expiry cleanup handles leftovers.
      }
    }
    failWithUnknownError(err, options);
  }
}

function buildBundleName(files: BundleFile[]): string {
  if (files.length === 1) {
    return files[0].bundlePath;
  }

  return `${files[0].bundlePath} + ${files.length - 1} more`;
}

function toBundlePath(inputPath: string, absPath: string): string {
  if (isAbsolute(inputPath)) {
    return basename(absPath);
  }

  let path = inputPath.trim().replaceAll('\\', '/');
  while (path.startsWith('./')) {
    path = path.slice(2);
  }

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some(segment => segment === '.' || segment === '..')) {
    return basename(absPath);
  }

  return segments.join('/');
}

function hoursUntil(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60)));
}
