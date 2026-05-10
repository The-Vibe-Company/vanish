import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getConfigDir } from './config.js';

const NPM_LATEST_URL = 'https://registry.npmjs.org/vanish-cli/latest';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;

interface VersionCache {
  checkedAt: number;
  latestVersion: string;
}

interface LatestPackage {
  version?: string;
  'dist-tags'?: {
    latest?: string;
  };
}

export interface VersionNotice {
  currentVersion: string;
  latestVersion: string;
  message: string;
}

export interface VersionCheckOptions {
  now?: number;
  fetchImpl?: typeof fetch;
  cachePath?: string;
}

export function shouldCheckForVersionNotice(args: string[]): boolean {
  if (args.length === 0) {
    return true;
  }

  const suppressedFlags = ['--json', '--help', '-h', '--version', '-V'];
  if (suppressedFlags.some((flag) => args.includes(flag))) {
    return false;
  }

  const firstArg = args[0];
  return ![
    'update',
    '--version',
    '-V',
    '--help',
    '-h',
    'help',
  ].includes(firstArg);
}

export async function getVersionNotice(
  currentVersion: string,
  options: VersionCheckOptions = {},
): Promise<VersionNotice | null> {
  try {
    const now = options.now ?? Date.now();
    const cachePath = options.cachePath ?? getVersionCachePath();
    const cached = readVersionCache(cachePath);

    if (cached && now - cached.checkedAt < CACHE_TTL_MS) {
      return createNotice(currentVersion, cached.latestVersion);
    }

    const latestVersion = await fetchLatestVersion(options.fetchImpl ?? fetch);
    if (!latestVersion) {
      return null;
    }

    writeVersionCache(cachePath, { checkedAt: now, latestVersion });
    return createNotice(currentVersion, latestVersion);
  } catch {
    return null;
  }
}

export async function printVersionNoticeIfNeeded(
  args: string[],
  currentVersion: string,
): Promise<void> {
  if (!shouldCheckForVersionNotice(args)) {
    return;
  }

  const notice = await getVersionNotice(currentVersion);
  if (notice) {
    process.stderr.write(`${notice.message}\n`);
  }
}

function getVersionCachePath(): string {
  return join(getConfigDir(), 'version-check.json');
}

function readVersionCache(cachePath: string): VersionCache | null {
  if (!existsSync(cachePath)) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(cachePath, 'utf-8')) as Partial<VersionCache>;
  if (typeof parsed.checkedAt !== 'number' || typeof parsed.latestVersion !== 'string') {
    return null;
  }

  return {
    checkedAt: parsed.checkedAt,
    latestVersion: parsed.latestVersion,
  };
}

function writeVersionCache(cachePath: string, cache: VersionCache): void {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n', { mode: 0o600 });
}

async function fetchLatestVersion(fetchImpl: typeof fetch): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetchImpl(NPM_LATEST_URL, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }

    const data = await response.json() as LatestPackage;
    return data['dist-tags']?.latest || data.version || null;
  } finally {
    clearTimeout(timeout);
  }
}

function createNotice(currentVersion: string, latestVersion: string): VersionNotice | null {
  if (compareVersions(currentVersion, latestVersion) >= 0) {
    return null;
  }

  return {
    currentVersion,
    latestVersion,
    message: `vanish-cli ${currentVersion} is out of date. Latest is ${latestVersion}.\nRun: vanish update`,
  };
}

function compareVersions(a: string, b: string): number {
  const aParts = normalizeVersion(a);
  const bParts = normalizeVersion(b);

  for (let i = 0; i < 3; i++) {
    if (aParts[i] > bParts[i]) return 1;
    if (aParts[i] < bParts[i]) return -1;
  }

  return 0;
}

function normalizeVersion(version: string): [number, number, number] {
  const [major = '0', minor = '0', patch = '0'] = version.replace(/^v/, '').split('-', 1)[0].split('.');
  return [
    Number.parseInt(major, 10) || 0,
    Number.parseInt(minor, 10) || 0,
    Number.parseInt(patch, 10) || 0,
  ];
}
