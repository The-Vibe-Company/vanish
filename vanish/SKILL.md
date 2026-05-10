---
name: vanish
description: Legacy compatibility shim for explicit `$vanish` invocations or existing Vanish skill references only. Do not use this skill for implicit routing. For public static folders use vanish-publish-site, for public file/document URLs use vanish-upload-files, and for explicit account/status/quota/upgrade blockers use vanish-connect-upgrade.
---

# Vanish Legacy Shim

This compatibility shim prevents older `$vanish` invocations from using stale monolithic guidance.

Route immediately:

- Public static folder, demo, generated site, HTML/CSS/JS/Markdown mini-site, or external review URL: use `vanish-publish-site`.
- Public URL for a file, document, report, screenshot, deck, spreadsheet, image, archive, or generated deliverable: use `vanish-upload-files`.
- Explicit login, logout, status, quota, retention, config, API key, custom slug, `--days`, or upgrade blocker: use `vanish-connect-upgrade`.

Do not upload from this shim. Load the specific Vanish skill and follow its privacy gate.
