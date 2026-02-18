# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vanish is a temporary file sharing service. Users upload files via CLI and get public URLs that auto-expire. The project is an npm workspaces monorepo with two packages:

- **`packages/cli`** (`vanish-cli`): Node.js CLI published to npm
- **`packages/worker`** (`@vanish/worker`): Cloudflare Worker backend (private, not published)

Architecture: `CLI → HTTPS → Cloudflare Worker (Hono) → R2 (files) + D1 (metadata)`

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

- **`routes/`**: Each file exports a Hono route group — `upload.ts` (POST /upload), `serve.ts` (GET/DELETE /f/:id), `auth.ts` (GitHub OAuth flow), `user.ts` (GET /me, GET /uploads), `keys.ts` (API key CRUD), `billing.ts` (Stripe checkout/webhooks), `landing.ts` (HTML landing page)
- **`middleware/`**: `auth.ts` extracts Bearer token, resolves user + tier (never rejects unauthenticated — sets tier to 'anonymous'). `rate-limit.ts` enforces per-user or per-IP rate limits.
- **`cron/cleanup.ts`**: Hourly cleanup of expired uploads, stale auth sessions, and old rate limit records
- **`db/schema.sql`**: D1 schema (tables: users, api_keys, uploads, auth_sessions, rate_limits)
- **`types.ts`**: `Env` bindings interface, `TIER_LIMITS` constant defining per-tier limits (anonymous/free/pro)
- **`lib/`**: Utilities — `api-key.ts` (generation + SHA-256 hashing), `expiry.ts` (tier-based TTL), `rate-limit.ts` (identifier extraction), `stripe.ts` (minimal Stripe client, no SDK)

### CLI (`packages/cli/src/`)

Uses **Commander** for argument parsing. Entry point is `index.ts`.

- **`commands/`**: `upload.ts`, `login.ts` (OAuth polling flow), `ls.ts`, `rm.ts`
- **`lib/`**: `config.ts` (reads `~/.config/vanish/config.json`, env vars override file), `api-client.ts`, `clipboard.ts` (cross-platform), `progress.ts` (spinner)

### Tier System

Three tiers with different limits defined in `TIER_LIMITS` (`packages/worker/src/types.ts`):
- **anonymous**: 2MB max file, 48h retention, 10 uploads/hour
- **free**: 50MB max file, 50MB total storage, 30-day retention, 50/hour
- **pro**: 1GB max file, 1GB total storage, unlimited retention, 200/hour

### Key Patterns

- **API keys** use `vnsh_` prefix, stored as SHA-256 hashes, 48 chars total
- **File URLs** include extension: `/f/{nanoid}.{ext}` — the extension is stripped during lookup
- **Soft deletes**: uploads set `deleted_at` rather than hard-deleting
- **`waitUntil()`**: Non-critical DB writes (last_used_at, soft deletes) use fire-and-forget via execution context
- **Blocked extensions**: executables (.exe, .bat, .sh, .ps1, etc.) are rejected at upload

## Testing

Tests use **Vitest** with `globals: true` (no need to import describe/it/expect). Test files live in `test/` directories within each package. Worker tests run in Node environment (not the Workers pool for unit tests).

## Conventions

- **Commits**: Conventional Commits enforced by commitlint + husky. Use `feat:`, `fix:`, `docs:`, `chore:`, etc.
- **Release**: Automated via Release Please — only the CLI package gets published to npm
- **TypeScript**: Strict mode, ES2022 target, ESM throughout
- **Worker secrets** (set via `wrangler secret put`): `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`
- **Worker vars** (in `wrangler.toml`): `BASE_URL`, `SELF_HOSTED`, `DEFAULT_TIER`
