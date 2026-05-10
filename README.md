# vanish

Turn a local artifact folder into a temporary public URL.

```bash
npx vanish-cli site ./demo --root index.html
# https://quiet-river-42.vanish.sh/
```

Vanish is built for agent and terminal workflows: Codex writes a mini-site, Claude Code produces an HTML report, a script exports Markdown/CSS/JS, and you need a real URL to send to someone without deploying an app.

Single-file uploads still work for screenshots, PDFs, decks, and quick handoffs.

## Quickstart

Publish a static folder:

```bash
npx vanish-cli site ./demo --root index.html
```

The root file is what Vanish serves at `/`. Vanish does not transform files: HTML is HTML, Markdown is served as Markdown, and CSS/JS/assets are served as static files.

Install the CLI when you use it regularly:

```bash
npm install -g vanish-cli
vanish site ./demo --root index.html
```

Upload one file:

```bash
npx vanish-cli upload screenshot.png
# https://vanish.sh/f/a1b2c3d4e5f6.png
```

## Agent Workflows

Vanish is meant to be a distribution channel for generated artifacts, not a long-lived hosting platform.

Recommended routing for coding agents:

- Use `vanish-publish-site` when the artifact is a folder, browser demo, static report, or mini-site.
- Use `vanish-upload-files` when the artifact is a single file, screenshot, deck, PDF, spreadsheet, archive, or generated document.
- Use `vanish-connect-upgrade` for login, quota, retention, custom slugs, and API key issues.

The skills include a privacy gate. They should ask before publishing suspected secrets, credentials, customer data, private documents, source maps, or unreleased proprietary material.

## Mini-Sites

Publish a folder:

```bash
vanish site ./demo --root index.html
# https://quiet-river-42.vanish.sh/
```

Publish Markdown as the root:

```bash
vanish site ./notes --root README.md
# https://silver-meadow-k9.vanish.sh/
```

Update an existing owned site:

```bash
vanish site ./demo --root index.html --update quiet-river-42
# keeps the same public URL and replaces the files
```

Use a Pro slug:

```bash
vanish site ./demo --root index.html --slug workshop-demo
# https://workshop-demo.vanish.sh/
```

Custom retention:

```bash
vanish site ./demo --root index.html --days 90
# Pro only, up to 365 days
```

JSON output:

```bash
vanish site ./demo --root index.html --json
```

Returns non-breaking fields such as:

```json
{
  "url": "https://quiet-river-42.vanish.sh/",
  "id": "k8m2q9z4p1ad",
  "rootPath": "index.html",
  "size": 8120,
  "fileCount": 3,
  "expires": "2026-05-12T10:30:00.000Z",
  "expiresInHours": 48,
  "tier": "free",
  "updateCommand": "vanish site ./demo --root index.html --update k8m2q9z4p1ad"
}
```

Agent-safe preflight:

```bash
vanish site ./demo --root index.html --dry-run --json --no-clipboard
```

Stable owner-scoped channels create the first URL, then update it on later runs:

```bash
vanish site ./demo --root index.html --channel pr-42 --verify --json --no-clipboard
```

Lifecycle commands:

```bash
vanish sites ls --json
vanish site info quiet-river-42 --json
vanish site verify quiet-river-42 --json
vanish site extend quiet-river-42 --days 90 --json
vanish site rm quiet-river-42 --json
```

## File Uploads

```bash
vanish upload screenshot.png
# https://vanish.sh/f/a1b2c3d4e5f6.png

vanish upload report.pdf --days 90
# Pro only
```

Output formats:

```bash
vanish upload image.png --md
vanish upload data.json --json
vanish upload file.png --no-clipboard
vanish upload file.png --idempotency-key retry-safe-123 --json --no-clipboard
```

Authenticated file uploads can be deleted from the CLI:

```bash
vanish rm a1b2c3d4e5f6
```

Share several related files behind one public URL:

```bash
vanish bundle report.pdf screenshot.png logs.txt --json --no-clipboard
```

## Account

```bash
vanish login       # GitHub OAuth, saves API key
vanish whoami      # show username and tier
vanish status      # show storage usage and limits
vanish ls          # list file uploads
vanish rm <id>     # delete a file upload
vanish sites ls    # list mini-sites
vanish keys ls     # list API keys
vanish keys create --name agent-ci
vanish keys revoke <prefix>
vanish upgrade     # Pro slugs and longer retention
vanish update      # update the CLI to the latest version
```

## Tiers

| | Anonymous | Free | Pro |
|---|---|---|---|
| Account needed | No | GitHub login | GitHub login |
| Mini-sites | Static HTML/CSS/JS/MD folders | Static HTML/CSS/JS/MD folders | Static HTML/CSS/JS/MD folders |
| Site URL | Readable random `*.vanish.sh` | Readable random `*.vanish.sh` | Readable random or custom `*.vanish.sh` slug |
| Site limits | 10 MB, 100 files | 500 files, counts toward 50 MB total | 1,000 files, counts toward 1 GB total |
| File uploads | Images only | All except executables | All except executables |
| Max file size | 5 MB | 50 MB | 1 GB |
| Total storage | Ephemeral only | 50 MB | 1 GB |
| Retention | 24 hours | 48 hours | 30 days, up to 365 with `--days` |
| Rate limit | 10/hour | 50/hour | 200/hour |
| Price | Free | Free | 2 EUR/month |

## Configuration

Config is read in this order:

1. CLI flags
2. Environment variables (`VANISH_API_KEY`, `VANISH_API_URL`)
3. Config file (`~/.config/vanish/config.json`)
4. Defaults

## Self-Hosting

vanish runs on Cloudflare Workers + R2 + D1. To self-host:

1. Clone this repo
2. Create a Cloudflare account
3. Create an R2 bucket and D1 database
4. Update `packages/worker/wrangler.toml` with your IDs
5. Deploy:

```bash
cd packages/worker
wrangler d1 migrations apply vanish-db --remote
wrangler deploy
```

For production mini-site URLs, route `*.your-domain` to the Worker. Local development uses path URLs like `http://localhost:8787/s/<site-id>/`.

Set `SELF_HOSTED=true` and `DEFAULT_TIER=pro` to give newly authenticated users Pro access without billing.

Product events are disabled by default. Set `PRODUCT_EVENTS=true` to record privacy-light funnel events without filenames, paths, tokens, keys, or content.

## Architecture

```text
CLI (npm)  --HTTPS-->  Cloudflare Worker (Hono)
                            |-- D1 (users, uploads, sites metadata, optional product events)
                            |-- R2 (files and site assets)
                            `-- Cron (cleanup expired uploads/sites)
```

## License

MIT
