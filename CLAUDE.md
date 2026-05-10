# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vanish is a temporary mini-site and file sharing service. Users publish static folders or upload files via CLI and get public URLs that auto-expire. The project is an npm workspaces monorepo with two packages:

- **`packages/cli`** (`vanish-cli`): Node.js CLI published to npm
- **`packages/worker`** (`@vanish/worker`): Cloudflare Worker backend (private, not published)

Architecture: `CLI → HTTPS → Cloudflare Worker (Hono) → R2 (files/site assets) + D1 (metadata)`

## Commands

```bash
# Build all packages
npm run build

# Type checking (both packages)
npm run typecheck

# Run all tests
npm test

# Run a single test file
npx vitest run packages/worker/test/expiry.test.ts

# Local worker dev server (port 8787)
npm run dev:worker

# CLI dev mode (uses tsx)
npm run dev:cli

# D1 schema migrations (local)
npm run db:migrate --workspace=@vanish/worker

# Deploy worker
npm run deploy --workspace=@vanish/worker
```

## Architecture

### Worker (`packages/worker/src/`)

The worker uses **Hono** as its web framework. Routes are registered in `index.ts`.

- **`routes/`**: Each file exports a Hono route group — `sites.ts` (site API and public mini-site serving), `upload.ts` (POST /upload), `serve.ts` (GET/DELETE /f/:id), `auth.ts` (GitHub OAuth flow), `user.ts` (GET /me, GET /uploads), `keys.ts` (API key CRUD), `billing.ts` (Stripe checkout/webhooks), `landing.ts` (HTML landing page)
- **`middleware/`**: `auth.ts` extracts Bearer token, resolves user + tier (never rejects unauthenticated — sets tier to 'anonymous'). `rate-limit.ts` enforces per-user or per-IP rate limits.
- **`cron/cleanup.ts`**: Hourly cleanup of expired uploads/sites, stale auth sessions, and old rate limit records
- **`db/schema.sql`**: D1 schema (tables: users, api_keys, uploads, sites, site_files, auth_sessions, rate_limits)
- **`types.ts`**: `Env` bindings interface, `TIER_LIMITS` constant defining per-tier limits (anonymous/free/pro)
- **`lib/`**: Utilities — `api-key.ts` (generation + SHA-256 hashing), `expiry.ts` (tier-based TTL), `rate-limit.ts` (identifier extraction), `stripe.ts` (minimal Stripe client, no SDK)

### CLI (`packages/cli/src/`)

Uses **Commander** for argument parsing. Entry point is `index.ts`.

- **`commands/`**: `site.ts` (publish static folder), `upload.ts`, `login.ts` (OAuth polling flow), `ls.ts`, `rm.ts`, `status.ts`
- **`lib/`**: `config.ts` (reads `~/.config/vanish/config.json`, env vars override file), `api-client.ts`, `clipboard.ts` (cross-platform), `progress.ts` (spinner)

Agent-ready surfaces:
- Use `--json --no-clipboard` for machine handoffs; JSON errors include stable fields when available.
- Use `vanish site --dry-run --json` before public mini-site publishes.
- Use `--idempotency-key` on retry-prone agent uploads/publishes.
- Use `--channel <name>` for stable owner-scoped site URLs.
- Use `vanish bundle <files...>` when several files should share one public URL.
- Use `vanish sites ...` and `vanish keys ...` for lifecycle/API-key management.

### Tier System

Three tiers with different limits defined in `TIER_LIMITS` (`packages/worker/src/types.ts`):
- **anonymous**: Images only for file uploads, 5MB max file, static mini-sites up to 10MB, 24h retention, 10 uploads/hour
- **free**: All files, 50MB max file, 50MB total storage shared across files and mini-sites, 48h retention, 50/hour
- **pro**: All files, 1GB max file, 1GB total storage shared across files and mini-sites, 30-day default retention (configurable up to 365 days via `--days`), custom site slugs, 200/hour

### Key Patterns

- **API keys** use `vnsh_` prefix, stored as SHA-256 hashes, 48 chars total
- **File URLs** include extension: `/f/{nanoid}.{ext}` — the extension is stripped during lookup
- **Site URLs** use DNS-safe IDs or Pro slugs: `https://{id-or-slug}.vanish.sh/`; local dev uses `/s/{id}/`
- **Soft deletes**: uploads set `deleted_at` rather than hard-deleting
- **`waitUntil()`**: Non-critical DB writes (last_used_at, soft deletes) use fire-and-forget via execution context
- **Blocked extensions**: executables (.exe, .bat, .sh, .ps1, etc.) are rejected at upload

## Skill Routing

When a request involves sharing, sending as a public link, publishing, uploading to Vanish, handing off by URL, creating an external review URL, or producing a public link for an artifact, invoke a Vanish skill first instead of answering ad hoc.

- Static folders, demos, generated HTML/CSS/JS/Markdown sites, public previews, external review URLs, or temporary mini-sites → use `vanish-publish-site`
- Single or multiple files/documents, PDFs, decks, spreadsheets, reports, screenshots, images, archives, generated deliverables, or review artifacts that need a public URL → use `vanish-upload-files`
- Explicit login, logout, account status, quota, storage, retention, custom slugs, API keys, `--days`, `--slug`, anonymous/free/pro limits, or upgrade blockers after a share attempt → use `vanish-connect-upgrade`

Vanish URLs are public. Do not publish for localhost QA, in-app browser checks, local previews, native email/chat attachments, connector-specific sends, or when the user says not to upload, local only, private, or similar. Ask first when filenames or visible content suggest secrets, credentials, customer/private data, contracts, invoices, medical/legal/financial records, unreleased proprietary material, or personal data.

## Testing

Tests use **Vitest** with `globals: true` (no need to import describe/it/expect). Test files live in `test/` directories within each package. Worker tests run in Node environment (not the Workers pool for unit tests).

## Conventions

- **Commits**: Conventional Commits enforced by commitlint + husky. Use `feat:`, `fix:`, `docs:`, `chore:`, etc.
- **Release**: Automated via Release Please — only the CLI package gets published to npm
- **TypeScript**: Strict mode, ES2022 target, ESM throughout
- **Worker secrets** (set via `wrangler secret put`): `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`
- **Worker vars** (in `wrangler.toml`): `BASE_URL`, `SELF_HOSTED`, `DEFAULT_TIER`
