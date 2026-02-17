import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface VanishConfig {
  api_key?: string;
  api_url: string;
}

const DEFAULT_API_URL = 'https://api.vanish.sh';

function getConfigDir(): string {
  const dir = join(homedir(), '.config', 'vanish');
  return dir;
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

export function loadConfig(): VanishConfig {
  // Env vars take priority
  const envKey = process.env.VANISH_API_KEY;
  const envUrl = process.env.VANISH_API_URL;

  let fileConfig: Partial<VanishConfig> = {};
  try {
    const raw = readFileSync(getConfigPath(), 'utf-8');
    fileConfig = JSON.parse(raw);
  } catch {
    // No config file, that's fine
  }

  return {
    api_key: envKey || fileConfig.api_key,
    api_url: envUrl || fileConfig.api_url || DEFAULT_API_URL,
  };
}

export function saveConfig(config: Partial<VanishConfig>): void {
  const existing = loadConfig();
  const merged = { ...existing, ...config };

  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2) + '\n', {
    mode: 0o600, // Owner-only read/write
  });
}

export function clearConfig(): void {
  try {
    const path = getConfigPath();
    writeFileSync(path, '{}', { mode: 0o600 });
  } catch {
    // Ignore
  }
}
