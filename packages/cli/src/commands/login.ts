import { randomBytes } from 'node:crypto';
import { loadConfig, saveConfig } from '../lib/config.js';

export async function loginCommand(): Promise<void> {
  const config = loadConfig();

  if (config.api_key) {
    console.log('Already logged in. Use `vanish logout` first to switch accounts.');
    return;
  }

  const sessionId = randomBytes(16).toString('hex');
  const loginUrl = `${config.api_url}/auth/github?cli=true&session=${sessionId}`;

  console.log('Opening browser for GitHub login...');
  console.log(`If it doesn't open, visit: ${loginUrl}\n`);

  // Dynamic import to avoid issues in non-browser environments
  try {
    const open = await import('open');
    await open.default(loginUrl);
  } catch {
    // If open fails (e.g., headless server), just show the URL
  }

  console.log('Waiting for authentication...');

  // Poll for the API key
  const pollUrl = `${config.api_url}/auth/poll?session=${sessionId}`;
  const maxAttempts = 60; // 2 minutes

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);

    try {
      const response = await fetch(pollUrl);
      if (response.status === 200) {
        const data = await response.json() as { api_key: string; username: string };
        saveConfig({ api_key: data.api_key });
        console.log(`\nLogged in as @${data.username}. API key saved.`);
        console.log('Your uploads and mini-sites now have 48h retention and share 50MB storage.');
        console.log('Upgrade for custom site slugs and longer retention: vanish upgrade');
        return;
      }
      // 202 = still waiting, continue polling
      if (response.status !== 202) {
        console.error('\nAuthentication failed. Please try again.');
        process.exit(1);
      }
    } catch {
      // Network error, keep trying
    }
  }

  console.error('\nAuthentication timed out. Please try again.');
  process.exit(1);
}

export function logoutCommand(): void {
  saveConfig({ api_key: undefined });
  console.log('Logged out. Anonymous uploads and mini-sites expire in 24h.');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
