---
name: vanish-upload-files
description: Use this skill when the user or workflow needs to share by public link, send a URL, attach as a public URL, upload to Vanish, publish, hand off by URL, or create a public URL for one or more files or documents, including PDFs, DOCX, PPTX, XLSX, Markdown, images, screenshots, reports, archives, generated deliverables, or review artifacts. Prefer it automatically when a final artifact should be externally accessible by URL. Do not use for local-only reading, summarizing, editing, native email/chat attachments, connector-specific sends, or inspection. Ask before uploading suspected secrets, credentials, customer/private data, contracts, invoices, medical/legal/financial records, unreleased proprietary content, or personal data.
---

# Vanish Upload Files

Upload files through Vanish and return temporary public URLs. Use this for documents, screenshots, generated reports, decks, spreadsheets, images, and any single-file artifact that needs to be shared outside the workspace. Use `vanish-publish-site` instead when the deliverable is a static folder or browser preview.

## Workflow

1. Confirm each target exists and is a file.
2. If the task clearly asks for a public link, upload without asking unless the privacy gate applies.
3. If filenames or visible content suggest sensitive material, stop and ask before uploading.
4. Run the default JSON command:

```bash
vanish upload <files...> --json --no-clipboard
```

If `vanish` is not installed, use:

```bash
npx vanish-cli upload <files...> --json --no-clipboard
```

Return the URL, id, filename, size, expiry, and any delete command field from the JSON output.

If the agent may retry after a network failure, include a stable key:

```bash
vanish upload <files...> --idempotency-key <stable-key> --json --no-clipboard
```

Structured JSON errors include `code`, `message`, `hint`, `retryable`, `status`, `limits`, and `upgradeRequired` when available.

For multiple related files that should share one URL, use the bundle command:

```bash
vanish bundle report.pdf screenshot.png logs.txt --json --no-clipboard
```

## Output Formats

Use these only when they match the destination:

```bash
vanish upload image.png --md --no-clipboard
vanish upload data.json --json --no-clipboard
vanish upload file1.pdf file2.png --json --no-clipboard
```

`--md` prints Markdown image syntax and is best for screenshots or images in issues, PRs, and docs.

The shorthand `vanish <file>` is valid for casual use, but prefer explicit `vanish upload` in agent workflows.

## Retention

Use custom retention only when the user asks for a longer-lived link or the artifact must remain available beyond the default:

```bash
vanish upload report.pdf --days 90 --json --no-clipboard
```

`--days` requires Pro and supports 1-365 days. If unavailable, route to `vanish-connect-upgrade`.

## Privacy Gate

Vanish creates public URLs. Ask before uploading if paths, names, or obvious content indicate:

- Secrets, credentials, keys, `.env`, tokens, or internal config.
- Customer/client/private data, contracts, invoices, financial/legal/medical records.
- Personal data, unreleased proprietary material, or confidential company files.

Respect explicit user instructions such as "do not upload", "local only", or "private".

## Limits And Gotchas

- Anonymous: image uploads only, 5 MB max, 24h retention.
- Free login: all non-executable file types, 50 MB max file, 50 MB total storage, 48h retention.
- Pro: all non-executable file types, 1 GB max file, 1 GB total storage, 30-day default retention, `--days` up to 365.
- Blocked upload extensions: `.exe`, `.bat`, `.cmd`, `.com`, `.msi`, `.scr`, `.sh`, `.bash`, `.ps1`, `.psm1`.
- Multiple uploads return multiple results. Copying to clipboard is disabled by default in this skill with `--no-clipboard`.
