import { extname } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadConfig } from '../lib/config.js';
import { VanishClient } from '../lib/api-client.js';
import { formatBytes } from '../lib/progress.js';
import { fail, failWithUnknownError } from '../lib/output.js';
import { isPasswordGate, unlockSiteForVerification } from '../lib/site-access-session.js';

interface JsonOptions {
  json?: boolean;
}

export async function siteAccessCommand(
  id: string,
  options: JsonOptions & { mode?: 'link' | 'password'; passwordStdin?: boolean },
): Promise<void> {
  if (options.mode !== 'link' && options.mode !== 'password') {
    fail('Error: --mode must be link or password', options, 'invalid_access_mode');
  }
  if (options.mode === 'password' && !options.passwordStdin) {
    fail('Error: password mode requires --password-stdin', options, 'password_stdin_required');
  }

  const client = authedClient(options);
  try {
    const channel = await client.getSiteChannel(id);
    const target = channel?.site.id || id;
    const access = options.mode === 'password'
      ? await client.setSiteAccess(target, { mode: 'password', password: readPasswordFromStdin(options) })
      : await client.setSiteAccess(target, { mode: 'link' });
    if (options.json) {
      console.log(JSON.stringify(access, null, 2));
    } else {
      console.log(`Access mode: ${access.mode}`);
      console.log(access.passwordConfigured ? 'Password protection enabled.' : 'Anyone with the link can view this site.');
    }
  } catch (error) {
    failWithUnknownError(error, options, 'Failed to update site access');
  }
}

export async function sitesListCommand(options: JsonOptions & { active?: boolean }): Promise<void> {
  const client = authedClient(options);

  try {
    const result = await client.listSites({ active: options.active !== false });
    if (options.json) {
      console.log(JSON.stringify(result.sites, null, 2));
      return;
    }

    if (result.sites.length === 0) {
      console.log('No sites found.');
      return;
    }

    console.log(`${'ID'.padEnd(14)} ${'ROOT'.padEnd(24)} ${'SIZE'.padEnd(10)} ${'EXPIRES'.padEnd(22)} URL`);
    console.log('-'.repeat(100));
    for (const site of result.sites) {
      const expires = site.expires_at
        ? new Date(site.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'never';
      console.log(`${site.id.padEnd(14)} ${site.root_path.slice(0, 22).padEnd(24)} ${formatBytes(site.size_bytes).padEnd(10)} ${expires.padEnd(22)} ${site.url}`);
    }
  } catch (err) {
    failWithUnknownError(err, options, 'Failed to list sites');
  }
}

export async function siteInfoCommand(id: string, options: JsonOptions): Promise<void> {
  const client = authedClient(options);

  try {
    const [site, files] = await Promise.all([
      client.getSite(id),
      client.getSiteFiles(id).catch(() => null),
    ]);
    const result = files ? { ...site, files: files.files } : site;
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(site.url);
    console.log(`ID: ${site.id}`);
    console.log(`Root: ${site.root_path}`);
    console.log(`Files: ${site.file_count}`);
    console.log(`Size: ${formatBytes(site.size_bytes)}`);
    console.log(`Expires: ${site.expires_at || 'never'}`);
  } catch (err) {
    failWithUnknownError(err, options, 'Failed to get site');
  }
}

export async function siteRmCommand(id: string, options: JsonOptions): Promise<void> {
  const client = authedClient(options);

  try {
    await client.deleteSite(id);
    if (options.json) {
      console.log(JSON.stringify({ ok: true, id }, null, 2));
    } else {
      console.log(`Deleted site: ${id}`);
    }
  } catch (err) {
    failWithUnknownError(err, options, 'Failed to delete site');
  }
}

export async function siteExtendCommand(id: string, options: JsonOptions & { days?: number }): Promise<void> {
  if (!options.days) {
    fail('Error: --days is required', options, 'missing_days');
  }

  const client = authedClient(options);
  try {
    const site = await client.patchSite(id, { days: options.days });
    if (options.json) {
      console.log(JSON.stringify(site, null, 2));
    } else {
      console.log(site.url);
      console.log(`Expires: ${site.expires_at || 'never'}`);
    }
  } catch (err) {
    failWithUnknownError(err, options, 'Failed to extend site');
  }
}

export async function siteVerifyCommand(id: string, options: JsonOptions & { passwordStdin?: boolean }): Promise<void> {
  const client = authedClient(options);

  try {
    const { site, files } = await client.getSiteFiles(id);
    const headers = options.passwordStdin
      ? await unlockSiteForVerification(site.url, site.id, readPasswordFromStdin(options))
      : undefined;
    const result = await verifySite(site.url, site.root_path, files.map(file => file.path), headers);
    if (options.json) {
      console.log(JSON.stringify({ site, ...result }, null, 2));
      if (!result.verified) {
        process.exit(1);
      }
      return;
    }

    console.log(result.verified ? 'Verified' : 'Verification failed');
    for (const check of result.checks) {
      console.log(`${check.ok ? 'ok' : 'fail'} ${check.name}: ${check.message}`);
    }
    if (!result.verified) {
      process.exit(1);
    }
  } catch (err) {
    failWithUnknownError(err, options, 'Failed to verify site');
  }
}

function authedClient(options: JsonOptions): VanishClient {
  const config = loadConfig();
  if (!config.api_key) {
    fail('Not logged in. Use `vanish login` first.', options, 'auth_required');
  }
  return new VanishClient(config);
}

function readPasswordFromStdin(options: JsonOptions): string {
  const password = process.stdin.isTTY
    ? ''
    : requireStdin().trimEnd();
  if (password.length < 8 || password.length > 128) {
    fail('Error: password from stdin must contain between 8 and 128 characters', options, 'invalid_password');
  }
  return password;
}

function requireStdin(): string {
  return readFileSync(0, 'utf8');
}

async function verifySite(
  url: string,
  rootPath: string,
  files: string[],
  headers?: Record<string, string>,
) {
  const checks: Array<{ name: string; ok: boolean; message: string }> = [];

  try {
    const root = await fetch(url, { redirect: 'follow', headers });
    const passwordGate = isPasswordGate(root);
    checks.push({
      name: 'root',
      ok: root.ok && !passwordGate,
      message: passwordGate
        ? 'Password required; rerun with --password-stdin'
        : `Root responded ${root.status}`,
    });

    if (!files.includes(rootPath)) {
      checks.push({
        name: 'manifest-root',
        ok: false,
        message: `Root path ${rootPath} is missing from uploaded files`,
      });
    }

    const rootText = root.ok && !passwordGate ? await root.text() : '';
    const assets = Array.from(extractAssetPaths(rootText)).slice(0, 10);

    for (const asset of assets) {
      if (!files.includes(asset)) {
        checks.push({
          name: `manifest:${asset}`,
          ok: false,
          message: `${asset} is referenced by the root document but is not in the uploaded manifest`,
        });
        continue;
      }

      const response = await fetch(new URL(asset, url), { redirect: 'follow', headers });
      const passwordGate = isPasswordGate(response);
      checks.push({
        name: `asset:${asset}`,
        ok: response.ok && !passwordGate,
        message: passwordGate
          ? `${asset} returned a password gate instead of uploaded content`
          : `${asset} responded ${response.status}`,
      });
    }
  } catch (err) {
    checks.push({
      name: 'network',
      ok: false,
      message: err instanceof Error ? err.message : 'Verification request failed',
    });
  }

  return {
    verified: checks.length > 0 && checks.every(check => check.ok),
    checks,
  };
}

function extractAssetPaths(html: string): Set<string> {
  const paths = new Set<string>();
  const pattern = /\b(?:src|href)=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html))) {
    const value = match[1];
    if (!value || value.startsWith('http:') || value.startsWith('https:') || value.startsWith('//') || value.startsWith('data:') || value.startsWith('#')) {
      continue;
    }
    const path = normalizeAssetPath(value);
    if (path && isVerifiableAssetPath(path)) {
      paths.add(path);
    }
  }

  return paths;
}

function isVerifiableAssetPath(path: string): boolean {
  return STATIC_ASSET_EXTENSIONS.has(extname(path).toLowerCase());
}

function normalizeAssetPath(value: string): string | null {
  const raw = value.split(/[?#]/)[0].replaceAll('\\', '/');
  const segments: string[] = [];

  for (const segment of raw.replace(/^\/+/, '').split('/')) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.length > 0) {
        segments.pop();
      }
      continue;
    }
    segments.push(segment);
  }

  return segments.length > 0 ? segments.join('/') : null;
}

const STATIC_ASSET_EXTENSIONS = new Set([
  '.avif', '.bmp', '.css', '.gif', '.heic', '.heif', '.ico', '.jpeg', '.jpg',
  '.js', '.json', '.map', '.mjs', '.otf', '.png', '.svg', '.tif', '.tiff',
  '.ttf', '.wasm', '.webp', '.woff', '.woff2',
]);
