import { existsSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { loadConfig } from '../lib/config.js';
import { VanishClient } from '../lib/api-client.js';
import { copyToClipboard } from '../lib/clipboard.js';
import { Spinner, formatBytes } from '../lib/progress.js';

export interface UploadOptions {
  json?: boolean;
  md?: boolean;
  clipboard?: boolean;
  days?: number;
}

export async function uploadCommand(files: string[], options: UploadOptions): Promise<void> {
  if (files.length === 0) {
    console.error('Error: No files specified');
    process.exit(1);
  }

  // Resolve and validate all files first
  const resolvedFiles = files.map(f => resolve(f));
  for (const file of resolvedFiles) {
    if (!existsSync(file)) {
      console.error(`Error: File not found: ${file}`);
      process.exit(1);
    }
    const stat = statSync(file);
    if (!stat.isFile()) {
      console.error(`Error: Not a file: ${file}`);
      process.exit(1);
    }
  }

  const config = loadConfig();
  const client = new VanishClient(config);
  const results = [];
  const shouldCopy = options.clipboard !== false; // default: true

  for (let i = 0; i < resolvedFiles.length; i++) {
    const file = resolvedFiles[i];
    const name = basename(file);
    const size = statSync(file).size;

    const spinner = new Spinner(
      resolvedFiles.length > 1
        ? `Uploading ${name} (${formatBytes(size)}) [${i + 1}/${resolvedFiles.length}]`
        : `Uploading ${name} (${formatBytes(size)})`
    );

    try {
      spinner.start();
      const result = await client.upload(file, { days: options.days });
      spinner.stop();
      results.push(result);

      if (!options.json) {
        if (options.md) {
          console.log(`![${result.filename}](${result.url})`);
        } else {
          console.log(result.url);
        }
      }
    } catch (err) {
      spinner.stop();
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error uploading ${name}: ${message}`);
      process.exit(1);
    }
  }

  if (options.json) {
    console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  }

  // Copy last URL to clipboard
  if (shouldCopy && results.length > 0 && !options.json) {
    const lastUrl = options.md
      ? `![${results[results.length - 1].filename}](${results[results.length - 1].url})`
      : results[results.length - 1].url;
    const copied = copyToClipboard(lastUrl);
    if (copied) {
      process.stderr.write('Copied to clipboard.\n');
    }
  }

  // Hint about login if anonymous
  if (!config.api_key && !options.json) {
    const expiry = results[0]?.expires;
    if (expiry) {
      const hours = Math.round((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60));
      process.stderr.write(`Expires in ${hours}h (images only). Login for 48h + all file types: vanish login\n`);
    }
  }
}
