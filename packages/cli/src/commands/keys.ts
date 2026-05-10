import { loadConfig } from '../lib/config.js';
import { VanishClient } from '../lib/api-client.js';
import { fail, failWithUnknownError } from '../lib/output.js';

interface JsonOptions {
  json?: boolean;
}

export async function keysListCommand(options: JsonOptions): Promise<void> {
  const client = authedClient(options);

  try {
    const keys = await client.listKeys();
    if (options.json) {
      console.log(JSON.stringify(keys, null, 2));
      return;
    }

    if (keys.length === 0) {
      console.log('No API keys found.');
      return;
    }

    console.log(`${'PREFIX'.padEnd(14)} ${'NAME'.padEnd(24)} ${'LAST USED'.padEnd(22)} STATUS`);
    console.log('-'.repeat(76));
    for (const key of keys) {
      console.log(`${key.prefix.padEnd(14)} ${key.name.slice(0, 22).padEnd(24)} ${(key.last_used_at || 'never').padEnd(22)} ${key.revoked ? 'revoked' : 'active'}`);
    }
  } catch (err) {
    failWithUnknownError(err, options, 'Failed to list API keys');
  }
}

export async function keysCreateCommand(options: JsonOptions & { name?: string }): Promise<void> {
  const client = authedClient(options);

  try {
    const key = await client.createKey(options.name);
    if (options.json) {
      console.log(JSON.stringify(key, null, 2));
      return;
    }

    console.log(key.api_key);
    console.error(key.message);
  } catch (err) {
    failWithUnknownError(err, options, 'Failed to create API key');
  }
}

export async function keysRevokeCommand(prefix: string, options: JsonOptions): Promise<void> {
  const client = authedClient(options);

  try {
    await client.revokeKey(prefix);
    if (options.json) {
      console.log(JSON.stringify({ ok: true, prefix }, null, 2));
    } else {
      console.log(`Revoked key: ${prefix}`);
    }
  } catch (err) {
    failWithUnknownError(err, options, 'Failed to revoke API key');
  }
}

function authedClient(options: JsonOptions): VanishClient {
  const config = loadConfig();
  if (!config.api_key) {
    fail('Not logged in. Use `vanish login` first.', options, 'auth_required');
  }
  return new VanishClient(config);
}
