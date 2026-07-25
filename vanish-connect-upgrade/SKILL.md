---
name: vanish-connect-upgrade
description: Use this skill for explicit Vanish account, authentication, status, quota, storage, tier, retention, API key, config, or upgrade questions, or after a publish/upload attempt reports an auth, quota, tier, `--days`, or `--slug` blocker. Use for read-only `whoami` and `status` checks, `VANISH_API_KEY`, `VANISH_API_URL`, config file behavior, anonymous/free/pro limits, invalid auth, and explaining when login or Pro is required. Do not use this skill first for normal upload or site publishing requests; route those to vanish-upload-files or vanish-publish-site.
---

# Vanish Connect Upgrade

Manage Vanish authentication, account status, storage limits, and Pro upgrade paths. Use this when publishing or uploading fails because of login, quota, retention, file type, slug, or tier constraints.

## Account Commands

```bash
vanish login       # GitHub OAuth, saves API key
vanish whoami      # show current user and tier
vanish status      # show storage usage, tier, and limits
vanish status --json
vanish logout      # remove saved API key
vanish upgrade     # open Pro checkout
vanish update      # update the CLI to the latest version
vanish keys ls --json
vanish keys create --name agent-ci --json
vanish keys revoke <prefix> --json
vanish sites ls --json
vanish site info <id-or-slug> --json
vanish site rm <id-or-slug> --json
vanish site extend <id-or-slug> --days 90 --json
vanish site verify <id-or-slug> --json
```

If `vanish` is not installed, use `npx vanish-cli <command>`.

## Workflow

1. Run `vanish whoami` for identity and tier questions.
2. Run `vanish status --json` when quota, size, retention, or rate limits matter.
3. Explain the blocker and ask before running `vanish login`; it opens OAuth and saves an API key.
4. Explain the blocker and ask before running `vanish upgrade`; it opens checkout.
5. Run `vanish logout` only after explicit user confirmation, because it removes the saved API key.

## Configuration

Vanish reads config in this order:

1. CLI flags.
2. Environment variables: `VANISH_API_KEY`, `VANISH_API_URL`.
3. Config file: `~/.config/vanish/config.json`.
4. Defaults.

The config file can contain `api_key` and `api_url`. Environment variables override the file.

## Tier Limits

| Tier | Sites | File uploads | Retention | Storage | Rate limit |
|------|-------|--------------|-----------|---------|------------|
| Anonymous | 10 MB, 100 files | Images only, 5 MB max | 24h | Ephemeral | 10/hour |
| Free | 500 files | All except executables, 50 MB max | 48h | 50 MB total | 50/hour |
| Pro | 5,000 files, custom slugs | All except executables, 1 GB max | 30 days, `--days` up to 365 | 10 GB total | 500/hour |

## When To Route Here

- `--update` fails or is needed: login is required.
- `--channel` is requested: login is required.
- `--slug` or `--days` is requested: Pro is required.
- Anonymous upload fails for non-image files: login is required.
- Storage quota or file size blocks sharing: check status, then suggest cleanup or upgrade.
- The API key is missing or invalid: login again or set `VANISH_API_KEY`.
- A self-hosted or alternate API is needed: set `VANISH_API_URL`.

## Safety

Do not upload anything from this skill. Route back to `vanish-publish-site` or `vanish-upload-files` only after account or tier blockers are resolved.
