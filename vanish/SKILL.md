---
name: vanish
description: Publish temporary static mini-sites and share files via public URLs using the Vanish CLI (vanish-cli). Use when the user wants to share an HTML/CSS/JS/Markdown folder, a temporary website, a Claude Code or Codex artifact, screenshots, images, or other temporary files.
---

# Vanish CLI

Vanish publishes temporary public URLs. Prefer mini-sites when an agent has produced a folder containing HTML, Markdown, CSS, JavaScript, images, or other static assets.

Install with `npm i -g vanish-cli` or use `npx vanish-cli`.

## Publish a Mini-Site

```bash
vanish site ./demo --root index.html
npx vanish-cli site ./demo --root index.html
```

- `--root` is required and must be a file inside the folder.
- The root file is served at `/`.
- Files are served as-is. Vanish does not transform Markdown to HTML or rewrite links.
- Anonymous sites expire in 24h and are limited to 10 MB and 100 files per site.
- Logged-in free accounts expire in 48h and share the 50 MB total storage quota across files and sites, with 500 files per site.
- Pro accounts get 30-day default retention, `--days` up to 365, 1 GB total storage, 1,000 files per site, and custom `*.vanish.sh` slugs.
- Default site URLs use readable random subdomains such as `quiet-river-42.vanish.sh`.

## Mini-Site Options

```bash
vanish site ./demo --root index.html --json
vanish site ./demo --root README.md
vanish site ./demo --root index.html --slug agent-demo   # Pro only
vanish site ./demo --root index.html --days 90           # Pro only
vanish site ./demo --root index.html --update quiet-river-42
vanish site ./demo --root index.html --no-clipboard
```

Default output is the public URL, copied to clipboard.

`--update` requires login and replaces the full site contents from the local folder. Free accounts can update content; Pro accounts can also combine `--update` with `--slug` or `--days`.

`--json` returns:

```json
{
  "url": "https://k8m2q9z4p1ad.vanish.sh/",
  "id": "k8m2q9z4p1ad",
  "rootPath": "index.html",
  "size": 8120,
  "fileCount": 3,
  "expires": "2026-05-12T10:30:00.000Z"
}
```

## Share a Single File

```bash
vanish screenshot.png
vanish upload file1.png file2.jpg
vanish upload image.png --md
vanish upload data.json --json
vanish upload file.png --no-clipboard
vanish upload report.pdf --days 90       # Pro only
```

`--md` produces `![filename](url)` for PRs, issues, and Markdown docs.

## Tier Limits

| Tier | Mini-sites | File uploads | Retention | Storage | Rate limit |
|------|------------|--------------|-----------|---------|------------|
| Anonymous | Static folders, 10 MB and 100 files max | Images only, 5 MB max | 24 hours | Ephemeral | 10/hour |
| Free (`vanish login`) | 500 files max, counts toward 50 MB total | All except executables, 50 MB max | 48 hours | 50 MB total | 50/hour |
| Pro (`vanish upgrade`) | Custom slug, 1,000 files max, counts toward 1 GB total | All except executables, 1 GB max | 30 days, up to 365 with `--days` | 1 GB total | 200/hour |

Blocked extensions for file uploads: `.exe`, `.bat`, `.cmd`, `.com`, `.msi`, `.scr`, `.sh`, `.bash`, `.ps1`, `.psm1`.

## Account Commands

```bash
vanish login       # GitHub OAuth, saves API key
vanish whoami      # show username and tier
vanish status      # show storage usage, tier, and limits
vanish logout      # remove saved API key
vanish upgrade     # Pro slugs and longer retention
vanish update      # update the CLI to the latest version
```

## Upload Management

```bash
vanish ls             # list file uploads
vanish ls --json      # list file uploads as JSON
vanish rm <id>        # delete file upload by ID
```

Mini-sites for authenticated users are visible in the Vanish dashboard.

## Configuration

Config file: `~/.config/vanish/config.json` with `api_key` and `api_url`.
Env vars: `VANISH_API_KEY`, `VANISH_API_URL`.
Priority: env vars > config file > defaults.
