#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import { uploadCommand } from './commands/upload.js';
import { siteCommand } from './commands/site.js';
import { loginCommand, logoutCommand } from './commands/login.js';
import { lsCommand } from './commands/ls.js';
import { rmCommand } from './commands/rm.js';
import { statusCommand } from './commands/status.js';
import { updateCommand } from './commands/update.js';
import { sitesListCommand, siteInfoCommand, siteRmCommand, siteExtendCommand, siteVerifyCommand } from './commands/sites.js';
import { keysCreateCommand, keysListCommand, keysRevokeCommand } from './commands/keys.js';
import { bundleCommand } from './commands/bundle.js';
import { printVersionNoticeIfNeeded } from './lib/version-check.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('vanish')
  .description('Publish temporary mini-sites and file URLs.')
  .version(pkg.version);

program
  .command('upload')
  .alias('up')
  .description('Upload file(s) and get temporary public URL(s)')
  .argument('<files...>', 'file(s) to upload')
  .option('--json', 'Output as JSON')
  .option('--md', 'Output as Markdown image link')
  .option('--no-clipboard', 'Do not copy URL to clipboard')
  .option('--days <days>', 'Custom retention in days (Pro only, 1-365)', parseInt)
  .option('--idempotency-key <key>', 'Stable key for safe agent retries')
  .action(uploadCommand);

program
  .command('site')
  .description('Upload a static folder as a temporary mini-site')
  .argument('<folder>', 'folder to publish')
  .requiredOption('--root <file>', 'Root file to serve at /, relative to the folder')
  .option('--update <site>', 'Replace an existing owned site by ID or slug')
  .option('--slug <slug>', 'Custom vanish.sh subdomain slug (Pro only)')
  .option('--channel <channel>', 'Owned stable channel that creates or updates the same site URL')
  .option('--days <days>', 'Custom retention in days (Pro only, 1-365)', parseInt)
  .option('--dry-run', 'Inspect and print the site manifest without uploading')
  .option('--verify', 'Fetch the published root and referenced assets after publish')
  .option('--idempotency-key <key>', 'Stable key for safe agent retries')
  .option('--json', 'Output as JSON')
  .option('--no-clipboard', 'Do not copy URL to clipboard')
  .action(siteCommand);

const sites = program
  .command('sites')
  .description('Manage owned mini-sites');

sites
  .command('ls')
  .description('List your mini-sites')
  .option('--json', 'Output as JSON')
  .option('--all', 'Include expired and deleted sites')
  .action((options) => sitesListCommand({ json: options.json, active: !options.all }));

sites
  .command('info')
  .description('Show a mini-site and its files')
  .argument('<site>', 'site ID or slug')
  .option('--json', 'Output as JSON')
  .action(siteInfoCommand);

sites
  .command('rm')
  .description('Delete a mini-site by ID or slug')
  .argument('<site>', 'site ID or slug')
  .option('--json', 'Output as JSON')
  .action(siteRmCommand);

sites
  .command('extend')
  .description('Extend a Pro mini-site expiry')
  .argument('<site>', 'site ID or slug')
  .requiredOption('--days <days>', 'Custom retention in days (Pro only, 1-365)', parseInt)
  .option('--json', 'Output as JSON')
  .action(siteExtendCommand);

sites
  .command('verify')
  .description('Verify a published mini-site root and referenced assets')
  .argument('<site>', 'site ID or slug')
  .option('--json', 'Output as JSON')
  .action(siteVerifyCommand);

program
  .command('bundle')
  .description('Publish multiple files behind one temporary public URL')
  .argument('<files...>', 'files to include')
  .option('--json', 'Output as JSON')
  .option('--no-clipboard', 'Do not copy URL to clipboard')
  .option('--days <days>', 'Custom retention in days (Pro only, 1-365)', parseInt)
  .option('--idempotency-key <key>', 'Stable key for safe agent retries')
  .option('--name <name>', 'Bundle display name')
  .action(bundleCommand);

const keys = program
  .command('keys')
  .description('Manage API keys');

keys
  .command('ls')
  .description('List API keys')
  .option('--json', 'Output as JSON')
  .action(keysListCommand);

keys
  .command('create')
  .description('Create an API key')
  .option('--name <name>', 'API key name')
  .option('--json', 'Output as JSON')
  .action(keysCreateCommand);

keys
  .command('revoke')
  .description('Revoke an API key by prefix')
  .argument('<prefix>', 'API key prefix')
  .option('--json', 'Output as JSON')
  .action(keysRevokeCommand);

program
  .command('login')
  .description('Login with GitHub for 48h retention and all file types')
  .action(loginCommand);

program
  .command('logout')
  .description('Remove saved API key')
  .action(logoutCommand);

program
  .command('upgrade')
  .description('Upgrade to Pro for 1GB uploads and up to 365-day retention (2 EUR/month)')
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
      console.log('Not logged in (anonymous tier, 24h retention, images only)');
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

program
  .command('status')
  .description('Show storage usage and tier info')
  .option('--json', 'Output as JSON')
  .action(statusCommand);

program
  .command('update')
  .description('Update vanish-cli to the latest version')
  .action(updateCommand);

// Default: if first arg looks like a file path, treat as upload
const args = process.argv.slice(2);
const siteLifecycleSubcommands = ['info', 'rm', 'extend', 'verify'];
const VALUE_OPTIONS = new Set([
  '--channel',
  '--days',
  '--idempotency-key',
  '--root',
  '--slug',
  '--update',
]);
const hasSiteRootFlag = args.some(arg => arg === '--root' || arg.startsWith('--root='));
if (args[0] === 'site' && siteLifecycleSubcommands.includes(args[1] || '') && (!hasSiteRootFlag || hasLifecycleTargetArg(args))) {
  process.argv.splice(2, 2, 'sites', args[1]);
  args.splice(0, 2, 'sites', args[1]);
}

if (args.length > 0 && !args[0].startsWith('-') && !['upload', 'up', 'site', 'sites', 'bundle', 'keys', 'login', 'logout', 'upgrade', 'whoami', 'ls', 'rm', 'status', 'update', 'help', 'mcp-serve'].includes(args[0])) {
  // Shorthand: `vanish file.png` = `vanish upload file.png`
  process.argv.splice(2, 0, 'upload');
}

await printVersionNoticeIfNeeded(args, pkg.version);
await program.parseAsync();

function hasLifecycleTargetArg(argv: string[]): boolean {
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      return i + 1 < argv.length;
    }
    if (arg.includes('=')) {
      continue;
    }
    if (VALUE_OPTIONS.has(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith('-')) {
      continue;
    }
    return true;
  }

  return false;
}
