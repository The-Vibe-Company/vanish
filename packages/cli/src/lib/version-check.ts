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
  const aVersion = parseVersion(a);
  const bVersion = parseVersion(b);

  for (let i = 0; i < 3; i++) {
    if (aVersion.parts[i] > bVersion.parts[i]) return 1;
    if (aVersion.parts[i] < bVersion.parts[i]) return -1;
  }

  return comparePrerelease(aVersion.prerelease, bVersion.prerelease);
}

function parseVersion(version: string): { parts: [number, number, number]; prerelease: string[] } {
  const withoutBuild = version.replace(/^v/, '').split('+', 1)[0];
  const prereleaseIndex = withoutBuild.indexOf('-');
  const core = prereleaseIndex === -1 ? withoutBuild : withoutBuild.slice(0, prereleaseIndex);
  const prerelease = prereleaseIndex === -1 ? '' : withoutBuild.slice(prereleaseIndex + 1);
  const [major = '0', minor = '0', patch = '0'] = core.split('.');

  return {
    parts: [
      Number.parseInt(major, 10) || 0,
      Number.parseInt(minor, 10) || 0,
      Number.parseInt(patch, 10) || 0,
    ],
    prerelease: prerelease ? prerelease.split('.') : [],
  };
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const maxLength = Math.max(a.length, b.length);
  for (let i = 0; i < maxLength; i++) {
    const aPart = a[i];
    const bPart = b[i];

    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;

    const compared = comparePrereleasePart(aPart, bPart);
    if (compared !== 0) {
      return compared;
    }
  }

  return 0;
}

function comparePrereleasePart(a: string, b: string): number {
  const aNumeric = isNumericIdentifier(a);
  const bNumeric = isNumericIdentifier(b);

  if (aNumeric && bNumeric) {
    return compareNumericIdentifier(a, b);
  }

  if (aNumeric) return -1;
  if (bNumeric) return 1;

  return compareAscii(a, b);
}

function isNumericIdentifier(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value);
}

function compareNumericIdentifier(a: string, b: string): number {
  if (a.length !== b.length) {
    return a.length - b.length;
  }

  return compareAscii(a, b);
}

function compareAscii(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);

  for (let i = 0; i < maxLength; i++) {
    const aCode = a.charCodeAt(i);
    const bCode = b.charCodeAt(i);

    if (Number.isNaN(aCode)) return -1;
    if (Number.isNaN(bCode)) return 1;
    if (aCode !== bCode) return aCode - bCode;
  }

  return 0;
}
