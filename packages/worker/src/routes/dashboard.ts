import { Hono } from 'hono';
import type { Env } from '../types.js';
import { PLAN_PRICES_EUR, TIER_LIMITS } from '../types.js';
import { POSTHOG_MASK_USER_CONTENT, posthogConfig, posthogInitScript } from '../lib/posthog.js';

const dashboard = new Hono<{ Bindings: Env }>();

dashboard.get('/dashboard', (c) => {
  const baseUrl = c.env.BASE_URL;
  const selfHosted = c.env.SELF_HOSTED === 'true';
  const analytics = posthogInitScript(posthogConfig(c.env, c.req.url), POSTHOG_MASK_USER_CONTENT);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a4bb0">
<meta name="referrer" content="no-referrer">
<title>vanish · dashboard</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='3' fill='%230a4bb0'/%3E%3Crect x='5' y='11' width='22' height='10' rx='5' fill='%23ffffff'/%3E%3Crect x='5' y='11' width='6' height='10' rx='3' fill='%23ffffff'/%3E%3Crect x='21' y='11' width='6' height='10' rx='3' fill='%231f7a44'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Narrow:wght@400;500;600&family=Oswald:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --blue: #0a4bb0;
  --blue-d: #083a8a;
  --blue-l: #e3ebf8;
  --blue-lit: #5fb4ff;
  --white: #fff;
  --ink: #0a2a63;
  --dim: #46587a;
  --mute: #7a88a3;
  --rule: #c4d1ea;
  --green: #14893f;
  --green-lit: #2fcf6a;
  --orange: #d97a00;
  --orange-l: #fff1dd;
  --red: #c62828;
  --red-l: #fde7e7;
  --focus: #ffd400;
  --head: 'Oswald', 'Archivo Narrow', 'Arial Narrow', sans-serif;
  --body: 'Archivo Narrow', 'Arial Narrow', system-ui, sans-serif;
  --mono: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace;
  --plate-r: 16px;
  --ease: cubic-bezier(.16, 1, .3, 1);
}

html { background: var(--blue); }
body {
  min-height: 100vh;
  overflow-x: hidden;
  background: var(--blue);
  color: var(--white);
  font: 400 16px/1.45 var(--body);
  -webkit-font-smoothing: antialiased;
}
::selection { background: var(--focus); color: var(--ink); }
a { color: inherit; text-decoration: none; }
button { font-family: inherit; font-size: inherit; background: none; border: 0; color: inherit; cursor: pointer; }
input, select, textarea { font-family: inherit; font-size: inherit; }
svg { display: block; }
code { font-family: var(--mono); font-size: .9em; }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }

/* Engraved labels: small condensed capitals, used for every column head and field label */
.engraved, .sb-section-label, .stat-label, .er-kind, .er-time-label, .site-time-label, .sd-label,
.files-head, .keys-head, .bf-row.bf-head, .curl-label, .bh-tag, .bh-l, .form-row label, .domain-field span,
.qc-label, .tier-tag, .pill, .ov-section-sub, .fb-limit, .login-divider {
  font-family: var(--head);
  font-weight: 600;
  font-size: 12px;
  line-height: 1.2;
  letter-spacing: .12em;
  text-transform: uppercase;
}

/* Layout */
.app { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; }
.main { width: 100%; max-width: 1280px; padding: 2.6rem clamp(1.5rem, 3.5vw, 3.5rem) 5rem; min-width: 0; }

/* Sidebar: the sign's left rail */
.sidebar {
  position: sticky; top: 0; height: 100vh;
  display: flex; flex-direction: column;
  padding: 1.4rem 1.1rem 1.2rem;
  border-right: 3px solid rgba(255,255,255,.35);
}
.sb-brand { padding: .2rem .4rem 1.2rem; margin-bottom: 1.2rem; border-bottom: 3px solid var(--white); }
.sb-logo { display: inline-flex; align-items: center; gap: .55rem; min-height: 44px; }
.sb-mark { display: none; }
.sb-wordmark { font: 700 32px/1 var(--head); letter-spacing: .02em; text-transform: lowercase; color: var(--white); }
.sb-wordmark .dot { display: none; }
.sb-version { display: none; }

.sb-nav { display: flex; flex-direction: column; gap: .25rem; }
.sb-section-label { padding: 0 .6rem .55rem; color: rgba(255,255,255,.75); }
.sb-item {
  position: relative;
  display: flex; align-items: center; gap: .7rem;
  min-height: 46px; padding: .55rem .7rem;
  border-radius: 10px;
  color: var(--white);
  font: 600 18px/1 var(--head);
  letter-spacing: .05em; text-transform: uppercase;
  text-align: left;
  transition: background .15s var(--ease), color .15s var(--ease);
}
.sb-item:hover { background: rgba(255,255,255,.12); }
.sb-item.active { background: var(--white); color: var(--blue); }
.sb-icon { flex-shrink: 0; color: rgba(255,255,255,.8); }
.sb-item.active .sb-icon { color: var(--blue); }
.sb-dot { display: none; }

.sb-foot { margin-top: auto; display: flex; flex-direction: column; gap: .9rem; padding-top: 1rem; }
.sb-upgrade {
  padding: .9rem 1rem;
  border-radius: 14px;
  background: var(--white); color: var(--ink);
  text-align: left; cursor: pointer;
  transition: transform .15s var(--ease);
}
.sb-upgrade:hover { transform: translateY(-1px); }
.sb-upgrade-head { display: flex; align-items: center; gap: .5rem; color: var(--blue); font: 700 18px/1 var(--head); text-transform: uppercase; letter-spacing: .04em; }
.sb-upgrade-body { margin-top: .4rem; color: var(--dim); font-size: 14px; line-height: 1.4; }
.sb-upgrade-cta { margin-top: .55rem; display: flex; justify-content: space-between; align-items: center; color: var(--ink); font: 600 16px/1 var(--head); letter-spacing: .04em; }
.sb-arrow { color: var(--green); }

.sb-user { display: flex; align-items: center; gap: .6rem; padding: .8rem .3rem .2rem; border-top: 3px solid rgba(255,255,255,.35); }
.sb-avatar {
  width: 36px; height: 36px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  border: 3px solid var(--white);
  background: var(--green-lit); color: var(--ink);
  font: 700 16px/1 var(--head);
}
.sb-user-meta { min-width: 0; flex: 1; }
.sb-user-name { color: var(--white); font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-user-tier { display: flex; align-items: center; gap: .45rem; margin-top: .15rem; }
.sb-user-since { color: rgba(255,255,255,.75); font-size: 13px; }
.sb-signout { margin-left: auto; min-width: 36px; min-height: 36px; border-radius: 8px; color: rgba(255,255,255,.8); font-size: 14px; }
.sb-signout:hover { color: var(--white); background: rgba(255,255,255,.14); }
.sidebar .tier-tag { color: var(--white); border-color: rgba(255,255,255,.6); background: transparent; }

/* Tags, pills, lamps */
.tier-tag, .pill {
  display: inline-flex; align-items: center; gap: .35rem;
  padding: .15rem .5rem;
  border-radius: 999px;
  border: 2px solid var(--rule);
  color: var(--dim);
  white-space: nowrap;
}
.tier-free { color: var(--green); border-color: var(--green); }
.tier-pro { color: var(--white); border-color: var(--blue); background: var(--blue); }
.tier-anonymous { color: var(--dim); }
.pill-green { color: var(--green); border-color: var(--green); }
.pill-gold { color: var(--orange); border-color: var(--orange); }
.pill-red { color: var(--red); border-color: var(--red); }
.pill-mute { color: var(--mute); }

.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 2px solid currentColor; background: currentColor; }
.dot-green { color: var(--green); background: var(--green-lit); }
.dot-gold { color: var(--orange); background: #ffb347; }
.dot-red { color: var(--red); background: #ff6b6b; }
.dot-mute { color: var(--mute); background: transparent; }
.dot-pulse { animation: lamp 1.8s ease-in-out infinite; }
.dot-pulse.dot-green { box-shadow: 0 0 0 3px rgba(47,207,106,.25); }
.dot-pulse.dot-gold { box-shadow: 0 0 0 3px rgba(217,122,0,.2); }
@keyframes lamp { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }

/* Page head: the sign's title */
.page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 2rem; padding-bottom: 1.2rem; border-bottom: 3px solid var(--white); }
.page-title { font: 700 clamp(40px, 5vw, 64px)/1 var(--head); text-transform: uppercase; letter-spacing: .01em; color: var(--white); }
.page-sub { margin-top: .5rem; color: rgba(255,255,255,.85); font: 500 14px/1.4 var(--mono); }
.page-sub .tier-tag { color: var(--white); border-color: var(--white); vertical-align: middle; }
.page-head-actions { display: flex; gap: .5rem; }

/* Section heads inside the main area (white on blue) */
.ov-section-head h2, .ov-card-head h2, .curl-section h3, .billing-features h2, .set-section h2 {
  font: 700 26px/1 var(--head); text-transform: uppercase; letter-spacing: .02em;
}
.ov-section-head h2, .curl-section h3, .billing-features h2, .set-section h2 { color: var(--white); }
.ov-card-head h2 { color: var(--blue); }
.billing-features h2, .set-section h2 { margin-bottom: 1rem; padding-bottom: .6rem; border-bottom: 3px solid rgba(255,255,255,.35); }
.danger-section h2 { color: #ffb4b4; border-color: rgba(255,180,180,.5); }

/* Enamel plates: white, ink text, blue inner rule on the big ones */
.plate, .stat-card, .ov-card, .expiring-list, .files-list, .keys-list, .set-rows, .bf-table, .site-row, .file-card,
.bh-current, .bh-pro, .curl-card, .key-reveal, .filter-bar, .files-banner, .empty.subtle, .modal, .toast, .login-card {
  background: var(--white);
  color: var(--ink);
  border-radius: var(--plate-r);
}
.stat-card, .ov-card, .bh-current, .bh-pro, .modal { position: relative; }
.stat-card::before, .ov-card::before, .bh-current::before, .bh-pro::before, .modal::before {
  content: ''; position: absolute; inset: 7px;
  border: 2px solid var(--blue); border-radius: calc(var(--plate-r) - 7px);
  pointer-events: none;
}

/* Buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
  min-height: 42px; padding: 0 1rem;
  border-radius: 10px;
  border: 3px solid var(--blue);
  font: 600 15px/1 var(--head); letter-spacing: .07em; text-transform: uppercase;
  white-space: nowrap;
  transition: background .15s var(--ease), color .15s var(--ease), border-color .15s var(--ease), opacity .15s var(--ease);
}
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn.ghost { background: var(--white); color: var(--blue); }
.btn.ghost:hover:not(:disabled) { background: var(--blue-l); }
.btn.solid { background: var(--blue); color: var(--white); }
.btn.solid:hover:not(:disabled) { background: var(--blue-d); border-color: var(--blue-d); }
.btn.danger { background: var(--red); border-color: var(--red); color: var(--white); }
.btn.danger-ghost { background: var(--white); border-color: var(--red); color: var(--red); }
.btn.danger-ghost:hover:not(:disabled) { background: var(--red-l); }
.btn-sm { min-height: 36px; padding: 0 .8rem; font-size: 14px; border-width: 2px; }
.btn-xs { min-height: 32px; padding: 0 .65rem; font-size: 13px; border-width: 2px; }
.btn-lg { min-height: 50px; padding: 0 1.4rem; font-size: 17px; }
.btn code { text-transform: none; letter-spacing: 0; }
.btn-arrow { transition: transform .2s var(--ease); }
.btn:hover .btn-arrow { transform: translateX(2px); }
.iconbtn {
  width: 34px; height: 34px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 2px solid var(--rule); border-radius: 8px;
  color: var(--dim); font: 600 12px/1 var(--head); letter-spacing: .05em; text-transform: uppercase;
  transition: color .15s var(--ease), border-color .15s var(--ease), background .15s var(--ease);
}
.iconbtn:hover { color: var(--blue); border-color: var(--blue); background: var(--blue-l); }
.iconbtn.iconbtn-danger:hover { color: var(--red); border-color: var(--red); background: var(--red-l); }

/* Toast */
.toast {
  position: fixed; bottom: 1.6rem; left: 50%; z-index: 200;
  transform: translateX(-50%);
  padding: .7rem 1.2rem;
  border: 3px solid var(--blue); border-radius: 12px;
  font: 600 15px/1 var(--head); letter-spacing: .05em; text-transform: uppercase;
  opacity: 0; pointer-events: none; transition: opacity .2s var(--ease);
}
.toast.show { opacity: 1; }

/* Progress */
.pbar { width: 100%; height: 8px; background: var(--blue-l); border-radius: 4px; overflow: hidden; }
.pbar-fill { height: 100%; }
.pbar-accent { background: var(--blue); }
.pbar-red { background: var(--red); }

/* Overview */
.ov-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; margin-bottom: 2.5rem; }
.stat-card { display: flex; flex-direction: column; gap: .2rem; min-height: 150px; padding: 1.3rem 1.4rem 1.2rem; }
.stat-label { color: var(--blue); }
.stat-value { margin-top: .2rem; color: var(--blue); font: 700 44px/1 var(--head); letter-spacing: .01em; }
.stat-sub { color: var(--dim); font-size: 15px; }
.stat-detail { margin-top: .4rem; color: var(--dim); font: 500 12px/1.5 var(--mono); }
.stat-progress { margin-top: auto; padding-top: .7rem; }

.ov-section { margin-bottom: 2.5rem; }
.ov-section-head { display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.ov-section-sub { color: rgba(255,255,255,.8); }

.expiring-list { display: flex; flex-direction: column; overflow: hidden; }
.expiring-row {
  display: grid; grid-template-columns: 1.5fr auto 1fr auto;
  gap: 1rem; align-items: center;
  padding: .85rem 1.2rem;
  border-bottom: 2px solid var(--rule);
  font-size: 15px;
}
.expiring-row:last-child { border-bottom: 0; }
.expiring-row.warn { background: var(--orange-l); }
.expiring-row.critical { background: var(--red-l); }
.er-left { display: flex; align-items: center; gap: .6rem; min-width: 0; }
.er-kind { color: var(--blue); }
.er-name { color: var(--ink); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.er-mid { color: var(--dim); font: 500 13px/1 var(--mono); }
.er-time { display: flex; flex-direction: column; align-items: flex-end; gap: .15rem; }
.er-time-label { color: var(--mute); }
.er-time-val { color: var(--orange); font: 700 16px/1 var(--mono); font-variant-numeric: tabular-nums; }
.expiring-row.critical .er-time-val { color: var(--red); }
.er-actions { display: flex; gap: .4rem; }

.ov-two-col { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 1rem; }
.ov-two-col > * { min-width: 0; }
.ov-card { padding: 1.4rem; min-width: 0; }
.ov-card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: 1rem; }
.ov-link { color: var(--blue); font: 600 14px/1 var(--head); letter-spacing: .06em; text-transform: uppercase; }
.ov-link:hover { text-decoration: underline; }

.ov-recent { display: flex; flex-direction: column; gap: .3rem; }
.recent-row {
  display: flex; align-items: center; gap: .8rem; width: 100%;
  padding: .55rem .6rem; border-radius: 10px;
  text-align: left; transition: background .15s var(--ease);
}
.recent-row:hover { background: var(--blue-l); }
.recent-thumb {
  width: 40px; height: 40px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px;
  background: var(--blue); color: var(--white);
  font: 700 12px/1 var(--mono); letter-spacing: .04em; text-transform: uppercase;
}
.recent-thumb span { color: var(--white); }
.recent-meta { flex: 1; min-width: 0; }
.recent-name { color: var(--ink); font-size: 16px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-name .acc { color: var(--blue); }
.recent-sub { margin-top: .1rem; color: var(--dim); font-size: 14px; }

.ov-quickref { display: flex; flex-direction: column; gap: .7rem; min-width: 0; }
.qc { min-width: 0; }
.qc-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: .3rem; }
.qc-label { color: var(--dim); }
.qc-cmd {
  display: flex; align-items: center; gap: .6rem; width: 100%; max-width: 100%;
  padding: .7rem .8rem;
  border-radius: 10px;
  background: var(--blue); color: var(--white);
  font: 500 14px/1.4 var(--mono);
  text-align: left; overflow: hidden; white-space: nowrap;
  transition: background .15s var(--ease);
}
.qc-cmd:hover { background: var(--blue-d); }
.qc-prompt { opacity: .7; }
.qc-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.qc-copy { font: 600 12px/1 var(--head); letter-spacing: .08em; text-transform: uppercase; opacity: .85; }
.ov-pro-banner {
  margin-top: 1rem; width: 100%;
  display: flex; justify-content: space-between; align-items: center; gap: 1rem;
  padding: .8rem 1rem;
  border: 3px solid var(--blue); border-radius: 12px;
  background: var(--white); color: var(--ink);
  font-size: 15px; text-align: left;
  transition: background .15s var(--ease);
}
.ov-pro-banner:hover { background: var(--blue-l); }
.ov-pro-arrow { color: var(--blue); font: 600 15px/1 var(--head); letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }

/* Filter bar */
.filter-bar {
  display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;
  margin-bottom: 1.2rem; padding: .7rem .8rem;
}
.tabs { display: flex; gap: .3rem; flex-wrap: wrap; }
.tab {
  display: inline-flex; align-items: center; gap: .45rem;
  min-height: 38px; padding: 0 .85rem;
  border-radius: 999px;
  color: var(--blue);
  font: 600 15px/1 var(--head); letter-spacing: .06em; text-transform: uppercase;
  transition: color .15s var(--ease), background .15s var(--ease);
}
.tab:hover { background: var(--blue-l); }
.tab.active { background: var(--blue); color: var(--white); }
.tab-count { padding: .1rem .45rem; border-radius: 8px; background: var(--blue-l); color: var(--dim); font: 600 12px/1.4 var(--mono); font-variant-numeric: tabular-nums; }
.tab.active .tab-count { background: rgba(255,255,255,.22); color: var(--white); }
.filter-tools { display: flex; gap: .5rem; align-items: center; }
.search {
  display: inline-flex; align-items: center; gap: .5rem;
  min-height: 40px; padding: 0 .7rem;
  border: 2px solid var(--rule); border-radius: 10px;
  color: var(--dim);
  transition: border-color .15s var(--ease);
}
.search:focus-within { border-color: var(--blue); }
.search input { width: 230px; background: none; border: 0; outline: none; color: var(--ink); font-size: 15px; }
.search-clear { color: var(--mute); font-size: 1.2rem; line-height: 1; padding: 0 .2rem; min-width: 28px; min-height: 28px; }
.search-clear:hover { color: var(--ink); }
.sort { min-height: 40px; padding: 0 .7rem; border: 2px solid var(--rule); border-radius: 10px; background: var(--white); color: var(--ink); font-size: 15px; }
.view-toggle { display: inline-flex; border: 2px solid var(--rule); border-radius: 10px; overflow: hidden; }
.view-toggle button { min-width: 40px; min-height: 36px; display: grid; place-items: center; color: var(--dim); border-right: 2px solid var(--rule); }
.view-toggle button:last-child { border-right: 0; }
.view-toggle button.active { color: var(--white); background: var(--blue); }

/* Sites */
.sites-grid { display: flex; flex-direction: column; gap: .6rem; }
.site-row { overflow: hidden; transition: box-shadow .15s var(--ease); }
.site-row:hover { box-shadow: inset 0 0 0 3px var(--blue); }
.site-row.site-expiring { background: var(--orange-l); }
.site-row.site-expired { opacity: .6; }
.site-main {
  width: 100%;
  display: grid; grid-template-columns: auto 1fr auto auto;
  gap: 1rem; align-items: center;
  padding: .9rem 1.2rem; text-align: left;
}
.site-thumb {
  width: 44px; height: 44px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 10px;
  background: var(--blue); color: var(--white);
}
.site-thumb-mark { font: 700 12px/1 var(--mono); letter-spacing: .04em; text-transform: uppercase; }
.site-meta { min-width: 0; }
.site-name { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; color: var(--ink); font-size: 18px; font-weight: 600; word-break: break-all; }
.site-sub { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: .2rem; color: var(--dim); font-size: 14px; }
.site-sub code { color: var(--ink); }
.site-sep { color: var(--mute); }
.site-time { display: flex; flex-direction: column; align-items: flex-end; gap: .15rem; }
.site-time-label { color: var(--mute); }
.site-time-val { color: var(--ink); font: 700 16px/1 var(--mono); font-variant-numeric: tabular-nums; }
.site-time-val.expiring { color: var(--orange); }
.site-time-val.expired { color: var(--red); }
.site-chev { color: var(--blue); transition: transform .2s var(--ease); }
.site-row.open .site-chev { transform: rotate(180deg); }
.site-detail { padding: 1rem 1.2rem 1.2rem; border-top: 3px solid var(--blue); background: var(--white); animation: detailIn .18s ease-out; }
@keyframes detailIn { from { opacity: 0; } to { opacity: 1; } }
.sd-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem 1.4rem; margin-bottom: 1rem; }
.sd-field { display: flex; flex-direction: column; gap: .25rem; min-width: 0; }
.sd-label { color: var(--blue); }
.sd-val { color: var(--ink); font-size: 15px; overflow: hidden; text-overflow: ellipsis; }
.sd-mono { color: var(--ink); font-size: 14px; overflow-wrap: anywhere; }
.sd-url { display: inline-flex; align-items: center; gap: .45rem; color: var(--blue); font: 700 15px/1.3 var(--mono); text-align: left; overflow-wrap: anywhere; }
.sd-url:hover { text-decoration: underline; }
.sd-actions { display: flex; gap: .45rem; flex-wrap: wrap; padding-top: .9rem; border-top: 2px solid var(--rule); }
.sd-spacer { flex: 1; }

/* Files */
.files-banner { margin-bottom: 1.2rem; padding: 1rem 1.2rem; border: 3px solid var(--blue); }
.fb-inner { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
.fb-inner > svg { flex-shrink: 0; color: var(--blue); }
.fb-text { flex: 1; font-size: 16px; color: var(--ink); }
.fb-text strong { color: var(--blue); font-weight: 600; }
.fb-text code { background: var(--blue-l); padding: 1px 5px; border-radius: 5px; }
.fb-limit { color: var(--dim); }

.files-list { overflow: hidden; }
.files-head, .file-row {
  display: grid; grid-template-columns: 2fr .8fr .7fr 1fr 1fr 110px;
  gap: .8rem; align-items: center; padding: .65rem 1.2rem;
}
.files-head { color: var(--blue); border-bottom: 3px solid var(--blue); }
.file-row { font-size: 15px; border-bottom: 2px solid var(--rule); transition: background .15s var(--ease); }
.file-row:last-child { border-bottom: 0; }
.file-row:hover { background: var(--blue-l); }
.file-row.expired { opacity: .55; }
.file-row.expired .fn { text-decoration: line-through; }
.file-name { display: flex; align-items: center; gap: .6rem; min-width: 0; }
.fn { color: var(--ink); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-icon { flex-shrink: 0; color: var(--blue); }
.kind-image { color: var(--blue); }
.kind-video { color: var(--red); }
.kind-doc { color: var(--dim); }
.kind-data { color: var(--green); }
.file-mime code { color: var(--dim); font-size: 13px; }
.file-actions { display: flex; gap: .3rem; justify-self: end; }
.dim { color: var(--dim); }
.warn { color: var(--orange); }

.files-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: .8rem; }
.file-card { display: flex; flex-direction: column; gap: .5rem; padding: 1rem; transition: box-shadow .15s var(--ease); }
.file-card:hover { box-shadow: inset 0 0 0 3px var(--blue); }
.file-card.expired { opacity: .55; }
.fc-thumb { height: 92px; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--blue-l); color: var(--blue); }
.fc-name { color: var(--ink); font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fc-meta { display: flex; gap: .4rem; color: var(--dim); font-size: 14px; }
.fc-sep { color: var(--mute); }
.fc-actions { display: flex; gap: .3rem; flex-wrap: wrap; margin-top: auto; }

/* Empty states */
.empty.subtle { padding: 2.4rem 1.2rem; text-align: center; color: var(--dim); font-size: 16px; }
.empty-mark { display: inline-block; margin-right: .5rem; color: var(--blue); font-size: 1.1rem; }
.empty code { background: var(--blue); color: var(--white); padding: .1rem .4rem; border-radius: 5px; font-size: .9em; }

/* Modal */
.modal-bg { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: rgba(8,58,138,.7); animation: bgIn .18s ease-out; }
@keyframes bgIn { from { opacity: 0; } to { opacity: 1; } }
.modal { width: 440px; max-width: 92vw; padding: 7px; animation: modalIn .22s cubic-bezier(.16,1,.3,1); }
@keyframes modalIn { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
.modal-wide { width: 560px; }
.modal-head { padding: 1.1rem 1.25rem .6rem; color: var(--blue); font: 700 28px/1 var(--head); text-transform: uppercase; letter-spacing: .02em; }
.modal-body { padding: .4rem 1.25rem 1.1rem; color: var(--ink); font-size: 16px; line-height: 1.5; }
.modal-actions { display: flex; justify-content: flex-end; gap: .5rem; padding: .9rem 1.25rem 1.1rem; border-top: 2px solid var(--rule); }
.form-row { display: flex; flex-direction: column; gap: .35rem; margin-bottom: 1rem; }
.form-row:last-child { margin-bottom: 0; }
.form-row label { color: var(--blue); }
.form-row input, .form-row select { width: 100%; min-height: 44px; padding: .5rem .75rem; border: 2px solid var(--rule); border-radius: 10px; background: var(--white); color: var(--ink); font-size: 16px; }
.form-row input:focus, .form-row select:focus { outline: none; border-color: var(--blue); }
.form-hint { color: var(--dim); font-size: 14px; }
.form-error { margin-top: .5rem; color: var(--red); font-size: 14px; line-height: 1.5; }
.form-error[hidden] { display: none; }
.domain-fields { display: flex; justify-content: flex-end; align-items: flex-end; gap: .5rem; flex-wrap: wrap; min-width: 0; }
.domain-field { display: flex; flex: 1 1 170px; flex-direction: column; gap: .3rem; min-width: min(170px, 100%); }
.domain-field span { color: var(--blue); }
.domain-field input { width: 100%; min-width: 0; min-height: 40px; padding: .4rem .7rem; border: 2px solid var(--rule); border-radius: 10px; background: var(--white); color: var(--ink); }
.domain-field input:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.domain-value, .domain-record code { overflow-wrap: anywhere; word-break: break-word; }

/* Keys */
.key-reveal { margin-bottom: 1.5rem; padding: 1.1rem 1.3rem; border: 3px solid var(--orange); animation: revealIn .3s cubic-bezier(.16,1,.3,1); }
@keyframes revealIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.kr-head { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; margin-bottom: .8rem; color: var(--ink); font-size: 16px; }
.kr-warn { color: var(--orange); font-weight: 600; }
.kr-body { display: flex; align-items: center; gap: .55rem; flex-wrap: wrap; }
.kr-key { flex: 1; min-width: 0; padding: .7rem .9rem; border: 2px solid var(--blue); border-radius: 10px; background: var(--blue-l); color: var(--blue); font-size: 15px; word-break: break-all; }
.kr-foot { margin-top: .8rem; color: var(--dim); font-size: 14px; line-height: 1.6; }
.kr-foot code { color: var(--ink); }
.keys-list { overflow: hidden; margin-bottom: 2rem; }
.keys-head, .key-row {
  display: grid; grid-template-columns: 1fr 1.2fr 1fr 1fr 110px;
  gap: 1rem; align-items: center; padding: .7rem 1.2rem;
}
.keys-head { color: var(--blue); border-bottom: 3px solid var(--blue); }
.key-row { font-size: 15px; border-bottom: 2px solid var(--rule); }
.key-row:last-child { border-bottom: 0; }
.key-row:hover { background: var(--blue-l); }
.key-row.revoked { opacity: .55; }
.key-name { color: var(--ink); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.key-prefix { display: flex; align-items: center; gap: .4rem; min-width: 0; }
.key-prefix code { color: var(--blue); font-size: 14px; }
.key-mask { flex: 1; min-width: 0; overflow: hidden; color: var(--mute); font-size: 12px; letter-spacing: -1px; }
.key-actions { justify-self: end; }
.curl-section { margin-top: 2rem; }
.curl-section h3 { margin-bottom: .8rem; }
.curl-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; }
.curl-card { overflow: hidden; }
.curl-label { display: flex; justify-content: space-between; align-items: center; padding: .6rem 1rem; color: var(--blue); border-bottom: 3px solid var(--blue); }
.curl-copy { color: var(--blue); font: inherit; min-height: 28px; }
.curl-copy:hover { text-decoration: underline; }
.curl-pre { padding: .9rem 1rem; color: var(--ink); font: 400 14px/1.7 var(--mono); overflow-x: auto; white-space: pre; }
.cu-d { color: var(--mute); }
.cu-key { color: var(--green); font-weight: 700; }

/* Billing */
.billing-hero { margin-bottom: 1rem; }
.billing-plans { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-bottom: 2.5rem; }
.bh-current { padding: 1.5rem 1.6rem; }
.bh-tag { color: var(--blue); }
.bh-tier { display: flex; align-items: baseline; gap: .8rem; margin: .3rem 0 1.2rem; color: var(--blue); font: 700 44px/1 var(--head); text-transform: uppercase; }
.bh-price { color: var(--dim); font: 500 14px/1 var(--mono); }
.bh-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
.bh-l { color: var(--mute); }
.bh-v { margin: .25rem 0 .4rem; color: var(--ink); font: 700 20px/1 var(--mono); font-variant-numeric: tabular-nums; }
.bh-of { color: var(--dim); font-size: 13px; font-weight: 400; }
.bh-storage-note { margin-top: 1rem; padding-top: .8rem; border-top: 2px solid var(--rule); color: var(--dim); font: 500 13px/1.5 var(--mono); }
.bh-pro { display: flex; flex-direction: column; gap: 1rem; padding: 1.5rem 1.6rem; background: var(--blue); color: var(--white); }
.bh-pro::before { border-color: var(--white); }
.bh-pro-head { display: flex; align-items: center; gap: .55rem; flex-wrap: wrap; color: var(--white); font: 700 26px/1 var(--head); text-transform: uppercase; letter-spacing: .02em; }
.bh-pro-price { margin-left: auto; color: var(--white); font: 700 22px/1 var(--head); letter-spacing: .03em; text-align: right; }
.bh-pro-price span { font-size: 14px; font-weight: 500; opacity: .85; }
.bh-pro-list { list-style: none; display: flex; flex-direction: column; gap: .4rem; color: var(--white); font-size: 16px; }
.bh-pro-list li { display: flex; align-items: baseline; gap: .55rem; }
.bh-pro-list code { color: var(--white); background: rgba(255,255,255,.15); padding: 0 .35rem; border-radius: 4px; }
.bh-check { color: var(--green-lit); font-weight: 700; }
.bh-pro .btn.solid { background: var(--white); border-color: var(--white); color: var(--blue); align-self: flex-start; }
.bh-pro .btn.solid:hover:not(:disabled) { background: var(--blue-l); border-color: var(--blue-l); }
.bh-pro-meta { color: rgba(255,255,255,.85); font-size: 14px; }
.bf-table { overflow: hidden; }
.bf-row { display: grid; grid-template-columns: 1.25fr .8fr 1fr; align-items: center; padding: .8rem 1.2rem; border-bottom: 2px solid var(--rule); font-size: 15px; }
.bf-row:last-child { border-bottom: 0; }
.bf-row.bf-head { color: var(--blue); border-bottom: 3px solid var(--blue); }
.bf-pro-col { display: flex; align-items: baseline; gap: .55rem; color: var(--blue); }
.bf-pro-price { font-size: 12px; color: var(--dim); letter-spacing: 0; text-transform: none; font-family: var(--mono); }
.bf-k { color: var(--ink); }
.bf-free { color: var(--dim); }
.bf-pro { color: var(--ink); font-weight: 600; }
.bf-row.bf-highlight { background: var(--blue-l); }
.bf-row.bf-highlight .bf-pro { color: var(--blue); }

/* Settings */
.set-section { margin-bottom: 2.5rem; }
.set-blurb { margin-bottom: 1rem; color: var(--white); font-size: 16px; line-height: 1.6; }
.set-blurb code { background: rgba(255,255,255,.14); padding: 0 .35rem; border-radius: 4px; }
.set-rows { overflow: hidden; }
.set-row { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1.5rem; align-items: center; padding: 1rem 1.3rem; border-bottom: 2px solid var(--rule); }
.set-row > * { min-width: 0; }
.set-row:last-child { border-bottom: 0; }
.set-label { color: var(--ink); font-size: 17px; font-weight: 600; }
.set-hint { margin-top: .2rem; color: var(--dim); font-size: 14px; line-height: 1.5; }
.set-hint code { color: var(--blue); }
.set-row-r { display: flex; justify-content: flex-end; align-items: center; gap: .5rem; flex-wrap: wrap; min-width: 0; }
.set-readonly { color: var(--ink); font: 500 15px/1.4 var(--mono); text-align: right; overflow-wrap: anywhere; }
.danger-section .set-rows { box-shadow: inset 0 0 0 3px var(--red); }
form.set-rows, form.set-row { background: var(--white); color: var(--ink); border-radius: var(--plate-r); }
form.set-row { padding: 1rem 1.3rem; }

/* Login: one enamel plate on the blue wall */
body:has(.login-screen) { background: var(--blue); }
.login-screen {
  min-height: 100svh;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1rem; padding: 3rem 1.5rem;
  text-align: center;
}
.login-screen::before {
  content: ''; position: absolute; z-index: 0;
  width: min(460px, calc(100vw - 32px)); height: 520px;
  border-radius: 22px;
  background: var(--white);
  box-shadow: inset 0 0 0 7px var(--white), inset 0 0 0 9px var(--blue);
}
.login-screen::after { display: none; }
.login-logo, .login-msg, .btn-github, .login-divider, .login-key-form, .login-alt { position: relative; z-index: 1; }
.login-logo { color: var(--blue); font: 700 44px/1 var(--head); text-transform: lowercase; letter-spacing: .02em; }
.login-logo .dot { display: none; }
.login-msg { max-width: 300px; color: var(--ink); font-size: 18px; line-height: 1.4; }
.btn-github {
  display: inline-flex; align-items: center; justify-content: center; gap: .55rem;
  width: min(280px, calc(100vw - 84px)); min-height: 48px; padding: 0 1.3rem;
  border: 3px solid var(--blue); border-radius: 12px;
  background: var(--blue); color: var(--white);
  font: 600 17px/1 var(--head); letter-spacing: .07em; text-transform: uppercase;
  transition: background .15s var(--ease);
}
.btn-github:hover { background: var(--blue-d); border-color: var(--blue-d); }
.login-divider { color: var(--mute); }
.login-key-form { width: min(340px, calc(100vw - 84px)); display: grid; gap: .6rem; }
.login-key-form input { width: 100%; min-height: 46px; padding: .6rem .9rem; border: 2px solid var(--rule); border-radius: 12px; background: var(--white); color: var(--ink); font: 500 15px/1 var(--mono); outline: none; }
.login-key-form input:focus { border-color: var(--blue); }
.login-key-form button {
  min-height: 46px; padding: 0 1rem;
  border: 3px solid var(--blue); border-radius: 12px;
  background: var(--white); color: var(--blue);
  font: 600 16px/1 var(--head); letter-spacing: .07em; text-transform: uppercase;
}
.login-key-form button:hover { background: var(--blue-l); }
.login-alt { color: var(--dim); font-size: 15px; }
.login-alt code { background: var(--blue); color: var(--white); padding: .1rem .45rem; border-radius: 6px; }
.loading { padding: 4rem 1rem; text-align: center; color: var(--white); font: 600 18px/1 var(--head); letter-spacing: .1em; text-transform: uppercase; }

/* Widths */
@media (max-width: 1100px) {
  .main { padding: 2rem 1.5rem 4rem; }
  .ov-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 980px) { .ov-two-col { grid-template-columns: 1fr; } }
@media (max-width: 820px) { .billing-plans { grid-template-columns: 1fr; } }
@media (max-width: 760px) {
  .app { grid-template-columns: minmax(0, 1fr); }
  .main {
    min-width: 0;
    padding:
      1.4rem max(1rem, env(safe-area-inset-right))
      max(5rem, calc(4rem + env(safe-area-inset-bottom)))
      max(1rem, env(safe-area-inset-left));
  }
  .sidebar {
    position: sticky; top: 0; z-index: 50;
    height: auto;
    border-right: 0;
    background: var(--blue);
    padding:
      max(.7rem, env(safe-area-inset-top))
      max(1rem, env(safe-area-inset-right))
      .6rem max(1rem, env(safe-area-inset-left));
  }
  .sidebar::before {
    content: '';
    position: absolute;
    right: 0;
    bottom: 100%;
    left: 0;
    height: 100vh;
    height: 100svh;
    background: #0a4bb0;
    pointer-events: none;
  }
  .sb-brand { padding: 0 0 .5rem; margin: 0; border: 0; }
  .sb-wordmark { font-size: 26px; }
  .sb-nav { flex-direction: row; gap: .3rem; width: 100%; min-width: 0; padding-bottom: .2rem; overflow-x: auto; scrollbar-width: none; }
  .sidebar { min-width: 0; }
  .sb-nav::-webkit-scrollbar { display: none; }
  .sb-section-label, .sb-icon, .sb-foot { display: none; }
  .sb-item { min-height: 44px; flex: 0 0 auto; padding: 0 .75rem; font-size: 15px; }
  .page-head { margin-bottom: 1.5rem; padding-bottom: .9rem; align-items: flex-start; }
  .page-title { font-size: 40px; }
  .page-head-actions { width: 100%; }
  .page-head-actions .btn { flex: 1; min-height: 44px; }
  .ov-grid { gap: .75rem; }
  .stat-card { min-height: 130px; padding: 1.1rem 1.1rem 1rem; }
  .stat-value { font-size: 36px; }
  .filter-bar { align-items: stretch; }
  .tabs { width: 100%; flex-wrap: nowrap; overflow-x: auto; padding-bottom: .2rem; scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { min-height: 44px; flex: 0 0 auto; }
  .filter-tools { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; }
  .search { min-width: 0; }
  .search input { width: 100%; min-width: 120px; }
  .sort { min-height: 44px; max-width: 150px; }
  .view-toggle button { min-width: 44px; min-height: 44px; }
  .site-main { grid-template-columns: auto 1fr auto; gap: .7rem; padding: .8rem; }
  .site-time { display: none; }
  .sd-grid { grid-template-columns: 1fr 1fr; }
  .sd-actions .btn, .sd-actions a { min-height: 44px; }
  .files-list, .keys-list { overflow: visible; background: transparent; display: grid; gap: .75rem; }
  .files-head, .keys-head { display: none; }
  .file-row, .key-row { min-width: 0; padding: 1rem; border: 0; border-radius: var(--plate-r); background: var(--white); }
  .file-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .55rem 1rem; }
  .file-name { grid-column: 1 / -1; padding-bottom: .6rem; border-bottom: 2px solid var(--rule); }
  .file-row > [data-label], .key-row > [data-label] { display: flex; flex-direction: column; gap: .1rem; min-width: 0; }
  .file-row > [data-label]::before, .key-row > [data-label]::before {
    content: attr(data-label);
    color: var(--blue);
    font: 600 12px/1.2 var(--head);
    letter-spacing: .12em;
    text-transform: uppercase;
  }
  .file-actions { grid-column: 1 / -1; justify-self: stretch; justify-content: flex-end; padding-top: .45rem; }
  .file-actions .iconbtn { width: 44px; height: 44px; }
  .fb-limit { width: 100%; padding-left: 2rem; }
  .key-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7rem 1rem; }
  .key-name { grid-column: 1 / -1; padding-bottom: .6rem; border-bottom: 2px solid var(--rule); }
  .key-prefix { overflow: hidden; }
  .key-actions { grid-column: 1 / -1; justify-self: stretch; display: flex; justify-content: flex-end; }
  .key-actions .btn { min-height: 44px; }
  .curl-tabs { grid-template-columns: 1fr; }
  .bf-head { display: none; }
  .bf-row:not(.bf-head) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7rem; padding: .9rem 1rem; }
  .bf-row:not(.bf-head) .bf-k { grid-column: 1 / -1; color: var(--ink); font-weight: 600; }
  .bf-row [data-plan]::before {
    content: attr(data-plan);
    display: block;
    margin-bottom: .18rem;
    color: var(--blue);
    font: 600 12px/1.2 var(--head);
    letter-spacing: .1em;
    text-transform: uppercase;
  }
  .modal { width: calc(100vw - 2rem); max-height: calc(100svh - 2rem); overflow-y: auto; }
  .login-screen { padding: 2rem 1rem; }
  .login-screen::before { height: 540px; }
}
@media (max-width: 520px) {
  .main { padding-top: 1.2rem; }
  .ov-grid { grid-template-columns: 1fr; }
  .stat-card { min-height: 112px; padding: 1rem; }
  .stat-value { font-size: 34px; }
  .ov-two-col { gap: .8rem; }
  .ov-card { padding: 1.1rem; }
  .expiring-row { grid-template-columns: 1fr auto; }
  .er-mid { display: none; }
  .er-time { align-items: flex-start; }
  .er-actions { justify-content: flex-end; }
  .bh-stats { grid-template-columns: 1fr; }
  .bh-current, .bh-pro { padding: 1.1rem; }
  .bh-tier { align-items: flex-start; flex-direction: column; gap: .2rem; }
  .bf-row:not(.bf-head) { grid-template-columns: 1fr; }
  .bf-row:not(.bf-head) .bf-k { grid-column: 1; }
  .site-main { grid-template-columns: 1fr auto; }
  .site-thumb { display: none; }
  .site-sub { gap: .35rem; }
  .sd-grid { grid-template-columns: 1fr; }
  .filter-tools { grid-template-columns: 1fr; }
  .sort, .view-toggle { max-width: none; width: 100%; }
  .view-toggle button { flex: 1; }
  .set-row { grid-template-columns: minmax(0, 1fr); gap: .6rem; }
  .set-row-r { justify-content: flex-start; }
  .set-readonly { text-align: left; }
}
@media (pointer: coarse) {
  .btn, .iconbtn, .sb-signout, .search-clear { min-height: 44px; }
  .iconbtn { min-width: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .dot-pulse, .site-detail, .modal-bg, .modal, .key-reveal { animation: none; }
}
</style>
</head>
<body>
<div id="root"><div class="loading">loading…</div></div>
<div id="toast" class="toast" role="status"></div>
<div id="modal-host"></div>
<script>
(function() {
  var BASE_URL = ${JSON.stringify(baseUrl)};
  var SELF_HOSTED = ${JSON.stringify(selfHosted)};
  var TIER_LIMITS = ${JSON.stringify(TIER_LIMITS)};
  var PLAN_PRICES_EUR = ${JSON.stringify(PLAN_PRICES_EUR)};
  var ANALYTICS_ENABLED = ${JSON.stringify(Boolean(analytics))};

  // — State —
  var apiKey = localStorage.getItem('vanish_api_key');
  var params = new URLSearchParams(window.location.hash.slice(1));
  if (params.get('key')) {
    apiKey = params.get('key');
    localStorage.setItem('vanish_api_key', apiKey);
    history.replaceState({}, '', '/dashboard');
    // Reload so analytics starts on a page load whose navigation entry never held the key.
    if (ANALYTICS_ENABLED) {
      window.location.replace('/dashboard');
      return;
    }
  }

  ${analytics}

  var state = {
    me: null,
    sites: [],
    uploads: [],
    keys: [],
    domains: [],
    domainReservation: null,
    domainRouteLimit: 20,
    domainPending: { connect: false, reserve: false, verify: {}, delete: {}, release: false },
    domainErrors: { connect: '', reserve: '', verify: {}, delete: {}, release: '' },
    domainDraft: { hostname: '', channel: '', slug: '' },
    accessPending: {},
    accessErrors: {},
    section: 'overview',
    sitesFilter: 'all',
    sitesQuery: '',
    sitesSort: 'created',
    sitesOpen: {},
    filesFilter: 'all',
    filesQuery: '',
    filesView: 'list',
    revealKey: null,
    timerBuckets: {}
  };

  var rootEl = document.getElementById('root');
  var toastEl = document.getElementById('toast');
  var modalHost = document.getElementById('modal-host');

  // — Utils —
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function attr(s) { return escapeHtml(s); }

  function fmtBytes(b) {
    if (b == null) return '—';
    if (b === 0) return '0 B';
    var u = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(b) / Math.log(1024));
    if (i >= u.length) i = u.length - 1;
    var v = b / Math.pow(1024, i);
    return (i > 1 ? v.toFixed(1) : Math.round(v)) + ' ' + u[i];
  }
  function fmtTimeUntil(ms) {
    if (ms <= 0) return 'expired';
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h >= 24) {
      var d = Math.floor(h / 24);
      var rh = h % 24;
      return d + 'd ' + String(rh).padStart(2, '0') + 'h';
    }
    if (h >= 1) {
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    }
    return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }
  function countdownAttr(expires, mode, tone) {
    if (!expires) return '';
    var out = ' data-countdown-expires="' + attr(expires) + '" data-countdown-mode="' + attr(mode || 'until') + '"';
    if (tone) out += ' data-countdown-tone="' + attr(tone) + '"';
    return out;
  }
  function fmtAgo(ts) {
    if (ts == null) return 'never';
    var diff = Date.now() - ts;
    if (diff < 0) return 'in the future';
    if (diff < 60000) return 'just now';
    var m = Math.floor(diff / 60000);
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24);
    if (d < 30) return d + 'd ago';
    return Math.floor(d / 30) + 'mo ago';
  }
  function fmtDate(ts) {
    if (ts == null) return '—';
    var d = new Date(ts);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }
  function parseSqlDate(str) {
    if (!str) return null;
    var s = String(str);
    if (!/[zZ]|[+-]\\d{2}:?\\d{2}$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z';
    }
    var t = Date.parse(s);
    return isNaN(t) ? null : t;
  }
  function classify(contentType, filename) {
    var ct = (contentType || '').toLowerCase();
    if (ct.indexOf('image/') === 0) return 'image';
    if (ct.indexOf('video/') === 0) return 'video';
    if (ct === 'text/csv' || ct === 'application/json' || ct === 'application/x-ndjson') return 'data';
    var name = (filename || '').toLowerCase();
    if (/\\.(csv|json|tsv|jsonl|ndjson|xls|xlsx|parquet)$/.test(name)) return 'data';
    if (/\\.(mp4|mov|webm|avi|mkv|m4v)$/.test(name)) return 'video';
    if (/\\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|heic|heif|tiff?)$/.test(name)) return 'image';
    return 'doc';
  }
  function mimeShort(contentType, filename) {
    if (contentType) {
      var parts = contentType.split('/');
      if (parts[1]) return parts[1].split(';')[0];
    }
    var m = String(filename || '').match(/\\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : 'file';
  }
  function ext(name) {
    var m = String(name || '').match(/\\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : 'file';
  }
  function maxFileLabel(tier) {
    var lim = TIER_LIMITS[tier] || TIER_LIMITS.free;
    return fmtBytes(lim.maxFileSize);
  }
  function retentionLabel(tier) {
    var lim = TIER_LIMITS[tier] || TIER_LIMITS.free;
    var h = lim.maxExpiryHours;
    if (h >= 24) return Math.round(h / 24) + 'd';
    return h + 'h';
  }

  // — Toast —
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { toastEl.classList.remove('show'); }, 1700);
  }
  function copyText(text, msg) {
    if (!navigator.clipboard) {
      toast('clipboard unavailable');
      return;
    }
    navigator.clipboard.writeText(text).then(function() {
      toast(msg || 'copied');
    }, function() {
      toast('copy failed');
    });
  }

  // — Confirm modal —
  var confirmCfg = null;
  var modalReturnFocus = null;
  function openConfirm(cfg) {
    if (!confirmCfg) {
      modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    confirmCfg = cfg;
    rootEl.setAttribute('inert', '');
    renderModal();
  }
  function closeModal() {
    var returnFocus = modalReturnFocus;
    confirmCfg = null;
    modalReturnFocus = null;
    renderModal();
    rootEl.removeAttribute('inert');
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
  }
  function renderModal() {
    if (!confirmCfg) {
      modalHost.innerHTML = '';
      return;
    }
    var c = confirmCfg;
    modalHost.innerHTML =
      '<div class="modal-bg" data-action="modal-cancel">' +
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-description" data-stop>' +
          '<div class="modal-head" id="modal-title">' + escapeHtml(c.title) + '</div>' +
          '<div class="modal-body">' +
            '<div id="modal-description">' + escapeHtml(c.body) + '</div>' +
            (c.passwordInput
              ? '<div class="form-row" style="margin-top:1rem">' +
                  '<label for="modal-password">Shared password</label>' +
                  '<input id="modal-password" data-modal-password type="password" minlength="8" maxlength="128" autocomplete="new-password" required aria-describedby="modal-password-hint modal-password-error">' +
                  '<div class="form-hint" id="modal-password-hint">Use 8–128 characters. The password stays masked while you type.</div>' +
                  '<div class="form-error" id="modal-password-error" role="alert" hidden></div>' +
                '</div>'
              : '') +
          '</div>' +
          '<div class="modal-actions">' +
            '<button class="btn ghost" data-action="modal-cancel">Cancel</button>' +
            '<button class="btn ' + (c.destructive === false ? 'solid' : 'danger') + '" data-action="modal-confirm">' +
              escapeHtml(c.confirmLabel || 'Confirm') +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    var initialFocus = modalHost.querySelector('[data-modal-password]') ||
      modalHost.querySelector(c.destructive === false ? '[data-action="modal-confirm"]' : 'button[data-action="modal-cancel"]');
    if (initialFocus) initialFocus.focus();
  }
  function confirmModal() {
    var fn = confirmCfg && confirmCfg.onConfirm;
    var passwordInput = modalHost.querySelector('[data-modal-password]');
    var value = passwordInput ? passwordInput.value : undefined;
    if (passwordInput && !passwordInput.checkValidity()) {
      var passwordError = modalHost.querySelector('#modal-password-error');
      passwordInput.setAttribute('aria-invalid', 'true');
      if (passwordError) {
        passwordError.textContent = 'Password must contain between 8 and 128 characters.';
        passwordError.hidden = false;
      }
      passwordInput.focus();
      return;
    }
    closeModal();
    fn && fn(value);
  }

  document.addEventListener('keydown', function(e) {
    if (!confirmCfg) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.key === 'Tab') {
      trapModalFocus(e);
      return;
    }
    if (e.key === 'Enter') {
      var target = e.target;
      if (target && target.closest && target.closest('[data-action="modal-cancel"]')) return;
      e.preventDefault();
      confirmModal();
    }
  });
  function trapModalFocus(e) {
    var focusable = Array.from(modalHost.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    ));
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!modalHost.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }

  function resetAnalytics() {
    if (window.posthog) window.posthog.reset();
  }

  // — API —
  function apiFetch(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (apiKey) opts.headers['Authorization'] = 'Bearer ' + apiKey;
    return fetch(path, opts).then(function(r) {
      if (r.status === 401) {
        localStorage.removeItem('vanish_api_key');
        apiKey = null;
        resetAnalytics();
        renderLogin();
        throw new Error('unauthorized');
      }
      return r.json().catch(function() { return {}; });
    });
  }

  function fetchAll() {
    return Promise.all([
      apiFetch('/me'),
      apiFetch('/sites?limit=100&active=false'),
      apiFetch('/uploads?limit=100&active=false'),
      apiFetch('/keys'),
      apiFetch('/domains')
    ]).then(function(rs) {
      if (!rs[0] || rs[0].error || !rs[0].id) {
        localStorage.removeItem('vanish_api_key');
        apiKey = null;
        resetAnalytics();
        renderLogin();
        throw new Error('unauthorized');
      }
      state.me = rs[0];
      if (window.posthog) {
        window.posthog.identify(state.me.id, { email: state.me.email || undefined, name: state.me.username || undefined });
      }
      state.sites = (rs[1].sites || []).filter(function(s) { return !s.deleted; }).map(normalizeSite);
      state.uploads = (rs[2].uploads || []).filter(function(u) { return !u.deleted; }).map(normalizeUpload);
      state.keys = (rs[3].keys || []);
      state.domains = (rs[4].domains || []);
      state.domainReservation = rs[4].reservation || null;
      state.domainRouteLimit = rs[4].routeLimit || 20;
      refreshTimerBuckets();
      render();
    });
  }

  function loginWithApiKey(key) {
    apiKey = String(key || '').trim();
    if (!apiKey) {
      toast('enter an API key');
      return;
    }
    localStorage.setItem('vanish_api_key', apiKey);
    rootEl.innerHTML = '<div class="loading">loading…</div>';
    fetchAll().catch(function(e) {
      localStorage.removeItem('vanish_api_key');
      apiKey = null;
      resetAnalytics();
      renderLogin();
      toast(String(e).indexOf('unauthorized') === -1 ? 'failed to validate API key' : 'invalid API key');
    });
  }
  function normalizeSite(s) {
    var expiresAt = parseSqlDate(s.expires_at);
    var createdAt = parseSqlDate(s.created_at);
    var lastActivityAt = parseSqlDate(s.last_activity_at) || createdAt;
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      root_path: s.root_path || 'index.html',
      file_count: s.file_count || 0,
      size_bytes: s.size_bytes || 0,
      url: s.url,
      created: createdAt || 0,
      lastActivity: lastActivityAt || 0,
      expires: expiresAt || 0,
      published_at: parseSqlDate(s.published_at),
      access_mode: s.access_mode || 'link',
      draft: !s.published_at,
      hasExpiry: expiresAt != null,
      expired: expiresAt != null && expiresAt <= Date.now()
    };
  }
  function normalizeUpload(u) {
    var expiresAt = parseSqlDate(u.expires_at);
    var createdAt = parseSqlDate(u.created_at);
    return {
      id: u.id,
      name: u.filename,
      content_type: u.content_type,
      kind: classify(u.content_type, u.filename),
      mime: mimeShort(u.content_type, u.filename),
      bytes: u.size_bytes || 0,
      url: u.url,
      created: createdAt || 0,
      expires: expiresAt || 0,
      hasExpiry: expiresAt != null,
      expired: expiresAt != null && expiresAt <= Date.now()
    };
  }

  // — Render dispatch —
  function render() {
    if (!apiKey || !state.me) {
      if (!apiKey) renderLogin();
      return;
    }
    rootEl.innerHTML =
      '<div class="app">' +
        renderSidebar() +
        '<main class="main" id="main">' + renderSection() + '</main>' +
      '</div>';
    if (window.matchMedia('(max-width: 760px)').matches) {
      var activeNav = rootEl.querySelector('.sb-item.active');
      if (activeNav && activeNav.scrollIntoView) {
        activeNav.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
      }
    }
  }
  function renderSection() {
    switch (state.section) {
      case 'sites': return renderSitesPage();
      case 'files': return renderFilesPage();
      case 'keys': return renderKeysPage();
      case 'domains': return renderDomainsPage();
      case 'billing': return renderBillingPage();
      case 'settings': return renderSettingsPage();
      default: return renderOverview();
    }
  }
  function rerenderMain() {
    var el = document.getElementById('main');
    if (el) el.innerHTML = renderSection();
  }

  // — Sidebar —
  function renderSidebar() {
    var me = state.me;
    var section = state.section;
    var initial = (me.username || '?').charAt(0).toUpperCase();
    var items = [
      { id: 'overview', label: 'Home', icon: '<path d="M3 3h5v5H3V3zm0 7h5v5H3v-5zm7-7h5v5h-5V3zm0 7h5v5h-5v-5z"/>' },
      { id: 'sites', label: 'Sites', icon: '<path d="M2 4h12v9H2V4zm1 1v1h10V5H3zm0 2v5h10V7H3z"/>' },
      { id: 'files', label: 'Files', icon: '<path d="M4 2h5l3 3v9H4V2zm5 0v3h3"/>' },
      { id: 'domains', label: 'Domains', icon: '<path d="M2 8a6 6 0 1 0 12 0A6 6 0 0 0 2 8zm1.5 0h9M8 2c2 2 2 10 0 12M8 2C6 4 6 12 8 14"/>' },
      { id: 'keys', label: 'Access keys', icon: '<path d="M11 6a3 3 0 1 1-2.83 4H5v2H3v-2H1v-2h7.17A3 3 0 0 1 11 6zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>' },
      { id: 'billing', label: 'Plan', icon: '<path d="M2 4h12v3H2V4zm0 4h12v5H2V8zm2 2v1h3v-1H4z"/>' },
      { id: 'settings', label: 'Settings', icon: '<path d="M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm5.5 4.2.9.7-1 1.7-1.1-.3-1.1.6-.3 1.1H8.1l-.3-1.1-1.1-.6-1.1.3-1-1.7.9-.7v-1.4l-.9-.7 1-1.7 1.1.3 1.1-.6.3-1.1h2.8l.3 1.1 1.1.6 1.1-.3 1 1.7-.9.7v1.4z"/>' }
    ];
    var navHtml = items.map(function(it) {
      var active = it.id === section ? ' active' : '';
      return '<button class="sb-item' + active + '" data-action="nav" data-section="' + it.id + '">' +
        '<svg class="sb-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">' + it.icon + '</svg>' +
        '<span class="sb-label">' + it.label + '</span>' +
        (it.id === section ? '<span class="sb-dot"></span>' : '') +
      '</button>';
    }).join('');

    var upgradeHtml = '';
    if (me.tier === 'free' && !SELF_HOSTED) {
      upgradeHtml =
        '<button class="sb-upgrade" data-action="nav" data-section="billing">' +
          '<div class="sb-upgrade-head"><span class="dot dot-gold dot-pulse"></span><span>Upgrade to Pro</span></div>' +
          '<div class="sb-upgrade-body">10 GB · 5,000 files per site · 365-day retention</div>' +
          '<div class="sb-upgrade-cta">€' + PLAN_PRICES_EUR.pro + '/mo <span class="sb-arrow">→</span></div>' +
        '</button>';
    }

    var tierClass = 'tier-' + me.tier;
    var sinceLabel = me.created_at ? fmtDate(parseSqlDate(me.created_at)) : '—';

    return '<aside class="sidebar">' +
      '<div class="sb-brand">' +
        '<a href="/" class="sb-logo"><span class="sb-mark">v</span><span class="sb-wordmark">vanish<span class="dot">.</span></span></a>' +
      '</div>' +
      '<nav class="sb-nav">' +
        '<div class="sb-section-label">Your space</div>' +
        navHtml +
      '</nav>' +
      '<div class="sb-foot">' +
        upgradeHtml +
        '<div class="sb-user">' +
          '<div class="sb-avatar">' + escapeHtml(initial) + '</div>' +
          '<div class="sb-user-meta">' +
            '<div class="sb-user-name">@' + escapeHtml(me.username || 'anon') + '</div>' +
            '<div class="sb-user-tier">' +
              '<span class="tier-tag ' + tierClass + '">' + escapeHtml(me.tier) + '</span>' +
              '<span class="sb-user-since">since ' + escapeHtml(sinceLabel) + '</span>' +
            '</div>' +
          '</div>' +
          '<button class="sb-signout" data-action="signout" title="Sign out">⏻</button>' +
        '</div>' +
      '</div>' +
    '</aside>';
  }

  // — Overview —
  function renderOverview() {
    var me = state.me;
    var liveSites = state.sites.filter(function(s) { return !s.draft && !s.expired; });
    var draftSites = state.sites.filter(function(s) { return s.draft && !s.expired; });
    var liveFiles = state.uploads.filter(function(f) { return !f.expired; });
    var lim = TIER_LIMITS[me.tier] || TIER_LIMITS.free;
    var totalBytes = me.stats.total_bytes || 0;
    var storageMax = lim.maxTotalStorage;
    var storageHtml = '';
    if (storageMax) {
      var pct = Math.min(100, Math.round((totalBytes / storageMax) * 100));
      var tone = pct > 85 ? 'red' : 'accent';
      storageHtml =
        '<div class="stat-progress"><div class="pbar"><div class="pbar-fill pbar-' + tone + '" style="width:' + pct + '%"></div></div></div>';
    }

    var combinedExpiring = liveSites.map(function(s) {
      return { id: s.id, kind: 'site', name: s.slug || s.name, bytes: s.size_bytes, expires: s.expires, hasExpiry: s.hasExpiry, url: s.url };
    }).concat(liveFiles.map(function(f) {
      return { id: f.id, kind: 'file', name: f.name, bytes: f.bytes, expires: f.expires, hasExpiry: f.hasExpiry, url: f.url };
    })).filter(function(x) {
      return x.hasExpiry && (x.expires - Date.now()) < 6 * 3600 * 1000 && x.expires > Date.now();
    }).sort(function(a, b) { return a.expires - b.expires; });

    var expiringHtml;
    if (combinedExpiring.length === 0) {
      expiringHtml =
        '<div class="empty subtle"><span class="empty-mark">○</span>' +
        'nothing vanishing soon. everything you\\'ve published has more than 6 hours left.</div>';
    } else {
      expiringHtml = '<div class="expiring-list">' + combinedExpiring.map(function(item) {
        var remaining = item.expires - Date.now();
        var critical = remaining < 1800000;
        return '<div class="expiring-row ' + (critical ? 'critical' : 'warn') + '">' +
          '<div class="er-left">' +
            '<span class="er-kind">' + item.kind + '</span>' +
            '<span class="er-name">' + escapeHtml(item.name) + '</span>' +
          '</div>' +
          '<div class="er-mid">' + fmtBytes(item.bytes) + '</div>' +
          '<div class="er-time">' +
            '<span class="er-time-label">vanishes in</span>' +
            '<span class="er-time-val"' + countdownAttr(item.expires, 'until') + '>' + fmtTimeUntil(remaining) + '</span>' +
          '</div>' +
          '<div class="er-actions">' +
            '<button class="btn ghost btn-sm" data-action="copy" data-text="' + attr(item.url) + '" data-msg="URL copied">copy url</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
    }

    var latest = liveSites.slice().sort(function(a, b) { return b.created - a.created; }).slice(0, 4);
    var recentHtml;
    if (latest.length === 0) {
      recentHtml = '<div class="empty subtle"><span class="empty-mark">∅</span>no mini-sites yet. publish one with <code>vanish site ./demo</code></div>';
    } else {
      recentHtml = '<div class="ov-recent">' + latest.map(function(s) {
        return '<button class="recent-row" data-action="nav" data-section="sites">' +
          '<div class="recent-thumb"><span>' + escapeHtml(ext(s.root_path)) + '</span></div>' +
          '<div class="recent-meta">' +
            '<div class="recent-name"><span class="acc">' + escapeHtml(s.slug || s.name) + '</span></div>' +
            '<div class="recent-sub">' + s.file_count + ' files · ' + fmtBytes(s.size_bytes) + ' · ' + fmtAgo(s.created) + '</div>' +
          '</div>' +
        '</button>';
      }).join('') + '</div>';
    }

    var quickCmds = [
      { label: 'Publish folder', cmd: 'vanish site ./demo --root index.html' },
      { label: 'Update in place', cmd: 'vanish site ./demo --update <site-id>' },
      { label: 'Single-file upload', cmd: 'vanish upload screenshot.png' }
    ];
    if (me.tier === 'pro') {
      quickCmds.push({ label: 'Custom slug + 90 days', cmd: 'vanish site ./slides --slug workshop --days 90' });
    }
    var quickHtml = '<div class="ov-quickref">' + quickCmds.map(function(qc) {
      return '<div class="qc">' +
        '<div class="qc-head"><span class="qc-label">' + escapeHtml(qc.label) + '</span></div>' +
        '<button class="qc-cmd" data-action="copy" data-text="' + attr(qc.cmd) + '" data-msg="command copied">' +
          '<span class="qc-prompt">$</span>' +
          '<span class="qc-text">' + escapeHtml(qc.cmd) + '</span>' +
          '<span class="qc-copy">copy</span>' +
        '</button>' +
      '</div>';
    }).join('') + '</div>';

    var proBanner = '';
    if (me.tier === 'free' && !SELF_HOSTED) {
      proBanner =
        '<button class="ov-pro-banner" data-action="nav" data-section="billing">' +
          '<span>Unlock 10 GB, custom slugs and 365-day retention</span>' +
          '<span class="ov-pro-arrow">€' + PLAN_PRICES_EUR.pro + '/mo →</span>' +
        '</button>';
    }

    return '<div class="page page-overview">' +
      '<header class="page-head">' +
        '<div>' +
          '<h1 class="page-title">Your Vanish space</h1>' +
          '<p class="page-sub">@' + escapeHtml(me.username || 'anon') + ' · your latest shares, in one place · ' + fmtDate(Date.now()) + '</p>' +
        '</div>' +
      '</header>' +
      '<div class="ov-grid">' +
        '<div class="stat-card">' +
          '<div class="stat-label">Storage used</div>' +
          '<div class="stat-value">' + fmtBytes(totalBytes) + '</div>' +
          '<div class="stat-sub">' + (storageMax ? fmtBytes(storageMax) + ' total' : 'no limit') + '</div>' +
          '<div class="stat-detail">' + fmtBytes(me.stats.published_site_bytes || 0) + ' published · ' +
            fmtBytes(me.stats.draft_site_bytes || 0) + ' drafts · ' +
            fmtBytes(me.stats.upload_bytes || 0) + ' files · ' +
            fmtBytes(me.stats.bundle_bytes || 0) + ' bundles</div>' +
          storageHtml +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-label">Published sites</div>' +
          '<div class="stat-value">' + (me.stats.published_sites || 0) + '</div>' +
          '<div class="stat-sub">public and currently live</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-label">Upload drafts</div>' +
          '<div class="stat-value">' + (me.stats.total_site_drafts || 0) + '</div>' +
          '<div class="stat-sub">' + fmtBytes(me.stats.draft_site_bytes || 0) + ' · cleaned after 6h</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-label">Live files</div>' +
          '<div class="stat-value">' + liveFiles.length + '</div>' +
          '<div class="stat-sub">' + (state.uploads.length - liveFiles.length) + ' expired</div>' +
        '</div>' +
      '</div>' +

      '<section class="ov-section">' +
        '<div class="ov-section-head">' +
          '<h2>Expiring soon</h2>' +
          '<span class="ov-section-sub">items vanishing in the next 6 hours</span>' +
        '</div>' +
        expiringHtml +
      '</section>' +

      '<section class="ov-section ov-two-col">' +
        '<div class="ov-card">' +
          '<div class="ov-card-head">' +
            '<h2>Recent mini-sites</h2>' +
            '<button class="ov-link" data-action="nav" data-section="sites">view all →</button>' +
          '</div>' +
          recentHtml +
        '</div>' +
        '<div class="ov-card">' +
          '<div class="ov-card-head"><h2>Quick reference</h2></div>' +
          quickHtml +
          proBanner +
        '</div>' +
      '</section>' +
    '</div>';
  }

  // — Sites —
  function siteStatus(s) {
    if (s.expired) return 'expired';
    if (s.draft) return 'draft';
    if (s.hasExpiry && (s.expires - Date.now()) < 6 * 3600 * 1000) return 'expiring';
    return 'live';
  }
  function renderSitesPage() {
    var sites = state.sites;
    var counts = {
      all: sites.length,
      live: sites.filter(function(s) { return siteStatus(s) === 'live'; }).length,
      draft: sites.filter(function(s) { return siteStatus(s) === 'draft'; }).length,
      expiring: sites.filter(function(s) { return siteStatus(s) === 'expiring'; }).length,
      expired: sites.filter(function(s) { return siteStatus(s) === 'expired'; }).length
    };
    var q = state.sitesQuery;
    var filtered = sites.filter(function(s) {
      if (q && !((s.name || '') + ' ' + (s.slug || '') + ' ' + (s.root_path || '')).toLowerCase().includes(q.toLowerCase())) return false;
      if (state.sitesFilter === 'all') return true;
      return siteStatus(s) === state.sitesFilter;
    }).sort(function(a, b) {
      if (state.sitesSort === 'expires') return (a.expires || 0) - (b.expires || 0);
      if (state.sitesSort === 'size') return (b.size_bytes || 0) - (a.size_bytes || 0);
      return (b.created || 0) - (a.created || 0);
    });

    var tabsHtml = ['all','live','draft','expiring','expired'].map(function(f) {
      var active = f === state.sitesFilter ? ' active' : '';
      return '<button class="tab' + active + '" data-action="sites-filter" data-filter="' + f + '">' +
        f + '<span class="tab-count">' + counts[f] + '</span></button>';
    }).join('');

    var rowsHtml;
    if (filtered.length === 0) {
      rowsHtml = '<div class="empty subtle"><span class="empty-mark">∅</span>' +
        (sites.length === 0 ? 'no mini-sites yet. publish one with <code>vanish site ./demo</code>' : 'no mini-sites match. try another filter.') +
        '</div>';
    } else {
      rowsHtml = '<div class="sites-grid">' + filtered.map(renderSiteRow).join('') + '</div>';
    }

    return '<div class="page page-sites">' +
      '<header class="page-head">' +
        '<div>' +
          '<h1 class="page-title">Sites</h1>' +
          '<p class="page-sub">' + counts.live + ' published · ' + counts.draft + ' drafts · ' + counts.expiring + ' expiring</p>' +
        '</div>' +
      '</header>' +
      '<div class="filter-bar">' +
        '<div class="tabs">' + tabsHtml + '</div>' +
        '<div class="filter-tools">' +
          '<div class="search">' +
            '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6" cy="6" r="4"/><path d="M9 9l3 3"/></svg>' +
            '<input data-action="sites-search" placeholder="filter by name, slug, root file…" value="' + attr(q) + '">' +
            (q ? '<button class="search-clear" data-action="sites-search-clear">×</button>' : '') +
          '</div>' +
          '<select class="sort" data-action="sites-sort">' +
            '<option value="created"' + (state.sitesSort === 'created' ? ' selected' : '') + '>newest first</option>' +
            '<option value="expires"' + (state.sitesSort === 'expires' ? ' selected' : '') + '>expiring first</option>' +
            '<option value="size"' + (state.sitesSort === 'size' ? ' selected' : '') + '>largest first</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      rowsHtml +
    '</div>';
  }
  function renderSiteRow(s) {
    var status = siteStatus(s);
    var open = !!state.sitesOpen[s.id];
    var label = s.slug || s.name || s.id;
    var pillTone = status === 'live' ? 'green' : (status === 'expiring' || status === 'draft') ? 'gold' : 'mute';
    var dotTone = status === 'live' ? 'green' : (status === 'expiring' || status === 'draft') ? 'gold' : 'mute';
    var pulse = status !== 'expired' ? ' dot-pulse' : '';
    var accessPending = Boolean(state.accessPending[s.id]);
    var accessError = state.accessErrors[s.id] || '';
    var timeHtml;
    if (s.expired) {
      timeHtml = '<div class="site-time-label">expired</div><div class="site-time-val expired"' + countdownAttr(s.expires, 'ago') + '>' + fmtAgo(s.expires) + '</div>';
    } else if (s.draft) {
      var cleanupAt = s.lastActivity + 6 * 3600 * 1000;
      timeHtml = '<div class="site-time-label">draft cleanup</div><div class="site-time-val expiring"' +
        countdownAttr(cleanupAt, 'until', 'expiring') + '>' + fmtTimeUntil(cleanupAt - Date.now()) + '</div>';
    } else if (!s.hasExpiry) {
      timeHtml = '<div class="site-time-label">retention</div><div class="site-time-val">∞</div>';
    } else {
      timeHtml = '<div class="site-time-label">vanishes in</div><div class="site-time-val ' + status + '"' + countdownAttr(s.expires, 'until', status) + '>' + fmtTimeUntil(s.expires - Date.now()) + '</div>';
    }
    var detail = '';
    if (open) {
      detail =
        '<div class="site-detail" data-site-access-region="' + attr(s.id) + '" tabindex="-1" aria-busy="' + (accessPending ? 'true' : 'false') + '">' +
          '<div class="sd-grid">' +
            (s.draft ?
              '<div class="sd-field"><div class="sd-label">Status</div><div class="sd-val">Unpublished upload draft</div></div>' :
              '<div class="sd-field"><div class="sd-label">URL</div>' +
                '<button class="sd-url" data-action="copy" data-text="' + attr(s.url) + '" data-msg="URL copied">' + escapeHtml(s.url) + '</button>' +
              '</div>') +
            '<div class="sd-field"><div class="sd-label">ID</div><code class="sd-mono">' + escapeHtml(s.id) + '</code></div>' +
            '<div class="sd-field"><div class="sd-label">Files</div><div class="sd-val">' + s.file_count + '</div></div>' +
            '<div class="sd-field"><div class="sd-label">Size</div><div class="sd-val">' + fmtBytes(s.size_bytes) + '</div></div>' +
            '<div class="sd-field"><div class="sd-label">Root</div><code class="sd-mono">' + escapeHtml(s.root_path) + '</code></div>' +
            '<div class="sd-field"><div class="sd-label">Access</div><div class="sd-val">' + (s.access_mode === 'password' ? 'Password protected' : 'Anyone with link') + '</div></div>' +
            '<div class="sd-field"><div class="sd-label">Created</div><div class="sd-val">' + fmtDate(s.created) + ' · ' + fmtAgo(s.created) + '</div></div>' +
          '</div>' +
          (accessError ? '<div class="form-error" role="alert">' + escapeHtml(accessError) + '</div>' : '') +
          '<div class="sd-actions">' +
            (s.draft ? '' :
              '<button class="btn ghost btn-sm" data-action="copy" data-text="' + attr(s.url) + '" data-msg="URL copied">Copy URL</button>' +
              '<button class="btn ghost btn-sm" data-action="copy" data-text="' + attr('vanish site ./local --update ' + s.id) + '" data-msg="Update command copied">Copy update cmd</button>' +
              '<button class="btn ghost btn-sm" data-action="protect-site" data-id="' + attr(s.id) + '"' +
                (accessPending ? ' disabled aria-busy="true"' : '') + '>' +
                (accessPending ? 'Updating access…' : (s.access_mode === 'password' ? 'Change password' : 'Set password')) + '</button>' +
              '<button class="btn ghost btn-sm" data-action="link-site" data-id="' + attr(s.id) + '"' +
                (accessPending || s.access_mode === 'link' ? ' disabled' : '') +
                (s.access_mode === 'link' ? ' aria-current="true"' : '') + '>Anyone with link</button>' +
              '<a class="btn ghost btn-sm" href="' + attr(s.url) + '" target="_blank" rel="noopener">Open ↗</a>') +
            '<div class="sd-spacer"></div>' +
            (s.expired ? '' : '<button class="btn danger-ghost btn-sm" data-action="delete-site" data-id="' + attr(s.id) + '" data-name="' + attr(label) + '">Delete</button>') +
          '</div>' +
        '</div>';
    }
    return '<div class="site-row site-' + status + (open ? ' open' : '') + '">' +
      '<button class="site-main" data-action="toggle-site" data-id="' + attr(s.id) + '">' +
        '<div class="site-thumb"><span class="site-thumb-mark">' + escapeHtml(ext(s.root_path)) + '</span></div>' +
        '<div class="site-meta">' +
          '<div class="site-name">' +
            '<span>' + escapeHtml(label) + '</span>' +
            '<span class="pill pill-' + pillTone + '"><span class="dot dot-' + dotTone + pulse + '"></span>' + status + '</span>' +
          '</div>' +
          '<div class="site-sub">' +
            '<span>' + s.file_count + ' files</span>' +
            '<span class="site-sep">·</span>' +
            '<span>' + fmtBytes(s.size_bytes) + '</span>' +
            '<span class="site-sep">·</span>' +
            '<span>root <code>' + escapeHtml(s.root_path) + '</code></span>' +
          '</div>' +
        '</div>' +
        '<div class="site-time">' + timeHtml + '</div>' +
        '<div class="site-chev"><svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5l3 3 3-3"/></svg></div>' +
      '</button>' +
      detail +
    '</div>';
  }

  function renderDomainsPage() {
    var domains = state.domains || [];
    var roots = domains.filter(function(d) { return !d.parentHostname; });
    var routes = domains.filter(function(d) { return Boolean(d.parentHostname); });
    var isPro = state.me && state.me.tier === 'pro';
    var canAddRoot = isPro && roots.length === 0;
    var canAddRoute = isPro && routes.length < state.domainRouteLimit &&
      (Boolean(state.domainReservation) || roots.length > 0);
    var connectPending = state.domainPending.connect;
    var reservePending = state.domainPending.reserve;
    var releasePending = state.domainPending.release;
    var rows = domains.length ? domains.map(function(d) {
      var tone = d.status === 'active' ? 'green' : (d.status === 'error' || d.status === 'suspended' ? 'red' : 'gold');
      var verifyPending = Boolean(state.domainPending.verify[d.hostname]);
      var deletePending = Boolean(state.domainPending.delete[d.hostname]);
      var verifyError = state.domainErrors.verify[d.hostname] || '';
      var deleteError = state.domainErrors.delete[d.hostname] || '';
      var dns = (d.dnsRecords || []).map(function(r) {
        return '<div class="set-hint domain-record"><code>' + escapeHtml(r.type) + ' ' + escapeHtml(r.name) + '</code> → <code>' + escapeHtml(r.value) + '</code></div>';
      }).join('');
      return '<div class="set-row" style="align-items:flex-start" data-domain-region="' + attr(d.hostname) +
        '" tabindex="-1" aria-busy="' + (deletePending || verifyPending ? 'true' : 'false') + '">' +
        '<div><div class="set-label"><span class="domain-value">' + escapeHtml(d.hostname) + '</span> <span class="pill pill-' + tone + '">' + escapeHtml(d.status) + '</span></div>' +
          '<div class="set-hint">channel <code>' + escapeHtml(d.channel) + '</code>' +
            (d.parentHostname ? ' · namespace <code class="domain-value">' + escapeHtml(d.parentHostname) + '</code>' : '') + '</div>' + dns +
          (d.managedDns && d.status !== 'active' ? '<div class="set-hint">DNS managed by Vanish · TLS provisioning in progress</div>' : '') +
          (d.lastError ? '<div class="set-hint" style="color:var(--red)">' + escapeHtml(d.lastError) + '</div>' : '') +
          (verifyError ? '<div class="form-error" role="alert">' + escapeHtml(verifyError) + '</div>' : '') +
          (deleteError ? '<div class="form-error" role="alert">' + escapeHtml(deleteError) + '</div>' : '') +
        '</div>' +
        '<div class="set-row-r">' +
          '<button class="btn ghost btn-sm" data-action="verify-domain" data-hostname="' + attr(d.hostname) + '"' +
            (verifyPending || deletePending ? ' disabled' : '') + (verifyPending ? ' aria-busy="true"' : '') + '>' +
            (verifyPending ? 'Verifying…' : 'Verify') + '</button>' +
          '<button class="btn danger-ghost btn-sm" data-action="delete-domain" data-hostname="' + attr(d.hostname) + '"' +
            (deletePending ? ' disabled aria-busy="true"' : '') + '>' + (deletePending ? 'Removing…' : 'Remove') + '</button>' +
        '</div>' +
      '</div>';
    }).join('') : '<div class="empty subtle"><span class="empty-mark">∅</span>no domain route configured</div>';

    var form = (canAddRoot || canAddRoute)
      ? '<form class="set-rows" data-domain-form tabindex="-1" style="margin-bottom:1rem" aria-busy="' + (connectPending ? 'true' : 'false') + '">' +
          '<div class="set-row"><div style="flex:1"><div class="set-label">Connect a hostname</div><div class="set-hint" id="domain-hint">' +
            (canAddRoute
              ? 'Use a direct child such as site.' + escapeHtml((state.domainReservation && state.domainReservation.hostname) || (roots[0] && roots[0].hostname)) + '.'
              : 'Use a custom subdomain such as studio.example.com. Apex domains are not supported yet.') +
          '</div>' +
          '<div class="form-error" id="domain-form-error" role="alert"' + (state.domainErrors.connect ? '' : ' hidden') + '>' +
            escapeHtml(state.domainErrors.connect) + '</div></div>' +
          '<div class="domain-fields"><label class="domain-field"><span>Hostname</span><input name="hostname" required autocomplete="url" placeholder="' +
            (canAddRoute ? 'site.' + attr((state.domainReservation && state.domainReservation.hostname) || (roots[0] && roots[0].hostname)) : 'studio.example.com') +
          '" value="' + attr(state.domainDraft.hostname) + '" aria-describedby="domain-hint domain-form-error"' + (connectPending ? ' disabled' : '') + '></label>' +
          '<label class="domain-field"><span>Channel</span><input name="channel" required autocomplete="off" placeholder="client-preview" value="' +
            attr(state.domainDraft.channel) + '" aria-describedby="domain-hint domain-form-error"' + (connectPending ? ' disabled' : '') + '></label>' +
          '<button class="btn solid btn-sm" type="submit"' + (connectPending ? ' disabled' : '') + '>' +
            (connectPending ? 'Connecting…' : 'Connect') + '</button></div></div></form>'
      : (!isPro
        ? '<p class="set-blurb" style="margin-bottom:1rem">Custom domains require Pro. Your vanish.sh URLs continue to work normally.</p>'
        : '');

    var reservation = state.domainReservation
      ? '<div class="set-row" data-namespace-region tabindex="-1" aria-busy="' + (releasePending ? 'true' : 'false') + '"><div><div class="set-label domain-value">' +
          escapeHtml(state.domainReservation.hostname) + '</div>' +
          '<div class="set-hint">reserved namespace · publish on <code class="domain-value">site.' + escapeHtml(state.domainReservation.hostname) + '</code></div>' +
          (state.domainErrors.release ? '<div class="form-error" role="alert">' + escapeHtml(state.domainErrors.release) + '</div>' : '') + '</div>' +
          '<button class="btn danger-ghost btn-sm" data-action="release-namespace"' +
            (releasePending ? ' disabled aria-busy="true"' : '') + '>' + (releasePending ? 'Releasing…' : 'Release') + '</button></div>'
      : (isPro
        ? '<form class="set-row" data-namespace-form tabindex="-1" aria-busy="' + (reservePending ? 'true' : 'false') + '"><div style="flex:1"><div class="set-label">Reserve your vanish.sh namespace</div>' +
            '<div class="set-hint">One permanent identity, then up to ' + state.domainRouteLimit + ' site subdomains below it.</div>' +
            '<div class="form-error" id="namespace-form-error" role="alert"' + (state.domainErrors.reserve ? '' : ' hidden') + '>' +
              escapeHtml(state.domainErrors.reserve) + '</div></div>' +
            '<div class="domain-fields"><label class="domain-field"><span>Namespace</span><input name="slug" required autocomplete="off" placeholder="studio" value="' +
              attr(state.domainDraft.slug) + '" aria-describedby="namespace-form-error"' + (reservePending ? ' disabled' : '') + '></label>' +
            '<button class="btn solid btn-sm" type="submit"' + (reservePending ? ' disabled' : '') + '>' +
              (reservePending ? 'Reserving…' : 'Reserve') + '</button></div></form>'
        : '<p class="set-blurb">Namespace reservations require Pro.</p>');

    return '<div class="page page-domains">' +
      '<header class="page-head"><div><h1 class="page-title">Domains</h1><p class="page-sub">reserve an identity and route every site through its own hostname</p></div></header>' +
      '<section class="set-section"><h2>Vanish namespace</h2><div class="set-rows">' + reservation + '</div></section>' +
      '<section class="set-section"><h2>Domains &amp; site routes</h2>' + form + '<div class="set-rows">' + rows + '</div></section>' +
      '<section class="set-section"><h2>CLI</h2><p class="set-blurb"><code>vanish domains reserve studio</code><br><code>vanish site ./portfolio --root index.html --channel portfolio --domain portfolio.studio.vanish.sh</code></p></section>' +
    '</div>';
  }

  // — Files —
  function renderFilesPage() {
    var me = state.me;
    var lim = TIER_LIMITS[me.tier] || TIER_LIMITS.free;
    var uploads = state.uploads;
    var total = uploads.reduce(function(a, f) { return a + f.bytes; }, 0);
    var kinds = [
      { id: 'all', label: 'All' },
      { id: 'image', label: 'Images' },
      { id: 'doc', label: 'Docs' },
      { id: 'video', label: 'Video' },
      { id: 'data', label: 'Data' }
    ];
    var counts = {
      all: uploads.length,
      image: uploads.filter(function(f) { return f.kind === 'image'; }).length,
      doc: uploads.filter(function(f) { return f.kind === 'doc'; }).length,
      video: uploads.filter(function(f) { return f.kind === 'video'; }).length,
      data: uploads.filter(function(f) { return f.kind === 'data'; }).length
    };

    var q = state.filesQuery;
    var visible = uploads.filter(function(f) {
      if (q && !f.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (state.filesFilter === 'all') return true;
      return f.kind === state.filesFilter;
    }).sort(function(a, b) { return b.created - a.created; });

    var tabsHtml = kinds.map(function(k) {
      var active = k.id === state.filesFilter ? ' active' : '';
      return '<button class="tab' + active + '" data-action="files-filter" data-filter="' + k.id + '">' +
        k.label + '<span class="tab-count">' + counts[k.id] + '</span></button>';
    }).join('');

    var bodyHtml;
    if (visible.length === 0) {
      bodyHtml = '<div class="empty subtle"><span class="empty-mark">∅</span>' +
        (uploads.length === 0 ? 'no files yet. upload one with <code>vanish upload file.png</code>' : 'no files match. try another filter.') +
        '</div>';
    } else if (state.filesView === 'list') {
      bodyHtml = '<div class="files-list">' +
        '<div class="files-head"><div>name</div><div>type</div><div>size</div><div>uploaded</div><div>vanishes in</div><div></div></div>' +
        visible.map(renderFileRow).join('') +
      '</div>';
    } else {
      bodyHtml = '<div class="files-grid">' + visible.map(renderFileCard).join('') + '</div>';
    }

    var storageLabel = lim.maxTotalStorage ? fmtBytes(lim.maxTotalStorage) : 'unlimited';
    return '<div class="page page-files">' +
      '<header class="page-head">' +
        '<div>' +
          '<h1 class="page-title">Files</h1>' +
          '<p class="page-sub">' + uploads.length + ' uploads · ' + fmtBytes(total) + ' of ' + storageLabel + ' used</p>' +
        '</div>' +
      '</header>' +
      '<div class="files-banner">' +
        '<div class="fb-inner">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 4v12M6 10l6-6 6 6"/><path d="M4 20h16"/></svg>' +
          '<div class="fb-text"><strong>Upload from the CLI:</strong> run <code>vanish upload file.png</code> from your terminal.</div>' +
          '<div class="fb-limit">max ' + maxFileLabel(me.tier) + ' per file · ' + retentionLabel(me.tier) + ' retention</div>' +
        '</div>' +
      '</div>' +
      '<div class="filter-bar">' +
        '<div class="tabs">' + tabsHtml + '</div>' +
        '<div class="filter-tools">' +
          '<div class="search">' +
            '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6" cy="6" r="4"/><path d="M9 9l3 3"/></svg>' +
            '<input data-action="files-search" placeholder="filter by filename…" value="' + attr(q) + '">' +
            (q ? '<button class="search-clear" data-action="files-search-clear">×</button>' : '') +
          '</div>' +
          '<div class="view-toggle">' +
            '<button class="' + (state.filesView === 'list' ? 'active' : '') + '" data-action="files-view" data-view="list" title="List">' +
              '<svg viewBox="0 0 12 12" width="11" height="11" fill="currentColor"><rect x="1" y="2" width="10" height="1.5"/><rect x="1" y="5.25" width="10" height="1.5"/><rect x="1" y="8.5" width="10" height="1.5"/></svg>' +
            '</button>' +
            '<button class="' + (state.filesView === 'grid' ? 'active' : '') + '" data-action="files-view" data-view="grid" title="Grid">' +
              '<svg viewBox="0 0 12 12" width="11" height="11" fill="currentColor"><rect x="1" y="1" width="4" height="4"/><rect x="7" y="1" width="4" height="4"/><rect x="1" y="7" width="4" height="4"/><rect x="7" y="7" width="4" height="4"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      bodyHtml +
    '</div>';
  }
  function fileIconSvg(kind) {
    var inner;
    if (kind === 'image') inner = '<rect x="2" y="3" width="12" height="10" rx="1"/><circle cx="6" cy="7" r="1.2"/><path d="M2 11l3-3 4 3 2-2 3 3"/>';
    else if (kind === 'video') inner = '<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M7 6l4 2-4 2V6z" fill="currentColor"/>';
    else if (kind === 'data') inner = '<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 7h12M6 3v10M10 3v10"/>';
    else inner = '<path d="M3 1h7l3 3v11H3V1z"/><path d="M10 1v3h3"/>';
    return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" class="file-icon kind-' + kind + '">' + inner + '</svg>';
  }
  function renderFileRow(f) {
    var remaining = f.expires - Date.now();
    var expired = f.expired;
    var soon = f.hasExpiry && !expired && remaining < 6 * 3600000;
    var timeCell = expired ? '<span class="dim"' + countdownAttr(f.expires, 'expired-label') + '>expired</span>' :
      (!f.hasExpiry ? '<span class="dim">∞</span>' : '<span class="' + (soon ? 'warn' : '') + '"' + countdownAttr(f.expires, 'until', soon ? 'warn' : '') + '>' + fmtTimeUntil(remaining) + '</span>');
    var md = '![' + f.name + '](' + f.url + ')';
    return '<div class="file-row' + (expired ? ' expired' : '') + '">' +
      '<div class="file-name">' + fileIconSvg(f.kind) + '<span class="fn">' + escapeHtml(f.name) + '</span></div>' +
      '<div class="file-mime" data-label="Type"><code>' + escapeHtml(f.mime) + '</code></div>' +
      '<div class="file-size" data-label="Size">' + fmtBytes(f.bytes) + '</div>' +
      '<div class="file-uploaded dim" data-label="Uploaded">' + fmtAgo(f.created) + '</div>' +
      '<div class="file-expiry" data-label="Expires">' + timeCell + '</div>' +
      '<div class="file-actions">' +
        '<button class="iconbtn" title="Copy URL" data-action="copy" data-text="' + attr(f.url) + '" data-msg="URL copied">' +
          '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 1v6h6V1H3zM7 7v2H1V3h2"/></svg>' +
        '</button>' +
        '<button class="iconbtn" title="Markdown" data-action="copy" data-text="' + attr(md) + '" data-msg="Markdown copied">md</button>' +
        (expired ? '' : '<button class="iconbtn iconbtn-danger" title="Delete" data-action="delete-file" data-id="' + attr(f.id) + '" data-name="' + attr(f.name) + '">' +
          '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 3h8M5 5v4M7 5v4M3 3l1 7h4l1-7M5 3V2h2v1"/></svg>' +
        '</button>') +
      '</div>' +
    '</div>';
  }
  function renderFileCard(f) {
    var remaining = f.expires - Date.now();
    var expired = f.expired;
    var soon = f.hasExpiry && !expired && remaining < 6 * 3600000;
    var timeCell = expired ? 'expired' : (!f.hasExpiry ? '∞' : fmtTimeUntil(remaining));
    return '<div class="file-card' + (expired ? ' expired' : '') + '">' +
      '<div class="fc-thumb">' + fileIconSvg(f.kind).replace('width="14"', 'width="28"').replace('height="14"', 'height="28"') + '</div>' +
      '<div class="fc-name" title="' + attr(f.name) + '">' + escapeHtml(f.name) + '</div>' +
      '<div class="fc-meta">' +
        '<span>' + fmtBytes(f.bytes) + '</span><span class="fc-sep">·</span>' +
        '<span class="' + (soon ? 'warn' : '') + '"' + (f.hasExpiry ? countdownAttr(f.expires, expired ? 'expired-label' : 'until', soon ? 'warn' : '') : '') + '>' + timeCell + '</span>' +
      '</div>' +
      '<div class="fc-actions">' +
        '<button class="btn ghost btn-xs" data-action="copy" data-text="' + attr(f.url) + '" data-msg="URL copied">copy url</button>' +
        (expired ? '' : '<button class="btn danger-ghost btn-xs" data-action="delete-file" data-id="' + attr(f.id) + '" data-name="' + attr(f.name) + '">delete</button>') +
      '</div>' +
    '</div>';
  }

  // — Keys —
  function renderKeysPage() {
    var keys = state.keys;
    var revealHtml = '';
    if (state.revealKey) {
      var k = state.revealKey;
      revealHtml =
        '<div class="key-reveal ph-no-capture">' +
          '<div class="kr-head">' +
            '<span class="dot dot-gold dot-pulse"></span>' +
            '<strong>' + escapeHtml(k.name) + '</strong>' +
            '<span class="kr-warn">save this key now. we hash it on the server and can\\'t show it again.</span>' +
          '</div>' +
          '<div class="kr-body">' +
            '<code class="kr-key">' + escapeHtml(k.key) + '</code>' +
            '<button class="btn ghost btn-sm" data-action="copy" data-text="' + attr(k.key) + '" data-msg="Key copied">Copy</button>' +
            '<button class="btn ghost btn-sm" data-action="hide-reveal">Hide</button>' +
          '</div>' +
          '<div class="kr-foot">Use it in <code>~/.config/vanish/config.json</code>, the <code>VANISH_API_KEY</code> env var, or in your CI as a secret.</div>' +
        '</div>';
    }

    var rowsHtml;
    if (keys.length === 0) {
      rowsHtml = '<div class="empty subtle"><span class="empty-mark">∅</span>no API keys yet. create one to use the CLI or API.</div>';
    } else {
      rowsHtml = '<div class="keys-list">' +
        '<div class="keys-head"><div>name</div><div>prefix</div><div>created</div><div>last used</div><div></div></div>' +
        keys.map(function(k) {
          var lastUsed = k.last_used_at ? fmtAgo(parseSqlDate(k.last_used_at)) : 'never used';
          return '<div class="key-row' + (k.revoked ? ' revoked' : '') + '">' +
            '<div class="key-name" data-label="Name">' + escapeHtml(k.name) + '</div>' +
            '<div class="key-prefix" data-label="Prefix"><code>' + escapeHtml(k.prefix) + '…</code><span class="key-mask">' + '•'.repeat(40) + '</span></div>' +
            '<div class="key-created dim" data-label="Created">' + fmtAgo(parseSqlDate(k.created_at)) + '</div>' +
            '<div class="key-used ' + (k.last_used_at ? '' : 'dim') + '" data-label="Last used">' + lastUsed + '</div>' +
            '<div class="key-actions">' +
              (k.revoked ? '<span class="pill pill-mute">revoked</span>' :
                '<button class="btn danger-ghost btn-sm" data-action="revoke-key" data-prefix="' + attr(k.prefix) + '">Revoke</button>') +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    var curl = [
      ['$ ', 'curl -X POST --data-binary @file.png \\\\'],
      ['  ', '-H "X-Filename: file.png" \\\\'],
      ['  ', '-H "Authorization: Bearer ', 'vnsh_…', '" \\\\'],
      ['  ', BASE_URL + '/upload']
    ];
    var envExample = [
      ['$ ', 'export VANISH_API_KEY=', 'vnsh_…'],
      ['$ ', 'vanish site ./demo --root index.html']
    ];
    function curlPre(lines) {
      return lines.map(function(parts) {
        return parts.map(function(p, i) {
          if (i === 0 && (p === '$ ' || p === '  ')) return '<span class="cu-d">' + escapeHtml(p) + '</span>';
          if (p.indexOf('vnsh_') === 0) return '<span class="cu-key">' + escapeHtml(p) + '</span>';
          return escapeHtml(p);
        }).join('');
      }).join('\\n');
    }
    function curlText(lines) {
      return lines.map(function(parts) { return parts.join(''); }).join('\\n');
    }

    return '<div class="page page-keys">' +
      '<header class="page-head">' +
        '<div>' +
          '<h1 class="page-title">Access keys</h1>' +
          '<p class="page-sub">' + keys.length + ' keys · stored as SHA-256 hashes · prefix shown for identification only</p>' +
        '</div>' +
        '<div class="page-head-actions">' +
          '<button class="btn solid" data-action="new-key">+ New key</button>' +
        '</div>' +
      '</header>' +
      revealHtml +
      rowsHtml +
      '<section class="curl-section">' +
        '<h3>Use it</h3>' +
        '<div class="curl-tabs">' +
          '<div class="curl-card">' +
            '<div class="curl-label"><span>curl</span><button class="curl-copy" data-action="copy" data-text="' + attr(curlText(curl)) + '" data-msg="Snippet copied">copy</button></div>' +
            '<pre class="curl-pre">' + curlPre(curl) + '</pre>' +
          '</div>' +
          '<div class="curl-card">' +
            '<div class="curl-label"><span>env var</span><button class="curl-copy" data-action="copy" data-text="' + attr(curlText(envExample)) + '" data-msg="Snippet copied">copy</button></div>' +
            '<pre class="curl-pre">' + curlPre(envExample) + '</pre>' +
          '</div>' +
        '</div>' +
      '</section>' +
    '</div>';
  }

  // — Billing —
  function renderBillingPage() {
    var me = state.me;
    var lim = TIER_LIMITS[me.tier] || TIER_LIMITS.free;
    var liveBytes = me.stats.total_bytes || 0;
    var storageMax = lim.maxTotalStorage;
    var pct = storageMax ? Math.min(100, Math.round((liveBytes / storageMax) * 100)) : 0;
    var tone = pct > 85 ? 'red' : 'accent';

    function planCard() {
      if (SELF_HOSTED) return '';
      var planLim = TIER_LIMITS.pro;
      var active = me.tier === 'pro';
      var cta = active
        ? (me.billing && me.billing.has_billing_account
          ? '<button class="btn solid btn-lg" data-action="manage-billing">Manage billing <span class="btn-arrow">→</span></button>'
          : '')
        : '<button class="btn solid btn-lg" data-action="upgrade-plan" data-tier="pro">Choose Pro <span class="btn-arrow">→</span></button>';
      return '<div class="bh-pro">' +
        '<div class="bh-pro-head"><span class="dot dot-gold dot-pulse"></span><span>Pro' +
          (active ? ' · active' : '') + '</span>' +
          (active
            ? '<span class="bh-pro-price">current plan</span>'
            : '<span class="bh-pro-price">€' + PLAN_PRICES_EUR.pro + '<span>/mo</span></span>') +
          '</div>' +
        '<ul class="bh-pro-list">' +
          '<li><span class="bh-check">✓</span> Custom <code>*.vanish.sh</code> slugs</li>' +
          '<li><span class="bh-check">✓</span> Up to 365 days with <code>--days</code></li>' +
          '<li><span class="bh-check">✓</span> ' + fmtBytes(planLim.maxTotalStorage) + ' total storage</li>' +
          '<li><span class="bh-check">✓</span> ' + planLim.rateLimit + ' requests / hour</li>' +
        '</ul>' +
        cta +
        '<div class="bh-pro-meta">cancel anytime · billed via Stripe</div>' +
      '</div>';
    }

    var planCards = planCard();
    var currentName = me.tier === 'pro' ? 'Pro' : me.tier === 'free' ? 'Free' : 'Anonymous';
    var currentPrice = me.tier === 'pro'
      ? (me.billing && me.billing.has_billing_account ? 'billing managed in Stripe' : 'included')
      : '€0';

    var features = [
      { k: 'Custom subdomains', free: 'random readable', pro: 'pick a slug', highlight: true },
      { k: 'Retention', free: retentionLabel('free'), pro: 'up to 365d', highlight: true },
      { k: 'Total storage', free: fmtBytes(TIER_LIMITS.free.maxTotalStorage), pro: fmtBytes(TIER_LIMITS.pro.maxTotalStorage) },
      { k: 'Max file size', free: fmtBytes(TIER_LIMITS.free.maxFileSize), pro: fmtBytes(TIER_LIMITS.pro.maxFileSize) },
      { k: 'Files per site', free: String(TIER_LIMITS.free.maxSiteFiles), pro: String(TIER_LIMITS.pro.maxSiteFiles) },
      { k: 'Rate limit', free: TIER_LIMITS.free.rateLimit + ' / hour', pro: TIER_LIMITS.pro.rateLimit + ' / hour' }
    ];
    var featuresHtml = features.map(function(f) {
      return '<div class="bf-row' + (f.highlight ? ' bf-highlight' : '') + '">' +
        '<div class="bf-k">' + escapeHtml(f.k) + '</div>' +
        '<div class="bf-free" data-plan="Free">' + escapeHtml(f.free) + '</div>' +
        '<div class="bf-pro" data-plan="Pro">' + escapeHtml(f.pro) + '</div>' +
      '</div>';
    }).join('');

    var storageBar = storageMax ?
      '<div class="pbar"><div class="pbar-fill pbar-' + tone + '" style="width:' + pct + '%"></div></div>' :
      '';

    var hostedNote = SELF_HOSTED ?
      '<p class="set-blurb" style="margin-top:1rem">This is a self-hosted instance. billing is disabled.</p>' : '';

    return '<div class="page page-billing">' +
      '<header class="page-head">' +
        '<div>' +
          '<h1 class="page-title">Plan &amp; billing</h1>' +
          '<p class="page-sub">currently on <span class="tier-tag tier-' + me.tier + '">' + escapeHtml(me.tier) + '</span></p>' +
        '</div>' +
      '</header>' +
      '<div class="billing-hero">' +
        '<div class="bh-current">' +
          '<div class="bh-tag">your plan</div>' +
          '<div class="bh-tier">' + currentName +
            '<span class="bh-price">' + currentPrice + '</span></div>' +
          '<div class="bh-stats">' +
            '<div><div class="bh-l">storage</div><div class="bh-v">' + fmtBytes(liveBytes) +
              (storageMax ? ' <span class="bh-of">of ' + fmtBytes(storageMax) + '</span>' : '') + '</div>' + storageBar + '</div>' +
            '<div><div class="bh-l">retention</div><div class="bh-v">' + retentionLabel(me.tier) + '</div></div>' +
            '<div><div class="bh-l">rate limit</div><div class="bh-v">' + lim.rateLimit + '<span class="bh-of">/hour</span></div></div>' +
          '</div>' +
          '<div class="bh-storage-note">' + fmtBytes(me.stats.published_site_bytes || 0) + ' published sites · ' +
            fmtBytes(me.stats.draft_site_bytes || 0) + ' drafts · ' + fmtBytes(me.stats.upload_bytes || 0) + ' files · ' +
            fmtBytes(me.stats.bundle_bytes || 0) + ' bundles</div>' +
          hostedNote +
        '</div>' +
      '</div>' +
      (planCards ? '<div class="billing-plans">' + planCards + '</div>' : '') +
      '<section class="billing-features">' +
        '<h2>What\\'s in each plan</h2>' +
        '<div class="bf-table">' +
          '<div class="bf-row bf-head"><div></div><div>Free</div><div class="bf-pro-col">Pro <span class="bf-pro-price">€' + PLAN_PRICES_EUR.pro + ' / month</span></div></div>' +
          featuresHtml +
        '</div>' +
      '</section>' +
    '</div>';
  }

  // — Settings —
  function renderSettingsPage() {
    var me = state.me;
    var sinceLabel = me.created_at ? fmtDate(parseSqlDate(me.created_at)) : '—';
    return '<div class="page page-settings">' +
      '<header class="page-head">' +
        '<div>' +
          '<h1 class="page-title">Settings</h1>' +
          '<p class="page-sub">account and danger zone</p>' +
        '</div>' +
      '</header>' +
      '<section class="set-section">' +
        '<h2>Profile</h2>' +
        '<div class="set-rows">' +
          '<div class="set-row">' +
            '<div><div class="set-label">GitHub handle</div><div class="set-hint">Linked via OAuth. change on github.com</div></div>' +
            '<div class="set-row-r"><div class="set-readonly">@' + escapeHtml(me.username || 'anon') + '</div></div>' +
          '</div>' +
          '<div class="set-row">' +
            '<div><div class="set-label">Email</div><div class="set-hint">From your GitHub account</div></div>' +
            '<div class="set-row-r"><div class="set-readonly">' + escapeHtml(me.email || '—') + '</div></div>' +
          '</div>' +
          '<div class="set-row">' +
            '<div><div class="set-label">Plan</div></div>' +
            '<div class="set-row-r"><span class="tier-tag tier-' + me.tier + '">' + escapeHtml(me.tier) + '</span></div>' +
          '</div>' +
          '<div class="set-row">' +
            '<div><div class="set-label">Joined</div></div>' +
            '<div class="set-row-r"><div class="set-readonly">' + escapeHtml(sinceLabel) + '</div></div>' +
          '</div>' +
        '</div>' +
      '</section>' +
      '<section class="set-section">' +
        '<h2>CLI</h2>' +
        '<p class="set-blurb">Configure the CLI by running <code>vanish login</code> or by setting <code>VANISH_API_KEY</code>. Defaults live in <code>~/.config/vanish/config.json</code>.</p>' +
      '</section>' +
      '<section class="set-section danger-section">' +
        '<h2>Danger zone</h2>' +
        '<div class="set-rows">' +
          '<div class="set-row">' +
            '<div><div class="set-label">Sign out of this browser</div><div class="set-hint">Removes the API key from this device. Your account and other sessions are unaffected.</div></div>' +
            '<div class="set-row-r"><button class="btn danger-ghost btn-sm" data-action="signout">Sign out</button></div>' +
          '</div>' +
        '</div>' +
      '</section>' +
    '</div>';
  }

  // — Login —
  function renderLogin() {
    rootEl.innerHTML =
      '<div class="login-screen">' +
        '<div class="login-logo">vanish<span class="dot">.</span></div>' +
        '<p class="login-msg">Come back to the sites and files you have shared.</p>' +
        '<a class="btn-github" href="/auth/github?redirect=/dashboard">Connect with GitHub</a>' +
        '<div class="login-divider">or</div>' +
        '<form class="login-key-form" data-login-key-form>' +
          '<input name="api_key" autocomplete="off" spellcheck="false" placeholder="vnsh_..." aria-label="API key">' +
          '<button type="submit">Use API key</button>' +
        '</form>' +
        '<p class="login-alt">or use the CLI: <code>vanish login</code></p>' +
      '</div>';
  }

  // — Actions —
  function focusSiteAccessRegion(siteId, preferredAction) {
    var preferred = Array.from(document.querySelectorAll('[data-action="' + preferredAction + '"]')).find(function(node) {
      return node.getAttribute('data-id') === siteId && !node.disabled;
    });
    var fallback = Array.from(document.querySelectorAll('[data-action="protect-site"]')).find(function(node) {
      return node.getAttribute('data-id') === siteId && !node.disabled;
    });
    var region = Array.from(document.querySelectorAll('[data-site-access-region]')).find(function(node) {
      return node.getAttribute('data-site-access-region') === siteId;
    });
    var target = preferred || fallback || region;
    if (target) target.focus();
  }

  function focusDomainMutation(hostname) {
    var remove = Array.from(document.querySelectorAll('[data-action="delete-domain"]')).find(function(node) {
      return node.getAttribute('data-hostname') === hostname && !node.disabled;
    });
    var region = Array.from(document.querySelectorAll('[data-domain-region]')).find(function(node) {
      return node.getAttribute('data-domain-region') === hostname;
    });
    var fallback = document.querySelector('.page-domains input, .page-domains button:not([disabled]), .page-domains [tabindex="-1"]');
    var target = remove || region || fallback;
    if (target) target.focus();
  }

  function focusDomainVerification(hostname) {
    var verify = Array.from(document.querySelectorAll('[data-action="verify-domain"]')).find(function(node) {
      return node.getAttribute('data-hostname') === hostname && !node.disabled;
    });
    var region = Array.from(document.querySelectorAll('[data-domain-region]')).find(function(node) {
      return node.getAttribute('data-domain-region') === hostname;
    });
    var target = verify || region;
    if (target) target.focus();
  }

  function focusDomainForm(hostname) {
    var region = hostname && Array.from(document.querySelectorAll('[data-domain-region]')).find(function(node) {
      return node.getAttribute('data-domain-region') === hostname;
    });
    var input = document.querySelector('[data-domain-form] input[name="hostname"]:not([disabled])');
    var form = document.querySelector('[data-domain-form]');
    var fallback = document.querySelector('.page-domains button:not([disabled]), .page-domains [tabindex="-1"]');
    var target = region || input || form || fallback;
    if (target) target.focus();
  }

  function focusNamespaceReservation(reserved) {
    var region = reserved ? document.querySelector('[data-namespace-region]') : null;
    var input = document.querySelector('[data-namespace-form] input[name="slug"]:not([disabled])');
    var form = document.querySelector('[data-namespace-form]');
    var fallback = document.querySelector('.page-domains button:not([disabled]), .page-domains [tabindex="-1"]');
    var target = region || input || form || fallback;
    if (target) target.focus();
  }

  function focusNamespaceMutation() {
    var release = document.querySelector('[data-action="release-namespace"]:not([disabled])');
    var region = document.querySelector('[data-namespace-region]');
    var fallback = document.querySelector('[data-namespace-form] input, .page-domains button:not([disabled]), .page-domains [tabindex="-1"]');
    var target = release || region || fallback;
    if (target) target.focus();
  }

  function performAction(action, el) {
    if (action === 'nav') {
      state.section = el.getAttribute('data-section');
      render();
      return;
    }
    if (action === 'signout') {
      localStorage.removeItem('vanish_api_key');
      apiKey = null;
      resetAnalytics();
      window.location.href = '/';
      return;
    }
    if (action === 'copy') {
      var text = el.getAttribute('data-text');
      var msg = el.getAttribute('data-msg') || 'copied';
      copyText(text, msg);
      return;
    }
    if (action === 'modal-cancel') { closeModal(); return; }
    if (action === 'modal-confirm') {
      confirmModal();
      return;
    }

    if (action === 'sites-filter') {
      state.sitesFilter = el.getAttribute('data-filter');
      rerenderMain();
      return;
    }
    if (action === 'sites-search-clear') {
      state.sitesQuery = '';
      rerenderMain();
      return;
    }
    if (action === 'toggle-site') {
      var id = el.getAttribute('data-id');
      state.sitesOpen[id] = !state.sitesOpen[id];
      rerenderMain();
      return;
    }
    if (action === 'delete-site') {
      var sid = el.getAttribute('data-id');
      var sname = el.getAttribute('data-name');
      openConfirm({
        title: 'Delete this mini-site?',
        body: 'The site at "' + sname + '" will return 404 immediately. This cannot be undone.',
        confirmLabel: 'Delete site',
        onConfirm: function() {
          apiFetch('/sites/' + encodeURIComponent(sid), { method: 'DELETE' }).then(function(r) {
            if (r && r.ok) {
              state.sites = state.sites.filter(function(s) { return s.id !== sid; });
              delete state.sitesOpen[sid];
              toast('site deleted');
              rerenderMain();
            } else {
              toast('error: ' + ((r && r.error) || 'failed'));
            }
          });
        }
      });
      return;
    }
    if (action === 'protect-site') {
      var protectedSiteId = el.getAttribute('data-id');
      if (!protectedSiteId || state.accessPending[protectedSiteId]) return;
      openConfirm({
        title: 'Protect this mini-site',
        body: 'Visitors will need this shared password before any site content is served.',
        confirmLabel: 'Enable password',
        destructive: false,
        passwordInput: true,
        onConfirm: function(password) {
          if (!password || password.length < 8 || password.length > 128) {
            toast('password must be 8–128 characters');
            return;
          }
          state.accessPending[protectedSiteId] = true;
          delete state.accessErrors[protectedSiteId];
          rerenderMain();
          focusSiteAccessRegion(protectedSiteId, 'protect-site');
          apiFetch('/sites/' + encodeURIComponent(protectedSiteId) + '/access', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'password', password: password })
          }).then(function(r) {
            delete state.accessPending[protectedSiteId];
            if (r && !r.error) {
              var site = state.sites.find(function(s) { return s.id === protectedSiteId; });
              if (site) site.access_mode = 'password';
              toast('password protection enabled');
            } else {
              state.accessErrors[protectedSiteId] = (r && r.error) || 'Unable to update password protection.';
            }
            rerenderMain();
            focusSiteAccessRegion(protectedSiteId, 'protect-site');
          }).catch(function() {
            delete state.accessPending[protectedSiteId];
            state.accessErrors[protectedSiteId] = 'Network error. Check your connection and try again.';
            rerenderMain();
            focusSiteAccessRegion(protectedSiteId, 'protect-site');
          });
        }
      });
      return;
    }
    if (action === 'link-site') {
      var linkedSiteId = el.getAttribute('data-id');
      if (!linkedSiteId || state.accessPending[linkedSiteId]) return;
      openConfirm({
        title: 'Remove password protection?',
        body: 'Anyone who has the site URL will be able to open it immediately.',
        confirmLabel: 'Allow link access',
        onConfirm: function() {
          state.accessPending[linkedSiteId] = true;
          delete state.accessErrors[linkedSiteId];
          rerenderMain();
          focusSiteAccessRegion(linkedSiteId, 'link-site');
          apiFetch('/sites/' + encodeURIComponent(linkedSiteId) + '/access', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'link' })
          }).then(function(r) {
            delete state.accessPending[linkedSiteId];
            if (r && !r.error) {
              var site = state.sites.find(function(s) { return s.id === linkedSiteId; });
              if (site) site.access_mode = 'link';
              toast('link access enabled');
            } else {
              state.accessErrors[linkedSiteId] = (r && r.error) || 'Unable to enable link access.';
            }
            rerenderMain();
            focusSiteAccessRegion(linkedSiteId, 'link-site');
          }).catch(function() {
            delete state.accessPending[linkedSiteId];
            state.accessErrors[linkedSiteId] = 'Network error. Check your connection and try again.';
            rerenderMain();
            focusSiteAccessRegion(linkedSiteId, 'link-site');
          });
        }
      });
      return;
    }
    if (action === 'verify-domain') {
      var verifyHostname = el.getAttribute('data-hostname');
      if (!verifyHostname || state.domainPending.verify[verifyHostname]) return;
      state.domainPending.verify[verifyHostname] = true;
      delete state.domainErrors.verify[verifyHostname];
      rerenderMain();
      focusDomainVerification(verifyHostname);
      apiFetch('/domains/' + encodeURIComponent(verifyHostname) + '/verify', { method: 'POST' }).then(function(r) {
        delete state.domainPending.verify[verifyHostname];
        if (r && !r.error) {
          state.domains = state.domains.map(function(d) { return d.hostname === r.hostname ? r : d; });
          toast('domain status: ' + r.status);
        } else {
          state.domainErrors.verify[verifyHostname] = (r && r.error) || 'Unable to verify this domain.';
        }
        rerenderMain();
        focusDomainVerification(verifyHostname);
      }).catch(function() {
        delete state.domainPending.verify[verifyHostname];
        state.domainErrors.verify[verifyHostname] = 'Network error. Check your connection and try again.';
        rerenderMain();
        focusDomainVerification(verifyHostname);
      });
      return;
    }
    if (action === 'delete-domain') {
      var deleteHostname = el.getAttribute('data-hostname');
      if (!deleteHostname || state.domainPending.delete[deleteHostname]) return;
      openConfirm({
        title: 'Remove custom domain?',
        body: deleteHostname + ' will stop serving this Vanish channel. The canonical vanish.sh URL remains available.',
        confirmLabel: 'Remove domain',
        onConfirm: function() {
          state.domainPending.delete[deleteHostname] = true;
          delete state.domainErrors.delete[deleteHostname];
          rerenderMain();
          focusDomainMutation(deleteHostname);
          apiFetch('/domains/' + encodeURIComponent(deleteHostname), { method: 'DELETE' }).then(function(r) {
            delete state.domainPending.delete[deleteHostname];
            if (r && r.ok) {
              state.domains = state.domains.filter(function(d) { return d.hostname !== deleteHostname; });
              toast(r.status === 'deleting' ? 'domain removal queued' : 'domain removed');
            } else {
              state.domainErrors.delete[deleteHostname] = (r && r.error) || 'Unable to remove this domain.';
            }
            rerenderMain();
            focusDomainMutation(deleteHostname);
          }).catch(function() {
            delete state.domainPending.delete[deleteHostname];
            state.domainErrors.delete[deleteHostname] = 'Network error. Check your connection and try again.';
            rerenderMain();
            focusDomainMutation(deleteHostname);
          });
        }
      });
      return;
    }
    if (action === 'release-namespace') {
      if (state.domainPending.release) return;
      openConfirm({
        title: 'Release Vanish namespace?',
        body: 'The namespace can only be released after all of its site routes have been removed.',
        confirmLabel: 'Release namespace',
        onConfirm: function() {
          state.domainPending.release = true;
          state.domainErrors.release = '';
          rerenderMain();
          focusNamespaceMutation();
          apiFetch('/domains/reservation', { method: 'DELETE' }).then(function(r) {
            state.domainPending.release = false;
            if (r && r.ok) {
              state.domainReservation = null;
              toast('namespace released');
            } else {
              state.domainErrors.release = (r && r.error) || 'Unable to release this namespace.';
            }
            rerenderMain();
            focusNamespaceMutation();
          }).catch(function() {
            state.domainPending.release = false;
            state.domainErrors.release = 'Network error. Check your connection and try again.';
            rerenderMain();
            focusNamespaceMutation();
          });
        }
      });
      return;
    }

    if (action === 'files-filter') {
      state.filesFilter = el.getAttribute('data-filter');
      rerenderMain();
      return;
    }
    if (action === 'files-search-clear') {
      state.filesQuery = '';
      rerenderMain();
      return;
    }
    if (action === 'files-view') {
      state.filesView = el.getAttribute('data-view');
      rerenderMain();
      return;
    }
    if (action === 'delete-file') {
      var fid = el.getAttribute('data-id');
      var fname = el.getAttribute('data-name');
      openConfirm({
        title: 'Delete this file?',
        body: '"' + fname + '" will return 404 immediately. This cannot be undone.',
        confirmLabel: 'Delete file',
        onConfirm: function() {
          apiFetch('/f/' + encodeURIComponent(fid), { method: 'DELETE' }).then(function(r) {
            if (r && r.ok) {
              state.uploads = state.uploads.filter(function(f) { return f.id !== fid; });
              toast('file deleted');
              rerenderMain();
            } else {
              toast('error: ' + ((r && r.error) || 'failed'));
            }
          });
        }
      });
      return;
    }

    if (action === 'new-key') {
      openConfirm({
        title: 'Create a new API key',
        body: 'Pick a name for your reference (e.g. "macbook-pro", "github-action"). The key will be shown once.',
        confirmLabel: 'Create',
        destructive: false,
        onConfirm: function() {
          var name = window.prompt('Key name:', 'default');
          if (!name) return;
          apiFetch('/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.slice(0, 64) })
          }).then(function(r) {
            if (r && r.api_key) {
              state.revealKey = { key: r.api_key, name: r.name };
              return apiFetch('/keys').then(function(rr) {
                state.keys = rr.keys || state.keys;
                rerenderMain();
              });
            }
            toast('error: ' + ((r && r.error) || 'failed'));
          });
        }
      });
      return;
    }
    if (action === 'hide-reveal') {
      state.revealKey = null;
      rerenderMain();
      return;
    }
    if (action === 'revoke-key') {
      var prefix = el.getAttribute('data-prefix');
      openConfirm({
        title: 'Revoke key ' + prefix + '…?',
        body: 'It will stop working immediately. Anything using this key will see 401 errors until you swap in a new one.',
        confirmLabel: 'Revoke key',
        onConfirm: function() {
          apiFetch('/keys/' + encodeURIComponent(prefix), { method: 'DELETE' }).then(function(r) {
            if (r && r.ok) {
              return apiFetch('/keys').then(function(rr) {
                state.keys = rr.keys || state.keys;
                toast('key revoked');
                rerenderMain();
              });
            }
            toast('error: ' + ((r && r.error) || 'failed'));
          });
        }
      });
      return;
    }
    if (action === 'manage-billing') {
      apiFetch('/billing/portal', { method: 'POST' }).then(function(r) {
        if (r && r.url) {
          window.location.assign(r.url);
        } else {
          toast('error: ' + ((r && r.error) || 'failed'));
        }
      }).catch(function(e) {
        toast('error: ' + ((e && e.message) || 'failed'));
      });
      return;
    }
    if (action === 'upgrade-plan') {
      var targetTier = el.getAttribute('data-tier');
      el.disabled = true;
      apiFetch('/billing/checkout?tier=' + encodeURIComponent(targetTier), { method: 'POST' }).then(function(r) {
        if (r && r.url) {
          window.location.assign(r.url);
        } else {
          el.disabled = false;
          toast('error: ' + ((r && r.error) || 'failed'));
        }
      }).catch(function(e) {
        el.disabled = false;
        toast('error: ' + ((e && e.message) || 'failed'));
      });
      return;
    }
  }

  document.addEventListener('click', function(e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.getAttribute('data-action') === 'modal-cancel' && e.target !== el) return;
    e.preventDefault();
    performAction(el.getAttribute('data-action'), el);
  });

  document.addEventListener('input', function(e) {
    var el = e.target;
    var action = el.getAttribute && el.getAttribute('data-action');
    if (action === 'sites-search') {
      state.sitesQuery = el.value;
      rerenderMain();
      var input = document.querySelector('[data-action="sites-search"]');
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    } else if (action === 'files-search') {
      state.filesQuery = el.value;
      rerenderMain();
      var i2 = document.querySelector('[data-action="files-search"]');
      if (i2) { i2.focus(); i2.setSelectionRange(i2.value.length, i2.value.length); }
    }
  });

  document.addEventListener('change', function(e) {
    var el = e.target;
    var action = el.getAttribute && el.getAttribute('data-action');
    if (action === 'sites-sort') {
      state.sitesSort = el.value;
      rerenderMain();
    }
  });

  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || !form.matches) return;
    if (form.matches('[data-login-key-form]')) {
      e.preventDefault();
      var input = form.querySelector('input[name="api_key"]');
      loginWithApiKey(input && input.value);
      return;
    }
    if (form.matches('[data-domain-form]')) {
      e.preventDefault();
      if (state.domainPending.connect) return;
      var hostnameInput = form.querySelector('input[name="hostname"]');
      var channelInput = form.querySelector('input[name="channel"]');
      state.domainDraft.hostname = hostnameInput ? hostnameInput.value : '';
      state.domainDraft.channel = channelInput ? channelInput.value : '';
      state.domainErrors.connect = '';
      state.domainPending.connect = true;
      rerenderMain();
      focusDomainForm('');
      apiFetch('/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname: state.domainDraft.hostname, channel: state.domainDraft.channel })
      }).then(function(r) {
        state.domainPending.connect = false;
        var connectedHostname = '';
        if (r && !r.error) {
          state.domains.unshift(r);
          connectedHostname = r.hostname;
          state.domainDraft.hostname = '';
          state.domainDraft.channel = '';
          toast('domain added');
        } else {
          state.domainErrors.connect = (r && r.error) || 'Unable to connect this hostname.';
        }
        rerenderMain();
        focusDomainForm(connectedHostname);
      }).catch(function() {
        state.domainPending.connect = false;
        state.domainErrors.connect = 'Network error. Check your connection and try again.';
        rerenderMain();
        focusDomainForm('');
      });
      return;
    }
    if (form.matches('[data-namespace-form]')) {
      e.preventDefault();
      if (state.domainPending.reserve) return;
      var slugInput = form.querySelector('input[name="slug"]');
      state.domainDraft.slug = slugInput ? slugInput.value : '';
      state.domainErrors.reserve = '';
      state.domainPending.reserve = true;
      rerenderMain();
      focusNamespaceReservation(false);
      apiFetch('/domains/reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: state.domainDraft.slug })
      }).then(function(r) {
        state.domainPending.reserve = false;
        var reserved = false;
        if (r && !r.error) {
          state.domainReservation = r;
          reserved = true;
          state.domainDraft.slug = '';
          toast('namespace reserved');
        } else {
          state.domainErrors.reserve = (r && r.error) || 'Unable to reserve this namespace.';
        }
        rerenderMain();
        focusNamespaceReservation(reserved);
      }).catch(function() {
        state.domainPending.reserve = false;
        state.domainErrors.reserve = 'Network error. Check your connection and try again.';
        rerenderMain();
        focusNamespaceReservation(false);
      });
    }
  });

  // — Ticker (live countdowns) —
  function timerBucket(item) {
    if (!item.hasExpiry) return 'none';
    var remaining = item.expires - Date.now();
    if (remaining <= 0) return 'expired';
    if (remaining < 30 * 60 * 1000) return 'critical';
    if (remaining < 6 * 3600 * 1000) return 'expiring';
    return 'live';
  }
  function refreshTimerBuckets() {
    var buckets = {};
    state.sites.forEach(function(s) { buckets['site:' + s.id] = timerBucket(s); });
    state.uploads.forEach(function(f) { buckets['file:' + f.id] = timerBucket(f); });
    state.timerBuckets = buckets;
  }
  function hasTimerBoundaryChange() {
    var changed = false;
    state.sites.forEach(function(s) {
      var key = 'site:' + s.id;
      var next = timerBucket(s);
      if (state.timerBuckets[key] && state.timerBuckets[key] !== next) changed = true;
      s.expired = s.hasExpiry && s.expires <= Date.now();
    });
    state.uploads.forEach(function(f) {
      var key = 'file:' + f.id;
      var next = timerBucket(f);
      if (state.timerBuckets[key] && state.timerBuckets[key] !== next) changed = true;
      f.expired = f.hasExpiry && f.expires <= Date.now();
    });
    return changed;
  }
  function updateVisibleCountdowns() {
    document.querySelectorAll('[data-countdown-expires]').forEach(function(el) {
      var expires = Number(el.getAttribute('data-countdown-expires'));
      if (!expires) return;
      var mode = el.getAttribute('data-countdown-mode') || 'until';
      if (mode === 'ago') {
        el.textContent = fmtAgo(expires);
      } else if (mode === 'expired-label') {
        el.textContent = expires <= Date.now() ? 'expired' : fmtTimeUntil(expires - Date.now());
      } else {
        el.textContent = fmtTimeUntil(expires - Date.now());
      }
    });
  }
  setInterval(function() {
    if (!state.me) return;
    if (state.section === 'overview' || state.section === 'sites' || state.section === 'files') {
      if (hasTimerBoundaryChange()) {
        refreshTimerBuckets();
        rerenderMain();
      } else {
        updateVisibleCountdowns();
      }
    }
  }, 1000);

  // — Init —
  if (!apiKey) {
    renderLogin();
  } else {
    fetchAll().catch(function(e) {
      if (String(e).indexOf('unauthorized') === -1) {
        rootEl.innerHTML = '<div class="loading">failed to load: ' + escapeHtml(String(e && e.message || e)) + '</div>';
      }
    });
  }
})();
</script>
</body>
</html>`;

  return c.html(html);
});

export default dashboard;
