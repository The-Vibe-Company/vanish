# vanish

Upload files, get temporary public URLs. Dead simple.

```bash
npx vanish-cli upload screenshot.png
# https://api.vanish.sh/f/a1b2c3d4e5f6
```

## Why

You're using Claude Code and want screenshots in your PRs. Or you need to quickly share a file with a coworker. `vanish` gives you a public URL in one command.

## Tiers

| | Anonymous | Free | Pro |
|---|---|---|---|
| Account needed | No | GitHub login | GitHub login |
| Max file size | 50 MB | 50 MB | 1 GB |
| Retention | 48 hours | 30 days | Unlimited |
| Price | Free | Free | 2 EUR/month |

## Install

```bash
# Use directly with npx (no install needed)
npx vanish-cli upload file.png

# Or install globally
npm install -g vanish-cli
```

## Usage

### Upload a file (anonymous, 48h)

```bash
vanish upload screenshot.png
# https://api.vanish.sh/f/a1b2c3d4e5f6
```

### Upload multiple files

```bash
vanish upload *.png
```

### Login for 30-day retention

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
