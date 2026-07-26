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

Use a paid-plan slug:

```bash
vanish site ./demo --root index.html --slug workshop-demo
# https://workshop-demo.vanish.sh/
```

Custom retention:

```bash
vanish site ./demo --root index.html --days 90
# Pro, up to 365 days
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

Protect an authenticated site with a shared password:

```bash
printf '%s' "$CLIENT_PREVIEW_PASSWORD" |
  vanish sites access pr-42 --mode password --password-stdin

# Restore normal link access
vanish sites access pr-42 --mode link
```

### Custom domains

Pro accounts can reserve one permanent Vanish namespace, then publish up to 20
site routes below it:

```bash
vanish domains reserve studio

vanish site ./portfolio \
  --root index.html \
  --channel portfolio \
  --domain portfolio.studio.vanish.sh
```

DNS is managed by Vanish for these routes. Each child hostname gets its own TLS
certificate, while the namespace remains reserved independently of site
expiration.

Pro accounts can also attach one custom subdomain to a stable channel:

```bash
vanish domains add studio.example.com --channel homepage
# Add the CNAME/TXT records printed by the command
vanish domains verify studio.example.com
```

The custom domain can act as a namespace too. Add a direct child for another
site and point the printed CNAME/TXT records at Vanish:

```bash
vanish site ./portfolio \
  --root index.html \
  --channel portfolio \
  --domain portfolio.studio.example.com \
  --verify
```

Every hostname follows its channel across updates. Domain lifecycle commands:

```bash
vanish domains ls
vanish domains attach portfolio.studio.example.com --channel another-preview
vanish domains rm portfolio.studio.example.com
vanish domains release
```

Custom domains support subdomains. Apex domains such as `example.com` are
intentionally rejected. A parent domain or Vanish namespace cannot be removed
until all of its child routes have been removed.

Lifecycle commands:

```bash
vanish sites ls --json
vanish sites info quiet-river-42 --json
vanish sites verify quiet-river-42 --json
printf '%s' "$PREVIEW_PASSWORD" | vanish sites verify quiet-river-42 --password-stdin --json
vanish sites extend quiet-river-42 --days 90 --json
vanish sites rm quiet-river-42 --json
```

## File Uploads

```bash
vanish upload screenshot.png
# https://vanish.sh/f/a1b2c3d4e5f6.png

vanish upload report.pdf --days 90
# Pro
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
vanish upgrade     # Pro: 10 GB for 10 EUR/month
vanish update      # update the CLI to the latest version
```

## Tiers

| | Anonymous | Free | Pro |
|---|---|---|---|
| Account needed | No | GitHub login | GitHub login |
| Mini-sites | Static folders | Static folders | Static folders |
| Site URL | Readable random | Readable random | Random or custom slug |
| Domain identity | No | No | 1 `vanish.sh` namespace + 1 custom subdomain |
| Site domain routes | No | No | Up to 20 below owned namespaces |
| Password protection | No | Yes | Yes |
| Site limits | 10 MB, 100 files | 500 files, within 50 MB total | 5,000 files, within 10 GB total |
| File uploads | Images only | All except executables | All except executables |
| Max file size | 5 MB | 50 MB | 1 GB |
| Total storage | Ephemeral only | 50 MB | 10 GB |
| Retention | 24 hours | 48 hours | 30 days, up to 365 |
| Rate limit | 10/hour | 50/hour | 500/hour |
| Price | Free | Free | 10 EUR/month |

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

Password protection requires a secret of at least 32 characters:

```bash
wrangler secret put ACCESS_SESSION_SECRET
```

Managed custom domains use Cloudflare for SaaS. Configure the Worker with:

```bash
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put CLOUDFLARE_ZONE_ID
```

`CUSTOM_DOMAIN_FALLBACK_HOST` defaults to `fallback.vanish.sh` in
`wrangler.toml`; change it for another installation before deploying.

For the hosted GitHub Actions deployments, configure these repository secrets
before merging:

- `VANISH_ACCESS_SESSION_SECRET`

`CLOUDFLARE_CUSTOM_HOSTNAMES_API_TOKEN` is recommended as a least-privilege
token with zone-read and custom-hostname permissions. Until it is set,
deployment uses the existing `CLOUDFLARE_API_TOKEN` and resolves the zone ID
automatically.

The fallback hostname must already be configured as the Cloudflare for SaaS
fallback origin. Without these values, the domain API returns
`domain_provisioning_unavailable`; ordinary Vanish URLs remain functional.

## Architecture

```text
CLI (npm)  --HTTPS-->  Cloudflare Worker (Hono)
                            |-- D1 (users, uploads, sites metadata, optional product events)
                            |-- R2 (files and site assets)
                            `-- Cron (cleanup expired uploads/sites)
```

## License

MIT
