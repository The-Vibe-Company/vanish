---
name: vanish-publish-site
description: Use this skill when the user or workflow needs to publish, share, send as a public link, hand off by URL, or produce an external review URL for a static folder, mini-site, web demo, HTML/CSS/JS/Markdown artifact, Claude Code or Codex output directory, or generated site assets. Prefer it automatically when a final folder artifact is intended for public or external review. Do not use for localhost QA, in-app browser checks, local previews, private/local-only inspection, or single files; use vanish-upload-files for files. Ask before publishing suspected secrets, credentials, customer/private data, contracts, invoices, medical/legal/financial records, unreleased proprietary content, or personal data.
---

# Vanish Publish Site

Publish static folders through Vanish and return temporary public URLs. Use this as the primary Vanish path for Codex/Claude artifacts: browser demos, generated HTML reports, Markdown mini-sites, and shareable static folders.

## Workflow

1. Confirm the target is a directory and identify the root file served at `/`.
2. Confirm the request needs a public/shareable/external URL. Do not publish for localhost QA, in-app browser checks, or "preview/open/test it" unless the user asks for a public link.
3. Run the agent-safe dry run before upload:

```bash
vanish site <folder> --root <root-file> --dry-run --json --no-clipboard
```

If `vanish` is not installed, use `npx vanish-cli`. Inspect `warnings`, `blockedFiles`, and `errors`.

4. If the dry-run output or filenames suggest sensitive content, stop and ask before uploading.
5. Run the default JSON command, using `--verify` when a browser-preview handoff should be checked:

```bash
vanish site <folder> --root <root-file> --verify --json --no-clipboard
```

If `vanish` is not installed, use:

```bash
npx vanish-cli site <folder> --root <root-file> --json --no-clipboard
```

Return the URL, expiry, site id or slug, root path, size, file count, and any update/delete command fields from the JSON output.

If the agent may retry the same publish after network failure, include a stable key:

```bash
vanish site <folder> --root <root-file> --idempotency-key <stable-key> --json --no-clipboard
```

## Root Selection

- Prefer `index.html` when present.
- Use the user's requested root when specified.
- Use `README.md` only when the artifact is intentionally Markdown-first.
- `--root` must be a relative file path inside the folder. Do not pass absolute paths or `..`.
- Vanish serves files as-is. It does not convert Markdown to HTML or rewrite links.

## Update Existing Sites

Use this when the user asks to replace or refresh a known Vanish mini-site:

```bash
vanish site <folder> --root <root-file> --update <site-id-or-slug> --json --no-clipboard
```

`--update` requires login and ownership. If it fails for auth, route to `vanish-connect-upgrade`.

For durable agent-owned URLs, prefer channels over manually remembering site IDs:

```bash
vanish site <folder> --root <root-file> --channel <name> --json --no-clipboard
```

Channels are owner-scoped and require login. They create the first site, then update the same public URL on later runs.

## Pro Options

Use only when requested or when preserving a known public URL matters:

```bash
vanish site <folder> --root <root-file> --slug <slug> --json --no-clipboard
vanish site <folder> --root <root-file> --days <1-365> --json --no-clipboard
```

`--slug` and `--days` require Pro. If unavailable, route to `vanish-connect-upgrade`.

## Privacy Gate

Vanish creates public URLs. Ask before publishing if paths, names, or obvious content indicate:

- Secrets, credentials, keys, `.env`, `.npmrc`, `.pypirc`, `.netrc`, `.ssh`, `.aws`, tokens, or internal config.
- Private key material such as `id_rsa`, `.pem`, `.key`, `.p12`, certificates, provisioning profiles, or credential exports.
- Source maps or debug artifacts that may expose private source when the user only asked for a public preview.
- Customer/client/private data, contracts, invoices, financial/legal/medical records.
- Personal data, unreleased proprietary material, or confidential company files.

Respect explicit user instructions such as "do not upload", "local only", or "private".

## Limits And Gotchas

- Anonymous: 24h retention, 10 MB, 100 files.
- Free login: 48h retention, 50 MB total storage, 500 files per site.
- Pro: 30-day default retention, `--days` up to 365, 1 GB total storage, 1,000 files per site, custom slugs.
- Blocked site extensions include `.exe`, `.bat`, `.cmd`, `.com`, `.msi`, `.scr`, `.sh`, `.bash`, `.ps1`, `.psm1`.
- Symlinks are not supported in sites.
