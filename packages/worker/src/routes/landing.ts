import { Hono } from 'hono';
import type { Env } from '../types.js';
import { posthogConfig, posthogScriptTag } from '../lib/posthog.js';
import { ogImageBytes } from '../lib/og-image.js';
import { HALF_LIFE_FAVICON, HALF_LIFE_FONTS, HALF_LIFE_PAPER, HALF_LIFE_TOKENS } from '../lib/half-life.js';

const landing = new Hono<{ Bindings: Env }>();

// Lucide glyphs (24px grid, drawn with currentColor). One set, one stroke, everywhere.
const icon = (paths: string, cls = 'ic') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICON_CLOCK = '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';
const ICON_LOCK = '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
const ICON_FILE = '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>';
const ICON_IMAGE = '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>';
const ICON_FOLDER = '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>';
const ICON_ARROW = '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>';
const ICON_CHECK = '<path d="M20 6 9 17l-5-5"/>';
const ICON_COPY = '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>';

const COMMAND = 'npx vanish-cli site ./demo --root index.html';

const commandBar = (extra = '') => `<div class="cmd${extra}">
  <code><span class="cmd-p" aria-hidden="true">$</span> ${COMMAND}</code>
  <button type="button" class="copy" data-copy="${COMMAND}">${icon(ICON_COPY)}<span class="copy-label" aria-live="polite">Copy</span></button>
</div>`;

const wordmark = (cls = '') => `<a class="wordmark${cls}" href="/" aria-label="vanish"><span aria-hidden="true"><b>v</b><b>a</b><b>n</b><b>i</b><b>s</b><b>h</b></span></a>`;

const fileChip = (name: string, image = false) =>
  `<li class="chip-file">${icon(image ? ICON_IMAGE : ICON_FILE)}<span>${name}</span></li>`;

type PlanCell = string;
const PLANS = [
  { name: 'Anonymous', price: 'Free', per: 'no account', cta: '<a class="btn btn-line" href="#command">Run the command</a>' },
  { name: 'Free', price: 'Free', per: 'GitHub login', cta: '<a class="btn btn-ink" href="/auth/github?redirect=/dashboard">Sign in with GitHub</a>' },
  { name: 'Pro', price: '10 €', per: 'per month', cta: '<a class="btn btn-line" href="/auth/github?redirect=/dashboard">Sign in, then <code>vanish upgrade</code></a>' },
];
const PLAN_ROWS: [string, PlanCell, PlanCell, PlanCell][] = [
  ['Mini-site', '300 MB · 100 files', '500 files · within 50 MB', '5,000 files · within 10 GB'],
  ['File upload', 'Images only · 300 MB', 'All but executables · 50 MB', 'All but executables · 1 GB'],
  ['Total storage', 'Ephemeral only', '50 MB', '10 GB'],
  ['Retention', '24 hours', '48 hours', '30 days · up to 365 with <code>--days</code>'],
  ['Rate limit', '10 per hour', '50 per hour', '500 per hour'],
  ['Custom slug', 'No', 'No', 'Yes · <code>--slug</code>'],
  ['Update in place', 'No, sign in first', 'Yes', 'Yes'],
  ['Who can open it', 'Anyone with the link', 'Anyone, or a password', 'Anyone, a password, or listed emails'],
  ['Domains', 'No', 'No', '1 vanish.sh namespace · 1 custom subdomain'],
];

const planHead = (i: number) =>
  `<span class="plan-name">${PLANS[i].name}</span><span class="plan-price"><strong>${PLANS[i].price}</strong> ${PLANS[i].per}</span>`;

// One table for wide screens; the same data as one card per plan on phones.
const plansTable = () => `<table class="plans in">
      <caption class="sr-only">Plans and limits</caption>
      <thead>
        <tr><th scope="col"><span class="mono-tag">Plan</span></th>${PLANS.map((_, i) => `<th scope="col"${i === 2 ? ' class="pro"' : ''}>${planHead(i)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${PLAN_ROWS.map(([label, ...cells]) => `<tr><th scope="row">${label}</th>${cells.map((c, i) => `<td${i === 2 ? ' class="pro"' : ''}>${c}</td>`).join('')}</tr>`).join('\n        ')}
      </tbody>
      <tfoot>
        <tr><td></td>${PLANS.map((p, i) => `<td${i === 2 ? ' class="pro"' : ''}>${p.cta}</td>`).join('')}</tr>
      </tfoot>
    </table>
    <ul class="plan-cards in">
      ${PLANS.map((p, i) => `<li class="plan-card${i === 2 ? ' pro' : ''}">
        <h3>${planHead(i)}</h3>
        <dl>${PLAN_ROWS.map(([label, ...cells]) => `<div><dt>${label}</dt><dd>${cells[i]}</dd></div>`).join('')}</dl>
        ${p.cta}
      </li>`).join('\n      ')}
    </ul>`;

const renderLanding = (analytics: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>vanish: public preview URLs for agent-made artifacts</title>
<meta name="description" content="A public URL for anything your agent makes: a photo, an image, a text, a file, a whole website. One command, and the URL expires on its own. No account needed to try." />
<meta name="theme-color" content="${HALF_LIFE_PAPER}" />
<meta property="og:title" content="vanish: a public URL for anything your agent makes" />
<meta property="og:description" content="A folder or a file goes in, a public URL comes back, and the URL expires on its own. No account needed to try." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://vanish.sh/" />
<meta property="og:image" content="https://vanish.sh/og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="vanish: a public URL for anything your agent makes. It expires on its own." />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="vanish: a public URL for anything your agent makes" />
<meta name="twitter:description" content="A folder or a file goes in, a public URL comes back, and the URL expires on its own. No account needed to try." />
<meta name="twitter:image" content="https://vanish.sh/og.png" />
${HALF_LIFE_FAVICON}

${HALF_LIFE_FONTS}

<style>
:root {
${HALF_LIFE_TOKENS}
  --wrap: 1240px;
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; scroll-padding-top: 80px; }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font: 400 17px/1.6 var(--sans); overflow-x: hidden;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
h1, h2, h3 { margin: 0; font-weight: 400; }
p { margin: 0; }
a { color: inherit; }
code, pre { font-family: var(--mono); }
ul, ol, dl, dd { margin: 0; padding: 0; list-style: none; }
.ic { width: 16px; height: 16px; flex: none; }
:focus-visible { outline: 2px solid var(--signal); outline-offset: 3px; border-radius: 4px; }

.wrap { width: 100%; max-width: var(--wrap); margin: 0 auto; padding: 0 32px; }
.skip { position: absolute; left: 12px; top: -60px; z-index: 40; background: var(--ink); color: var(--paper); padding: 10px 14px; border-radius: 8px; font-weight: 600; }
.skip:focus { top: 12px; }

/* text bits */
.mono-tag { font: 500 13px/1.4 var(--mono); letter-spacing: .02em; color: var(--ink-3); text-transform: uppercase; }
.inline-code, p code, dd code, td code, li code { font: 500 .88em var(--mono); background: var(--paper-2); padding: 2px 6px; border-radius: 5px; white-space: nowrap; }

/* wordmark: the last letters fade, as the links do */
.wordmark { display: inline-flex; align-items: center; min-height: 44px; text-decoration: none; color: var(--ink); font: 600 24px/1 var(--sans); letter-spacing: -.045em; }
.wordmark b { font-weight: 600; }
.wordmark b:nth-child(4) { opacity: .78; }
.wordmark b:nth-child(5) { opacity: .5; }
.wordmark b:nth-child(6) { opacity: .24; }

/* buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; padding: 0 20px; border-radius: 999px; border: 1px solid var(--ink);
  font: 600 15px/1 var(--sans); text-decoration: none; white-space: nowrap;
  transition: background .2s, color .2s, transform .2s var(--arrive);
}
.btn-ink { background: var(--ink); color: var(--paper); }
.btn-ink:hover { background: #2b2722; }
.btn-line { background: transparent; color: var(--ink); }
.btn-line:hover { background: var(--paper-2); }
.btn code { font: 500 14px var(--mono); }

/* header */
.top { position: sticky; top: 0; z-index: 30; background: color-mix(in srgb, var(--paper) 88%, transparent); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); border-bottom: 1px solid transparent; transition: border-color .2s; }
.top.scrolled { border-bottom-color: var(--rule); }
.top-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 68px; }
.top nav { display: flex; align-items: center; gap: 4px; }
.top nav a:not(.btn) { display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; text-decoration: none; font-weight: 500; font-size: 15px; color: var(--ink-2); }
.top nav a:not(.btn):hover { color: var(--ink); }
.top nav .btn { margin-left: 8px; min-height: 40px; }

/* hero */
.hero { padding: 72px 0 0; }
.eyebrow { margin-bottom: 26px; }
h1 {
  font-family: var(--serif); font-size: clamp(50px, 6.3vw, 92px); line-height: .96; letter-spacing: -.02em;
  text-wrap: balance;
}
@media (min-width: 1100px) { h1 em { display: block; } }
h1 em, h2 em { font-style: italic; color: var(--signal); }
.hero-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.08fr); gap: 56px; margin-top: 40px; align-items: start; }
.lead { font-size: 20px; line-height: 1.55; color: var(--ink-2); max-width: 31em; }
.no-account { margin-top: 14px; font-size: 15px; line-height: 1.55; color: var(--ink-2); }
.no-account strong { color: var(--ink); font-weight: 600; }
.no-account a { font-weight: 600; color: var(--ink); text-underline-offset: 3px; }

/* the command */
.cmd {
  display: flex; align-items: center; gap: 12px; min-width: 0;
  background: var(--ink); color: var(--night-text); border-radius: 14px; padding: 8px 8px 8px 20px;
}
.cmd code { flex: 1 1 auto; min-width: 0; font: 500 15px/1.5 var(--mono); white-space: nowrap; overflow-x: auto; scrollbar-width: none; padding: 8px 0; }
.cmd code::-webkit-scrollbar { display: none; }
.cmd-p { color: var(--signal); margin-right: 4px; }
.copy {
  flex: none; display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px;
  border: 0; border-radius: 9px; background: var(--paper); color: var(--ink);
  font: 600 14px/1 var(--sans); cursor: pointer; transition: background .2s;
}
.copy:hover { background: #fff; }
.copy.done { background: var(--signal-soft); }

/* the stage: a faux product shot (stageshow), drawn at a design size and scaled to fit */
.stage-wrap { margin-top: 64px; overflow-x: clip; }
.fit { container-type: inline-size; }
.fit-box { --w: 1176; --h: 660; --k: 1; position: relative; height: calc(var(--h) * 1px * var(--k)); clip-path: inset(0 -400px); }
@container (max-width: 1175px) { .fit-box { --k: .86; } }
@container (max-width: 999px) { .fit-box { --k: .7; } }
@container (max-width: 819px) { .fit-box { --k: .6; } }
.stage {
  position: absolute; top: 0; left: 50%; width: calc(var(--w) * 1px); height: calc(var(--h) * 1px);
  transform: translateX(-50%) scale(var(--k)); transform-origin: top center;
  font-family: var(--sans); font-size: 14px; line-height: 1.4; color: var(--ink); user-select: none;
}
.st-win { position: absolute; display: flex; flex-direction: column; overflow: hidden; border-radius: 14px; }
.st-bar { display: flex; align-items: center; gap: 10px; height: 40px; flex: none; padding: 0 15px; }
.st-lights { display: flex; gap: 7px; flex: none; }
.st-lights i { width: 10px; height: 10px; border-radius: 50%; background: #ff5f57; box-shadow: inset 0 0 0 .5px rgba(0,0,0,.14); }
.st-lights i:nth-child(2) { background: #febc2e; }
.st-lights i:nth-child(3) { background: #28c840; }

/* hero window: the browser with the published site */
.st-browser {
  left: 176px; top: 44px; width: 900px; height: 780px; background: #fff;
  box-shadow: 0 0 0 1px rgba(40, 30, 15, .08), 0 40px 80px -24px rgba(60, 40, 20, .28), 0 18px 36px -18px rgba(0, 0, 0, .22);
}
.st-browser .st-bar { background: #f7f5f1; border-bottom: 1px solid rgba(40, 30, 15, .08); }
.st-url {
  position: relative; flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  height: 26px; margin: 0 92px 0 34px; border-radius: 999px; background: rgba(40, 30, 15, .055);
  font-size: 12px; color: #57534c; white-space: nowrap; overflow: hidden;
}
.st-url .ic { width: 12px; height: 12px; color: #8c867c; }
.st-url-ph { width: 120px; height: 7px; border-radius: 4px; background: rgba(40, 30, 15, .1); }
.st-url-text, .st-url .ic { transition: opacity .3s; }
.stage[data-site="blank"] .st-url-text, .stage[data-site="blank"] .st-url .ic { display: none; }
.stage:not([data-site="blank"]) .st-url-ph { display: none; }
.st-progress { position: absolute; left: 0; right: 0; top: 40px; height: 2px; background: var(--ink); transform-origin: left; transform: scaleX(0); opacity: 0; z-index: 2; }
.stage[data-site="loading"] .st-progress { opacity: 1; transform: scaleX(.7); transition: transform .55s var(--travel); }
.stage[data-site="live"] .st-progress { opacity: 0; transform: scaleX(1); transition: transform .2s, opacity .3s .15s; }
.st-body { position: relative; flex: 1; min-height: 0; }
.st-layer { position: absolute; inset: 0; transition: opacity .6s var(--arrive), filter .6s var(--arrive); }

/* the agent's mini-site, quiet filler around two real strings */
.ms { display: flex; height: 100%; }
.ms-side { width: 230px; flex: none; background: #faf8f5; border-right: 1px solid rgba(40, 30, 15, .07); padding: 28px 22px; display: flex; flex-direction: column; gap: 14px; }
.ms-main { flex: 1; min-width: 0; padding: 34px 40px; }
.bar { display: block; height: 7px; border-radius: 4px; background: rgba(40, 30, 15, .09); }
.bar.t2 { background: rgba(40, 30, 15, .06); }
.ms-side .bar:first-child { height: 10px; background: rgba(40, 30, 15, .16); margin-bottom: 10px; }
.ms-kicker { font-size: 12px; font-weight: 600; color: #8c867c; letter-spacing: .02em; }
.ms-title { margin-top: 6px; font-size: 30px; font-weight: 600; letter-spacing: -.025em; color: #1d1a16; }
.ms-meta { display: flex; gap: 10px; margin-top: 14px; }
.ms-chart { position: relative; margin-top: 28px; height: 196px; border: 1px solid rgba(40, 30, 15, .08); border-radius: 12px; padding: 20px 22px 18px; display: flex; flex-direction: column; }
.ms-chart-head { display: flex; justify-content: space-between; align-items: center; }
.ms-chart-label { font-size: 12px; font-weight: 600; color: #57534c; }
.ms-cols { flex: 1; display: flex; align-items: flex-end; gap: 9px; margin-top: 16px; }
.ms-cols i { flex: 1; border-radius: 4px 4px 1px 1px; background: rgba(40, 30, 15, .12); }
.ms-cols i.hi { background: #1d1a16; }
.ms-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 16px; }
.ms-card { height: 92px; border: 1px solid rgba(40, 30, 15, .08); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
.ms-card .bar:last-child { height: 16px; border-radius: 5px; background: rgba(40, 30, 15, .12); }
.ms .rv { transition: opacity .5s var(--arrive), transform .6s var(--arrive); transition-delay: calc(var(--i, 0) * 70ms); }
.stage[data-site="loading"] .ms .rv, .stage[data-site="blank"] .ms .rv { opacity: 0; transform: translateY(6px); transition: none; }
.stage[data-site="live"] .st-gone, .stage[data-site="loading"] .st-gone, .stage[data-site="blank"] .st-gone { opacity: 0; }
.stage[data-site="expired"] .st-site { opacity: 0; filter: blur(6px); }
.stage[data-site="blank"] .st-site { opacity: 0; transition: none; }
.stage[data-site="expired"] .st-gone { transition-delay: .35s; }

/* what the URL serves once it is gone: the worker's JSON answer, as a browser shows it */
.st-gone { background: #fff; padding: 16px 20px; font: 13px/1.5 var(--mono); color: #1d1a16; }
.st-gone-pp { display: flex; align-items: center; gap: 6px; font: 12px/1 var(--sans); color: #57534c; margin-bottom: 12px; }
.st-gone-pp i { width: 12px; height: 12px; border: 1px solid #a8a29a; border-radius: 3px; }

/* satellite: the terminal the agent ran it in */
.st-term {
  left: 0; top: 448px; width: 470px; background: var(--night-2);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, .5), inset 0 0 0 1px rgba(255, 255, 255, .06), 0 30px 60px -18px rgba(30, 20, 10, .45), 0 12px 24px -12px rgba(0, 0, 0, .35);
}
.st-term .st-bar { background: var(--night-2); border-bottom: 1px solid rgba(255, 255, 255, .07); }
.st-term-title { flex: 1; margin-right: 50px; text-align: center; font: 500 12px var(--sans); color: var(--night-dim); }
.st-term-body { height: 136px; padding: 13px 18px; font: 13px/1.62 var(--mono); color: var(--night-text); white-space: pre-wrap; overflow: hidden; }
.ln { display: none; min-height: 1.62em; }
.ln-p { color: var(--signal); }
.ln-url { color: #fff; font-weight: 600; }
.ln-dim, .ln-spin { color: var(--night-dim); }
.spin { display: inline-block; width: 1ch; height: 1em; vertical-align: -.12em; position: relative; }
.spin::before { content: ""; position: absolute; inset: .12em .06em; border-radius: 50%; border: 1.5px solid rgba(239, 233, 222, .25); border-top-color: var(--night-text); animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.caret { display: inline-block; width: .6em; height: 1.15em; margin-left: 1px; vertical-align: -.2em; background: var(--night-text); opacity: .55; }
.stage[data-term="empty"] .ln-cmd, .stage[data-term="typing"] .ln-cmd,
.stage[data-term="uploading"] .ln-cmd, .stage[data-term="uploading"] .ln-spin,
.stage[data-term="done"] .ln-cmd, .stage[data-term="done"] .ln-out, .stage[data-term="done"] .ln-next { display: block; }
.stage:not([data-term="empty"]):not([data-term="typing"]) .ln-cmd .caret { display: none; }

/* corner chip: one live fact, the time left */
.st-chip {
  position: absolute; left: 1076px; top: 25px; height: 38px; display: flex; align-items: center; gap: 8px;
  padding: 0 16px 0 13px; translate: -50% 0; overflow: hidden; border-radius: 999px; background: var(--signal); color: #fff;
  font: 600 14px/1 var(--sans); white-space: nowrap;
  box-shadow: 0 0 0 1px rgba(120, 30, 0, .18), 0 14px 30px -10px rgba(190, 60, 20, .55), 0 4px 10px -4px rgba(0, 0, 0, .18);
  transition: opacity .45s var(--arrive), transform .6s var(--arrive), width .5s var(--travel), background .25s, box-shadow .25s;
}
.st-chip .ic { width: 16px; height: 16px; }
.st-chip-states { display: grid; justify-items: start; }
.st-chip-states > span { grid-area: 1 / 1; white-space: nowrap; transition: opacity .25s; }
.st-time { font: 600 14px/1 var(--mono); font-variant-numeric: tabular-nums; margin-left: 4px; }
.st-chip-gone { opacity: 0; }
.stage[data-chip="hidden"] .st-chip { opacity: 0; transform: translateY(6px) scale(.96); }
.stage[data-chip="expired"] .st-chip { background: var(--ink); box-shadow: 0 0 0 1px rgba(0, 0, 0, .2), 0 14px 30px -12px rgba(0, 0, 0, .45); }
.stage[data-chip="expired"] .st-chip-live { opacity: 0; }
.stage[data-chip="expired"] .st-chip-gone { opacity: 1; }
.st-later { position: absolute; right: 210px; top: 16px; font: 500 12px/1 var(--mono); color: var(--ink-3); letter-spacing: .02em; opacity: 0; transform: translateY(-4px); transition: opacity .4s, transform .5s var(--arrive); }
.stage[data-chip="lapse"] .st-later, .stage[data-chip="expired"] .st-later { opacity: 1; transform: none; }

/* compact: a second design for the phone column, not a squeeze */
@container (max-width: 699px) {
  .fit-box { --w: 358; --h: 540; --k: 1; }
  .st-browser { left: 16px; top: 16px; width: 440px; height: 560px; border-radius: 12px; }
  .st-url { margin: 0 24px 0 22px; justify-content: flex-start; padding-left: 12px; }
  .ms-side { display: none; }
  .ms-main { padding: 22px 20px; }
  .ms-title { font-size: 22px; }
  .ms-chart { margin-top: 18px; height: 150px; padding: 14px 16px; }
  .ms-cols { gap: 6px; }
  .st-term { left: 16px; top: 338px; width: 326px; }
  .st-term-body { height: 146px; padding: 12px 14px; font-size: 12px; }
  .st-term-title { visibility: hidden; }
  .st-chip { left: 252px; top: 319px; }
  .st-later { right: auto; left: 16px; top: 326px; padding: 6px 10px; border-radius: 999px; background: var(--paper); box-shadow: 0 0 0 1px var(--rule); }
}

/* facts */
.facts { border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); background: var(--paper); position: relative; z-index: 1; }
.facts ul { display: grid; grid-template-columns: repeat(4, 1fr); }
.facts li { padding: 20px 0 20px 24px; border-left: 1px solid var(--rule); font: 500 14px/1.4 var(--mono); color: var(--ink-2); }
.facts li:first-child { border-left: 0; padding-left: 0; }

/* sections */
.sec { padding: 128px 0 0; }
.sec-head { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: end; }
h2 { font-family: var(--serif); font-size: clamp(42px, 5.4vw, 76px); line-height: .98; letter-spacing: -.015em; text-wrap: balance; }
.sec-sub { font-size: 19px; line-height: 1.55; color: var(--ink-2); max-width: 30em; }
.sec-head .mono-tag { display: block; margin-bottom: 18px; }

/* how it works: a timeline that runs out */
.line { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; margin-top: 72px; padding-top: 36px; }
.line::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: linear-gradient(90deg, var(--ink) 0%, var(--ink) 62%, rgba(21, 19, 16, 0) 100%); }
.beat { position: relative; }
.beat::before { content: ""; position: absolute; top: -41px; left: 0; width: 11px; height: 11px; border-radius: 50%; background: var(--paper); border: 1.5px solid var(--ink); }
.beat:last-child::before { background: var(--signal); border-color: var(--signal); }
.beat .beat-t { font: italic 400 64px/1 var(--serif); margin: 0; max-width: none; color: var(--ink); letter-spacing: -.01em; }
.beat:last-child .beat-t { color: var(--signal); }
.beat h3 + p { margin-top: 10px; }
.beat h3 { margin-top: 18px; font: 600 21px/1.25 var(--sans); letter-spacing: -.015em; }
.beat p { margin-top: 10px; color: var(--ink-2); font-size: 16px; line-height: 1.6; max-width: 26em; }

/* bento */
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 64px; }
.tile { position: relative; overflow: hidden; border-radius: 22px; background: var(--card); box-shadow: inset 0 0 0 1px var(--rule); min-height: 400px; display: flex; flex-direction: column; }
.tile-2 { grid-column: span 2; }
.tile-copy { padding: 28px 30px 0; font-size: 19px; line-height: 1.45; color: var(--ink-3); max-width: 36em; }
.tile-copy strong { color: var(--ink); font-weight: 600; }
.tile-copy a, .qa dd a { color: var(--ink); font-weight: 500; text-underline-offset: 3px; }
.tile-copy code.long { white-space: normal; }
.tile-viz { position: relative; flex: 1; min-height: 0; margin-top: 28px; }
.tile-ink { background: var(--night); box-shadow: none; }
.tile-ink .tile-copy { color: var(--night-dim); }
.tile-ink .tile-copy strong { color: var(--night-text); }
.tile-ink .tile-copy code { background: var(--night-3); color: var(--night-text); }
.tile-signal { background: var(--signal-soft); box-shadow: none; }

/* tile: folder to URL */
.fold { position: absolute; left: 30px; right: 30px; top: 0; bottom: 30px; display: flex; align-items: center; gap: 22px; }
.fcard { flex: 1.15; min-width: 0; background: #fff; border-radius: 14px; box-shadow: 0 0 0 1px rgba(40, 30, 15, .08), 0 18px 40px -22px rgba(60, 40, 20, .3); padding: 8px 6px; }
.fcard-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px 10px; font: 500 13px var(--mono); color: var(--ink-2); border-bottom: 1px solid rgba(40, 30, 15, .07); margin-bottom: 4px; }
.fcard li { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 8px 12px; font-size: 14px; color: var(--ink-2); }
.fcard li .ic { color: var(--ink-3); }
.fcard li code { font: 500 13px var(--mono); color: var(--ink); background: none; padding: 0; border-radius: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fcard .sz { font: 12px var(--mono); color: var(--ink-3); text-align: right; min-width: 58px; }
.root { font: 600 11px/1 var(--sans); padding: 4px 7px; border-radius: 999px; background: var(--ink); color: var(--paper); }
.fold-arrow { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--paper-2); color: var(--ink); }
.ucard { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.ucard-url { display: flex; align-items: center; gap: 8px; height: 46px; padding: 0 16px; border-radius: 999px; background: #fff; box-shadow: 0 0 0 1px rgba(40, 30, 15, .1), 0 18px 40px -22px rgba(60, 40, 20, .35); font: 600 14px var(--mono); color: var(--ink); white-space: nowrap; overflow: hidden; }
.ucard-url .ic { color: var(--ink-3); width: 14px; height: 14px; }
.ucard-meta { padding-left: 16px; font: 12.5px/1.4 var(--mono); color: var(--ink-3); }

/* tile: the 24 hours */
.stat { padding: 28px 30px 30px; display: flex; flex-direction: column; justify-content: space-between; flex: 1; }
.stat-lead { font-size: 19px; line-height: 1.45; color: var(--signal-ink); font-weight: 600; }
.stat-num { font: 400 200px/.8 var(--serif); letter-spacing: -.045em; color: var(--signal); white-space: nowrap; margin-top: 20px; }
.stat-num span { font-size: .3em; letter-spacing: 0; margin-left: 6px; font-style: italic; }
.stat-label { margin-top: 18px; font-size: 16px; line-height: 1.5; color: #6d3a26; max-width: 22em; }

/* tile: the real access gate, cropped */
.gate { position: absolute; left: 30px; right: 30px; top: 0; bottom: -40px; background: #0f1113; border: 1px solid #2b3035; border-radius: 12px; padding: 24px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #dee3e9; }
.gate-h { font-size: 16px; font-weight: 700; }
.gate-h span { color: #d4a850; }
.gate-l { font-size: 12px; margin: 18px 0 8px; }
.gate-i { height: 40px; border: 1px solid #343a40; border-radius: 6px; background: #08090a; padding: 0 12px; display: flex; align-items: center; gap: 3px; }
.gate-i i { width: 7px; height: 7px; border-radius: 50%; background: #dee3e9; }
.gate-b { margin-top: 12px; height: 40px; border-radius: 6px; background: #d4a850; color: #08090a; font-size: 13px; font-weight: 700; display: grid; place-items: center; }

/* tile: files, many of one */
.files-cloud { position: absolute; left: 0; right: 0; top: 0; bottom: 0; padding-left: 30px; display: flex; flex-direction: column; gap: 10px; overflow: hidden;
  -webkit-mask-image: linear-gradient(180deg, #000 50%, transparent 100%), linear-gradient(90deg, transparent 0, #000 28px, #000 calc(100% - 56px), transparent 100%);
  -webkit-mask-composite: source-in; mask-image: linear-gradient(180deg, #000 50%, transparent 100%), linear-gradient(90deg, transparent 0, #000 28px, #000 calc(100% - 56px), transparent 100%); mask-composite: intersect; }
.files-cloud ul { display: flex; gap: 10px; }
.files-cloud ul:nth-child(2) { margin-left: -38px; }
.files-cloud ul:nth-child(3) { margin-left: 18px; }
.files-cloud ul:nth-child(4) { margin-left: -20px; }
.chip-file { flex: none; display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 16px 0 13px; border-radius: 999px; background: #fff; box-shadow: 0 0 0 1px rgba(40, 30, 15, .1); font: 500 14px var(--mono); color: var(--ink); white-space: nowrap; }
.chip-file .ic { color: var(--ink-3); }

/* tile: same URL, new files */
.upd { position: absolute; left: 30px; right: 30px; top: 18px; bottom: -24px; }
.upd-cmd { height: 100%; background: var(--night-2); color: var(--night-text); border-radius: 14px; padding: 22px 20px; font: 13px/1.7 var(--mono); white-space: pre-wrap; }
.upd-cmd span { color: var(--signal); }
.upd-cmd b { display: block; margin-top: 10px; color: #fff; font-weight: 600; }
.upd-cmd i { display: block; font-style: normal; color: var(--night-dim); }
.upd-cmd u { display: inline-block; width: .6em; height: 1.15em; vertical-align: -.2em; background: var(--night-text); opacity: .55; }
.upd-chip { position: absolute; right: 18px; top: -17px; display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px 0 11px; border-radius: 999px; background: #fff; color: var(--ink); font: 600 13px/1 var(--sans); font-style: normal; white-space: nowrap; box-shadow: 0 0 0 1px rgba(40, 30, 15, .1), 0 10px 24px -10px rgba(60, 40, 20, .35); }
.upd-chip .ic { width: 14px; height: 14px; }

/* tile: --json */
.json { position: absolute; left: 30px; right: 30px; top: 0; bottom: -24px; border-radius: 14px 14px 0 0; background: var(--night-2); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07); padding: 20px 24px; overflow: hidden; }
.json pre { margin: 0; font: 13.5px/1.7 var(--mono); color: var(--night-dim); white-space: pre; }
.json .k { color: var(--night-text); }
.json .s { color: #f0b9a2; }
.json .n { color: #e9d6a4; }
.json .hl { display: inline-block; margin: 0 -10px; padding: 0 10px; border-radius: 6px; background: rgba(236, 74, 28, .2); }
.json .hl .s { color: #fff; }

/* tile: skills */
.skills { padding: 0 30px 30px; margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
.skills li { display: flex; align-items: center; gap: 10px; height: 46px; padding: 0 16px; border-radius: 12px; background: var(--paper-2); font: 500 14px var(--mono); color: var(--ink); }
.skills li span { margin-left: auto; font: 500 12px var(--sans); color: var(--ink-3); }

/* lifespan ruler */
.life { margin: 64px 0 0; padding: 36px 36px 30px; border-radius: 22px; background: var(--card); box-shadow: inset 0 0 0 1px var(--rule); }
.life-row + .life-row { margin-top: 26px; }
.life-top { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
.life-name { font-weight: 600; font-size: 17px; }
.life-val { font: 500 14px var(--mono); color: var(--ink-2); }
.life-track { position: relative; height: 14px; margin-top: 10px; border-radius: 999px; background: var(--paper-2); }
.life-bar { position: absolute; left: 0; top: 0; bottom: 0; width: var(--to); border-radius: 999px; background: linear-gradient(90deg, var(--ink) 0%, var(--ink) 55%, rgba(21, 19, 16, .12) 100%); }
.life-bar::after { content: ""; position: absolute; right: -1px; top: -5px; bottom: -5px; width: 3px; border-radius: 2px; background: var(--signal); }
.life-more { position: absolute; top: 5px; height: 4px; left: var(--from); right: 0; background-image: linear-gradient(90deg, var(--signal) 0 6px, transparent 6px 12px); background-size: 12px 4px; opacity: .65; }
.life-axis { position: relative; height: 22px; margin-top: 22px; border-top: 1px solid var(--rule); }
.life-axis span { position: absolute; top: 8px; transform: translateX(-50%); font: 12px var(--mono); color: var(--ink-3); white-space: nowrap; }
.life-axis span:first-child { transform: none; }
.life-axis span:last-child { transform: translateX(-100%); }
.life-note { margin-top: 18px; font-size: 14px; color: var(--ink-3); }

/* plans table */
.plans { width: 100%; margin-top: 28px; border-collapse: separate; border-spacing: 0; font-size: 15.5px; }
.plans th, .plans td { text-align: left; padding: 14px 20px; border-bottom: 1px solid var(--rule); vertical-align: top; }
.plans thead th { border-bottom: 1px solid var(--ink); padding-top: 26px; padding-bottom: 20px; vertical-align: bottom; }
.plans thead th:first-child { width: 22%; padding-left: 0; }
.plans tbody th { font-weight: 500; color: var(--ink-3); font-size: 14.5px; padding-left: 0; }
.plan-name { display: block; font: 400 38px/1 var(--serif); letter-spacing: -.01em; }
.plan-price { display: block; margin-top: 12px; font-size: 15px; color: var(--ink-2); }
.plan-price strong { color: var(--ink); font-weight: 600; font-size: 20px; margin-right: 4px; }
.plans .pro { background: var(--card); }
.plans thead .pro { border-radius: 18px 18px 0 0; box-shadow: inset 1px 0 0 var(--rule), inset -1px 0 0 var(--rule), inset 0 1px 0 var(--rule); }
.plans tbody .pro { box-shadow: inset 1px 0 0 var(--rule), inset -1px 0 0 var(--rule); }
.plans tfoot td, .plans tfoot th { border-bottom: 0; padding-top: 22px; padding-bottom: 26px; }
.plans tfoot .pro { border-radius: 0 0 18px 18px; box-shadow: inset 1px 0 0 var(--rule), inset -1px 0 0 var(--rule), inset 0 -1px 0 var(--rule); }
.plan-cards { display: none; gap: 14px; margin-top: 24px; }
.plan-card { border-radius: 20px; background: var(--card); box-shadow: inset 0 0 0 1px var(--rule); padding: 24px 22px 22px; }
.plan-card.pro { background: #fff; box-shadow: inset 0 0 0 1px var(--ink); }
.plan-card h3 { padding-bottom: 16px; border-bottom: 1px solid var(--ink); }
.plan-card dl > div { display: grid; grid-template-columns: 7.5em minmax(0, 1fr); gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--rule); font-size: 15px; }
.plan-card dt { color: var(--ink-3); font-size: 14px; }
.plan-card .btn { margin-top: 18px; width: 100%; }
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.cli-line { margin-top: 28px; font-size: 15px; line-height: 1.7; color: var(--ink-2); max-width: 60em; }

/* questions */
.qa-grid { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); gap: 56px; }
.qa-grid h2 { position: sticky; top: 110px; }
.qa > div { padding: 26px 0; border-top: 1px solid var(--rule); }
.qa > div:last-child { border-bottom: 1px solid var(--rule); }
.qa dt { font: 600 20px/1.3 var(--sans); letter-spacing: -.015em; }
.qa dd { margin-top: 10px; color: var(--ink-2); font-size: 16.5px; line-height: 1.65; max-width: 40em; }

/* final band and footer, on ink */
.end { margin-top: 140px; background: var(--night); color: var(--night-text); padding: 120px 0 0; }
.end h2 { color: var(--night-text); font-size: clamp(54px, 8vw, 120px); }
.end-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.08fr); gap: 56px; margin-top: 44px; align-items: end; }
.end-sub { font-size: 19px; color: var(--night-dim); max-width: 26em; }
.end .cmd { background: var(--night-3); }
.end-actions { display: flex; flex-direction: column; gap: 14px; }
.end .btn-line { color: var(--night-text); border-color: rgba(239, 233, 222, .35); align-self: flex-start; }
.end .btn-line:hover { background: var(--night-3); }
.foot { margin-top: 120px; border-top: 1px solid var(--night-3); }
.foot-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-top: 22px; padding-bottom: 14px; }
.foot .wordmark { color: var(--night-text); font-size: 20px; }
.foot nav { display: flex; flex-wrap: wrap; gap: 4px; }
.foot nav a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; color: var(--night-dim); text-decoration: none; font-size: 15px; }
.foot nav a:hover { color: var(--night-text); }
.foot-line { padding-bottom: 36px; font: 13px var(--mono); color: #9a9183; }

/* motion on the page: one entrance as things scroll in */
@media (prefers-reduced-motion: no-preference) {
  .js .in { opacity: 0; transform: translateY(14px); transition: opacity .8s var(--arrive), transform .9s var(--arrive); transition-delay: var(--d, 0ms); }
  .js .in.seen { opacity: 1; transform: none; }
  .js .line.in::before { transform-origin: left; transform: scaleX(0); transition: transform 1.4s var(--travel) .2s; }
  .js .line.in.seen::before { transform: none; }
  .js .life .life-bar { transform-origin: left; transform: scaleX(.02); transition: transform 1.2s var(--travel); transition-delay: var(--d, 0ms); }
  .js .life.seen .life-bar { transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .st-layer, .st-chip, .ms .rv, .st-later { transition: none !important; }
}

/* narrow */
@media (max-width: 1080px) {
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tile-2 { grid-column: span 2; }
  .tile-2.tile-json { grid-column: auto; }
}
@media (max-width: 900px) {
  .plans { display: none; }
  .plan-cards { display: grid; }
}
@media (max-width: 860px) {
  .fold { flex-direction: column; align-items: stretch; justify-content: flex-start; gap: 14px; bottom: auto; }
  .fold-arrow { align-self: center; transform: rotate(90deg); }
  .ucard { flex: none; }
  .tile-fold { min-height: 580px; }
  .hero { padding-top: 48px; }
  .hero-row, .sec-head, .qa-grid, .end-row { grid-template-columns: minmax(0, 1fr); gap: 28px; }
  .qa-grid h2 { position: static; }
  .line { grid-template-columns: minmax(0, 1fr); gap: 44px; padding-top: 0; padding-left: 36px; margin-top: 48px; }
  .line::before { left: 5px; right: auto; top: 6px; bottom: 0; width: 1px; height: auto; background: linear-gradient(180deg, var(--ink) 0%, var(--ink) 62%, rgba(21, 19, 16, 0) 100%); }
  .js .line.in::before { transform-origin: top; transform: scaleY(0); }
  .js .line.in.seen::before { transform: none; }
  .beat::before { top: 6px; left: -36px; }
  .facts ul { grid-template-columns: repeat(2, 1fr); }
  .facts li:nth-child(3) { border-left: 0; padding-left: 0; }
  .facts li:nth-child(n+3) { border-top: 1px solid var(--rule); }
  .sec { padding-top: 96px; }
  .end { margin-top: 110px; padding-top: 88px; }
}
@media (max-width: 760px) {
  .grid { grid-template-columns: minmax(0, 1fr); }
  .tile-2 { grid-column: auto; }
  .tile { min-height: 360px; }
  .json { bottom: -40px; }
  .json pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12.5px; }
  .tile-json { min-height: 430px; }
}
@media (max-width: 640px) {
  .wrap { padding: 0 16px; }
  body { font-size: 16px; }
  .top nav a.hide-sm { display: none; }
  .top nav a:not(.btn) { padding: 0 10px; }
  .eyebrow { margin-bottom: 18px; }
  h1 { font-size: 52px; line-height: .96; }
  .lead { font-size: 18px; }
  .hero-row { margin-top: 28px; }
  .cmd { padding-left: 14px; border-radius: 12px; }
  .cmd code { font-size: 13px; white-space: normal; overflow-wrap: anywhere; }
  .copy .copy-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .copy { padding: 0 14px; }
  .stage-wrap { margin-top: 40px; }
  .stage-wrap .wrap { padding: 0; }
  .facts li { font-size: 13px; padding-left: 16px; }
  h2 { font-size: 44px; }
  .sec-sub { font-size: 17px; }
  .tile-copy { padding: 24px 22px 0; font-size: 17px; }
  .fold, .gate, .upd, .json { left: 22px; right: 22px; }
  .files-cloud { left: 22px; }
  .stat { padding: 24px 22px 24px; }
  .stat-num { font-size: 168px; }
  .skills { padding: 0 22px 22px; }
  .life { padding: 26px 20px 22px; }
  .life-axis span.opt { display: none; }
  .beat .beat-t { font-size: 52px; }
  .end h2 { font-size: 60px; }
  .foot nav a { padding: 0 8px; }
}
</style>
${analytics}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wrap top-row">
    ${wordmark()}
    <nav aria-label="Site">
      <a class="hide-sm" href="#how">How it works</a>
      <a class="hide-sm" href="#plans">Plans</a>
      <a href="https://github.com/The-Vibe-Company/vanish">GitHub</a>
      <a class="hide-sm" href="/dashboard">Dashboard</a>
      <a class="btn btn-ink" href="/auth/github?redirect=/dashboard">Sign in</a>
    </nav>
  </div>
</header>

<main id="main">
<section class="hero">
  <div class="wrap">
    <p class="eyebrow mono-tag">The publish command your agent was missing.</p>
    <h1>A public URL for anything your agent makes. <em>It expires on its own.</em></h1>
    <div class="hero-row">
      <p class="lead">A photo, an image, a text, a file, a whole website: your agent can make them, but it cannot hand them to anyone. One command gives it a public URL to send.</p>
      <div id="command">
        ${commandBar()}
        <p class="no-account"><strong>No account needed to try.</strong> Sites and images stay up for 24 hours. <a href="/auth/github?redirect=/dashboard">Sign in with GitHub</a> for every file type, 48 hours and a password on the link.</p>
      </div>
    </div>
  </div>

  <div class="stage-wrap">
    <div class="wrap">
      <div class="fit" role="img" aria-label="A terminal runs npx vanish-cli site ./demo --root index.html and prints https://quiet-river-42.vanish.sh/. A browser opens that URL, and a tag on its corner counts down the 24 hours until it expires. When the time runs out, the same URL only answers: Site not found.">
        <div class="fit-box" data-fit>
          <div class="stage" data-stage data-site="live" data-term="done" data-chip="live" aria-hidden="true">
            <div class="st-win st-browser">
              <div class="st-bar">
                <span class="st-lights"><i></i><i></i><i></i></span>
                <div class="st-url">${icon(ICON_LOCK)}<span class="st-url-text">quiet-river-42.vanish.sh</span><span class="st-url-ph"></span></div>
              </div>
              <div class="st-progress"></div>
              <div class="st-body">
                <div class="st-layer st-site">
                  <div class="ms">
                    <div class="ms-side">
                      <span class="bar" style="width:62%"></span>
                      <span class="bar t2" style="width:78%"></span>
                      <span class="bar t2" style="width:54%"></span>
                      <span class="bar t2" style="width:70%"></span>
                      <span class="bar t2" style="width:46%"></span>
                      <span class="bar t2" style="width:64%"></span>
                    </div>
                    <div class="ms-main">
                      <div class="rv" style="--i:0"><div class="ms-kicker">Review build</div><div class="ms-title">Checkout redesign</div></div>
                      <div class="ms-meta rv" style="--i:1"><span class="bar" style="width:84px"></span><span class="bar t2" style="width:120px"></span><span class="bar t2" style="width:64px"></span></div>
                      <div class="ms-chart rv" style="--i:2">
                        <div class="ms-chart-head"><span class="ms-chart-label">Conversion by day</span><span class="bar t2" style="width:72px"></span></div>
                        <div class="ms-cols"><i style="height:38%"></i><i style="height:46%"></i><i style="height:41%"></i><i style="height:52%"></i><i style="height:49%"></i><i style="height:58%"></i><i style="height:55%"></i><i style="height:63%"></i><i style="height:60%"></i><i style="height:71%"></i><i style="height:68%"></i><i style="height:77%"></i><i style="height:74%"></i><i class="hi" style="height:88%"></i><i style="height:82%"></i><i style="height:86%"></i></div>
                      </div>
                      <div class="ms-cards rv" style="--i:3">
                        <div class="ms-card"><span class="bar t2" style="width:52%"></span><span class="bar" style="width:64%"></span></div>
                        <div class="ms-card"><span class="bar t2" style="width:44%"></span><span class="bar" style="width:52%"></span></div>
                        <div class="ms-card"><span class="bar t2" style="width:60%"></span><span class="bar" style="width:70%"></span></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="st-layer st-gone">
                  <div class="st-gone-pp"><i></i>Pretty-print</div>
                  <div>{"error":"Site not found"}</div>
                </div>
              </div>
            </div>

            <div class="st-win st-term">
              <div class="st-bar"><span class="st-lights"><i></i><i></i><i></i></span><span class="st-term-title">~/agent-output</span></div>
              <div class="st-term-body"><div class="ln ln-cmd"><span class="ln-p">$</span> <span data-cmd>${COMMAND}</span><span class="caret"></span></div><div class="ln ln-spin"><span class="spin"></span> <span data-spin-text>Publishing site</span></div><div class="ln ln-out ln-url">https://quiet-river-42.vanish.sh/</div><div class="ln ln-out ln-dim">Copied to clipboard.</div><div class="ln ln-out ln-dim">Expires in 24h.</div><div class="ln ln-next"><span class="ln-p">$</span> <span data-next></span><span class="caret"></span></div></div>
            </div>

            <div class="st-chip">${icon(ICON_CLOCK)}<span class="st-chip-states"><span class="st-chip-live">Expires in <span class="st-time" data-time>23:59:41</span></span><span class="st-chip-gone">Expired</span></span></div>
            <div class="st-later">24 hours later</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<div class="facts" aria-label="Facts">
  <div class="wrap">
    <ul><li>Open source, MIT</li><li>No build step</li><li>Files served as they are</li><li>Runs on Cloudflare</li></ul>
  </div>
</div>

<section class="sec" id="how">
  <div class="wrap">
    <div class="sec-head in">
      <h2>How it works</h2>
      <p class="sec-sub">Three steps, and the third one happens on its own.</p>
    </div>
    <ol class="line in">
      <li class="beat">
        <p class="beat-t" aria-hidden="true">00:00</p>
        <h3>Your agent makes something.</h3>
        <p>A site, a report, a deck, a prototype, a screenshot. It sits on your machine, and nobody else can see it.</p>
      </li>
      <li class="beat">
        <p class="beat-t" aria-hidden="true">00:01</p>
        <h3>One command.</h3>
        <p>Run it yourself, or let the agent run it: the Vanish agent skills pick the right command for a folder, a file or an account question.</p>
      </li>
      <li class="beat">
        <p class="beat-t" aria-hidden="true">24:00</p>
        <h3>Everyone with the link sees it, until it expires.</h3>
        <p>24 hours without an account, 48 hours signed in, 30 days on Pro. Until then, a site you own takes new files at the same URL.</p>
      </li>
    </ol>
  </div>
</section>

<section class="sec" id="what">
  <div class="wrap">
    <div class="sec-head in">
      <h2>What goes through</h2>
      <p class="sec-sub">Folders, single files, a handful of files at once. Nothing is transformed on the way: what your agent wrote is what people open.</p>
    </div>
    <div class="grid">
      <article class="tile tile-2 tile-fold in">
        <p class="tile-copy"><strong>Folders become sites.</strong> Point it at a folder and a root file. HTML is served as HTML, Markdown as Markdown, assets as static files. No build step, no server code.</p>
        <div class="tile-viz">
          <div class="fold">
            <div class="fcard">
              <div class="fcard-head">${icon(ICON_FOLDER)}<span>./notes</span></div>
              <ul>
                <li>${icon(ICON_FILE)}<code>README.md</code><span class="root">root</span><span class="sz">3.1 KB</span></li>
                <li>${icon(ICON_FILE)}<code>setup.md</code><span></span><span class="sz">2.4 KB</span></li>
                <li>${icon(ICON_IMAGE)}<code>diagram.png</code><span></span><span class="sz">48.2 KB</span></li>
                <li>${icon(ICON_FILE)}<code>styles.css</code><span></span><span class="sz">1.2 KB</span></li>
              </ul>
            </div>
            <span class="fold-arrow">${icon(ICON_ARROW)}</span>
            <div class="ucard">
              <div class="ucard-url">${icon(ICON_LOCK)}silver-meadow-k9.vanish.sh</div>
              <p class="ucard-meta">4 files, 54.9 KB, root README.md</p>
            </div>
          </div>
        </div>
      </article>

      <article class="tile tile-signal in" style="--d:100ms">
        <div class="stat">
          <p class="stat-lead">No account, live for</p>
          <p class="stat-num">24<span>hours</span></p>
          <p class="stat-label">Sites and images, no sign-up. Signed in: 48 hours, and every file type except executables.</p>
        </div>
      </article>

      <article class="tile in">
        <p class="tile-copy"><strong>Lock the link.</strong> Signed in, put a password on a site or a file. On Pro, allow listed emails with a one-time code.</p>
        <div class="tile-viz">
          <div class="gate" aria-hidden="true">
            <div class="gate-h"><span>vanish</span> protected preview</div>
            <div class="gate-l">Password</div>
            <div class="gate-i"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
            <div class="gate-b">Open preview</div>
          </div>
        </div>
      </article>

      <article class="tile in" style="--d:100ms">
        <p class="tile-copy"><strong>Files too.</strong> <code class="long">npx vanish-cli upload photo.jpg</code> gives one file its own URL. <code>vanish bundle</code> puts several behind one.</p>
        <div class="tile-viz">
          <div class="files-cloud" aria-hidden="true">
            <ul>${fileChip('screenshot.png', true)}${fileChip('report.pdf')}${fileChip('data.json')}</ul>
            <ul>${fileChip('deck.pdf')}${fileChip('photo.jpg', true)}${fileChip('notes.md')}</ul>
            <ul>${fileChip('logs.txt')}${fileChip('chart.png', true)}${fileChip('sheet.csv')}</ul>
            <ul>${fileChip('archive.zip')}${fileChip('mock.svg', true)}${fileChip('brief.docx')}</ul>
          </div>
        </div>
      </article>

      <article class="tile in" style="--d:200ms">
        <p class="tile-copy"><strong>Same link, new files.</strong> Signed in, update a site you own and the URL you already sent keeps working.</p>
        <div class="tile-viz">
          <div class="upd" aria-hidden="true">
            <div class="upd-cmd"><span>$</span> vanish site ./demo --root index.html --update quiet-river-42<b>https://quiet-river-42.vanish.sh/</b><i>Copied to clipboard.</i><i><span>$</span> <u></u></i></div>
            <em class="upd-chip">${icon(ICON_CHECK)}Same URL</em>
          </div>
        </div>
      </article>

      <article class="tile tile-2 tile-ink tile-json in">
        <p class="tile-copy"><strong>Made for scripts and agents.</strong> <code>--json</code> returns fields a script can read. <code>--dry-run</code> checks a folder before anything goes public. <code>--idempotency-key</code> makes retries safe.</p>
        <div class="tile-viz">
          <div class="json" aria-hidden="true">
<pre>{
  <span class="hl"><span class="k">"url"</span>: <span class="s">"https://quiet-river-42.vanish.sh/"</span>,</span>
  <span class="k">"id"</span>: <span class="s">"k8m2q9z4p1ad"</span>,
  <span class="k">"rootPath"</span>: <span class="s">"index.html"</span>,
  <span class="k">"size"</span>: <span class="n">12235</span>,
  <span class="k">"fileCount"</span>: <span class="n">4</span>,
  <span class="k">"expires"</span>: <span class="s">"2026-11-03T17:58:00.000Z"</span>,
  <span class="k">"expiresInHours"</span>: <span class="n">48</span>,
  <span class="k">"tier"</span>: <span class="s">"free"</span>,
  <span class="k">"updateCommand"</span>: <span class="s">"vanish site ./demo --root index.html --update k8m2q9z4p1ad"</span>
}</pre>
          </div>
        </div>
      </article>

      <article class="tile in" style="--d:100ms">
        <p class="tile-copy"><strong>Your agent knows the way.</strong> The <a href="https://github.com/The-Vibe-Company/vanish">repo</a> includes agent skills that pick the right command, and ask before publishing anything that looks private.</p>
        <ul class="skills">
          <li>vanish-publish-site<span>folders</span></li>
          <li>vanish-upload-files<span>files</span></li>
          <li>vanish-connect-upgrade<span>account</span></li>
        </ul>
      </article>
    </div>
  </div>
</section>

<section class="sec" id="plans">
  <div class="wrap">
    <div class="sec-head in">
      <h2>Plans and limits</h2>
      <p class="sec-sub">Three tiers. The limits below are the ones the server enforces.</p>
    </div>

    <figure class="life in" aria-label="How long a link lives on each plan">
      <div class="life-row">
        <div class="life-top"><span class="life-name">Anonymous</span><span class="life-val">24 hours</span></div>
        <div class="life-track"><span class="life-bar" style="--to:35%"></span></div>
      </div>
      <div class="life-row">
        <div class="life-top"><span class="life-name">Free</span><span class="life-val">48 hours</span></div>
        <div class="life-track"><span class="life-bar" style="--to:42.6%;--d:120ms"></span></div>
      </div>
      <div class="life-row">
        <div class="life-top"><span class="life-name">Pro</span><span class="life-val">30 days · up to 365 with --days</span></div>
        <div class="life-track"><span class="life-bar" style="--to:72.5%;--d:240ms"></span><span class="life-more" style="--from:73.5%"></span></div>
      </div>
      <div class="life-axis" aria-hidden="true"><span style="left:0">1 h</span><span style="left:35%">1 day</span><span class="opt" style="left:56.4%">1 week</span><span style="left:72.5%">30 days</span><span class="opt" style="left:84.6%">90 days</span><span style="left:100%">1 year</span></div>
      <figcaption class="life-note">Every URL carries its own end date. When it passes, the link stops working and the files are deleted.</figcaption>
    </figure>

${plansTable()}

    <p class="cli-line in">Signed in, the CLI also gives you <code>vanish login</code> · <code>vanish status</code> · <code>vanish ls</code> · <code>vanish rm &lt;id&gt;</code> · <code>vanish upgrade</code>, and the <a href="/dashboard">dashboard</a> lists what is live and when it goes.</p>
  </div>
</section>

<section class="sec" id="questions">
  <div class="wrap qa-grid">
    <div><h2 class="in">Questions</h2></div>
    <dl class="qa">
      <div class="in">
        <dt>Is it public?</dt>
        <dd>By default, yes: anyone with the link can open it, so do not publish secrets. Signed in, you can put a password on a site or a file; on Pro, you can restrict it to listed emails. The agent skills are set up to ask before publishing anything that looks private.</dd>
      </div>
      <div class="in">
        <dt>What if I need it longer?</dt>
        <dd>Without an account it lives 24 hours, signed in 48 hours, on Pro 30 days. On Pro, <code>--days 90</code> sets how long, up to 365.</dd>
      </div>
      <div class="in">
        <dt>Can I update it?</dt>
        <dd>Signed in, a site you own takes new files at the same URL with <code>--update quiet-river-42</code>, or with a stable <code>--channel</code> name. The link you already sent keeps working.</dd>
      </div>
      <div class="in">
        <dt>What is blocked?</dt>
        <dd>Executables, on every tier. Without an account, file uploads take images only; every other type once signed in.</dd>
      </div>
      <div class="in">
        <dt>Does my agent know how to use it?</dt>
        <dd>The <a href="https://github.com/The-Vibe-Company/vanish">vanish repo</a> includes agent skills: <code>vanish-publish-site</code> for folders, <code>vanish-upload-files</code> for files, <code>vanish-connect-upgrade</code> for login, quota and slugs. Add them to Claude Code, Codex or any agent that reads skills.</dd>
      </div>
      <div class="in">
        <dt>Can I run my own?</dt>
        <dd>Yes. Open source under MIT, it runs on Cloudflare Workers, R2 and D1. Clone it and run your own.</dd>
      </div>
    </dl>
  </div>
</section>
</main>

<div class="end">
  <section class="wrap" aria-labelledby="end-title">
    <h2 id="end-title" class="in">Send it. <em>Let it go.</em></h2>
    <div class="end-row in">
      <p class="end-sub">One command, one public URL, gone on the date you see. No account needed to try.</p>
      <div class="end-actions">
        ${commandBar()}
        <a class="btn btn-line" href="/auth/github?redirect=/dashboard">Sign in with GitHub</a>
      </div>
    </div>
  </section>
  <footer class="foot">
    <div class="wrap foot-row">
      ${wordmark()}
      <nav aria-label="Footer">
        <a href="https://github.com/The-Vibe-Company/vanish">GitHub</a>
        <a href="https://github.com/The-Vibe-Company/vanish/blob/main/packages/cli/CHANGELOG.md">Changelog</a>
        <a href="/dashboard">Dashboard</a>
        <a href="mailto:abuse@vanish.sh?subject=Vanish%20abuse%20report">Report abuse</a>
      </nav>
    </div>
    <div class="wrap foot-line"><p>vanish.sh · MIT · Cloudflare Workers · R2 · D1</p></div>
  </footer>
</div>

<script>
(function () {
  var d = document;
  d.documentElement.classList.add('js');

  var top = d.querySelector('.top');
  var onScroll = function () { if (top) top.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  d.querySelectorAll('.copy').forEach(function (b) {
    var label = b.querySelector('.copy-label');
    b.addEventListener('click', function () {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function () {
        b.classList.add('done'); if (label) label.textContent = 'Copied';
        setTimeout(function () { b.classList.remove('done'); if (label) label.textContent = 'Copy'; }, 1500);
      });
    });
  });

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Entrances, once, as each block scrolls in.
  var ins = d.querySelectorAll('.in');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    ins.forEach(function (el) { io.observe(el); });
  } else {
    ins.forEach(function (el) { el.classList.add('seen'); });
  }

  // The stage: scale the design to its slot. Layout (wide or compact) comes from a container query.
  var box = d.querySelector('[data-fit]');
  var st = d.querySelector('[data-stage]');
  if (!box || !st) return;
  var fit = function () {
    var w = parseFloat(getComputedStyle(box).getPropertyValue('--w')) || 1160;
    var avail = box.parentNode.clientWidth;
    box.style.setProperty('--k', String(Math.min(1, avail / w)));
  };
  box.style.setProperty('--k', '1');
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(function () { box.style.removeProperty('--k'); fit(); }).observe(box.parentNode);
  else window.addEventListener('resize', function () { box.style.removeProperty('--k'); fit(); });

  if (reduce) return;

  // The story, on a loop: the link expires, the agent publishes again, the page comes back.
  var $ = function (s) { return st.querySelector(s); };
  var timeEl = $('[data-time]'), cmdEl = $('[data-cmd]'), nextEl = $('[data-next]');
  var spinText = $('[data-spin-text]');
  var CMD = cmdEl.textContent;
  var FULL = 24 * 3600;
  var left = FULL - 19;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var show = function () {
    var s = Math.max(0, Math.round(left));
    timeEl.textContent = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  };
  var chip = $('.st-chip');
  var sizeChip = function () {
    var on = $(st.getAttribute('data-chip') === 'expired' ? '.st-chip-gone' : '.st-chip-live');
    chip.style.width = (on.offsetWidth + 53) + 'px';
  };
  var set = function (k, v) { st.setAttribute('data-' + k, v); if (k === 'chip') sizeChip(); };
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(sizeChip); else sizeChip();

  var onScreen = false, wake = null;
  var ready = function () {
    return onScreen && !d.hidden ? Promise.resolve() : new Promise(function (r) { wake = r; });
  };
  var resume = function () { if (onScreen && !d.hidden && wake) { var w = wake; wake = null; w(); } };
  new IntersectionObserver(function (e) { onScreen = e[0].isIntersecting; resume(); }, { threshold: 0.25 }).observe(st);
  d.addEventListener('visibilitychange', resume);

  var wait = function (ms) {
    return ready().then(function () { return new Promise(function (r) { setTimeout(r, ms); }); });
  };
  var type = function (el, text, ms) {
    var i = 0;
    var step = function () {
      if (i > text.length) return Promise.resolve();
      el.textContent = text.slice(0, i++);
      return wait(ms + Math.random() * ms * 0.6).then(step);
    };
    return step();
  };
  var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var lapse = function (ms) {
    var from = left, t0 = 0;
    return ready().then(function () {
      return new Promise(function (r) {
        var frame = function (now) {
          if (!t0) t0 = now;
          var t = Math.min(1, (now - t0) / ms);
          left = from * (1 - ease(t)); show();
          if (t < 1) requestAnimationFrame(frame); else r();
        };
        requestAnimationFrame(frame);
      });
    });
  };

  var ticking = true;
  setInterval(function () {
    if (ticking && onScreen && !d.hidden && st.getAttribute('data-chip') === 'live') { left -= 1; show(); }
  }, 1000);

  var FILES = ['index.html', 'styles.css', 'app.js', 'chart.svg'];

  var run = function () {
    return wait(3200)
      .then(function () { ticking = false; set('chip', 'lapse'); return lapse(1900); })
      .then(function () { left = 0; show(); set('chip', 'expired'); set('site', 'expired'); return wait(2600); })
      .then(function () { return type(nextEl, 'clear', 90); })
      .then(function () { return wait(320); })
      .then(function () {
        set('term', 'empty'); nextEl.textContent = ''; cmdEl.textContent = '';
        set('chip', 'hidden'); set('site', 'blank');
        return wait(800);
      })
      .then(function () { set('term', 'typing'); return type(cmdEl, CMD, 30); })
      .then(function () { return wait(380); })
      .then(function () {
        set('term', 'uploading');
        var i = 0;
        var next = function () {
          if (i >= FILES.length) { spinText.textContent = 'Publishing site'; return wait(620); }
          spinText.textContent = 'Uploading ' + FILES[i] + ' (' + (i + 1) + '/' + FILES.length + ')';
          i++;
          return wait(340).then(next);
        };
        return next();
      })
      .then(function () { set('term', 'done'); return wait(600); })
      .then(function () { set('site', 'loading'); return wait(560); })
      .then(function () { set('site', 'live'); return wait(700); })
      .then(function () { left = FULL; show(); ticking = true; set('chip', 'live'); })
      .then(run);
  };
  run();
})();
</script>
</body>
</html>
`;

landing.get('/', (c) => c.html(renderLanding(posthogScriptTag(posthogConfig(c.env, c.req.url)))));

landing.get('/og.png', () => {
  const bytes = ogImageBytes();
  return new Response(bytes.slice().buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

export default landing;
