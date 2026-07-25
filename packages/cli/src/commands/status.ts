import { loadConfig } from '../lib/config.js';
import { VanishClient } from '../lib/api-client.js';
import { formatBytes } from '../lib/progress.js';

export async function statusCommand(options: { json?: boolean }): Promise<void> {
  const config = loadConfig();

  if (!config.api_key) {
    console.error('Not logged in. Use `vanish login` first.');
    process.exit(1);
  }

  const client = new VanishClient(config);

  try {
    const me = await client.me();

    if (options.json) {
      console.log(JSON.stringify(me, null, 2));
      return;
    }

    console.log(`Tier: ${me.tier}`);

    if (me.limits.maxTotalStorage) {
      const usedBytes = me.stats.total_bytes;
      const maxBytes = me.limits.maxTotalStorage;
      const pct = Math.round((usedBytes / maxBytes) * 100);
      console.log(`Storage: ${formatBytes(usedBytes)} / ${formatBytes(maxBytes)} (${pct}%)`);
    } else {
      console.log(`Storage: ${formatBytes(me.stats.total_bytes)} used (no limit)`);
    }

    console.log(`Active uploads: ${me.stats.total_uploads}`);
    console.log(`Published sites: ${me.stats.total_sites || 0}`);
    if (me.stats.total_site_drafts) {
      console.log(`Site drafts: ${me.stats.total_site_drafts} (${formatBytes(me.stats.draft_site_bytes || 0)} used, auto-cleaned after 6h)`);
    }
    console.log(`Active bundles: ${me.stats.total_bundles || 0}`);
    console.log(`Max file size: ${formatBytes(me.limits.maxFileSize)}`);
    if (me.limits.maxSiteSize) {
      console.log(`Max site size: ${formatBytes(me.limits.maxSiteSize)}`);
    }
    if (me.limits.maxSiteFiles) {
      console.log(`Max site files: ${me.limits.maxSiteFiles}`);
    }

    const retentionDays = Math.round(me.limits.maxExpiryHours / 24);
    const retentionStr = me.limits.customTtl
      ? `${retentionDays} days (configurable up to 365 days with --days)`
      : `${retentionDays} ${retentionDays === 1 ? 'day' : 'days'}`;
    console.log(`Retention: ${retentionStr}`);

    if (me.limits.imageOnly) {
      console.log(`File types: images only`);
    } else {
      console.log(`File types: all (except blocked executables)`);
    }

    console.log(`Rate limit: ${me.limits.rateLimit}/hour`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
