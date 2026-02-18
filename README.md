# vanish

Upload files, get temporary public URLs. Dead simple.

```bash
npx vanish-cli upload screenshot.png
# https://vanish.sh/f/a1b2c3d4e5f6
```

## Why

You're using Claude Code and want screenshots in your PRs. Or you need to quickly share a file with a coworker. `vanish` gives you a public URL in one command.

## Tiers

| | Anonymous | Free | Pro |
|---|---|---|---|
| Account needed | No | GitHub login | GitHub login |
| File types | Images only | All (except executables) | All (except executables) |
| Max file size | 5 MB | 50 MB | 1 GB |
| Total storage | — | 50 MB | 1 GB |
| Retention | 24 hours | 48 hours | 30 days (up to 365 with `--days`) |
| Rate limit | 10/hour | 50/hour | 200/hour |
| Price | Free | Free | 2 EUR/month |

## Install

```bash
# Use directly with npx (no install needed)
npx vanish-cli upload file.png

# Or install globally
npm install -g vanish-cli
```

## Install the Skill

```bash
npx skills add the-vibe-company/vanish
```

## Usage

### Upload an image (anonymous, 24h)

```bash
vanish upload screenshot.png
# https://vanish.sh/f/a1b2c3d4e5f6
```

### Upload multiple files

```bash
vanish upload *.png
```

### Upload with custom retention (Pro)

```bash
vanish upload report.pdf --days 90
# Expires in 90 days
```

### Login for 48h retention and all file types

```bash
vanish login
# Opens browser for GitHub OAuth
# API key saved to ~/.config/vanish/config.json
```

### Upgrade to Pro

```bash
vanish upgrade
# Opens billing page
```

### Other commands

```bash
vanish whoami          # Show current user and tier
vanish status          # Show storage usage and limits
vanish logout          # Remove saved API key
```

### Output formats

```bash
vanish upload file.png              # Plain URL
vanish upload file.png --json       # JSON with metadata
vanish upload file.png --md         # Markdown image link
```

## Configuration

Config is read in this order (highest priority first):

1. CLI flags
2. Environment variables (`VANISH_API_KEY`, `VANISH_API_URL`)
3. Config file (`~/.config/vanish/config.json`)
4. Defaults

## Self-hosting

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

Set `SELF_HOSTED=true` and `DEFAULT_TIER=pro` to give all users Pro access without billing.

## Architecture

```
CLI (npm)  ──HTTPS──>  Cloudflare Worker (Hono)
                            ├── D1 (users, uploads metadata)
                            ├── R2 (file storage)
                            └── Cron (cleanup expired files)
```

- **R2**: Zero egress fees, 10GB free storage
- **D1**: SQLite at the edge, free tier
- **Hono**: Lightweight web framework for Workers

## License

MIT
