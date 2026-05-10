# vanish

Publish temporary mini-sites and file links from your terminal. Built for Claude Code, Codex, and agent workflows that need to hand someone a real HTML/Markdown/CSS/JS artifact for a short time.

```bash
npx vanish-cli site ./demo --root index.html
# https://quiet-river-42.vanish.sh/
```

## Why

Agents often create small static projects: an `index.html`, a Markdown report, CSS, JavaScript, images, and other assets. Vanish turns that folder into a public temporary URL in one command, without deploying a real app.

Single-file uploads still work for screenshots, PDFs, and other quick shares.

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

## Install

```bash
npm install -g vanish-cli
```

Or use directly with npx:

```bash
npx vanish-cli site ./demo --root index.html
```

## Mini-Sites

### Publish a folder

```bash
vanish site ./demo --root index.html
# https://quiet-river-42.vanish.sh/
```

The root file is what Vanish serves at `/`. Vanish does not transform files: HTML is HTML, Markdown is served as Markdown, and CSS/JS/assets are served as static files.

### Publish Markdown as the root

```bash
vanish site ./notes --root README.md
# https://silver-meadow-k9.vanish.sh/
```

### Use a Pro slug

```bash
vanish site ./demo --root index.html --slug workshop-demo
# https://workshop-demo.vanish.sh/
```

### Custom retention

```bash
vanish site ./demo --root index.html --days 90
# Pro only, up to 365 days
```

### Update an existing site

```bash
vanish site ./demo --root index.html --update quiet-river-42
# replaces the site's files while keeping the same public URL
```

Updates require login and ownership of the site. Free accounts can replace site content. Pro accounts can also change the slug or retention during the update:

```bash
vanish site ./demo --root index.html --update quiet-river-42 --slug workshop-demo --days 90
```

### JSON output

```bash
vanish site ./demo --root index.html --json
```

Returns:

```json
{
  "url": "https://quiet-river-42.vanish.sh/",
  "id": "k8m2q9z4p1ad",
  "rootPath": "index.html",
  "size": 8120,
  "fileCount": 3,
  "expires": "2026-05-12T10:30:00.000Z"
}
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
```

## Account

```bash
vanish login       # GitHub OAuth, saves API key
vanish whoami      # show username and tier
vanish status      # show storage usage and limits
vanish ls          # list file uploads
vanish rm <id>     # delete a file upload
vanish upgrade     # Pro slugs and longer retention
```

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
wrangler d1 execute vanish-db --file=src/db/schema.sql
wrangler deploy
```

For production mini-site URLs, route `*.your-domain` to the Worker. Local development uses path URLs like `http://localhost:8787/s/<site-id>/`.

Set `SELF_HOSTED=true` and `DEFAULT_TIER=pro` to give newly authenticated users Pro access without billing.

## Architecture

```text
CLI (npm)  --HTTPS-->  Cloudflare Worker (Hono)
                            |-- D1 (users, uploads, sites metadata)
                            |-- R2 (files and site assets)
                            `-- Cron (cleanup expired uploads/sites)
```

## License

MIT
