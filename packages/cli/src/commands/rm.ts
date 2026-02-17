import { loadConfig } from '../lib/config.js';

export async function rmCommand(ids: string[]): Promise<void> {
  const config = loadConfig();

  if (!config.api_key) {
    console.error('Not logged in. Use `vanish login` first.');
    process.exit(1);
  }

  if (ids.length === 0) {
    console.error('Error: No upload ID(s) specified.');
    console.error('Usage: vanish rm <id> [id...]');
    process.exit(1);
  }

  let errors = 0;

  for (const id of ids) {
    try {
      const response = await fetch(`${config.api_url}/f/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.api_key}` },
      });

      if (response.ok) {
        console.log(`Deleted: ${id}`);
      } else {
        const err = await response.json() as { error: string };
        console.error(`Failed to delete ${id}: ${err.error}`);
        errors++;
      }
    } catch (err) {
      console.error(`Failed to delete ${id}:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  if (errors > 0) {
    process.exit(1);
  }
}
