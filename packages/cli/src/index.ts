#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import { uploadCommand } from './commands/upload.js';
import { loginCommand, logoutCommand } from './commands/login.js';
import { lsCommand } from './commands/ls.js';
import { rmCommand } from './commands/rm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('vanish')
  .description('Upload files, get temporary public URLs. Dead simple.')
  .version(pkg.version);

program
  .command('upload')
  .alias('up')
  .description('Upload file(s) and get temporary public URL(s)')
  .argument('<files...>', 'file(s) to upload')
  .option('--json', 'Output as JSON')
  .option('--md', 'Output as Markdown image link')
  .option('--no-clipboard', 'Do not copy URL to clipboard')
  .action(uploadCommand);

program
  .command('login')
  .description('Login with GitHub to get 30-day retention')
  .action(loginCommand);

program
  .command('logout')
  .description('Remove saved API key')
  .action(logoutCommand);

program
  .command('upgrade')
  .description('Upgrade to Pro for 1GB uploads and unlimited retention (2 EUR/month)')
  .action(async () => {
    const { loadConfig } = await import('./lib/config.js');
    const config = loadConfig();
    if (!config.api_key) {
      console.log('Please login first: vanish login');
      process.exit(1);
    }
    // The /billing/checkout endpoint requires auth and redirects to Stripe
    const checkoutUrl = `${config.api_url}/billing/checkout`;
    console.log('Opening Stripe checkout...');
    console.log(`If it doesn't open, visit: ${checkoutUrl}`);
    console.log('(You need to be logged in — your API key will be sent as auth)\n');
    // We can't pass the Bearer token via browser redirect, so we fetch the redirect URL
    try {
      const response = await fetch(checkoutUrl, {
        headers: { Authorization: `Bearer ${config.api_key}` },
        redirect: 'manual',
      });
      const location = response.headers.get('Location');
      if (location) {
        console.log(`Checkout URL: ${location}`);
        try {
          const open = await import('open');
          await open.default(location);
        } catch {
          // URL already printed above
        }
      } else if (response.ok) {
        const data = await response.json() as { error?: string; tier?: string };
        if (data.tier === 'pro') {
          console.log('You are already on the Pro tier!');
        } else if (data.error) {
          console.error(`Error: ${data.error}`);
        }
      } else {
        const data = await response.json() as { error?: string };
        console.error(`Error: ${data.error || 'Unknown error'}`);
        process.exit(1);
      }
    } catch (err) {
      console.error('Failed to connect:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('whoami')
  .description('Show current user and tier')
  .action(async () => {
    const { loadConfig } = await import('./lib/config.js');
    const config = loadConfig();
    if (!config.api_key) {
      console.log('Not logged in (anonymous tier, 48h retention)');
      console.log('Login: vanish login');
      return;
    }
    try {
      const response = await fetch(`${config.api_url}/me`, {
        headers: { Authorization: `Bearer ${config.api_key}` },
      });
      if (!response.ok) {
        console.error('Failed to fetch user info. Your API key may be invalid.');
        process.exit(1);
      }
      const user = await response.json() as { username: string; tier: string; email: string };
      console.log(`@${user.username} (${user.tier})`);
    } catch (err) {
      console.error('Failed to connect to server:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('ls')
  .description('List your uploads')
  .option('--json', 'Output as JSON')
  .action(lsCommand);

program
  .command('rm')
  .description('Delete upload(s) by ID')
  .argument('<ids...>', 'upload ID(s) to delete')
  .action(rmCommand);

// Default: if first arg looks like a file path, treat as upload
const args = process.argv.slice(2);
if (args.length > 0 && !args[0].startsWith('-') && !['upload', 'login', 'logout', 'upgrade', 'whoami', 'ls', 'rm', 'help', 'mcp-serve'].includes(args[0])) {
  // Shorthand: `vanish file.png` = `vanish upload file.png`
  process.argv.splice(2, 0, 'upload');
}

program.parse();
