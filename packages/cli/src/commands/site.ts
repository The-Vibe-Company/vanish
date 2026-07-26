import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute, relative, resolve } from 'node:path';
import type { CreateReplacementResult, CreateSiteResult, DomainInfo } from '../lib/api-client.js';
import { loadConfig } from '../lib/config.js';
import { VanishClient } from '../lib/api-client.js';
import { copyToClipboard } from '../lib/clipboard.js';
import { Spinner, formatBytes } from '../lib/progress.js';
import { fail, failWithUnknownError } from '../lib/output.js';
import { isPasswordGate, unlockSiteForVerification } from '../lib/site-access-session.js';

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
  update?: string;
  dryRun?: boolean;
  idempotencyKey?: string;
  channel?: string;
  verify?: boolean;
  domain?: string;
  passwordStdin?: boolean;
}

interface SiteFile {
  absPath: string;
  sitePath: string;
  size: number;
}

interface SiteInspection {
  files: SiteFile[];
  blockedFiles: Array<{ path: string; extension: string }>;
  symlinks: string[];
  errors: string[];
}

export async function siteCommand(folder: string, options: SiteOptions): Promise<void> {
  const folderPath = resolve(folder);

  if (!existsSync(folderPath)) {
    fail(`Error: Folder not found: ${folderPath}`, options, 'folder_not_found');
  }

  const folderStat = statSync(folderPath);
  if (!folderStat.isDirectory()) {
    fail(`Error: Not a folder: ${folderPath}`, options, 'not_a_folder');
  }

  if (!options.root) {
    fail('Error: --root is required, for example: vanish site ./demo --root index.html', options, 'missing_root');
  }

  const rootPath = normalizeCliPath(options.root);
  if (!rootPath) {
    fail('Error: --root must be a relative file path inside the site folder', options, 'invalid_root_path');
  }

  const rootAbs = resolve(folderPath, rootPath);
  if (!isInside(folderPath, rootAbs) || !existsSync(rootAbs) || !statSync(rootAbs).isFile()) {
    fail(`Error: Root file not found inside folder: ${rootPath}`, options, 'root_not_found');
  }

  const inspection = inspectFiles(folderPath);
  if (!options.dryRun && inspection.errors.length > 0) {
    fail(inspection.errors[0], options, 'invalid_site_files');
  }
  const files = inspection.files;

  if (!files.some(file => file.sitePath === rootPath) && !options.dryRun) {
    fail(`Error: Root file is not included in site files: ${rootPath}`, options, 'root_not_included');
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const config = loadConfig();
  const client = new VanishClient(config);
  if (options.domain && !options.channel) {
    fail('Error: --domain requires --channel so the hostname remains stable across publishes.', options, 'domain_requires_channel');
  }
  if (options.dryRun && (options.domain || options.passwordStdin)) {
    fail('Error: --domain and --password-stdin cannot be used with --dry-run.', options, 'dry_run_configuration_conflict');
  }
  if ((options.domain || options.passwordStdin) && !config.api_key) {
    fail('Error: --domain and --password-stdin require login. Use: vanish login', options, 'auth_required');
  }
  const requestedPassword = options.passwordStdin ? readPasswordFromStdin(options) : undefined;
  let updateTarget = options.update;
  if (options.channel) {
    if (!config.api_key) {
      fail('Error: --channel requires login. Use: vanish login', options, 'channel_requires_auth');
    }
    if (options.update) {
      fail('Error: Use either --channel or --update, not both.', options, 'conflicting_site_target');
    }
    try {
      const channel = await client.getSiteChannel(options.channel);
      updateTarget = channel?.site.id;
    } catch (err) {
      failWithUnknownError(err, options, 'Failed to resolve channel');
    }
  }
  const isUpdate = Boolean(updateTarget);
  let accountTier = config.api_key ? 'authenticated' : 'anonymous';
  let canManageSite = false;

  if (!config.api_key) {
    if (isUpdate) {
      fail('Error: --update requires login. Use: vanish login', options, 'update_requires_auth');
    }
    if (options.slug) {
      fail('Error: --slug requires a paid account. Login and upgrade with: vanish login && vanish upgrade', options, 'slug_requires_pro');
    }
    if (options.days) {
      fail('Error: --days requires a paid account. Login and upgrade with: vanish login && vanish upgrade', options, 'days_requires_pro');
    }
    if (totalBytes > ANONYMOUS_SITE_MAX_BYTES) {
      fail(`Error: Anonymous sites are limited to ${formatBytes(ANONYMOUS_SITE_MAX_BYTES)}. This folder is ${formatBytes(totalBytes)}.`, options, 'site_too_large');
    }
  } else {
    try {
      const me = await client.me();
      accountTier = me.tier;
      canManageSite = true;
      const maxSiteSize = me.limits.maxSiteSize ?? me.limits.maxTotalStorage ?? me.limits.maxFileSize;
      if (maxSiteSize && totalBytes > maxSiteSize) {
        fail(`Error: Site too large for ${me.tier}. Max ${formatBytes(maxSiteSize)}, folder is ${formatBytes(totalBytes)}.`, options, 'site_too_large');
      }
      if ((options.slug || options.days) && me.tier !== 'pro') {
        fail(`Error: ${options.slug ? '--slug' : '--days'} requires a paid account. Current tier: ${me.tier}.`, options, 'pro_required');
      }
      if (options.domain && me.tier !== 'pro') {
        fail(`Error: --domain requires a Pro account. Current tier: ${me.tier}.`, options, 'pro_required');
      }
      if (!isUpdate && me.limits.maxTotalStorage && me.stats.total_bytes + totalBytes > me.limits.maxTotalStorage) {
        fail(
          `Error: Storage quota exceeded. ${formatBytes(me.stats.total_bytes)} used of ${formatBytes(me.limits.maxTotalStorage)}; ` +
          `this site adds ${formatBytes(totalBytes)}.`,
          options,
          'storage_quota_exceeded',
        );
      }
    } catch (err) {
      if (isUpdate || options.slug || options.days || totalBytes > ANONYMOUS_SITE_MAX_BYTES) {
        failWithUnknownError(err, options, 'Failed to check account limits');
      }
      accountTier = 'anonymous';
      canManageSite = false;
    }
  }

  if (options.dryRun) {
    const dryRun = buildDryRunResult(folder, folderPath, rootPath, inspection, totalBytes, {
      tier: accountTier,
      update: updateTarget,
      channel: options.channel,
      canManageSite,
    });

    if (options.json) {
      console.log(JSON.stringify(dryRun, null, 2));
    } else {
      console.log(`${files.length} files, ${formatBytes(totalBytes)}, root ${rootPath}`);
    }
    return;
  }

  const spinner = new Spinner(`${isUpdate ? 'Updating' : 'Creating'} site (${files.length} files, ${formatBytes(totalBytes)})`);
  const shouldCopy = options.clipboard !== false;
  let draft: CreateSiteResult | CreateReplacementResult | null = null;
  let customDomain: DomainInfo | undefined;
  let createdDomain = false;
  let pendingDomainAttachment: { hostname: string; channel: string } | null = null;
  let domainError: string | null = null;

  try {
    spinner.start();
    const draftInput = {
      name: basename(folderPath),
      rootPath,
      fileCount: files.length,
      totalBytes,
      slug: options.slug,
      days: options.days,
    };

    if (isUpdate) {
      draft = options.idempotencyKey
        ? await client.createSiteReplacement(updateTarget!, draftInput, { idempotencyKey: `${options.idempotencyKey}:replacement` })
        : await client.createSiteReplacement(updateTarget!, draftInput);
    } else {
      const createInput = {
        ...draftInput,
        channel: options.channel,
      };
      draft = options.idempotencyKey
        ? await client.createSite(createInput, { idempotencyKey: `${options.idempotencyKey}:create` })
        : await client.createSite(createInput);
    }

    if (options.domain && options.channel) {
      const existing = (await client.listDomains()).domains
        .find(domain => domain.hostname.toLowerCase() === options.domain!.toLowerCase());
      if (existing) {
        if (existing.channel === options.channel) {
          customDomain = existing;
        } else {
          customDomain = existing;
          pendingDomainAttachment = {
            hostname: options.domain,
            channel: options.channel,
          };
        }
      } else {
        customDomain = await client.createDomain(options.domain, options.channel);
        createdDomain = true;
      }
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      spinner.update(`Uploading ${file.sitePath} (${i + 1}/${files.length})`);
      await client.uploadSiteFile(draft.id, draft.token, file.absPath, file.sitePath);
    }

    spinner.update(isUpdate ? 'Publishing update' : 'Publishing site');
    const publishAccess = requestedPassword
      ? { mode: 'password' as const, password: requestedPassword }
      : undefined;
    const published = isUpdate
      ? (options.idempotencyKey
        ? await client.publishSiteReplacement(updateTarget!, draft.id, draft.token, {
          slug: options.slug,
          days: options.days,
          access: publishAccess,
        }, { idempotencyKey: `${options.idempotencyKey}:publish` })
        : await client.publishSiteReplacement(updateTarget!, draft.id, draft.token, {
          slug: options.slug,
          days: options.days,
          access: publishAccess,
        }))
      : (options.idempotencyKey
        ? await client.publishSite(draft.id, draft.token, {
          idempotencyKey: `${options.idempotencyKey}:publish`,
          access: publishAccess,
        })
        : await client.publishSite(draft.id, draft.token, { access: publishAccess }));
    spinner.stop();
    draft = null;

    if (pendingDomainAttachment) {
      try {
        customDomain = await client.attachDomain(
          pendingDomainAttachment.hostname,
          pendingDomainAttachment.channel,
        );
      } catch (err) {
        domainError = err instanceof Error ? err.message : 'Failed to attach custom domain';
      }
    }

    const verification = options.verify
      ? await verifyPublishedSite(
        published.url,
        rootPath,
        files,
        requestedPassword ? { siteId: published.id, password: requestedPassword } : undefined,
      )
      : undefined;

    const access = published.access;

    const shareUrl = !domainError && customDomain?.status === 'active'
      ? customDomain.url
      : published.url;

    const result = {
      url: shareUrl,
      canonicalUrl: published.url,
      id: published.id,
      rootPath: published.rootPath,
      size: published.size,
      fileCount: published.fileCount,
      expires: published.expires,
      expiresInHours: published.expires ? hoursUntil(published.expires) : null,
      tier: accountTier,
      verified: verification?.verified,
      verification,
      channel: options.channel,
      domain: customDomain,
      domainError: domainError || undefined,
      access,
      updateCommand: canManageSite
        ? buildUpdateCommand(folder, rootPath, published.id)
        : undefined,
      deleteCommand: canManageSite
        ? `curl -X DELETE -H "Authorization: Bearer $VANISH_API_KEY" ${config.api_url}/sites/${published.id}`
        : undefined,
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(shareUrl);
    }

    if (shouldCopy && !options.json) {
      const copied = copyToClipboard(shareUrl);
      if (copied) {
        process.stderr.write('Copied to clipboard.\n');
      }
    }

    if (!options.json) {
      if (result.expiresInHours !== null) {
        process.stderr.write(`Expires in ${result.expiresInHours}h.\n`);
      }
      if (canManageSite) {
        process.stderr.write(`Update this URL: ${result.updateCommand}\n`);
        process.stderr.write(`Delete this site: ${result.deleteCommand}\n`);
      } else {
        process.stderr.write('Login for updates, deletes, 48h retention, and 50MB storage: vanish login\n');
      }
      if (verification && !verification.verified) {
        process.stderr.write(`Verification failed: ${verification.checks.filter(check => !check.ok).map(check => check.message).join('; ')}\n`);
      }
      if (customDomain && customDomain.status !== 'active') {
        process.stderr.write(`Custom domain ${customDomain.hostname}: ${customDomain.status}\n`);
        for (const record of customDomain.dnsRecords) {
          process.stderr.write(`DNS ${record.type} ${record.name} -> ${record.value}\n`);
        }
        process.stderr.write(`Verify later: vanish domains verify ${customDomain.hostname}\n`);
      }
      if (domainError) {
        process.stderr.write(`Custom domain update failed: ${domainError}\n`);
        process.stderr.write(`Published successfully at: ${published.url}\n`);
      }
      if (access?.passwordConfigured) {
        process.stderr.write('Password protection enabled.\n');
      }
    }
  } catch (err) {
    spinner.stop();
    if (createdDomain && customDomain) {
      try {
        await client.deleteDomain(customDomain.hostname);
      } catch {
        // Best-effort rollback of a domain created for a publish that never completed.
      }
    }
    if (draft) {
      try {
        await client.deleteSite(draft.id, draft.token);
      } catch {
        // Best-effort cleanup. The server-side expiry/cleanup will handle leftovers.
      }
    }
    failWithUnknownError(err, options);
  }
}

function readPasswordFromStdin(options: SiteOptions): string {
  if (process.stdin.isTTY) {
    fail('Error: --password-stdin expects a password on stdin.', options, 'password_stdin_required');
  }
  const password = readFileSync(0, 'utf8').trimEnd();
  if (password.length < 8 || password.length > 128) {
    fail('Error: password from stdin must contain between 8 and 128 characters.', options, 'invalid_password');
  }
  return password;
}

function buildDryRunResult(
  folder: string,
  folderPath: string,
  rootPath: string,
  inspection: SiteInspection,
  totalBytes: number,
  context: { tier: string; update?: string; channel?: string; canManageSite: boolean },
) {
  const privacyWarnings = buildPrivacyWarnings(inspection.files.map(file => file.sitePath));

  return {
    ok: inspection.errors.length === 0,
    dryRun: true,
    folder,
    folderPath,
    rootPath,
    fileCount: inspection.files.length,
    size: totalBytes,
    tier: context.tier,
    update: context.update,
    channel: context.channel,
    canManageSite: context.canManageSite,
    files: inspection.files.map(file => ({
      path: file.sitePath,
      size: file.size,
    })),
    blockedFiles: inspection.blockedFiles,
    symlinks: inspection.symlinks,
    warnings: privacyWarnings,
    errors: inspection.errors,
  };
}

function buildPrivacyWarnings(paths: string[]): string[] {
  const warnings = new Set<string>();
  const sensitivePatterns = [
    /(^|\/)\.env(\.|$)/,
    /(^|\/)\.npmrc$/,
    /(^|\/)\.pypirc$/,
    /(^|\/)\.netrc$/,
    /(^|\/)\.ssh(\/|$)/,
    /(^|\/)\.aws(\/|$)/,
    /\.(pem|key|p12|mobileprovision)$/i,
    /\.map$/i,
  ];

  for (const path of paths) {
    if (sensitivePatterns.some(pattern => pattern.test(path))) {
      warnings.add(`Sensitive-looking file path: ${path}`);
    }
  }

  return Array.from(warnings);
}

async function verifyPublishedSite(
  url: string,
  rootPath: string,
  files: SiteFile[],
  protectedAccess?: { siteId: string; password: string },
) {
  const checks: Array<{ name: string; ok: boolean; message: string }> = [];

  try {
    const headers = protectedAccess
      ? await unlockSiteForVerification(url, protectedAccess.siteId, protectedAccess.password)
      : undefined;
    const root = await fetch(url, { redirect: 'follow', headers });
    const passwordGate = isPasswordGate(root);
    checks.push({
      name: 'root',
      ok: root.ok && !passwordGate,
      message: passwordGate
        ? 'Password required; uploaded content was not verified'
        : `Root responded ${root.status}`,
    });

    const expectedContentType = guessContentType(rootPath);
    const contentType = root.headers.get('content-type') || '';
    if (root.ok && !passwordGate && expectedContentType !== 'application/octet-stream') {
      checks.push({
        name: 'root-content-type',
        ok: contentType.includes(expectedContentType.split(';')[0]),
        message: `Root content type ${contentType || 'missing'}`,
      });
    }

    const uploadedPaths = new Set(files.map(file => file.sitePath));
    if (!uploadedPaths.has(rootPath)) {
      checks.push({
        name: 'manifest-root',
        ok: false,
        message: `Root path ${rootPath} is missing from uploaded files`,
      });
    }

    const rootText = root.ok && !passwordGate ? await root.text() : '';
    const assetPaths = Array.from(extractAssetPaths(rootText)).slice(0, 10);

    for (const assetPath of assetPaths) {
      if (!uploadedPaths.has(assetPath)) {
        checks.push({
          name: `manifest:${assetPath}`,
          ok: false,
          message: `${assetPath} is referenced by the root document but is not in the uploaded manifest`,
        });
        continue;
      }

      const assetUrl = new URL(assetPath, url).toString();
      const asset = await fetch(assetUrl, { redirect: 'follow', headers });
      const assetPasswordGate = isPasswordGate(asset);
      checks.push({
        name: `asset:${assetPath}`,
        ok: asset.ok && !assetPasswordGate,
        message: assetPasswordGate
          ? `${assetPath} returned a password gate instead of uploaded content`
          : `${assetPath} responded ${asset.status}`,
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

    const normalized = normalizeAssetPath(value);
    if (normalized && isVerifiableAssetPath(normalized)) {
      paths.add(normalized);
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

function guessContentType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (ext === '.html' || ext === '.htm') return 'text/html';
  if (ext === '.css') return 'text/css';
  if (ext === '.js' || ext === '.mjs') return 'application/javascript';
  if (ext === '.json') return 'application/json';
  if (ext === '.md' || ext === '.markdown') return 'text/markdown';
  return 'application/octet-stream';
}

function inspectFiles(root: string): SiteInspection {
  const files: SiteFile[] = [];
  const blockedFiles: Array<{ path: string; extension: string }> = [];
  const symlinks: string[] = [];
  const errors: string[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absPath = resolve(dir, entry.name);

      if (entry.isSymbolicLink()) {
        const symlink = relative(root, absPath);
        symlinks.push(symlink);
        errors.push(`Error: Symlinks are not supported in sites: ${symlink}`);
        continue;
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
        blockedFiles.push({ path: sitePath, extension: ext });
        errors.push(`Error: File type ${ext} is not allowed in sites: ${sitePath}`);
        continue;
      }

      files.push({
        absPath,
        sitePath,
        size: statSync(absPath).size,
      });
    }
  }

  walk(root);
  return { files, blockedFiles, symlinks, errors };
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

function buildUpdateCommand(folder: string, rootPath: string, siteId: string): string {
  return `vanish site ${quoteShellArg(folder)} --root ${quoteShellArg(rootPath)} --update ${siteId}`;
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function hoursUntil(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60)));
}

function isInside(root: string, child: string): boolean {
  const rel = relative(root, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}
