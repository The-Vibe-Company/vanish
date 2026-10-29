import { Hono } from 'hono';
import type { Env } from '../types.js';
import { posthogConfig, posthogScriptTag } from '../lib/posthog.js';

const landing = new Hono<{ Bindings: Env }>();

const renderLanding = (analytics: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>vanish: public preview URLs for agent-made artifacts</title>
<meta name="description" content="A public URL for anything your agent makes: a photo, an image, a text, a file, a whole website. One command, and the URL expires on its own. No account needed to try." />
<meta name="theme-color" content="#184d2e" />
<meta property="og:title" content="vanish: a public URL for anything your agent makes" />
<meta property="og:description" content="A folder or a file goes in, a public URL comes back, and the URL expires on its own. No account needed to try." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://vanish.sh/" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'%3E%3Crect width='8' height='8' fill='%23184d2e'/%3E%3Crect x='1' y='1' width='6' height='3' fill='%23d63a2f'/%3E%3Crect x='2' y='4' width='4' height='1' fill='%238a1f17'/%3E%3Crect x='3' y='5' width='2' height='2' fill='%23ffffff'/%3E%3C/svg%3E" />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

<style>
:root {
  --ink: #14201a;
  --green: #184d2e;
  --green-deep: #0f3a21;
  --green-mid: #2e7a4b;
  --tint: #e6f2ea;
  --tint-2: #cfe6d6;
  --tint-3: #a9d1b6;
  --pale: #f3f8f5;
  --red: #d63a2f;
  --red-deep: #8a1f17;
  --sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --wrap: 1180px;
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: var(--sans);
  font-size: 17px;
  line-height: 1.55;
  color: var(--ink);
  background: #fff;
  overflow-x: hidden;
}
h1, h2, h3 { margin: 0; font-weight: 700; color: var(--ink); line-height: 1.1; letter-spacing: -0.01em; }
p { margin: 0; }
a { color: var(--green); }
code, pre { font-family: var(--mono); }
p code, li code, dd code, .val code, .btn code { font-size: 0.92em; background: var(--tint); color: var(--ink); padding: 1px 5px; }
ul, ol { margin: 0; padding: 0; list-style: none; }

.wrap { width: 100%; max-width: var(--wrap); margin: 0 auto; padding: 0 24px; }
.skip {
  position: absolute; left: 8px; top: -60px; z-index: 30;
  background: var(--green); color: #fff; padding: 10px 14px; font-weight: 600;
}
.skip:focus { top: 8px; }

/* buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 44px; padding: 0 18px; font-weight: 600; font-size: 16px;
  text-decoration: none; border: 2px solid var(--green); border-radius: 3px;
  white-space: nowrap;
}
.btn-solid { background: var(--green); color: #fff; }
.btn-line { background: #fff; color: var(--green); }
.btn-white { background: #fff; color: var(--green); border-color: #fff; }
.btn code { background: transparent; padding: 0; color: inherit; margin-left: 0.3em; }

/* menu, stuck to the top */
.menu { position: sticky; top: 0; z-index: 20; border-bottom: 1px solid var(--tint-2); background: #fff; }
.menu-row { display: flex; align-items: center; justify-content: space-between; min-height: 64px; gap: 16px; }
.wordmark {
  display: inline-flex; align-items: center; gap: 8px; min-height: 44px;
  text-decoration: none; color: var(--ink); font-weight: 800; font-size: 22px; letter-spacing: -0.02em;
}
.menu-links { display: flex; align-items: center; gap: 6px; }
.menu-links a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; text-decoration: none; color: var(--ink); font-weight: 600; font-size: 16px; }
.menu-links .btn { color: #fff; margin-left: 6px; }

/* hero */
.hero { padding: 40px 0 44px; }
.hero-grid { display: grid; grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr); gap: 48px; align-items: start; }
.eyebrow { font-weight: 600; font-size: 15px; color: var(--green); letter-spacing: 0.02em; margin-bottom: 14px; }
h1 { font-size: 50px; font-weight: 800; letter-spacing: -0.03em; text-wrap: balance; line-height: 1.05; }
.lead { font-size: 18px; line-height: 1.55; margin-top: 20px; max-width: 34em; }
.no-account { margin-top: 12px; font-size: 16px; line-height: 1.5; color: var(--ink); }
.no-account strong { color: var(--green); }
.no-account a { font-weight: 600; text-underline-offset: 3px; }

/* command box */
.cmdbox { margin-top: 28px; background: var(--green); color: #fff; border-radius: 4px; overflow: hidden; max-width: 100%; min-width: 0; }
.cmdbox-row > * { min-width: 0; max-width: 100%; }
.cmdbox-tabs { display: flex; gap: 0; background: var(--green-deep); padding: 0 6px; }
.tab { display: inline-block; padding: 9px 12px; font-size: 13px; font-weight: 600; color: #d8ecdf; font-family: var(--mono); white-space: nowrap; }
.tab-on { color: #fff; background: var(--green); margin-top: 4px; }
.cmdbox-row { display: flex; align-items: center; gap: 12px; padding: 10px 10px 10px 18px; }
.cmd { margin: 0; flex: 1 1 auto; min-width: 0; max-width: 100%; width: 100%; overflow-x: auto; font-size: 15px; line-height: 1.6; color: #fff; }
.cmd code { white-space: pre; }
.prompt { color: #d8ecdf; }
.copy {
  flex: 0 0 auto; min-height: 44px; padding: 0 16px; border: 0; border-radius: 3px;
  background: #fff; color: var(--green); font: 600 15px var(--sans); cursor: pointer; white-space: nowrap;
}

/* hero result */
.result { position: relative; margin-top: 26px; background: var(--tint); border: 2px solid var(--green); border-radius: 3px; padding: 22px 20px 18px; }
.kicker { font-size: 15px; font-weight: 700; letter-spacing: 0.01em; color: var(--green); }
.url {
  display: block; margin-top: 10px; font-family: var(--mono); font-weight: 700; font-size: 22px;
  color: var(--ink); text-decoration: underline; text-decoration-color: var(--green); text-underline-offset: 5px;
  overflow-wrap: anywhere; line-height: 1.3;
}
.result-exp { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 16px; font-weight: 600; font-family: var(--mono); }

/* hero scenes */
.hero-scenes { display: grid; gap: 22px; }
.scene { position: relative; margin: 0; border: 2px solid var(--green); border-radius: 3px; overflow: hidden; background: #fff; }
.scene svg { display: block; width: 100%; height: auto; }
.scene-tag {
  position: absolute; top: 0; left: 0; z-index: 1;
  background: var(--green); color: #fff; font-weight: 700; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase;
  padding: 5px 10px; border-radius: 0 0 3px 0;
}
.scene-tag-after { background: #b3281e; }
.scene figcaption { padding: 10px 14px 12px; font-size: 16px; font-weight: 600; border-top: 2px solid var(--green); background: var(--pale); }
.stamp { font-family: var(--mono); font-size: 3.1px; font-weight: 700; fill: #fff; }
.stamp-url { font-size: 2.25px; }

/* facts line */
.facts { background: var(--green); color: #fff; }
.facts p { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 0; padding: 14px 0; font-size: 16px; font-weight: 600; }
.facts span { padding: 0 14px; border-left: 2px solid #d8ecdf; line-height: 1.3; white-space: nowrap; }
.facts span:first-child { border-left: 0; }

/* strip */
.strip { background: var(--tint); padding: 44px 0 48px; }
.strip-title { font-size: 28px; margin-bottom: 24px; letter-spacing: -0.02em; }
.sheets { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
.sheet { background: #fff; border: 2px solid var(--green); border-radius: 3px; padding: 18px 16px 16px; min-width: 0; }
.sheet svg { display: block; width: 96px; height: 96px; margin: 0 auto 12px; }
.sheet h3 { font-size: 18px; text-align: center; margin-bottom: 8px; }
.sheet > code { display: block; font-size: 13px; line-height: 1.5; color: var(--ink); overflow-wrap: anywhere; padding: 6px 8px; }
.sheet-note { margin-top: 6px; font-size: 14px; font-weight: 600; color: var(--green); }

/* section titles */
section h2 { font-size: 38px; letter-spacing: -0.025em; }
.sub-h2 { font-size: 19px; margin-top: 10px; }

/* how it works */
.how { padding: 72px 0 24px; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 40px; }
.step { position: relative; border: 2px solid var(--green); border-radius: 3px; background: var(--pale); padding: 28px 20px 22px; min-width: 0; }
.step-no { display: inline-block; font-family: var(--mono); font-weight: 700; font-size: 15px; color: #fff; background: var(--green); padding: 3px 9px; margin-bottom: 12px; }
.step h3 { font-size: 21px; line-height: 1.2; text-wrap: balance; }
.step p { margin-top: 10px; font-size: 16px; line-height: 1.55; }
.step .mini { margin-top: 12px; }

/* ticket */
.ticket { padding: 72px 0 24px; }
.ticket-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.25fr); gap: 40px; margin-top: 32px; align-items: start; }
.lamps { border: 2px solid var(--green); border-radius: 3px; padding: 6px 18px; }
.lamps li { display: grid; grid-template-columns: 14px 88px 1fr; gap: 14px; align-items: center; padding: 11px 0; border-bottom: 1px solid var(--tint-2); font-size: 16px; }
.lamps li:last-child { border-bottom: 0; }
.lamp { width: 14px; height: 14px; flex: 0 0 14px; display: inline-block; background: var(--green-mid); box-shadow: inset 0 0 0 3px #fff, inset 0 0 0 7px var(--green-mid); }
.lamp-sent { background: var(--green-mid); }
.lamp-transit { background: var(--tint-3); box-shadow: inset 0 0 0 3px #fff, inset 0 0 0 7px var(--tint-3); }
.lamp-arrived { background: var(--green); box-shadow: inset 0 0 0 3px #fff, inset 0 0 0 7px var(--green); }
.lamp-expires { background: var(--red); box-shadow: inset 0 0 0 3px #fff, inset 0 0 0 7px var(--red); }
.lamp-k { font-weight: 600; color: var(--green); }
.lamp-v { font-family: var(--mono); font-size: 15px; }

.sub { font-size: 16px; margin-top: 4px; }
.capsule { margin-top: 28px; }
.files { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 16px; }
.files td { padding: 9px 0; border-bottom: 1px solid var(--tint-2); vertical-align: middle; }
.files td code { font-size: 15px; background: none; padding: 0; }
.files .num { text-align: right; font-family: var(--mono); font-size: 15px; white-space: nowrap; }
.files td:last-child { width: 56px; text-align: right; }
.files tfoot td { font-weight: 600; border-bottom: 0; }
.root { display: inline-block; font-size: 12px; font-weight: 700; color: #fff; background: var(--green); padding: 2px 7px; }
.note { margin-top: 16px; font-size: 16px; line-height: 1.55; }

.arrival { position: relative; background: var(--tint); border: 2px solid var(--green); border-radius: 3px; padding: 26px 22px 24px; }
.arrival .url { margin-top: 14px; font-size: 24px; }
.jsonbox { margin-top: 24px; background: var(--green); color: #fff; border-radius: 4px; overflow: hidden; }
.jsonbox { max-width: 100%; min-width: 0; }
.jsonbox pre { margin: 0; padding: 16px 18px; font-size: 14px; line-height: 1.6; overflow-x: auto; max-width: 100%; }
.jsonbox .k { color: #d8ecdf; }
.jsonbox .s { color: #fff; }
.jsonbox .n { color: #fff; }

/* pixel pin (CSS) */
.pin {
  position: absolute; top: -9px; left: 50%; width: 16px; height: 20px; margin-left: -8px;
  background:
    linear-gradient(var(--red), var(--red)) 0 0 / 16px 8px no-repeat,
    linear-gradient(var(--red-deep), var(--red-deep)) 4px 8px / 8px 4px no-repeat,
    linear-gradient(var(--green), var(--green)) 6px 12px / 4px 8px no-repeat;
}

/* rating plates */
.plates-section { padding: 72px 0 24px; }
.board {
  display: grid; grid-template-columns: 150px repeat(3, 1fr); gap: 0 16px;
  grid-template-rows: auto auto repeat(7, auto) auto;
  margin-top: 44px; align-items: stretch;
}
.labels, .plate { display: grid; grid-row: 1 / -1; grid-template-rows: subgrid; }
.labels .cell { padding: 10px 0; border-bottom: 1px solid var(--tint-2); font-size: 15px; font-weight: 600; color: var(--green); display: flex; align-items: center; }
.labels .head, .labels .price, .labels .foot { border-bottom: 0; }
.plate { position: relative; border: 2px solid var(--green); border-radius: 3px; background: #fff; }
.plate-mid { background: var(--tint); }
.usual {
  position: absolute; top: -15px; left: 16px; background: var(--green); color: #fff;
  font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 5px 10px; border-radius: 3px;
}
.plate .cell { padding: 10px 18px; border-bottom: 1px solid var(--tint-2); display: flex; flex-direction: column; justify-content: center; font-size: 16px; }
.plate .cell .lab { display: none; }
.plate .head { padding-top: 20px; border-bottom: 0; }
.plate .head h3 { font-size: 24px; }
.plate .price { padding-bottom: 16px; }
.plate .price strong { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
.plate .price span { font-size: 15px; font-weight: 600; color: var(--green); }
.plate .foot { padding: 18px 14px 20px; border-bottom: 0; }
.plate .foot .btn { display: flex; width: 100%; white-space: nowrap; text-align: center; padding: 0 10px; font-size: 15px; }

/* questions */
.faq { padding: 72px 0 24px; }
.qa { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 36px 0 0; }
.q { border: 2px solid var(--green); border-radius: 3px; padding: 22px 22px 20px; background: #fff; min-width: 0; }
.q:nth-child(odd) { background: var(--pale); }
.q:last-child { grid-column: 1 / -1; }
.q dt { font-size: 21px; font-weight: 700; letter-spacing: -0.01em; }
.q dd { margin: 10px 0 0; font-size: 16px; line-height: 1.55; }

/* operating notes, compact rows */
.notes { padding: 72px 0 80px; }
.rows { margin-top: 36px; border-top: 2px solid var(--green); }
.row { display: grid; grid-template-columns: 44px minmax(0, 1fr) minmax(0, 1fr); gap: 16px 20px; align-items: center; padding: 18px 0; border-bottom: 1px solid var(--tint-2); }
.row .no { font-family: var(--mono); font-weight: 700; font-size: 16px; color: var(--green); }
.row h3 { font-size: 18px; }
.row p { margin-top: 4px; font-size: 16px; line-height: 1.5; }
.mini { margin: 0; background: var(--green); color: #fff; padding: 12px 14px; font-size: 13.5px; line-height: 1.6; overflow-x: auto; border-radius: 3px; }
.mini code { white-space: pre-wrap; overflow-wrap: anywhere; background: transparent; color: inherit; padding: 0; font-size: inherit; }
.links { display: flex; flex-wrap: wrap; gap: 8px 18px; }
.links a { display: inline-flex; align-items: center; min-height: 44px; font-weight: 600; color: var(--green); text-underline-offset: 4px; }

/* final band */
.band { background: var(--green); color: #fff; padding: 64px 0 68px; }
.band h2 { color: #fff; }
.band-sub { margin-top: 10px; font-size: 19px; color: #fff; }
.band-row { display: flex; align-items: center; gap: 16px; margin-top: 30px; flex-wrap: wrap; }
.cmdbox-band { flex: 1 1 520px; margin: 0; background: var(--green-deep); min-width: 0; max-width: 100%; }
.band .btn-white { flex: 0 0 auto; }

/* footer */
.site-foot { background: var(--green-deep); color: #fff; padding: 36px 0 28px; }
.foot-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 24px; }
.wordmark-light { color: #fff; }
.foot-links { display: flex; flex-wrap: wrap; gap: 4px 6px; }
.foot-links a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 10px; color: #fff; font-weight: 600; text-decoration: none; font-size: 16px; }
.foot-line { margin-top: 14px; }
.foot-line p { font-size: 14px; color: #fff; line-height: 1.6; }

/* ---------- 390 ---------- */
@media (max-width: 900px) {
  .hero-grid { grid-template-columns: 1fr; gap: 36px; }
  .sheets { grid-template-columns: repeat(3, 1fr); }
  .steps { grid-template-columns: 1fr; gap: 26px; }
  .ticket-grid { grid-template-columns: 1fr; }
  .board { grid-template-columns: 1fr; grid-template-rows: none; gap: 30px; }
  .labels { display: none; }
  .plate { grid-row: auto; grid-template-rows: none; }
  .plate .cell .lab { display: block; font-size: 14px; font-weight: 600; color: var(--green); }
  .qa { grid-template-columns: 1fr; }
  .row { grid-template-columns: 44px minmax(0, 1fr); }
  .row .mini, .row .links { grid-column: 2; }
}
@media (max-width: 600px) {
  body { font-size: 16px; }
  .wrap { padding: 0 18px; }
  .menu-row { min-height: 60px; }
  .wordmark { font-size: 20px; }
  .menu-links a { padding: 0 9px; font-size: 15px; }
  .menu-links .btn { padding: 0 14px; margin-left: 2px; }
  .hero { padding: 28px 0 40px; }
  h1 { font-size: 36px; }
  .lead { font-size: 17px; margin-top: 16px; }
  .cmdbox-row { flex-direction: column; align-items: stretch; padding: 10px 12px 12px; }
  .cmd { font-size: 14px; }
  .copy { width: 100%; }
  .cmdbox-tabs { overflow-x: auto; }
  .tab { font-size: 12px; padding: 9px 10px; }
  .url { font-size: 19px; }
  .arrival .url { font-size: 19px; }
  .result-exp { font-size: 15px; }
  .scene figcaption { font-size: 15px; }
  .facts p { flex-direction: column; align-items: center; gap: 4px; padding: 12px 0; font-size: 15px; }
  .facts span { border-left: 0; padding: 0; white-space: normal; text-align: center; }
  .strip { padding: 36px 0; }
  .strip-title { font-size: 24px; }
  .sheets { grid-template-columns: 1fr 1fr; gap: 12px; }
  .sheet { padding: 14px 12px 12px; }
  .sheet svg { width: 72px; height: 72px; }
  .sheet h3 { font-size: 17px; }
  .sheet > code { font-size: 12px; }
  .sheet:last-child { grid-column: 1 / -1; }
  section h2 { font-size: 30px; }
  .sub-h2 { font-size: 17px; }
  .how, .ticket, .plates-section, .faq, .notes { padding-top: 52px; }
  .steps { margin-top: 32px; }
  .step h3 { font-size: 19px; }
  .lamps { padding: 4px 14px; }
  .lamps li { grid-template-columns: 14px 84px 1fr; gap: 10px; font-size: 15px; }
  .lamp-v { font-size: 14px; }
  .jsonbox pre { font-size: 13px; }
  .board { gap: 34px; }
  .plate .cell { padding: 10px 16px; }
  .plate .foot .btn { white-space: normal; min-height: 48px; padding: 8px 10px; line-height: 1.3; }
  .q { padding: 18px 16px 16px; }
  .q dt { font-size: 19px; }
  .row { grid-template-columns: 36px minmax(0, 1fr); gap: 12px 12px; padding: 16px 0; }
  .band { padding: 48px 0 52px; }
  .band-sub { font-size: 17px; }
  .band-row { flex-direction: column; align-items: stretch; }
  .cmdbox-band { flex-basis: auto; width: 100%; }
  .cmd code { white-space: pre-wrap; overflow-wrap: anywhere; }
  .band-row, .ticket-right, .ticket-left { min-width: 0; max-width: 100%; }
  .band .btn-white { width: 100%; }
}

/* grid children never widen the page */
.hero-text, .hero-scenes, .scene, .ticket-left, .ticket-right, .plate, .labels, .sheet, .step, .q, .row, .row-text { min-width: 0; }
</style>
${analytics}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<header class="menu">
  <div class="wrap menu-row">
    <a class="wordmark" href="/" aria-label="vanish">
      <svg class="pin-mark" viewBox="0 0 8 8" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true">
        <rect x="1" y="0" width="6" height="3" fill="#d63a2f"/>
        <rect x="2" y="3" width="4" height="1" fill="#8a1f17"/>
        <rect x="3" y="4" width="2" height="2" fill="#184d2e"/>
        <rect x="3.5" y="6" width="1" height="2" fill="#184d2e"/>
      </svg>
      <span>vanish</span>
    </a>
    <nav class="menu-links" aria-label="Site">
      <a href="https://github.com/The-Vibe-Company/vanish">GitHub</a>
      <a href="/dashboard">Dashboard</a>
      <a class="btn btn-solid" href="/auth/github?redirect=/dashboard">Sign in</a>
    </nav>
  </div>
</header>

<main id="main">

<!-- HERO: before / after -->
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-text">
      <p class="eyebrow">The publish command your agent was missing.</p>
      <h1>A public URL for anything your agent makes. It expires on its own.</h1>
      <p class="lead">A photo, an image, a text, a file, a whole website: your agent can make them, but it cannot hand any of them to another person. One command gives it a public URL to send, and the URL expires on its own.</p>

      <div class="cmdbox" id="command">
        <div class="cmdbox-tabs">
          <span class="tab tab-on">Publish a folder</span>
          <span class="tab">Any folder, any machine</span>
        </div>
        <div class="cmdbox-row">
          <pre class="cmd"><code><span class="prompt">$</span> npx vanish-cli site ./demo --root index.html</code></pre>
          <button type="button" class="copy" data-copy="npx vanish-cli site ./demo --root index.html">Copy command</button>
        </div>
      </div>
      <p class="no-account"><strong>No account needed to try.</strong> Anonymous links last 24 hours. <a href="/auth/github?redirect=/dashboard">Sign in with GitHub</a> for 48 hours and every file type.</p>

      <div class="result">
        <span class="pin" aria-hidden="true"></span>
        <p class="kicker">What comes back · Public to anyone with the link</p>
        <a class="url" href="https://quiet-river-42.vanish.sh/">https://quiet-river-42.vanish.sh/</a>
        <p class="result-exp"><span class="lamp lamp-expires" aria-hidden="true"></span>Expires 2026-10-30 17:58 UTC</p>
      </div>
    </div>

    <div class="hero-scenes">
      <figure class="scene">
        <span class="scene-tag">Before</span>
        <svg viewBox="0 0 120 64" shape-rendering="crispEdges" role="img" aria-label="A developer at a desk holds a sheet the agent just made; the door beside them is empty">
          <rect width="120" height="64" fill="#f3f8f5"/>
          <rect x="0" y="52" width="120" height="12" fill="#cfe6d6"/>
          <rect x="0" y="52" width="120" height="1" fill="#a9d1b6"/>
          <!-- door, nobody in it -->
          <rect x="4" y="16" width="18" height="36" fill="#184d2e"/>
          <rect x="6" y="18" width="14" height="34" fill="#e6f2ea"/>
          <rect x="17" y="34" width="2" height="2" fill="#184d2e"/>
          <!-- window -->
          <rect x="100" y="8" width="18" height="18" fill="#184d2e"/>
          <rect x="102" y="10" width="14" height="14" fill="#e6f2ea"/>
          <rect x="108" y="10" width="2" height="14" fill="#184d2e"/>
          <rect x="102" y="16" width="14" height="2" fill="#184d2e"/>
          <!-- chair -->
          <rect x="27" y="26" width="3" height="26" fill="#184d2e"/>
          <rect x="27" y="40" width="16" height="2" fill="#184d2e"/>
          <rect x="33" y="42" width="3" height="10" fill="#184d2e"/>
          <!-- developer, seated -->
          <rect x="32" y="20" width="7" height="2" fill="#14201a"/>
          <rect x="32" y="22" width="7" height="6" fill="#f2d6c0"/>
          <rect x="32" y="22" width="2" height="2" fill="#14201a"/>
          <rect x="30" y="28" width="11" height="12" fill="#2e7a4b"/>
          <rect x="41" y="40" width="8" height="3" fill="#14201a"/>
          <rect x="47" y="43" width="3" height="9" fill="#14201a"/>
          <rect x="47" y="51" width="6" height="1" fill="#14201a"/>
          <rect x="41" y="32" width="8" height="2" fill="#2e7a4b"/>
          <rect x="49" y="31" width="3" height="3" fill="#f2d6c0"/>
          <!-- the sheet the agent made -->
          <rect x="50" y="20" width="16" height="20" fill="#184d2e"/>
          <rect x="51" y="21" width="14" height="18" fill="#ffffff"/>
          <rect x="53" y="24" width="8" height="1" fill="#14201a"/>
          <g fill="#5aa06f"><rect x="53" y="27" width="10" height="1"/><rect x="53" y="30" width="7" height="1"/><rect x="53" y="33" width="10" height="1"/><rect x="53" y="36" width="5" height="1"/></g>
          <!-- question mark -->
          <g fill="#d63a2f"><rect x="55" y="6" width="8" height="2"/><rect x="61" y="8" width="2" height="2"/><rect x="59" y="10" width="2" height="2"/><rect x="58" y="12" width="2" height="2"/><rect x="58" y="16" width="2" height="2"/></g>
          <!-- desk -->
          <rect x="44" y="44" width="54" height="3" fill="#184d2e"/>
          <rect x="47" y="47" width="3" height="5" fill="#184d2e"/>
          <rect x="92" y="47" width="3" height="5" fill="#184d2e"/>
          <!-- monitor with the agent's terminal -->
          <rect x="68" y="24" width="28" height="18" fill="#184d2e"/>
          <rect x="70" y="26" width="24" height="13" fill="#0f3a21"/>
          <g fill="#5aa06f"><rect x="72" y="28" width="2" height="1"/><rect x="75" y="28" width="12" height="1"/><rect x="72" y="31" width="16" height="1"/><rect x="72" y="34" width="9" height="1"/></g>
          <rect x="82" y="34" width="3" height="2" fill="#ffffff"/>
          <rect x="80" y="42" width="4" height="2" fill="#184d2e"/>
        </svg>
        <figcaption>Your agent made it. There is nobody to give it to.</figcaption>
      </figure>

      <figure class="scene">
        <span class="scene-tag scene-tag-after">After</span>
        <svg viewBox="0 0 120 64" shape-rendering="crispEdges" role="img" aria-label="The same sheet pinned on the town notice board with its URL and the date it comes down; people pass by and one points at it">
          <rect width="120" height="64" fill="#ffffff"/>
          <rect x="0" y="50" width="120" height="14" fill="#cfe6d6"/>
          <rect x="0" y="50" width="120" height="1" fill="#a9d1b6"/>
          <!-- lamppost -->
          <rect x="9" y="24" width="2" height="26" fill="#14201a"/>
          <rect x="7" y="20" width="6" height="4" fill="#184d2e"/>
          <!-- tree -->
          <rect x="110" y="36" width="3" height="14" fill="#184d2e"/>
          <rect x="104" y="22" width="15" height="14" fill="#2e7a4b"/>
          <rect x="107" y="17" width="9" height="5" fill="#2e7a4b"/>
          <!-- town board -->
          <rect x="18" y="3" width="84" height="3" fill="#0f3a21"/>
          <rect x="20" y="6" width="80" height="35" fill="#184d2e"/>
          <rect x="23" y="9" width="74" height="29" fill="#a9d1b6"/>
          <rect x="26" y="41" width="3" height="9" fill="#184d2e"/>
          <rect x="91" y="41" width="3" height="9" fill="#184d2e"/>
          <g fill="#8fc4a1"><rect x="25" y="34" width="2" height="2"/><rect x="60" y="11" width="2" height="2"/><rect x="94" y="36" width="2" height="2"/><rect x="38" y="12" width="2" height="2"/></g>
          <!-- other notices -->
          <rect x="26" y="13" width="12" height="10" fill="#e6f2ea"/>
          <g fill="#2e7a4b"><rect x="28" y="16" width="8" height="1"/><rect x="28" y="18" width="6" height="1"/><rect x="28" y="20" width="8" height="1"/></g>
          <rect x="30" y="11" width="4" height="3" fill="#d63a2f"/><rect x="31" y="14" width="2" height="2" fill="#8a1f17"/>
          <rect x="83" y="12" width="11" height="12" fill="#ffffff"/>
          <rect x="85" y="19" width="2" height="3" fill="#5aa06f"/><rect x="88" y="16" width="2" height="6" fill="#2e7a4b"/><rect x="91" y="18" width="2" height="4" fill="#184d2e"/>
          <rect x="86" y="10" width="4" height="3" fill="#d63a2f"/><rect x="87" y="13" width="2" height="2" fill="#8a1f17"/>
          <!-- the same sheet, pinned -->
          <rect x="41" y="11" width="38" height="24" fill="#184d2e"/>
          <rect x="42" y="12" width="36" height="22" fill="#ffffff"/>
          <rect x="45" y="16" width="10" height="1" fill="#14201a"/>
          <g fill="#5aa06f"><rect x="45" y="19" width="14" height="1"/><rect x="45" y="22" width="10" height="1"/><rect x="45" y="25" width="12" height="1"/></g>
          <rect x="63" y="15" width="12" height="4" fill="#d63a2f"/>
          <text x="64.2" y="18.2" class="stamp">10-30</text>
          <rect x="44" y="28" width="34" height="4" fill="#184d2e"/>
          <text x="44.9" y="31.1" class="stamp stamp-url">quiet-river-42.vanish.sh</text>
          <rect x="58" y="9" width="4" height="3" fill="#d63a2f"/><rect x="59" y="12" width="2" height="2" fill="#8a1f17"/>
          <!-- people -->
          <rect x="34" y="30" width="6" height="2" fill="#14201a"/>
          <rect x="34" y="32" width="6" height="5" fill="#f2d6c0"/>
          <rect x="33" y="37" width="8" height="8" fill="#2e7a4b"/>
          <rect x="34" y="45" width="2" height="5" fill="#14201a"/><rect x="38" y="45" width="2" height="5" fill="#14201a"/>
          <rect x="44" y="36" width="4" height="2" fill="#14201a"/>
          <rect x="44" y="38" width="4" height="4" fill="#f2d6c0"/>
          <rect x="43" y="42" width="6" height="5" fill="#d63a2f"/>
          <rect x="44" y="47" width="1" height="3" fill="#14201a"/><rect x="47" y="47" width="1" height="3" fill="#14201a"/>
          <rect x="80" y="30" width="6" height="2" fill="#14201a"/>
          <rect x="80" y="32" width="6" height="5" fill="#f2d6c0"/>
          <rect x="79" y="37" width="8" height="8" fill="#184d2e"/>
          <rect x="76" y="38" width="3" height="2" fill="#184d2e"/><rect x="73" y="36" width="3" height="2" fill="#184d2e"/><rect x="71" y="34" width="2" height="2" fill="#f2d6c0"/>
          <rect x="80" y="45" width="2" height="5" fill="#14201a"/><rect x="84" y="45" width="2" height="5" fill="#14201a"/>
          <rect x="98" y="30" width="6" height="2" fill="#14201a"/>
          <rect x="98" y="32" width="6" height="5" fill="#f2d6c0"/>
          <rect x="97" y="37" width="8" height="8" fill="#5aa06f"/>
          <rect x="94" y="40" width="3" height="5" fill="#184d2e"/>
          <rect x="98" y="45" width="2" height="5" fill="#14201a"/><rect x="102" y="45" width="2" height="5" fill="#14201a"/>
        </svg>
        <figcaption>Pinned at a public URL, with the day it comes down. Everyone with the link sees it.</figcaption>
      </figure>
    </div>
  </div>
</section>

<!-- TRUST LINE -->
<div class="facts" aria-label="Facts">
  <div class="wrap">
    <p><span>Open source</span><span>MIT</span><span>Runs on Cloudflare Workers, R2 and D1</span><span>No build step</span><span>Nothing transformed</span></p>
  </div>
</div>

<!-- WHAT GOES THROUGH -->
<section class="strip">
  <div class="wrap">
    <h2 class="strip-title">What goes through</h2>
    <ul class="sheets">
      <li class="sheet">
        <svg viewBox="0 0 40 40" shape-rendering="crispEdges" aria-hidden="true">
          <rect x="3" y="5" width="34" height="32" fill="#184d2e"/><rect x="4" y="6" width="32" height="30" fill="#ffffff"/>
          <rect x="7" y="9" width="26" height="18" fill="#cfe6d6"/><rect x="26" y="11" width="3" height="3" fill="#ffffff"/>
          <rect x="7" y="21" width="26" height="6" fill="#5aa06f"/><rect x="12" y="18" width="10" height="3" fill="#2e7a4b"/><rect x="7" y="23" width="26" height="4" fill="#2e7a4b"/>
          <rect x="9" y="16" width="2" height="5" fill="#184d2e"/><rect x="7" y="30" width="12" height="2" fill="#a9d1b6"/>
          <rect x="18" y="3" width="4" height="3" fill="#d63a2f"/><rect x="19" y="6" width="2" height="2" fill="#8a1f17"/>
        </svg>
        <h3>Photo</h3>
        <code>npx vanish-cli upload photo.jpg</code>
      </li>
      <li class="sheet">
        <svg viewBox="0 0 40 40" shape-rendering="crispEdges" aria-hidden="true">
          <rect x="3" y="5" width="34" height="32" fill="#184d2e"/><rect x="4" y="6" width="32" height="30" fill="#ffffff"/>
          <rect x="7" y="9" width="12" height="2" fill="#184d2e"/>
          <rect x="8" y="20" width="4" height="10" fill="#5aa06f"/><rect x="14" y="13" width="4" height="17" fill="#2e7a4b"/><rect x="20" y="16" width="4" height="14" fill="#5aa06f"/><rect x="26" y="10" width="4" height="20" fill="#184d2e"/>
          <rect x="7" y="30" width="26" height="1" fill="#184d2e"/>
          <rect x="18" y="3" width="4" height="3" fill="#d63a2f"/><rect x="19" y="6" width="2" height="2" fill="#8a1f17"/>
        </svg>
        <h3>Image</h3>
        <code>npx vanish-cli upload chart.png</code>
      </li>
      <li class="sheet">
        <svg viewBox="0 0 40 40" shape-rendering="crispEdges" aria-hidden="true">
          <rect x="3" y="5" width="34" height="32" fill="#184d2e"/><rect x="4" y="6" width="32" height="30" fill="#e6f2ea"/>
          <rect x="7" y="10" width="18" height="3" fill="#184d2e"/>
          <g fill="#2e7a4b"><rect x="7" y="16" width="26" height="1"/><rect x="7" y="19" width="22" height="1"/><rect x="7" y="22" width="26" height="1"/><rect x="7" y="25" width="16" height="1"/><rect x="7" y="28" width="24" height="1"/><rect x="7" y="31" width="12" height="1"/></g>
          <rect x="18" y="3" width="4" height="3" fill="#d63a2f"/><rect x="19" y="6" width="2" height="2" fill="#8a1f17"/>
        </svg>
        <h3>Text</h3>
        <code>npx vanish-cli upload notes.md</code>
      </li>
      <li class="sheet">
        <svg viewBox="0 0 40 40" shape-rendering="crispEdges" aria-hidden="true">
          <rect x="3" y="5" width="34" height="32" fill="#184d2e"/><rect x="4" y="6" width="24" height="30" fill="#ffffff"/><rect x="28" y="14" width="8" height="22" fill="#ffffff"/><rect x="28" y="6" width="8" height="8" fill="#cfe6d6"/>
          <rect x="7" y="17" width="26" height="3" fill="#184d2e"/>
          <g fill="#5aa06f"><rect x="7" y="23" width="22" height="2"/><rect x="7" y="27" width="18" height="2"/><rect x="7" y="31" width="24" height="2"/></g>
          <rect x="18" y="3" width="4" height="3" fill="#d63a2f"/><rect x="19" y="6" width="2" height="2" fill="#8a1f17"/>
        </svg>
        <h3>Files</h3>
        <code>npx vanish-cli upload report.pdf</code>
        <p class="sheet-note">once signed in</p>
      </li>
      <li class="sheet">
        <svg viewBox="0 0 40 40" shape-rendering="crispEdges" aria-hidden="true">
          <rect x="3" y="5" width="34" height="32" fill="#184d2e"/><rect x="4" y="6" width="32" height="30" fill="#ffffff"/>
          <rect x="4" y="6" width="32" height="5" fill="#184d2e"/>
          <g fill="#cfe6d6"><rect x="6" y="8" width="1" height="1"/><rect x="8" y="8" width="1" height="1"/><rect x="10" y="8" width="1" height="1"/></g>
          <rect x="13" y="7" width="20" height="3" fill="#2e7a4b"/>
          <rect x="7" y="14" width="14" height="3" fill="#184d2e"/><rect x="7" y="19" width="16" height="2" fill="#5aa06f"/><rect x="7" y="23" width="8" height="4" fill="#184d2e"/>
          <rect x="24" y="14" width="9" height="13" fill="#cfe6d6"/><rect x="25" y="21" width="7" height="5" fill="#5aa06f"/><rect x="30" y="16" width="2" height="2" fill="#ffffff"/>
          <g fill="#5aa06f"><rect x="7" y="30" width="26" height="1"/><rect x="7" y="33" width="18" height="1"/></g>
          <rect x="18" y="3" width="4" height="3" fill="#d63a2f"/><rect x="19" y="6" width="2" height="2" fill="#8a1f17"/>
        </svg>
        <h3>Website</h3>
        <code>npx vanish-cli site ./demo --root index.html</code>
      </li>
    </ul>
  </div>
</section>

<!-- HOW IT WORKS -->
<section class="how">
  <div class="wrap">
    <h2>How it works</h2>
    <p class="sub-h2">Three steps, and the third one happens on its own.</p>
    <ol class="steps">
      <li class="step">
        <span class="pin" aria-hidden="true"></span>
        <span class="step-no">1</span>
        <h3>Your agent makes something.</h3>
        <p>A site, a report, a deck, a prototype, a screenshot. Any folder or file, on any machine.</p>
      </li>
      <li class="step">
        <span class="pin" aria-hidden="true"></span>
        <span class="step-no">2</span>
        <h3>One command.</h3>
        <p>Run it yourself or let the agent run it: three skills ship with the CLI. No account needed to try.</p>
        <pre class="mini"><code><span class="prompt">$</span> npx vanish-cli site ./demo --root index.html</code></pre>
      </li>
      <li class="step">
        <span class="pin" aria-hidden="true"></span>
        <span class="step-no">3</span>
        <h3>Everyone with the link sees it, until it expires.</h3>
        <p>24 hours anonymous, 48 hours signed in, 30 days on Pro. A site you own takes new files at the same URL.</p>
      </li>
    </ol>
  </div>
</section>

<!-- ONE COMMAND IN, ONE URL OUT -->
<section class="ticket">
  <div class="wrap">
    <h2>One command in, one URL out</h2>
    <div class="ticket-grid">
      <div class="ticket-left">
        <ul class="lamps" aria-label="Status">
          <li><span class="lamp lamp-sent" aria-hidden="true"></span><span class="lamp-k">Sent</span><span class="lamp-v">17:58:00 UTC</span></li>
          <li><span class="lamp lamp-transit" aria-hidden="true"></span><span class="lamp-k">In transit</span><span class="lamp-v">4 files, 12.0 KB</span></li>
          <li><span class="lamp lamp-arrived" aria-hidden="true"></span><span class="lamp-k">Arrived</span><span class="lamp-v">quiet-river-42</span></li>
          <li><span class="lamp lamp-expires" aria-hidden="true"></span><span class="lamp-k">Expires</span><span class="lamp-v">2026-10-30 17:58 UTC</span></li>
        </ul>

        <div class="capsule">
          <h3 class="kicker">What was sent · ./demo</h3>
          <p class="sub">Files in the folder sent</p>
          <table class="files">
            <tbody>
              <tr><td><code>index.html</code></td><td class="num">4,812 B</td><td><span class="root">root</span></td></tr>
              <tr><td><code>styles.css</code></td><td class="num">2,140 B</td><td></td></tr>
              <tr><td><code>app.js</code></td><td class="num">3,377 B</td><td></td></tr>
              <tr><td><code>chart.svg</code></td><td class="num">1,906 B</td><td></td></tr>
            </tbody>
            <tfoot>
              <tr><td>4 files</td><td class="num">12,235 B</td><td></td></tr>
            </tfoot>
          </table>
          <p class="note">Nothing is transformed. HTML is served as HTML, Markdown as Markdown, assets as static files. No build step, no server code.</p>
        </div>
      </div>

      <div class="ticket-right">
        <div class="arrival">
          <span class="pin" aria-hidden="true"></span>
          <h3 class="kicker">What came back</h3>
          <p class="sub">Public to anyone with the link</p>
          <a class="url" href="https://quiet-river-42.vanish.sh/">https://quiet-river-42.vanish.sh/</a>
        </div>

        <div class="jsonbox">
          <div class="cmdbox-tabs"><span class="tab tab-on">Answer with --json</span></div>
<pre><code>{
  <span class="k">"url"</span>: <span class="s">"https://quiet-river-42.vanish.sh/"</span>,
  <span class="k">"id"</span>: <span class="s">"quiet-river-42"</span>,
  <span class="k">"rootPath"</span>: <span class="s">"index.html"</span>,
  <span class="k">"size"</span>: <span class="n">12235</span>,
  <span class="k">"fileCount"</span>: <span class="n">4</span>,
  <span class="k">"expires"</span>: <span class="s">"2026-10-30T17:58:00.000Z"</span>,
  <span class="k">"expiresInHours"</span>: <span class="n">48</span>,
  <span class="k">"tier"</span>: <span class="s">"free"</span>,
  <span class="k">"updateCommand"</span>: <span class="s">"vanish site ./demo --root index.html --update quiet-river-42"</span>
}</code></pre>
        </div>
        <p class="note">A script reads <code>url</code> and moves on. Run <code>updateCommand</code> later and the same URL serves the new files.</p>
      </div>
    </div>
  </div>
</section>

<!-- RATING PLATES -->
<section class="plates-section">
  <div class="wrap">
    <h2>Plans and limits</h2>
    <p class="sub-h2">Three tiers, one pipe. Every limit below is the real one.</p>

    <div class="board">
      <div class="labels" aria-hidden="true">
        <div class="cell head"></div>
        <div class="cell price"></div>
        <div class="cell lab">Mini-site</div>
        <div class="cell lab">File upload</div>
        <div class="cell lab">Total storage</div>
        <div class="cell lab">Retention</div>
        <div class="cell lab">Rate limit</div>
        <div class="cell lab">Custom slug</div>
        <div class="cell lab">Update in place</div>
        <div class="cell foot"></div>
      </div>

      <div class="plate">
        <div class="cell head"><h3>Anonymous</h3></div>
        <div class="cell price"><strong>Free</strong> <span>no account</span></div>
        <div class="cell"><span class="lab">Mini-site</span><span class="val">300 MB · 100 files</span></div>
        <div class="cell"><span class="lab">File upload</span><span class="val">Images only · 300 MB</span></div>
        <div class="cell"><span class="lab">Total storage</span><span class="val">Ephemeral only</span></div>
        <div class="cell"><span class="lab">Retention</span><span class="val">24 hours</span></div>
        <div class="cell"><span class="lab">Rate limit</span><span class="val">10 per hour</span></div>
        <div class="cell"><span class="lab">Custom slug</span><span class="val">No</span></div>
        <div class="cell"><span class="lab">Update in place</span><span class="val">Owned sites</span></div>
        <div class="cell foot"><a class="btn btn-line" href="#command">Run the command</a></div>
      </div>

      <div class="plate plate-mid">
        <span class="usual">Usual start</span>
        <div class="cell head"><h3>Free</h3></div>
        <div class="cell price"><strong>Free</strong> <span>GitHub login</span></div>
        <div class="cell"><span class="lab">Mini-site</span><span class="val">500 files · within 50 MB</span></div>
        <div class="cell"><span class="lab">File upload</span><span class="val">All but executables · 50 MB</span></div>
        <div class="cell"><span class="lab">Total storage</span><span class="val">50 MB</span></div>
        <div class="cell"><span class="lab">Retention</span><span class="val">48 hours</span></div>
        <div class="cell"><span class="lab">Rate limit</span><span class="val">50 per hour</span></div>
        <div class="cell"><span class="lab">Custom slug</span><span class="val">No</span></div>
        <div class="cell"><span class="lab">Update in place</span><span class="val">Yes</span></div>
        <div class="cell foot"><a class="btn btn-solid" href="/auth/github?redirect=/dashboard">Sign in with GitHub</a></div>
      </div>

      <div class="plate">
        <div class="cell head"><h3>Pro</h3></div>
        <div class="cell price"><strong>10 €</strong> <span>per month</span></div>
        <div class="cell"><span class="lab">Mini-site</span><span class="val">5,000 files · within 10 GB</span></div>
        <div class="cell"><span class="lab">File upload</span><span class="val">All but executables · 1 GB</span></div>
        <div class="cell"><span class="lab">Total storage</span><span class="val">10 GB</span></div>
        <div class="cell"><span class="lab">Retention</span><span class="val">30 days · up to 365 with <code>--days</code></span></div>
        <div class="cell"><span class="lab">Rate limit</span><span class="val">500 per hour</span></div>
        <div class="cell"><span class="lab">Custom slug</span><span class="val">Yes · <code>--slug</code></span></div>
        <div class="cell"><span class="lab">Update in place</span><span class="val">Yes</span></div>
        <div class="cell foot"><a class="btn btn-line" href="/auth/github?redirect=/dashboard">Sign in, then <code>vanish upgrade</code></a></div>
      </div>
    </div>
  </div>
</section>

<!-- QUESTIONS -->
<section class="faq">
  <div class="wrap">
    <h2>Questions</h2>
    <p class="sub-h2">The five we get. The answers are the real ones.</p>
    <dl class="qa">
      <div class="q">
        <dt>Is it public?</dt>
        <dd>Yes, to anyone who has the link. There is no password: expiry is the safety. Each skill asks before publishing anything that looks private.</dd>
      </div>
      <div class="q">
        <dt>What if I need it longer?</dt>
        <dd>Anonymous keeps it 24 hours, Free 48 hours, Pro 30 days. On Pro, <code>--days 90</code> sets the retention, up to 365.</dd>
      </div>
      <div class="q">
        <dt>Can I update it?</dt>
        <dd>A site you own takes new files at the same URL with <code>--update quiet-river-42</code>. The reviewer's link keeps working.</dd>
      </div>
      <div class="q">
        <dt>What is blocked?</dt>
        <dd>Executables, on every tier. Anonymous file uploads take images only; every other type once signed in.</dd>
      </div>
      <div class="q">
        <dt>Can I run my own?</dt>
        <dd>Yes. Open source under MIT, runs on Cloudflare Workers, R2 and D1. Clone it and run your own station.</dd>
      </div>
    </dl>
  </div>
</section>

<!-- OPERATING NOTES -->
<section class="notes">
  <div class="wrap">
    <h2>Good to know</h2>
    <p class="sub-h2">What the command does, in the order you will meet it.</p>

    <ol class="rows">
      <li class="row">
        <span class="no">01</span>
        <div class="row-text"><h3>Agent skills</h3><p>Three skills ship with the CLI and route each artifact to the right command. Each one asks before publishing anything that looks private.</p></div>
        <pre class="mini"><code>vanish-publish-site · vanish-upload-files · vanish-connect-upgrade</code></pre>
      </li>
      <li class="row">
        <span class="no">02</span>
        <div class="row-text"><h3>Single file</h3><p>A file keeps its extension in the URL. Images on every tier; every other type once signed in.</p></div>
        <pre class="mini"><code><span class="prompt">$</span> npx vanish-cli upload screenshot.png
https://vanish.sh/f/a1b2c3d4e5f6.png</code></pre>
      </li>
      <li class="row">
        <span class="no">03</span>
        <div class="row-text"><h3>Update in place</h3><p>A site you own takes new files at the same URL. The reviewer's link keeps working.</p></div>
        <pre class="mini"><code><span class="prompt">$</span> vanish site ./demo --root index.html --update quiet-river-42</code></pre>
      </li>
      <li class="row">
        <span class="no">04</span>
        <div class="row-text"><h3>Expiry and slug</h3><p>Every URL is public to anyone who has it. Pro sets <code>--days 90</code>, up to 365, and names the site with <code>--slug workshop-demo</code>.</p></div>
        <pre class="mini"><code>https://workshop-demo.vanish.sh/</code></pre>
      </li>
      <li class="row">
        <span class="no">05</span>
        <div class="row-text"><h3>Run your own</h3><p>Open source under MIT. Runs on Cloudflare Workers, R2 and D1. Clone it and run your own station.</p></div>
        <p class="links"><a href="https://github.com/The-Vibe-Company/vanish">Source on GitHub</a> <a href="https://github.com/The-Vibe-Company/vanish/blob/main/LICENSE">MIT license</a></p>
      </li>
      <li class="row">
        <span class="no">06</span>
        <div class="row-text"><h3>Account</h3><p>Sign in with GitHub to reach the Free tier. The dashboard lists what is live and when it goes.</p></div>
        <pre class="mini"><code>vanish login · vanish whoami · vanish status
vanish ls · vanish rm &lt;id&gt; · vanish upgrade</code></pre>
      </li>
    </ol>
  </div>
</section>

<!-- FINAL CALL -->
<section class="band">
  <div class="wrap">
    <h2>Hand it over now.</h2>
    <p class="band-sub">One command, one public URL, gone on its own. No account needed to try.</p>
    <div class="band-row">
      <div class="cmdbox cmdbox-band">
        <div class="cmdbox-row">
          <pre class="cmd"><code><span class="prompt">$</span> npx vanish-cli site ./demo --root index.html</code></pre>
          <button type="button" class="copy" data-copy="npx vanish-cli site ./demo --root index.html">Copy command</button>
        </div>
      </div>
      <a class="btn btn-white" href="/auth/github?redirect=/dashboard">Sign in with GitHub</a>
    </div>
  </div>
</section>

</main>

<footer class="site-foot">
  <div class="wrap foot-row">
    <a class="wordmark wordmark-light" href="/" aria-label="vanish">
      <svg viewBox="0 0 8 8" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true">
        <rect x="1" y="0" width="6" height="3" fill="#d63a2f"/>
        <rect x="2" y="3" width="4" height="1" fill="#8a1f17"/>
        <rect x="3" y="4" width="2" height="2" fill="#ffffff"/>
        <rect x="3.5" y="6" width="1" height="2" fill="#ffffff"/>
      </svg>
      <span>vanish</span>
    </a>
    <nav class="foot-links" aria-label="Footer">
      <a href="https://github.com/The-Vibe-Company/vanish">GitHub</a>
      <a href="https://github.com/The-Vibe-Company/vanish/blob/main/CHANGELOG.md">Changelog</a>
      <a href="/dashboard">Dashboard</a>
      <a href="mailto:abuse@vanish.sh?subject=Vanish%20abuse%20report">Report abuse</a>
    </nav>
  </div>
  <div class="wrap foot-line">
    <p>vanish.sh · MIT · Cloudflare Workers · R2 · D1</p>
  </div>
</footer>
<script>
/* optional: the page reads the same without it */
document.querySelectorAll('.copy').forEach(function (b) {
  b.addEventListener('click', function () {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(b.dataset.copy).then(function () {
      var t = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = t; }, 1500);
    });
  });
});
</script>
</body>
</html>
`;

landing.get('/', (c) => c.html(renderLanding(posthogScriptTag(posthogConfig(c.env, c.req.url)))));

export default landing;
