import { Hono } from 'hono';
import type { Env } from '../types.js';
import { PLAN_PRICES_EUR, TIER_LIMITS } from '../types.js';

const dashboard = new Hono<{ Bindings: Env }>();

dashboard.get('/dashboard', (c) => {
  const baseUrl = c.env.BASE_URL;
  const selfHosted = c.env.SELF_HOSTED === 'true';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<title>vanish · dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg: #08090a;
  --bg-2: #0c0e10;
  --bg-3: #0f1113;
  --bg-card: #0f1113;
  --bg-mid: #0a0c0e;
  --bg-elev: #14171a;

  --fg: #a8adb5;
  --fg-dim: #5e646b;
  --fg-mute: #3d3a35;
  --fg-bright: #dee3e9;
  --fg-white: #f2f5fa;

  --accent: #d4a850;
  --accent-dim: #806328;
  --accent-soft: rgba(212,168,80,.10);
  --accent-faint: rgba(212,168,80,.04);

  --green: #7dba5a;
  --blue: #6a9fd8;
  --red: #d46a6a;

  --border: #171a1d;
  --border-2: #202428;
  --hairline: #121417;

  --mono: 'IBM Plex Mono', 'SF Mono', 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  --sans: 'IBM Plex Sans', -apple-system, system-ui, sans-serif;
}

html, body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
body { min-height: 100vh; overflow-x: hidden; }
::selection { background: var(--accent); color: var(--bg); }

a { color: inherit; text-decoration: none; }
button { font-family: inherit; font-size: inherit; background: none; border: 0; color: inherit; cursor: pointer; }
input, select, textarea { font-family: inherit; font-size: inherit; }
svg { display: block; }
code { font-family: var(--mono); }

/* Layout */
.app { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
@media (max-width: 760px) { .app { grid-template-columns: 1fr; } }
.main { padding: 2.5rem 3rem 4rem; max-width: 1180px; width: 100%; }
@media (max-width: 1100px) { .main { padding: 2rem 2rem 4rem; } }
@media (max-width: 760px)  { .main { padding: 1.4rem 1.2rem 4rem; } }

/* Sidebar */
.sidebar {
  border-right: 1px solid var(--hairline);
  background: var(--bg-mid);
  display: flex; flex-direction: column;
  position: sticky; top: 0; height: 100vh;
  padding: 1rem .9rem;
}
@media (max-width: 760px) { .sidebar { position: static; height: auto; } }
.sb-brand {
  display: flex; align-items: baseline; gap: .6rem;
  padding: .4rem .5rem 1.2rem;
  border-bottom: 1px solid var(--hairline);
  margin-bottom: 1rem;
}
.sb-logo { display: flex; align-items: baseline; gap: .35rem; }
.sb-mark {
  width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--accent); color: var(--bg);
  border-radius: 4px; font-weight: 600; font-size: .85rem; letter-spacing: -.04em;
}
.sb-wordmark { color: var(--fg-white); font-weight: 600; letter-spacing: -.02em; font-size: .92rem; }
.sb-wordmark .dot { color: var(--accent); }
.sb-version { margin-left: auto; color: var(--fg-mute); font-size: .65rem; letter-spacing: .04em; }

.sb-nav { display: flex; flex-direction: column; gap: 2px; }
.sb-section-label {
  font-size: .62rem; letter-spacing: .14em; text-transform: uppercase;
  color: var(--fg-mute); padding: 0 .5rem .4rem;
}
.sb-item {
  display: flex; align-items: center; gap: .6rem;
  padding: .5rem .6rem; border-radius: 4px;
  color: var(--fg); font-size: .8rem; position: relative;
  transition: background .15s, color .15s;
  text-align: left;
}
.sb-item:hover { background: var(--bg-3); color: var(--fg-bright); }
.sb-item.active { background: var(--bg-elev); color: var(--fg-white); }
.sb-item.active .sb-icon { color: var(--accent); }
.sb-icon { color: var(--fg-dim); flex-shrink: 0; }
.sb-item.active .sb-dot {
  position: absolute; left: -.9rem; top: 50%; width: 2px; height: 16px;
  background: var(--accent); border-radius: 0 2px 2px 0; transform: translateY(-50%);
}

.sb-foot { margin-top: auto; display: flex; flex-direction: column; gap: .8rem; padding-top: 1rem; }
.sb-upgrade {
  border: 1px solid var(--accent-dim);
  background: linear-gradient(180deg, var(--accent-soft), transparent);
  border-radius: 6px; padding: .8rem .9rem; cursor: pointer;
  transition: border-color .2s, background .2s;
  text-align: left;
}
.sb-upgrade:hover { border-color: var(--accent); }
.sb-upgrade-head { display: flex; align-items: center; gap: .45rem; color: var(--accent); font-size: .78rem; font-weight: 500; }
.sb-upgrade-body { color: var(--fg-dim); font-size: .68rem; line-height: 1.5; margin-top: .35rem; }
.sb-upgrade-cta { margin-top: .55rem; color: var(--fg-bright); font-size: .76rem; display: flex; justify-content: space-between; align-items: center; }
.sb-arrow { color: var(--accent); }

.sb-user {
  display: flex; align-items: center; gap: .6rem;
  padding: .55rem .5rem; border-top: 1px solid var(--hairline);
}
.sb-avatar {
  width: 28px; height: 28px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  color: var(--fg-white); font-size: .75rem; font-weight: 500; flex-shrink: 0;
  background: #2a2522;
}
.sb-user-meta { min-width: 0; flex: 1; }
.sb-user-name { color: var(--fg-bright); font-size: .78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-user-tier { display: flex; align-items: center; gap: .4rem; margin-top: .1rem; }
.sb-user-since { color: var(--fg-mute); font-size: .62rem; }
.sb-signout {
  margin-left: auto; color: var(--fg-mute); font-size: .65rem;
  padding: .25rem .4rem; border-radius: 3px;
  transition: color .15s, background .15s;
}
.sb-signout:hover { color: var(--red); background: var(--bg-3); }

.tier-tag {
  font-size: .6rem; letter-spacing: .1em; text-transform: uppercase;
  padding: .1rem .4rem; border-radius: 2px;
}
.tier-free { color: var(--green); border: 1px solid color-mix(in srgb, var(--green) 35%, transparent); }
.tier-pro { color: var(--accent); border: 1px solid var(--accent-dim); background: var(--accent-soft); }
.tier-anonymous { color: var(--fg-dim); border: 1px solid var(--border-2); }

/* Page head */
.page-head {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 1.5rem;
  margin-bottom: 2rem; flex-wrap: wrap;
}
.page-title {
  font-family: var(--mono); font-weight: 500;
  font-size: 1.6rem; letter-spacing: -.025em;
  color: var(--fg-white); line-height: 1.1;
}
.page-sub { color: var(--fg-dim); font-size: .78rem; margin-top: .35rem; }
.page-head-actions { display: flex; gap: .5rem; }

/* Buttons */
.btn {
  display: inline-flex; align-items: center; gap: .5rem;
  padding: .55rem .9rem; border-radius: 4px;
  font-size: .78rem; font-weight: 500; letter-spacing: .01em;
  border: 1px solid transparent;
  transition: background .15s, color .15s, border-color .15s, opacity .15s;
  white-space: nowrap;
}
.btn:disabled { opacity: .4; cursor: not-allowed; }
.btn.ghost { border-color: var(--border-2); color: var(--fg-bright); background: var(--bg-3); }
.btn.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.btn.solid { background: var(--accent); color: var(--bg); }
.btn.solid:hover:not(:disabled) { filter: brightness(1.08); }
.btn.danger { background: var(--red); color: var(--bg); }
.btn.danger-ghost { border-color: var(--border-2); color: var(--fg-dim); background: transparent; }
.btn.danger-ghost:hover { color: var(--red); border-color: var(--red); }
.btn-sm { padding: .35rem .65rem; font-size: .72rem; }
.btn-xs { padding: .25rem .55rem; font-size: .68rem; }
.btn-lg { padding: .75rem 1.2rem; font-size: .85rem; }
.btn-arrow { transition: transform .2s; }
.btn:hover .btn-arrow { transform: translateX(2px); }

.iconbtn {
  width: 26px; height: 26px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); border-radius: 3px;
  color: var(--fg-dim); font-size: .68rem;
  transition: color .15s, border-color .15s, background .15s;
}
.iconbtn:hover { color: var(--fg-bright); border-color: var(--border-2); background: var(--bg-3); }
.iconbtn.iconbtn-danger:hover { color: var(--red); border-color: var(--red); }

/* Pills, dots */
.pill {
  display: inline-flex; align-items: center; gap: .35rem;
  font-size: .62rem; letter-spacing: .1em; text-transform: uppercase;
  padding: .12rem .45rem; border-radius: 2px;
  border: 1px solid var(--border-2); color: var(--fg-dim); white-space: nowrap;
}
.pill-green { color: var(--green); border-color: color-mix(in srgb, var(--green) 30%, transparent); }
.pill-gold  { color: var(--accent); border-color: var(--accent-dim); background: var(--accent-soft); }
.pill-red   { color: var(--red); border-color: color-mix(in srgb, var(--red) 30%, transparent); }
.pill-mute  { color: var(--fg-dim); }

.dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; }
.dot-green { background: var(--green); }
.dot-gold  { background: var(--accent); }
.dot-red   { background: var(--red); }
.dot-mute  { background: var(--fg-mute); }
.dot-pulse { animation: dotpulse 1.8s ease-in-out infinite; }
.dot-pulse.dot-green { box-shadow: 0 0 6px var(--green); }
.dot-pulse.dot-gold  { box-shadow: 0 0 6px var(--accent); }
@keyframes dotpulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }

/* Toast */
.toast {
  position: fixed; bottom: 1.6rem; left: 50%;
  transform: translateX(-50%);
  background: var(--bg-elev); border: 1px solid var(--border-2);
  color: var(--fg-bright); padding: .55rem 1.1rem;
  border-radius: 4px; font-size: .78rem;
  z-index: 200; opacity: 0; pointer-events: none;
  transition: opacity .2s;
  box-shadow: 0 8px 24px rgba(0,0,0,.5);
}
.toast.show { opacity: 1; }

/* Progress */
.pbar { width: 100%; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
.pbar-fill { height: 100%; transition: width .3s; }
.pbar-accent { background: var(--accent); }
.pbar-red { background: var(--red); }

/* Overview */
.ov-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
  background: var(--hairline); border: 1px solid var(--hairline);
  border-radius: 6px; overflow: hidden; margin-bottom: 2.5rem;
}
@media (max-width: 900px) { .ov-grid { grid-template-columns: repeat(2, 1fr); } }
.stat-card {
  background: var(--bg-card); padding: 1.1rem 1.2rem 1.2rem;
  display: flex; flex-direction: column; gap: .25rem; min-height: 130px;
}
.stat-label { font-size: .65rem; letter-spacing: .12em; text-transform: uppercase; color: var(--fg-dim); }
.stat-value { font-size: 1.6rem; color: var(--fg-white); font-weight: 500; letter-spacing: -.02em; line-height: 1.1; margin-top: .1rem; }
.stat-sub { font-size: .7rem; color: var(--fg-dim); }
.stat-progress { margin-top: auto; padding-top: .6rem; }

.ov-section { margin-bottom: 2.5rem; }
.ov-section-head { display: flex; align-items: baseline; gap: 1rem; margin-bottom: 1rem; }
.ov-section-head h2, .ov-card-head h2 {
  font-size: .9rem; font-weight: 500; color: var(--fg-white); letter-spacing: -.01em;
}
.ov-section-sub { color: var(--fg-dim); font-size: .72rem; }

.expiring-list {
  display: flex; flex-direction: column;
  border: 1px solid var(--border); border-radius: 6px; overflow: hidden;
}
.expiring-row {
  display: grid; grid-template-columns: 1.5fr auto 1fr auto;
  gap: 1rem; align-items: center;
  padding: .75rem 1rem;
  background: var(--bg-card);
  border-bottom: 1px solid var(--hairline);
  font-size: .78rem;
}
.expiring-row:last-child { border-bottom: 0; }
.expiring-row.warn { background: linear-gradient(90deg, var(--accent-faint), transparent 30%), var(--bg-card); }
.expiring-row.critical { background: linear-gradient(90deg, color-mix(in srgb, var(--red) 8%, transparent), transparent 30%), var(--bg-card); }
.er-left { display: flex; align-items: center; gap: .55rem; min-width: 0; }
.er-kind { font-size: .62rem; letter-spacing: .1em; text-transform: uppercase; color: var(--fg-mute); }
.er-name { color: var(--fg-bright); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.er-mid { color: var(--fg-dim); font-size: .72rem; }
.er-time { display: flex; flex-direction: column; align-items: flex-end; gap: .1rem; }
.er-time-label { font-size: .62rem; letter-spacing: .08em; text-transform: uppercase; color: var(--fg-mute); }
.er-time-val { font-variant-numeric: tabular-nums; color: var(--accent); font-size: .82rem; }
.expiring-row.critical .er-time-val { color: var(--red); }
.er-actions { display: flex; gap: .35rem; }

.ov-two-col { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1rem; }
@media (max-width: 980px) { .ov-two-col { grid-template-columns: 1fr; } }
.ov-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 1.2rem; }
.ov-card-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1rem; }
.ov-link { color: var(--accent); font-size: .72rem; }
.ov-link:hover { text-decoration: underline; }

.ov-recent { display: flex; flex-direction: column; gap: .4rem; }
.recent-row {
  display: flex; align-items: center; gap: .8rem;
  padding: .6rem .55rem; border-radius: 4px; cursor: pointer;
  transition: background .15s; text-align: left; width: 100%;
}
.recent-row:hover { background: var(--bg-2); }
.recent-thumb {
  width: 32px; height: 32px;
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: 3px;
  display: flex; align-items: center; justify-content: center;
  color: var(--fg-dim); font-size: .58rem; letter-spacing: .04em;
  text-transform: uppercase; flex-shrink: 0;
}
.recent-meta { flex: 1; min-width: 0; }
.recent-name { color: var(--fg-bright); font-size: .82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-name .acc { color: var(--accent); }
.recent-host { color: var(--fg-dim); }
.recent-sub { color: var(--fg-dim); font-size: .68rem; margin-top: .1rem; }

.ov-quickref { display: flex; flex-direction: column; gap: .55rem; }
.qc-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: .25rem; }
.qc-label { color: var(--fg-dim); font-size: .68rem; letter-spacing: .04em; }
.qc-cmd {
  background: var(--bg-2); border: 1px solid var(--border); border-radius: 3px;
  padding: .5rem .6rem;
  display: flex; align-items: center; gap: .55rem;
  font-size: .73rem; cursor: pointer;
  transition: border-color .15s;
  overflow-x: auto; white-space: nowrap;
  width: 100%; text-align: left;
}
.qc-cmd:hover { border-color: var(--accent-dim); }
.qc-prompt { color: var(--accent); }
.qc-text { color: var(--fg-bright); flex: 1; }
.qc-copy { color: var(--fg-dim); font-size: .62rem; letter-spacing: .04em; }

.ov-pro-banner {
  margin-top: 1rem;
  display: flex; justify-content: space-between; align-items: center;
  padding: .7rem .9rem;
  border: 1px dashed var(--accent-dim);
  border-radius: 4px;
  color: var(--fg-bright); font-size: .76rem;
  background: var(--accent-faint);
  transition: background .15s, border-color .15s;
  width: 100%; text-align: left;
}
.ov-pro-banner:hover { background: var(--accent-soft); border-color: var(--accent); }
.ov-pro-arrow { color: var(--accent); }

/* Filter bar */
.filter-bar {
  display: flex; justify-content: space-between; align-items: center;
  gap: 1rem; margin-bottom: 1.2rem; flex-wrap: wrap;
  border-bottom: 1px solid var(--hairline);
  padding-bottom: .8rem;
}
.tabs { display: flex; gap: .15rem; flex-wrap: wrap; }
.tab {
  display: inline-flex; align-items: center; gap: .4rem;
  padding: .35rem .75rem;
  font-size: .76rem; color: var(--fg-dim);
  border-radius: 3px; text-transform: capitalize;
  transition: color .15s, background .15s;
}
.tab:hover { color: var(--fg-bright); }
.tab.active { color: var(--fg-white); background: var(--bg-3); }
.tab-count {
  font-size: .62rem; color: var(--fg-mute);
  padding: .05rem .35rem; background: var(--bg-2); border-radius: 8px;
  font-variant-numeric: tabular-nums;
}
.tab.active .tab-count { color: var(--accent); background: var(--accent-soft); }

.filter-tools { display: flex; gap: .5rem; align-items: center; }
.search {
  display: inline-flex; align-items: center; gap: .5rem;
  background: var(--bg-3); border: 1px solid var(--border);
  border-radius: 3px; padding: .35rem .6rem;
  color: var(--fg-dim);
  transition: border-color .15s;
}
.search:focus-within { border-color: var(--accent-dim); }
.search input { background: none; border: 0; color: var(--fg-bright); outline: none; width: 220px; font-size: .76rem; }
.search-clear { color: var(--fg-mute); font-size: 1rem; line-height: 1; padding: 0 .2rem; }
.search-clear:hover { color: var(--fg); }
.sort {
  background: var(--bg-3); border: 1px solid var(--border);
  color: var(--fg-bright); padding: .35rem .6rem; border-radius: 3px;
  font-size: .76rem;
}
.view-toggle { display: inline-flex; border: 1px solid var(--border); border-radius: 3px; overflow: hidden; }
.view-toggle button {
  padding: .35rem .55rem; color: var(--fg-dim);
  border-right: 1px solid var(--border);
}
.view-toggle button:last-child { border-right: 0; }
.view-toggle button.active { color: var(--accent); background: var(--bg-3); }

/* Sites */
.sites-grid { display: flex; flex-direction: column; gap: .4rem; }
.site-row {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 6px; overflow: hidden;
  transition: border-color .15s;
}
.site-row:hover { border-color: var(--border-2); }
.site-row.site-expiring { background: linear-gradient(90deg, var(--accent-faint), transparent 25%), var(--bg-card); }
.site-row.site-expired { opacity: .55; }
.site-main {
  width: 100%;
  display: grid; grid-template-columns: auto 1fr auto auto;
  gap: 1rem; align-items: center;
  padding: .8rem 1rem; text-align: left;
}
.site-thumb {
  width: 38px; height: 38px;
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: 3px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; position: relative; overflow: hidden;
}
.site-thumb::before {
  content: ''; position: absolute; inset: 0;
  background: repeating-linear-gradient(135deg, transparent 0 5px, rgba(255,255,255,.025) 5px 10px);
}
.site-thumb-mark { font-size: .58rem; color: var(--fg-dim); text-transform: uppercase; letter-spacing: .04em; position: relative; }
.site-meta { min-width: 0; }
.site-name {
  display: flex; align-items: center; gap: .55rem;
  color: var(--fg-bright); font-size: .85rem;
  flex-wrap: wrap; word-break: break-all;
}
.site-host { color: var(--fg-dim); }
.site-sub { color: var(--fg-dim); font-size: .7rem; margin-top: .25rem; display: flex; gap: .5rem; flex-wrap: wrap; }
.site-sub code { color: var(--fg); }
.site-sep { color: var(--fg-mute); }
.site-time { display: flex; flex-direction: column; align-items: flex-end; gap: .1rem; }
.site-time-label { font-size: .6rem; letter-spacing: .08em; text-transform: uppercase; color: var(--fg-mute); }
.site-time-val { font-variant-numeric: tabular-nums; font-size: .82rem; color: var(--fg-bright); }
.site-time-val.expiring { color: var(--accent); }
.site-time-val.expired { color: var(--red); }
.site-chev { color: var(--fg-mute); transition: transform .2s; }
.site-row.open .site-chev { transform: rotate(180deg); color: var(--fg); }

.site-detail {
  border-top: 1px solid var(--hairline);
  padding: 1rem 1.2rem 1.2rem;
  background: var(--bg-2);
  animation: detailIn .18s ease-out;
}
@keyframes detailIn { from { opacity: 0; } to { opacity: 1; } }
.sd-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem 1.4rem; margin-bottom: 1rem; }
@media (max-width: 760px) { .sd-grid { grid-template-columns: 1fr 1fr; } }
.sd-field { display: flex; flex-direction: column; gap: .2rem; min-width: 0; }
.sd-label { font-size: .62rem; letter-spacing: .1em; text-transform: uppercase; color: var(--fg-mute); }
.sd-val { color: var(--fg-bright); font-size: .8rem; overflow: hidden; text-overflow: ellipsis; }
.sd-mono { color: var(--fg); font-size: .76rem; }
.sd-url {
  display: inline-flex; align-items: center; gap: .45rem;
  color: var(--accent); font-size: .8rem;
  cursor: pointer; transition: opacity .15s;
  word-break: break-all; text-align: left;
}
.sd-url:hover { opacity: .8; }
.sd-actions {
  display: flex; gap: .4rem; flex-wrap: wrap;
  padding-top: .8rem; border-top: 1px solid var(--hairline);
}
.sd-spacer { flex: 1; }

/* Files */
.files-banner {
  border: 1px dashed var(--border-2); border-radius: 5px;
  padding: 1rem 1.2rem; background: var(--bg-mid);
  margin-bottom: 1.2rem;
  transition: border-color .15s, background .15s;
}
.files-banner:hover { border-color: var(--accent-dim); background: var(--accent-faint); }
.fb-inner { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
.fb-inner > svg { color: var(--accent); flex-shrink: 0; }
.fb-text { flex: 1; font-size: .8rem; color: var(--fg); }
.fb-text strong { color: var(--fg-white); font-weight: 500; }
.fb-text code { color: var(--accent); }
.fb-limit { color: var(--fg-dim); font-size: .7rem; }

.files-list { border: 1px solid var(--border); border-radius: 6px; background: var(--bg-card); overflow: hidden; }
.files-head, .file-row {
  display: grid; grid-template-columns: 2fr .8fr .7fr 1fr 1fr 100px;
  gap: .8rem; align-items: center; padding: .55rem 1rem;
}
.files-head {
  font-size: .62rem; letter-spacing: .1em; text-transform: uppercase;
  color: var(--fg-mute);
  border-bottom: 1px solid var(--hairline);
  background: var(--bg-2);
}
.file-row { font-size: .76rem; border-bottom: 1px solid var(--hairline); transition: background .15s; }
.file-row:last-child { border-bottom: 0; }
.file-row:hover { background: var(--bg-2); }
.file-row.expired { opacity: .5; }
.file-row.expired .fn { text-decoration: line-through; }
.file-name { display: flex; align-items: center; gap: .6rem; min-width: 0; }
.fn { color: var(--fg-bright); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-icon { color: var(--fg-dim); flex-shrink: 0; }
.kind-image { color: var(--blue); }
.kind-video { color: var(--red); }
.kind-doc { color: var(--fg); }
.kind-data { color: var(--green); }
.file-mime code { color: var(--fg-dim); font-size: .68rem; }
.file-actions { display: flex; gap: .25rem; justify-self: end; }
.dim { color: var(--fg-dim); }
.warn { color: var(--accent); }

.files-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: .6rem; }
.file-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 5px; padding: .9rem;
  display: flex; flex-direction: column; gap: .5rem;
  transition: border-color .15s;
}
.file-card:hover { border-color: var(--border-2); }
.file-card.expired { opacity: .5; }
.fc-thumb {
  height: 80px; background: var(--bg-2); border: 1px solid var(--hairline);
  border-radius: 3px;
  display: flex; align-items: center; justify-content: center;
}
.fc-name { color: var(--fg-bright); font-size: .76rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fc-meta { color: var(--fg-dim); font-size: .68rem; display: flex; gap: .4rem; }
.fc-sep { color: var(--fg-mute); }
.fc-actions { display: flex; gap: .3rem; margin-top: auto; flex-wrap: wrap; }

/* Empty */
.empty.subtle {
  padding: 2rem 1.2rem; text-align: center;
  color: var(--fg-dim); font-size: .8rem;
  border: 1px dashed var(--border-2); border-radius: 6px;
  background: var(--bg-mid);
}
.empty-mark { display: inline-block; margin-right: .5rem; color: var(--fg-mute); font-size: 1rem; }
.empty code {
  background: var(--bg-card); border: 1px solid var(--border);
  padding: .1rem .35rem; border-radius: 2px;
  color: var(--fg-bright); font-size: .85em;
}

/* Modal */
.modal-bg {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.55); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
  animation: bgIn .18s ease-out;
}
@keyframes bgIn { from { opacity: 0; } to { opacity: 1; } }
.modal {
  background: var(--bg-card); border: 1px solid var(--border-2);
  border-radius: 8px;
  width: 420px; max-width: 92vw;
  box-shadow: 0 30px 60px -20px rgba(0,0,0,.7);
  animation: modalIn .22s cubic-bezier(.16,1,.3,1);
}
@keyframes modalIn { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
.modal-wide { width: 540px; }
.modal-head {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--hairline);
  color: var(--fg-white); font-size: .9rem; font-weight: 500;
  letter-spacing: -.01em;
}
.modal-body { padding: 1.1rem 1.25rem; color: var(--fg); font-size: .82rem; line-height: 1.6; }
.modal-actions {
  display: flex; justify-content: flex-end; gap: .5rem;
  padding: .85rem 1.25rem;
  border-top: 1px solid var(--hairline);
  background: var(--bg-2);
  border-radius: 0 0 8px 8px;
}
.form-row { display: flex; flex-direction: column; gap: .35rem; margin-bottom: 1rem; }
.form-row:last-child { margin-bottom: 0; }
.form-row label {
  font-size: .68rem; letter-spacing: .08em; text-transform: uppercase;
  color: var(--fg-dim);
}
.form-row input, .form-row select {
  background: var(--bg-2); border: 1px solid var(--border);
  color: var(--fg-bright); padding: .55rem .7rem;
  border-radius: 4px; font-size: .82rem; width: 100%;
}
.form-row input:focus, .form-row select:focus { outline: none; border-color: var(--accent-dim); }
.form-hint { color: var(--fg-mute); font-size: .68rem; }

/* Keys */
.key-reveal {
  background: linear-gradient(180deg, var(--accent-soft), transparent);
  border: 1px solid var(--accent-dim);
  border-radius: 6px; padding: 1rem 1.2rem;
  margin-bottom: 1.5rem;
  animation: revealIn .3s cubic-bezier(.16,1,.3,1);
}
@keyframes revealIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.kr-head { display: flex; align-items: center; gap: .6rem; margin-bottom: .8rem; flex-wrap: wrap; font-size: .82rem; color: var(--fg-bright); }
.kr-warn { color: var(--accent); font-size: .72rem; }
.kr-body { display: flex; align-items: center; gap: .55rem; flex-wrap: wrap; }
.kr-key {
  flex: 1; min-width: 0;
  background: var(--bg); border: 1px solid var(--border-2);
  padding: .65rem .8rem; border-radius: 4px;
  color: var(--accent); font-size: .82rem; word-break: break-all;
}
.kr-foot { color: var(--fg-dim); font-size: .7rem; margin-top: .8rem; line-height: 1.6; }
.kr-foot code { color: var(--fg-bright); }

.keys-list {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 6px; overflow: hidden; margin-bottom: 2rem;
}
.keys-head, .key-row {
  display: grid; grid-template-columns: 1fr 1.2fr 1fr 1fr 100px;
  gap: 1rem; align-items: center; padding: .65rem 1rem;
}
.keys-head {
  font-size: .62rem; letter-spacing: .1em; text-transform: uppercase;
  color: var(--fg-mute); background: var(--bg-2);
  border-bottom: 1px solid var(--hairline);
}
.key-row { font-size: .76rem; border-bottom: 1px solid var(--hairline); }
.key-row:last-child { border-bottom: 0; }
.key-row:hover { background: var(--bg-2); }
.key-row.revoked { opacity: .5; }
.key-name { color: var(--fg-bright); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.key-prefix { display: flex; align-items: center; gap: .4rem; min-width: 0; }
.key-prefix code { color: var(--accent); font-size: .76rem; }
.key-mask { color: var(--fg-mute); font-size: .65rem; letter-spacing: -1px; overflow: hidden; flex: 1; min-width: 0; }
.key-actions { justify-self: end; }

.curl-section { margin-top: 2rem; }
.curl-section h3 { color: var(--fg-white); font-size: .85rem; font-weight: 500; margin-bottom: .8rem; }
.curl-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
@media (max-width: 760px) { .curl-tabs { grid-template-columns: 1fr; } }
.curl-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px; overflow: hidden; }
.curl-label {
  display: flex; justify-content: space-between; align-items: center;
  padding: .55rem .85rem;
  background: var(--bg-2); border-bottom: 1px solid var(--hairline);
  font-size: .68rem; color: var(--fg-dim); letter-spacing: .08em; text-transform: uppercase;
}
.curl-copy { color: var(--accent); font-size: .68rem; }
.curl-pre { padding: .85rem 1rem; font-size: .76rem; color: var(--fg-bright); line-height: 1.7; overflow-x: auto; white-space: pre; }
.cu-d { color: var(--fg-dim); }
.cu-key { color: var(--accent); }

/* Billing */
.billing-hero { margin-bottom: 1rem; }
.billing-plans { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-bottom: 2.5rem; }
@media (max-width: 820px) { .billing-plans { grid-template-columns: 1fr; } }
.bh-current { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 1.4rem 1.5rem; }
.bh-tag { font-size: .65rem; letter-spacing: .12em; text-transform: uppercase; color: var(--fg-mute); }
.bh-tier {
  font-size: 1.6rem; color: var(--fg-white); font-weight: 500; letter-spacing: -.025em;
  display: flex; align-items: baseline; gap: .8rem;
  margin-top: .25rem; margin-bottom: 1.2rem;
}
.bh-price { font-size: .8rem; color: var(--fg-dim); font-weight: 400; }
.bh-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.bh-l { font-size: .62rem; letter-spacing: .1em; text-transform: uppercase; color: var(--fg-mute); }
.bh-v { color: var(--fg-bright); font-size: .92rem; margin: .2rem 0 .4rem; font-variant-numeric: tabular-nums; }
.bh-of { color: var(--fg-dim); font-size: .72rem; }
.bh-storage-note { color: var(--fg-dim); font-size: .7rem; margin-top: 1rem; padding-top: .8rem; border-top: 1px solid var(--hairline); }
.bh-pro {
  background: linear-gradient(180deg, var(--accent-soft), var(--bg-card) 60%);
  border: 1px solid var(--accent-dim);
  border-radius: 6px; padding: 1.4rem 1.5rem;
  display: flex; flex-direction: column; gap: 1rem;
}
.bh-pro-head { display: flex; align-items: center; gap: .55rem; color: var(--accent); font-size: 1rem; font-weight: 500; }
.bh-pro-price { margin-left: auto; color: var(--fg-white); font-size: 1.4rem; font-weight: 500; letter-spacing: -.02em; }
.bh-pro-price span { color: var(--fg-dim); font-size: .75rem; font-weight: 400; }
.bh-pro-list { list-style: none; display: flex; flex-direction: column; gap: .35rem; font-size: .78rem; color: var(--fg); }
.bh-pro-list li { display: flex; align-items: baseline; gap: .55rem; }
.bh-pro-list code { color: var(--accent); }
.bh-check { color: var(--accent); }
.bh-pro-meta { color: var(--fg-mute); font-size: .68rem; text-align: center; }
.billing-features h2, .set-section h2 {
  color: var(--fg-white); font-size: .9rem; font-weight: 500; margin-bottom: 1rem;
  padding-bottom: .55rem; border-bottom: 1px solid var(--hairline);
  letter-spacing: -.01em;
}
.bf-table { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; background: var(--bg-card); }
.bf-row {
  display: grid; grid-template-columns: 1.25fr .8fr 1fr;
  align-items: center; padding: .7rem 1rem;
  border-bottom: 1px solid var(--hairline);
  font-size: .78rem;
}
.bf-row:last-child { border-bottom: 0; }
.bf-row.bf-head {
  font-size: .65rem; letter-spacing: .1em; text-transform: uppercase;
  color: var(--fg-mute); background: var(--bg-2);
}
.bf-pro-col { color: var(--accent); display: flex; align-items: baseline; gap: .55rem; }
.bf-pro-price { font-size: .58rem; color: var(--fg-dim); letter-spacing: 0; text-transform: none; }
.bf-k { color: var(--fg); }
.bf-free { color: var(--fg-dim); }
.bf-pro { color: var(--fg-bright); }
.bf-row.bf-highlight { background: var(--accent-faint); }
.bf-row.bf-highlight .bf-pro { color: var(--accent); }

/* Settings */
.set-section { margin-bottom: 2.5rem; }
.set-blurb { color: var(--fg-dim); font-size: .76rem; margin-bottom: 1rem; line-height: 1.6; }
.set-blurb code { color: var(--accent); }
.set-rows { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.set-row {
  display: grid; grid-template-columns: 1.4fr 1fr; gap: 1.5rem;
  align-items: center; padding: 1rem 1.2rem;
  border-bottom: 1px solid var(--hairline);
}
.set-row:last-child { border-bottom: 0; }
.set-label { color: var(--fg-bright); font-size: .82rem; }
.set-hint { color: var(--fg-dim); font-size: .7rem; margin-top: .2rem; line-height: 1.5; }
.set-row-r { display: flex; justify-content: flex-end; align-items: center; }
.set-readonly { color: var(--fg-dim); font-size: .82rem; text-align: right; }
.danger-section h2 { color: var(--red); border-color: color-mix(in srgb, var(--red) 25%, transparent); }
.danger-section .set-rows { border-color: color-mix(in srgb, var(--red) 25%, transparent); }

/* Login */
.login-screen {
  min-height: 100vh;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 2rem; gap: 1.2rem; text-align: center;
}
.login-logo {
  font-family: var(--mono); font-weight: 600;
  font-size: 2rem; color: var(--fg-white); letter-spacing: -.03em;
}
.login-logo .dot { color: var(--accent); }
.login-msg { color: var(--fg-dim); font-size: .9rem; max-width: 320px; }
.btn-github {
  display: inline-flex; align-items: center; gap: .55rem;
  padding: .7rem 1.3rem;
  min-height: 44px;
  background: var(--fg-bright); color: var(--bg);
  font-weight: 500; border-radius: 4px;
  transition: opacity .15s;
}
.btn-github:hover { opacity: .9; }
.btn-github:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.login-divider { color: var(--fg-mute); font-size: .68rem; letter-spacing: .12em; text-transform: uppercase; }
.login-key-form {
  width: min(100%, 360px);
  display: grid; gap: .7rem;
}
.login-key-form input {
  width: 100%;
  background: var(--bg-card); border: 1px solid var(--border);
  color: var(--fg-bright); border-radius: 4px;
  padding: .72rem .85rem; outline: none;
  min-height: 44px;
  font-family: var(--mono); font-size: .78rem;
}
.login-key-form input:focus { border-color: var(--accent-dim); }
.login-key-form button {
  background: var(--bg-card); color: var(--fg-bright);
  border: 1px solid var(--border); border-radius: 4px;
  padding: .7rem 1rem; min-height: 44px; cursor: pointer;
}
.login-key-form button:hover { border-color: var(--fg-dim); }
.login-key-form button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.login-alt { color: var(--fg-dim); font-size: .78rem; }
.login-alt code {
  background: var(--bg-card); border: 1px solid var(--border);
  padding: .15em .4em; border-radius: 2px;
  color: var(--fg-bright);
}

.loading { padding: 4rem 1rem; text-align: center; color: var(--fg-dim); font-size: .85rem; }

/* — Frame identity — */
:root {
  --bg: #f4f0e7;
  --bg-2: #ece7db;
  --bg-3: #fffdf7;
  --bg-card: #fffdf7;
  --bg-mid: #ece7db;
  --bg-elev: #fffdf7;

  --fg: #45443f;
  --fg-dim: #66635c;
  --fg-mute: #6f6c65;
  --fg-bright: #11110f;
  --fg-white: #11110f;

  --accent: #1649e8;
  --accent-dim: #0d2d9d;
  --accent-soft: rgba(22, 73, 232, .10);
  --accent-faint: rgba(22, 73, 232, .045);

  --green: #15845c;
  --blue: #1649e8;
  --red: #c52d1e;
  --yellow: #f4c928;
  --paper: #fffdf7;
  --ink: #11110f;

  --border: rgba(17, 17, 15, .22);
  --border-2: rgba(17, 17, 15, .42);
  --hairline: rgba(17, 17, 15, .12);

  --mono: 'JetBrains Mono', monospace;
  --sans: 'Instrument Sans', sans-serif;
  --display: 'Barlow Condensed', sans-serif;
}

html, body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--sans);
  font-size: 14px;
}
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 300;
  opacity: .035;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E");
  mix-blend-mode: multiply;
}
::selection { background: var(--red); color: #fffdf7; }

.app { grid-template-columns: 248px 1fr; }
.main {
  max-width: 1440px;
  padding: 3.4rem clamp(2rem, 4vw, 4.8rem) 5rem;
}
/* Cobalt navigation rail */
.sidebar {
  padding: 1.4rem 1.15rem 1.2rem;
  border-right: 0;
  background:
    radial-gradient(circle at 20% 22%, rgba(255,255,255,.08), transparent 25%),
    #1649e8;
  color: #f4f0e7;
}
.sb-brand {
  padding: .25rem .65rem 1.5rem;
  margin-bottom: 1.4rem;
  border-bottom-color: rgba(244,240,231,.2);
}
.sb-mark { display: none; }
.sb-wordmark {
  color: #f4f0e7;
  font-family: var(--sans);
  font-size: 1.55rem;
  font-weight: 600;
  letter-spacing: -.07em;
}
.sb-wordmark .dot { color: var(--red); }
.sb-section-label {
  padding: 0 .7rem .6rem;
  color: rgba(244,240,231,.86);
  font-size: .61rem;
  letter-spacing: .16em;
}
.sb-nav { gap: .3rem; }
.sb-item {
  min-height: 45px;
  gap: .75rem;
  padding: .68rem .75rem;
  border-radius: 3px;
  color: rgba(244,240,231,.9);
  font-size: .85rem;
}
.sb-item:hover { background: rgba(244,240,231,.1); color: #f4f0e7; }
.sb-item.active {
  background: #f4f0e7;
  color: #11110f;
  box-shadow: 5px 5px 0 #11110f;
}
.sb-item.active .sb-icon { color: var(--red); }
.sb-icon { color: rgba(244,240,231,.82); }
.sb-item.active .sb-dot { display: none; }
.sb-foot { gap: 1rem; }
.sb-upgrade {
  padding: 1rem;
  border: 1px solid #11110f;
  border-radius: 3px;
  background: #f4f0e7;
  color: #11110f;
  box-shadow: 5px 5px 0 #11110f;
}
.sb-upgrade:hover { border-color: #11110f; transform: translate(2px,2px); box-shadow: 3px 3px 0 #11110f; }
.sb-upgrade-head { color: #11110f; font-weight: 600; }
.sb-upgrade-body { color: #66635c; }
.sb-upgrade-cta { color: #11110f; font-weight: 600; }
.sb-arrow { color: var(--red); }
.sb-user {
  padding: .8rem .4rem .2rem;
  border-top-color: rgba(244,240,231,.2);
}
.sb-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--red);
  color: #f4f0e7;
}
.sb-user-name { color: #f4f0e7; }
.sb-user-since { color: rgba(244,240,231,.86); }
.sb-signout { color: rgba(244,240,231,.86); }
.sb-signout:hover { color: #f4f0e7; background: rgba(244,240,231,.12); }
.sidebar .tier-free,
.sidebar .tier-pro,
.sidebar .tier-anonymous {
  color: #f4f0e7;
  border-color: rgba(244,240,231,.35);
  background: rgba(244,240,231,.08);
}

/* Editorial page hierarchy */
.page-head {
  align-items: end;
  min-height: 106px;
  margin-bottom: 2.6rem;
  padding-bottom: 1.5rem;
  border-bottom: 2px solid var(--ink, #11110f);
}
.page-title {
  font-family: var(--display);
  font-size: clamp(3.3rem, 5vw, 5.4rem);
  font-weight: 600;
  line-height: .8;
  letter-spacing: -.045em;
  color: #11110f;
}
.page-sub {
  margin-top: .85rem;
  color: var(--fg-dim);
  font-family: var(--mono);
  font-size: .68rem;
  letter-spacing: .015em;
}
.page-head-actions { align-items: center; }

/* Controls */
.btn {
  min-height: 40px;
  padding: .6rem .9rem;
  border-radius: 3px;
  font-family: var(--sans);
  font-size: .78rem;
  font-weight: 600;
}
.btn.ghost {
  border-color: var(--border-2);
  background: var(--paper, #fffdf7);
  color: #11110f;
}
.btn.ghost:hover:not(:disabled) { border-color: var(--accent); background: var(--accent); color: #fffdf7; }
.btn.solid { background: var(--accent); color: #fffdf7; box-shadow: 4px 4px 0 #11110f; }
.btn.solid:hover:not(:disabled) { filter: none; transform: translate(2px,2px); box-shadow: 2px 2px 0 #11110f; }
.btn.danger { background: var(--red); color: #fffdf7; }
.btn.danger-ghost { border-color: rgba(239,67,45,.35); color: var(--red); }
.btn.danger-ghost:hover { background: var(--red); color: #fffdf7; }
.iconbtn {
  width: 32px;
  height: 32px;
  border-color: var(--border);
  border-radius: 3px;
  color: var(--fg-dim);
}
.iconbtn:hover { background: var(--accent); border-color: var(--accent); color: #fffdf7; }
.iconbtn.iconbtn-danger:hover { background: var(--red); color: #fffdf7; }

.tier-tag, .pill { border-radius: 999px; font-family: var(--mono); }
.tier-free, .pill-green { color: var(--green); }
.tier-pro, .pill-gold { color: var(--accent); border-color: rgba(22,73,232,.45); background: var(--accent-soft); }
.dot-gold { background: var(--red); }
.dot-pulse.dot-gold { box-shadow: 0 0 6px var(--red); }

/* Overview as framed objects */
.ov-grid {
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 3.2rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
}
.stat-card {
  min-height: 166px;
  padding: 1.35rem;
  border: 1px solid #11110f;
  border-radius: 3px;
  background: #fffdf7;
}
.stat-card:first-child {
  background: var(--accent);
  color: #f4f0e7;
  box-shadow: 7px 7px 0 #11110f;
}
.stat-card:first-child .stat-label,
.stat-card:first-child .stat-sub { color: #f4f0e7; }
.stat-card:first-child .stat-value { color: #f4f0e7; }
.stat-card:first-child .stat-detail { color: rgba(244,240,231,.82); }
.stat-card:first-child .pbar { background: rgba(244,240,231,.24); }
.stat-card:first-child .pbar-fill { background: var(--red); }
.stat-label {
  color: var(--fg-dim);
  font-family: var(--mono);
  font-size: .61rem;
  letter-spacing: .12em;
}
.stat-value {
  margin-top: .35rem;
  color: #11110f;
  font-family: var(--display);
  font-size: 3.4rem;
  font-weight: 600;
  line-height: .9;
  letter-spacing: -.035em;
}
.stat-sub { color: var(--fg-dim); font-size: .73rem; }
.stat-detail { margin-top: .55rem; color: var(--fg-dim); font-family: var(--mono); font-size: .58rem; line-height: 1.45; }
.pbar { height: 5px; background: var(--bg-2); border-radius: 0; }
.pbar-accent { background: var(--accent); }
.ov-section { margin-bottom: 3rem; }
.ov-section-head { margin-bottom: 1.1rem; }
.ov-section-head h2, .ov-card-head h2, .curl-section h3,
.billing-features h2, .set-section h2 {
  color: #11110f;
  font-family: var(--display);
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -.02em;
}
.ov-section-sub { font-family: var(--mono); font-size: .64rem; }
.ov-card {
  padding: 1.35rem;
  border-color: #11110f;
  border-radius: 3px;
  background: #fffdf7;
}
.ov-link { color: var(--accent); font-weight: 600; }
.recent-row { border-radius: 2px; }
.recent-row:hover { background: var(--bg-2); }
.recent-thumb {
  width: 42px;
  height: 42px;
  border-color: #11110f;
  border-radius: 2px;
  background: var(--accent);
  color: #fffdf7;
}
.recent-thumb span { color: #fffdf7; }
.recent-name { color: #11110f; font-size: .87rem; font-weight: 600; }
.recent-name .acc { color: #11110f; }
.qc-cmd {
  min-height: 42px;
  border-color: var(--border);
  border-radius: 2px;
  background: #11110f;
}
.qc-cmd:hover { border-color: var(--accent); }
.qc-prompt { color: var(--red); }
.qc-text { color: #f4f0e7; font-family: var(--mono); }
.qc-copy { color: rgba(244,240,231,.8); }
.ov-pro-banner {
  border: 1px solid #11110f;
  border-radius: 2px;
  background: var(--yellow, #f4c928);
  color: #11110f;
}
.ov-pro-banner:hover { border-color: #11110f; background: #f4c928; }
.ov-pro-arrow { color: #11110f; font-weight: 600; }

/* Lists and tables */
.expiring-list, .files-list, .keys-list, .set-rows, .bf-table {
  border-color: #11110f;
  border-radius: 3px;
  background: #fffdf7;
}
.expiring-row, .file-row, .key-row, .set-row, .bf-row { background: #fffdf7; }
.expiring-row.warn { background: linear-gradient(90deg, rgba(244,201,40,.23), transparent 32%), #fffdf7; }
.expiring-row.critical { background: linear-gradient(90deg, rgba(239,67,45,.13), transparent 32%), #fffdf7; }
.er-time-val, .warn { color: var(--red); }

.filter-bar {
  margin-bottom: 1.5rem;
  padding: .8rem;
  border: 1px solid #11110f;
  background: #fffdf7;
}
.tab { border-radius: 999px; }
.tab:hover { color: #11110f; }
.tab.active { background: var(--accent); color: #fffdf7; }
.tab-count { background: rgba(17,17,15,.08); }
.tab.active .tab-count { background: rgba(255,255,255,.18); color: #fffdf7; }
.search, .sort, .view-toggle {
  border-color: var(--border);
  border-radius: 2px;
  background: var(--bg);
}
.search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.search input, .sort { color: #11110f; }
.view-toggle button.active { color: #fffdf7; background: var(--accent); }

.sites-grid { gap: .65rem; }
.site-row {
  border-color: #11110f;
  border-radius: 3px;
  background: #fffdf7;
}
.site-row:hover { border-color: var(--accent); box-shadow: 5px 5px 0 var(--accent); }
.site-row.site-expiring { background: linear-gradient(90deg, rgba(244,201,40,.2), transparent 30%), #fffdf7; }
.site-thumb {
  width: 46px;
  height: 46px;
  border-color: #11110f;
  border-radius: 2px;
  background: var(--accent);
}
.site-thumb::before { display: none; }
.site-thumb-mark { color: #fffdf7; font-family: var(--mono); }
.site-name { color: #11110f; font-weight: 600; }
.site-detail { background: var(--bg-2); }
.sd-url { color: var(--accent); font-weight: 600; }

.files-banner {
  border: 1px solid #11110f;
  border-radius: 3px;
  background: #f4c928;
}
.files-banner:hover { border-color: #11110f; background: #f4c928; }
.fb-inner > svg, .fb-text code { color: #11110f; }
.files-head, .keys-head, .bf-row.bf-head {
  background: var(--bg-2);
  color: var(--fg-dim);
  font-family: var(--mono);
}
.file-row:hover, .key-row:hover { background: var(--accent-faint); }
.files-grid { gap: 1rem; }
.file-card {
  padding: 1rem;
  border-color: #11110f;
  border-radius: 3px;
  background: #fffdf7;
}
.file-card:hover { border-color: var(--accent); box-shadow: 5px 5px 0 var(--accent); }
.fc-thumb { height: 112px; border-color: var(--border); background: var(--bg); }
.fn, .fc-name { color: #11110f; font-weight: 600; }

.empty.subtle {
  padding: 3.5rem 1.2rem;
  border: 1px dashed var(--border-2);
  border-radius: 3px;
  background: rgba(255,253,247,.55);
}
.empty code { background: #11110f; color: #fffdf7; }

/* Keys, billing and settings */
.key-reveal {
  border-color: #11110f;
  border-radius: 3px;
  background: #f4c928;
}
.kr-warn, .kr-key { color: #11110f; }
.kr-key { border-color: #11110f; background: #fffdf7; }
.curl-card {
  border-color: #11110f;
  border-radius: 3px;
  background: #11110f;
}
.curl-label { border-bottom-color: rgba(244,240,231,.2); background: #11110f; color: rgba(244,240,231,.8); }
.curl-pre { color: #f4f0e7; }
.curl-copy, .cu-key { color: var(--red); }
.cu-d { color: rgba(244,240,231,.75); }

.bh-current {
  border-color: #11110f;
  border-radius: 3px;
  background: #fffdf7;
}
.bh-tier { color: #11110f; font-family: var(--display); font-size: 3rem; font-weight: 600; }
.bh-pro {
  border-color: #11110f;
  border-radius: 3px;
  background: var(--accent);
  color: #f4f0e7;
  box-shadow: 8px 8px 0 #11110f;
}
.bh-pro-head, .bh-pro-price, .bh-check, .bh-pro-list code { color: #f4f0e7; }
.bh-pro-list { color: rgba(244,240,231,.9); }
.bh-pro-meta { color: rgba(244,240,231,.86); }
.bh-pro .btn.solid { background: #f4f0e7; color: #11110f; }
.bf-row.bf-highlight { background: rgba(22,73,232,.07); }
.bf-row.bf-highlight .bf-pro, .bf-pro-col { color: var(--accent); }
.set-section h2, .billing-features h2 { padding-bottom: .8rem; border-bottom: 2px solid #11110f; }
.set-blurb code { color: var(--accent); font-family: var(--mono); }
.danger-section h2 { color: var(--red); border-color: var(--red); }

/* Dialogs and feedback */
.modal-bg { background: rgba(13,45,157,.68); }
.modal {
  border: 10px solid #11110f;
  border-radius: 0;
  background: #fffdf7;
  box-shadow: 18px 18px 0 rgba(17,17,15,.25);
}
.modal-head { color: #11110f; font-family: var(--display); font-size: 1.8rem; border-bottom-color: var(--border); }
.modal-actions { border-top-color: var(--border); background: var(--bg-2); border-radius: 0; }
.form-row input, .form-row select { border-color: var(--border); border-radius: 2px; background: #fffdf7; color: #11110f; }
.form-row input:focus, .form-row select:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.toast {
  border: 1px solid #11110f;
  border-radius: 2px;
  background: #11110f;
  color: #f4f0e7;
  box-shadow: 6px 6px 0 var(--red);
}

/* Sign-in state */
body:has(.login-screen) { background: #1649e8; }
.login-screen {
  position: relative;
  isolation: isolate;
  min-height: 100svh;
  gap: 1rem;
  padding: 3rem;
  background:
    radial-gradient(circle at 20% 22%, rgba(255,255,255,.08), transparent 25%),
    #1649e8;
  color: #f4f0e7;
}
.login-screen::before {
  content: '';
  position: absolute;
  z-index: -1;
  width: min(480px, calc(100vw - 36px));
  height: 590px;
  border: 12px solid #11110f;
  background:
    linear-gradient(#ef432d 0 0) 50% 6% / 72% 3% no-repeat,
    radial-gradient(circle at 8% 72%, #11110f 0 8%, transparent 8.5%),
    linear-gradient(#11110f 0 0) 95% 78% / 10% 28% no-repeat,
    #fffdf7;
  box-shadow: 18px 20px 0 rgba(13,45,157,.5);
}
.login-screen::after {
  display: none;
}
.login-logo, .login-msg, .btn-github, .login-divider, .login-key-form, .login-alt { position: relative; z-index: 1; }
.login-logo {
  margin-top: 1rem;
  color: #11110f;
  font-family: var(--sans);
  font-size: 2rem;
  letter-spacing: -.07em;
}
.login-logo .dot { color: var(--red); }
.login-msg {
  max-width: 290px;
  color: #45443f;
  font-size: .94rem;
}
.btn-github {
  width: min(260px, calc(100vw - 84px));
  min-width: 0;
  justify-content: center;
  border: 1px solid #11110f;
  border-radius: 3px;
  background: #1649e8;
  color: #fffdf7;
  box-shadow: 5px 5px 0 #11110f;
}
.btn-github:hover { opacity: 1; transform: translate(2px,2px); box-shadow: 3px 3px 0 #11110f; }
.login-divider { color: var(--fg-dim); }
.login-key-form input,
.login-key-form button {
  border-color: #11110f;
  border-radius: 2px;
  background: #fffdf7;
  color: #11110f;
}
.login-key-form { width: min(360px, calc(100vw - 84px)); }
.login-key-form input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.login-key-form button:hover { background: #f4c928; border-color: #11110f; }
.login-alt { color: var(--fg-dim); }
.login-alt code { border-color: #11110f; background: #11110f; color: #f4f0e7; }
.loading { color: var(--fg-dim); }

@media (max-width: 1050px) {
  .ov-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 760px) {
  .app { grid-template-columns: 1fr; }
  .main {
    min-width: 0;
    padding:
      1.5rem max(1rem, env(safe-area-inset-right))
      max(5rem, calc(4rem + env(safe-area-inset-bottom)))
      max(1rem, env(safe-area-inset-left));
  }
  .sidebar {
    position: sticky;
    top: 0;
    z-index: 50;
    height: auto;
    padding:
      max(.7rem, env(safe-area-inset-top))
      max(1rem, env(safe-area-inset-right))
      .65rem max(1rem, env(safe-area-inset-left));
  }
  .sb-brand { padding: 0 0 .6rem; margin: 0; border: 0; }
  .sb-wordmark { font-size: 1.25rem; }
  .sb-nav {
    flex-direction: row;
    gap: .35rem;
    padding-bottom: .25rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .sb-nav::-webkit-scrollbar { display: none; }
  .sb-section-label, .sb-icon, .sb-dot, .sb-foot { display: none; }
  .sb-item {
    min-height: 44px;
    flex: 0 0 auto;
    padding: .45rem .65rem;
    font-size: .74rem;
  }
  .sb-item.active { box-shadow: 3px 3px 0 #11110f; }
  .page-head { min-height: 0; margin-bottom: 1.6rem; padding-bottom: 1rem; align-items: flex-start; }
  .page-title { font-size: 2.9rem; line-height: .88; }
  .page-sub { line-height: 1.55; }
  .page-head-actions { width: 100%; }
  .page-head-actions .btn { flex: 1; justify-content: center; min-height: 44px; }
  .ov-grid { gap: .75rem; }
  .stat-card { min-height: 138px; }
  .stat-value { font-size: 2.8rem; }
  .filter-bar { align-items: stretch; }
  .tabs {
    width: 100%;
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: .2rem;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { min-height: 44px; flex: 0 0 auto; }
  .filter-tools { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; }
  .search { min-width: 0; }
  .search input { width: 100%; min-width: 130px; }
  .sort { min-height: 44px; max-width: 150px; }
  .view-toggle button { min-width: 44px; min-height: 44px; display: grid; place-items: center; }
  .site-main { grid-template-columns: auto 1fr auto; gap: .7rem; padding: .75rem; }
  .site-time { display: none; }
  .sd-grid { grid-template-columns: 1fr 1fr; }
  .sd-actions .btn, .sd-actions a { min-height: 44px; }
  .files-list, .keys-list { overflow: visible; border: 0; background: transparent; display: grid; gap: .75rem; }
  .files-head, .keys-head { display: none; }
  .file-row, .key-row {
    min-width: 0;
    border: 1px solid #11110f;
    border-radius: 3px;
    padding: 1rem;
    background: #fffdf7;
  }
  .file-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: .55rem 1rem;
  }
  .file-name { grid-column: 1 / -1; padding-bottom: .6rem; border-bottom: 1px solid var(--hairline); }
  .file-row > [data-label], .key-row > [data-label] {
    display: flex;
    flex-direction: column;
    gap: .1rem;
    min-width: 0;
  }
  .file-row > [data-label]::before, .key-row > [data-label]::before {
    content: attr(data-label);
    color: var(--fg-mute);
    font-family: var(--mono);
    font-size: .58rem;
    letter-spacing: .1em;
    text-transform: uppercase;
  }
  .file-actions { grid-column: 1 / -1; justify-self: stretch; justify-content: flex-end; padding-top: .45rem; }
  .file-actions .iconbtn { width: 44px; height: 44px; }
  .fb-limit { width: 100%; padding-left: 2rem; }
  .key-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: .7rem 1rem;
  }
  .key-name { grid-column: 1 / -1; padding-bottom: .6rem; border-bottom: 1px solid var(--hairline); }
  .key-prefix { overflow: hidden; }
  .key-actions { grid-column: 1 / -1; justify-self: stretch; display: flex; justify-content: flex-end; }
  .key-actions .btn { min-height: 44px; }
  .billing-plans { grid-template-columns: 1fr; }
  .bf-head { display: none; }
  .bf-row:not(.bf-head) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: .7rem;
    padding: .9rem;
  }
  .bf-row:not(.bf-head) .bf-k { grid-column: 1 / -1; color: #11110f; font-weight: 600; }
  .bf-row [data-plan]::before {
    content: attr(data-plan);
    display: block;
    margin-bottom: .18rem;
    color: var(--fg-mute);
    font-family: var(--mono);
    font-size: .56rem;
    letter-spacing: .09em;
    text-transform: uppercase;
  }
  .modal { width: calc(100vw - 2rem); max-height: calc(100svh - 2rem); overflow-y: auto; border-width: 6px; }
  .login-screen { padding: 2rem 1.25rem; }
  .login-screen::before, .login-screen::after { height: 560px; }
}
@media (max-width: 520px) {
  .main { padding-top: 1.2rem; }
  .ov-grid { grid-template-columns: 1fr; }
  .stat-card { min-height: 118px; padding: 1rem; }
  .stat-value { font-size: 2.7rem; }
  .ov-two-col { gap: .8rem; }
  .ov-card { padding: 1rem; }
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
  .set-row { grid-template-columns: 1fr; gap: .6rem; }
  .set-row-r { justify-content: flex-start; }
  .set-readonly { text-align: left; }
}
@media (pointer: coarse) {
  .btn, .iconbtn, .sb-signout, .search-clear { min-height: 44px; }
  .iconbtn { min-width: 44px; }
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

  // — State —
  var apiKey = localStorage.getItem('vanish_api_key');
  var params = new URLSearchParams(window.location.hash.slice(1));
  if (params.get('key')) {
    apiKey = params.get('key');
    localStorage.setItem('vanish_api_key', apiKey);
    history.replaceState({}, '', '/dashboard');
  }

  var state = {
    me: null,
    sites: [],
    uploads: [],
    keys: [],
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
  function openConfirm(cfg) {
    confirmCfg = cfg;
    renderModal();
  }
  function closeModal() {
    confirmCfg = null;
    renderModal();
  }
  function renderModal() {
    if (!confirmCfg) {
      modalHost.innerHTML = '';
      return;
    }
    var c = confirmCfg;
    modalHost.innerHTML =
      '<div class="modal-bg" data-action="modal-cancel">' +
        '<div class="modal" data-stop>' +
          '<div class="modal-head">' + escapeHtml(c.title) + '</div>' +
          '<div class="modal-body">' + escapeHtml(c.body) + '</div>' +
          '<div class="modal-actions">' +
            '<button class="btn ghost" data-action="modal-cancel">Cancel</button>' +
            '<button class="btn ' + (c.destructive === false ? 'solid' : 'danger') + '" data-action="modal-confirm">' +
              escapeHtml(c.confirmLabel || 'Confirm') +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    var btn = modalHost.querySelector('[data-action="modal-confirm"]');
    if (btn) btn.focus();
  }

  document.addEventListener('keydown', function(e) {
    if (!confirmCfg) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter') {
      var fn = confirmCfg.onConfirm;
      closeModal();
      fn && fn();
    }
  });

  // — API —
  function apiFetch(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (apiKey) opts.headers['Authorization'] = 'Bearer ' + apiKey;
    return fetch(path, opts).then(function(r) {
      if (r.status === 401) {
        localStorage.removeItem('vanish_api_key');
        apiKey = null;
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
      apiFetch('/keys')
    ]).then(function(rs) {
      if (!rs[0] || rs[0].error || !rs[0].id) {
        localStorage.removeItem('vanish_api_key');
        apiKey = null;
        renderLogin();
        throw new Error('unauthorized');
      }
      state.me = rs[0];
      state.sites = (rs[1].sites || []).filter(function(s) { return !s.deleted; }).map(normalizeSite);
      state.uploads = (rs[2].uploads || []).filter(function(u) { return !u.deleted; }).map(normalizeUpload);
      state.keys = (rs[3].keys || []);
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
        '<div class="site-detail">' +
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
            '<div class="sd-field"><div class="sd-label">Created</div><div class="sd-val">' + fmtDate(s.created) + ' · ' + fmtAgo(s.created) + '</div></div>' +
          '</div>' +
          '<div class="sd-actions">' +
            (s.draft ? '' :
              '<button class="btn ghost btn-sm" data-action="copy" data-text="' + attr(s.url) + '" data-msg="URL copied">Copy URL</button>' +
              '<button class="btn ghost btn-sm" data-action="copy" data-text="' + attr('vanish site ./local --update ' + s.id) + '" data-msg="Update command copied">Copy update cmd</button>' +
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
        '<div class="key-reveal">' +
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
  function performAction(action, el) {
    if (action === 'nav') {
      state.section = el.getAttribute('data-section');
      render();
      return;
    }
    if (action === 'signout') {
      localStorage.removeItem('vanish_api_key');
      apiKey = null;
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
      var fn = confirmCfg && confirmCfg.onConfirm;
      closeModal();
      fn && fn();
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
    if (!form || !form.matches || !form.matches('[data-login-key-form]')) return;
    e.preventDefault();
    var input = form.querySelector('input[name="api_key"]');
    loginWithApiKey(input && input.value);
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
