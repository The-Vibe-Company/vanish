import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute, relative, resolve } from 'node:path';
import type { CreateSiteResult } from '../lib/api-client.js';
import { loadConfig } from '../lib/config.js';
import { VanishClient } from '../lib/api-client.js';
import { copyToClipboard } from '../lib/clipboard.js';
import { Spinner, formatBytes } from '../lib/progress.js';

const ANONYMOUS_SITE_MAX_BYTES = 10 * 1024 * 1024;
const BLOCKED_SITE_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr',
  '.sh', '.bash', '.ps1', '.psm1',
]);

export interface SiteOptions {
  root?: string;
  slug?: string;
  json?: boolean;
  clipboard?: boolean;
  days?: number;
}

interface SiteFile {
  absPath: string;
  sitePath: string;
  size: number;
}

export async function siteCommand(folder: string, options: SiteOptions): Promise<void> {
  const folderPath = resolve(folder);

  if (!existsSync(folderPath)) {
    console.error(`Error: Folder not found: ${folderPath}`);
    process.exit(1);
  }

  const folderStat = statSync(folderPath);
  if (!folderStat.isDirectory()) {
    console.error(`Error: Not a folder: ${folderPath}`);
    process.exit(1);
  }

  if (!options.root) {
    console.error('Error: --root is required, for example: vanish site ./demo --root index.html');
    process.exit(1);
  }

  const rootPath = normalizeCliPath(options.root);
  if (!rootPath) {
    console.error('Error: --root must be a relative file path inside the site folder');
    process.exit(1);
  }

  const rootAbs = resolve(folderPath, rootPath);
  if (!isInside(folderPath, rootAbs) || !existsSync(rootAbs) || !statSync(rootAbs).isFile()) {
    console.error(`Error: Root file not found inside folder: ${rootPath}`);
    process.exit(1);
  }

  let files: SiteFile[];
  try {
    files = collectFiles(folderPath);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (!files.some(file => file.sitePath === rootPath)) {
    console.error(`Error: Root file is not included in site files: ${rootPath}`);
    process.exit(1);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const config = loadConfig();
  const client = new VanishClient(config);

  if (!config.api_key) {
    if (options.slug) {
      console.error('Error: --slug requires a Pro account. Login and upgrade with: vanish login && vanish upgrade');
      process.exit(1);
    }
    if (options.days) {
      console.error('Error: --days requires a Pro account. Login and upgrade with: vanish login && vanish upgrade');
      process.exit(1);
    }
    if (totalBytes > ANONYMOUS_SITE_MAX_BYTES) {
      console.error(`Error: Anonymous sites are limited to ${formatBytes(ANONYMOUS_SITE_MAX_BYTES)}. This folder is ${formatBytes(totalBytes)}.`);
      process.exit(1);
    }
  } else {
    try {
      const me = await client.me();
      const maxSiteSize = me.limits.maxSiteSize ?? me.limits.maxTotalStorage ?? me.limits.maxFileSize;
      if (maxSiteSize && totalBytes > maxSiteSize) {
        console.error(`Error: Site too large for ${me.tier}. Max ${formatBytes(maxSiteSize)}, folder is ${formatBytes(totalBytes)}.`);
        process.exit(1);
      }
      if ((options.slug || options.days) && me.tier !== 'pro') {
        console.error(`Error: ${options.slug ? '--slug' : '--days'} requires a Pro account. Current tier: ${me.tier}.`);
        process.exit(1);
      }
      if (me.limits.maxTotalStorage && me.stats.total_bytes + totalBytes > me.limits.maxTotalStorage) {
        console.error(
          `Error: Storage quota exceeded. ${formatBytes(me.stats.total_bytes)} used of ${formatBytes(me.limits.maxTotalStorage)}; ` +
          `this site adds ${formatBytes(totalBytes)}.`,
        );
        process.exit(1);
      }
    } catch (err) {
      if (options.slug || options.days || totalBytes > ANONYMOUS_SITE_MAX_BYTES) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    }
  }

  const spinner = new Spinner(`Creating site (${files.length} files, ${formatBytes(totalBytes)})`);
  const shouldCopy = options.clipboard !== false;
  let draft: CreateSiteResult | null = null;

  try {
    spinner.start();
    draft = await client.createSite({
      name: basename(folderPath),
      rootPath,
      fileCount: files.length,
      totalBytes,
      slug: options.slug,
      days: options.days,
    });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      spinner.update(`Uploading ${file.sitePath} (${i + 1}/${files.length})`);
      await client.uploadSiteFile(draft.id, draft.token, file.absPath, file.sitePath);
    }

    spinner.update('Publishing site');
    const published = await client.publishSite(draft.id, draft.token);
    spinner.stop();

    const result = {
      url: published.url,
      id: published.id,
      rootPath: published.rootPath,
      size: published.size,
      fileCount: published.fileCount,
      expires: published.expires,
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(published.url);
    }

    if (shouldCopy && !options.json) {
      const copied = copyToClipboard(published.url);
      if (copied) {
        process.stderr.write('Copied to clipboard.\n');
      }
    }

    if (!config.api_key && !options.json && published.expires) {
      const hours = Math.round((new Date(published.expires).getTime() - Date.now()) / (1000 * 60 * 60));
      process.stderr.write(`Expires in ${hours}h. Login for 48h + 50MB storage: vanish login\n`);
    }
  } catch (err) {
    spinner.stop();
    if (draft) {
      try {
        await client.deleteSite(draft.id, draft.token);
      } catch {
        // Best-effort cleanup. The server-side expiry/cleanup will handle leftovers.
      }
    }
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function collectFiles(root: string): SiteFile[] {
  const files: SiteFile[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absPath = resolve(dir, entry.name);

      if (entry.isSymbolicLink()) {
        throw new Error(`Error: Symlinks are not supported in sites: ${relative(root, absPath)}`);
      }

      if (entry.isDirectory()) {
        walk(absPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const sitePath = toSitePath(root, absPath);
      const ext = extname(sitePath).toLowerCase();
      if (BLOCKED_SITE_EXTENSIONS.has(ext)) {
        throw new Error(`Error: File type ${ext} is not allowed in sites: ${sitePath}`);
      }

      files.push({
        absPath,
        sitePath,
        size: statSync(absPath).size,
      });
    }
  }

  walk(root);
  return files;
}

function normalizeCliPath(input: string): string | null {
  if (isAbsolute(input)) {
    return null;
  }

  let path = input.trim().replaceAll('\\', '/');
  while (path.startsWith('./')) {
    path = path.slice(2);
  }

  if (!path || path.startsWith('/') || path.includes('\0')) {
    return null;
  }

  const segments = path.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    return null;
  }

  return segments.join('/');
}

function toSitePath(root: string, file: string): string {
  return relative(root, file).replaceAll('\\', '/');
}

function isInside(root: string, child: string): boolean {
  const rel = relative(root, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}
