import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock homedir before importing config
const tempHome = mkdtempSync(join(tmpdir(), 'vanish-test-'));
vi.mock('node:os', async () => {
  const actual = await vi.importActual('node:os');
  return { ...actual, homedir: () => tempHome };
});

const { loadConfig, saveConfig, clearConfig } = await import('../src/lib/config.js');

describe('config', () => {
  afterEach(() => {
    // Clean env vars
    delete process.env.VANISH_API_KEY;
    delete process.env.VANISH_API_URL;
    clearConfig();
  });

  it('returns defaults when no config exists', () => {
    const config = loadConfig();
    expect(config.api_key).toBeUndefined();
    expect(config.api_url).toBe('https://api.vanish.sh');
  });

  it('reads API key from env var', () => {
    process.env.VANISH_API_KEY = 'vnsh_envkey123';
    const config = loadConfig();
    expect(config.api_key).toBe('vnsh_envkey123');
  });

  it('reads API URL from env var', () => {
    process.env.VANISH_API_URL = 'https://custom.example.com';
    const config = loadConfig();
    expect(config.api_url).toBe('https://custom.example.com');
  });

  it('saves and loads config from file', () => {
    saveConfig({ api_key: 'vnsh_filekey456' });
    const config = loadConfig();
    expect(config.api_key).toBe('vnsh_filekey456');
  });

  it('env var overrides file config', () => {
    saveConfig({ api_key: 'vnsh_filekey' });
    process.env.VANISH_API_KEY = 'vnsh_envkey';
    const config = loadConfig();
    expect(config.api_key).toBe('vnsh_envkey');
  });
});
