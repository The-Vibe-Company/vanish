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
<meta name="description" content="One command turns a folder or a file into a public URL that expires on its own. Built for coding agents: --json output, update in place, no account needed to try." />
<meta name="theme-color" content="#d4d9dd" />
<meta property="og:title" content="vanish: the publish command your agent was missing" />
<meta property="og:description" content="A folder goes in, a public URL comes back, and the URL expires on its own. No account needed to try." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://vanish.sh/" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='3' fill='%23353c43'/%3E%3Crect x='5' y='11' width='22' height='10' rx='5' fill='%23f4f6f8'/%3E%3Crect x='5' y='11' width='6' height='10' rx='3' fill='%23175bb5'/%3E%3Crect x='21' y='11' width='6' height='10' rx='3' fill='%231f7a44'/%3E%3C/svg%3E" />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

<style>
  :root {
    --ink: #1d2328;
    --steel-700: #434c55;
    --steel-600: #5b656f;
    --steel-400: #a9b1b8;
    --steel-300: #bfc6cc;
    --steel-200: #d4d9dd;
    --steel-100: #e8ebee;
    --white: #f8f9fa;
    --slot: #262c31;
    --slot-text: #f1f3f5;
    --blue: #175bb5;
    --green: #1f7a44;
    --sans: "Barlow", "Helvetica Neue", Arial, sans-serif;
    --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --radius: 3px;
    --gutter: 20px;
  }

  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }

  body {
    margin: 0;
    font-family: var(--sans);
    font-size: 17px;
    line-height: 1.5;
    color: var(--ink);
    background-color: var(--steel-200);
    background-image: repeating-linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.10) 0px,
      rgba(255, 255, 255, 0.10) 1px,
      rgba(0, 0, 0, 0.012) 1px,
      rgba(0, 0, 0, 0.012) 3px
    );
  }

  a { color: var(--blue); text-decoration-thickness: 1px; text-underline-offset: 3px; }
  a:hover { color: var(--ink); }
  :focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
  code, pre { font-family: var(--mono); }

  p code, dd code, li code, h3 code, .btn code {
    font-size: 0.92em;
    white-space: nowrap;
    background: rgba(29, 35, 40, 0.07);
    padding: 1px 5px;
    border-radius: 2px;
  }
  .btn-primary code { background: rgba(255, 255, 255, 0.16); }

  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0);
    white-space: nowrap; border: 0;
  }
  .skip {
    position: absolute; left: 16px; top: -100px; z-index: 20;
    padding: 10px 14px;
    background: var(--ink); color: var(--white);
    border-radius: var(--radius);
    font-weight: 600; text-decoration: none;
  }
  .skip:focus { top: 12px; }

  /* Engraved capital labels */
  .engraved {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--steel-700);
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.75);
    margin: 0;
  }
  .engraved.dim { color: var(--steel-600); font-weight: 500; }
  .engraved code { font-size: 1em; letter-spacing: 0; text-transform: none; }

  /* Top line */
  .topline, .footline {
    max-width: 1180px;
    margin: 0 auto;
    padding: 12px var(--gutter);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .topline { border-bottom: 1px solid var(--steel-300); position: sticky; top: 0; z-index: 10; background: var(--steel-200); }
  .footline { border-top: 1px solid var(--steel-300); margin-top: 72px; padding-top: 20px; padding-bottom: 32px; flex-wrap: wrap; }

  .topline nav, .footline nav { display: flex; gap: 4px; flex-wrap: wrap; }
  .topline nav a, .footline nav a {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 12px;
    color: var(--ink);
    text-decoration: none;
    font-weight: 500;
    border-radius: var(--radius);
  }
  .topline nav a:hover, .footline nav a:hover { background: var(--steel-100); }
  .topline .nav-signin { border: 1px solid var(--ink); }

  .wordmark {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 0 12px;
    background: var(--steel-100);
    border: 1px solid var(--steel-300);
    border-radius: var(--radius);
    text-decoration: none;
    color: var(--ink);
  }
  .wordmark-text {
    font-family: var(--sans);
    font-weight: 600;
    font-size: 17px;
    letter-spacing: 0.12em;
    color: var(--ink);
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.75);
  }
  .rivet {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--steel-400);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  }

  /* Layout */
  main { max-width: 1180px; margin: 0 auto; padding: 0 var(--gutter); }

  .intro { padding: 56px 0 36px; }
  .intro .engraved { margin-bottom: 18px; }
  h1 {
    font-size: clamp(34px, 4.4vw, 56px);
    font-weight: 600;
    line-height: 1.04;
    letter-spacing: -0.015em;
    margin: 0 0 20px;
    max-width: 20ch;
    text-wrap: balance;
  }
  .lead {
    font-size: clamp(17px, 1.5vw, 20px);
    line-height: 1.5;
    max-width: 60ch;
    margin: 0;
    color: var(--steel-700);
  }

  h2 {
    font-size: 26px;
    font-weight: 600;
    line-height: 1.15;
    margin: 0 0 6px;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  .section-head { margin: 0 0 20px; }
  .section-head p { margin: 0; color: var(--steel-700); max-width: 60ch; }

  /* Lamps */
  .bench { margin-top: 8px; }
  .lamps {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }
  .lamp {
    display: grid;
    grid-template-columns: 16px 1fr;
    grid-template-rows: auto auto;
    column-gap: 10px;
    align-items: center;
    padding: 12px 14px;
    background: var(--steel-100);
    border: 1px solid var(--steel-300);
    border-radius: var(--radius);
    min-width: 0;
  }
  .bulb {
    grid-row: 1 / span 2;
    width: 16px; height: 16px;
    border-radius: 50%;
    background: var(--steel-300);
    box-shadow: inset 0 0 0 2px var(--steel-400);
  }
  .is-on-blue .bulb { background: var(--blue); box-shadow: inset 0 0 0 2px #2f73d1; }
  .is-on-green .bulb { background: var(--green); box-shadow: inset 0 0 0 2px #2f9358; }
  .lamp-label { font-size: 13px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--steel-700); text-shadow: 0 1px 0 rgba(255,255,255,0.75); }
  .lamp-value { font-family: var(--mono); font-size: 14px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Panes */
  .panes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .pane {
    background: var(--steel-100);
    border: 1px solid var(--steel-300);
    border-radius: var(--radius);
    padding: 20px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .pane-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--steel-300);
  }
  .pane-head h3 { margin: 0; }

  .slot {
    background: var(--slot);
    border-radius: 2px;
    padding: 18px 20px;
  }
  .cmd {
    display: block;
    color: var(--slot-text);
    font-size: 17px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .cmd .prompt { color: var(--steel-400); }

  .actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .action-note { font-size: 15px; color: var(--steel-700); min-height: 1.5em; }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 18px;
    border-radius: var(--radius);
    font-family: var(--sans);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-decoration: none;
    cursor: pointer;
    border: 1px solid var(--ink);
    background: transparent;
    color: var(--ink);
    line-height: 1.2;
    text-align: center;
  }
  .btn code { text-transform: none; letter-spacing: 0; font-size: 0.95em; }
  .btn-primary { background: var(--ink); color: var(--white); }
  .btn-primary:hover { background: #2f373e; }
  .btn-outline:hover { background: var(--white); }

  .plate-small { margin: 0; }
  .plate-small .engraved { margin-bottom: 8px; }
  .files { width: 100%; border-collapse: collapse; font-family: var(--mono); font-size: 14px; }
  .files td { padding: 7px 0; border-top: 1px solid var(--steel-300); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .files td.num { text-align: right; color: var(--steel-700); padding-left: 12px; }
  .files td.tag { width: 56px; text-align: right; color: var(--blue); font-weight: 500; padding-left: 12px; }
  .files tfoot td { font-weight: 500; border-top: 2px solid var(--steel-400); }

  .fine { font-size: 15px; color: var(--steel-700); margin: 0; max-width: 56ch; }
  .pane .fine { margin-top: auto; }

  /* Arrival */
  .capsule {
    display: flex;
    align-items: stretch;
    min-height: 52px;
  }
  .cap { width: 20px; flex: 0 0 20px; }
  .cap-blue { background: var(--blue); border-radius: 26px 0 0 26px; }
  .cap-green { background: var(--green); border-radius: 0 26px 26px 0; }
  .capsule-url {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    padding: 10px 16px;
    background: var(--white);
    font-family: var(--mono);
    font-size: clamp(15px, 1.5vw, 19px);
    font-weight: 500;
    color: var(--ink);
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .capsule-url:hover { color: var(--blue); }

  .acrylic {
    background-color: var(--white);
    background-image: linear-gradient(118deg, rgba(255,255,255,0) 28%, rgba(255,255,255,0.95) 36%, rgba(255,255,255,0) 44%);
    border-radius: 2px;
    padding: 16px 18px;
  }
  .acrylic .engraved { margin-bottom: 10px; }
  .json {
    margin: 0;
    font-size: 14px;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--ink);
  }
  .json .k { color: var(--steel-700); }
  .json .s { color: var(--blue); }
  .json .n { color: var(--green); }

  /* Rating plates */
  .ratings { margin-top: 72px; }
  .plates {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  .plate-tier {
    position: relative;
    background-color: var(--steel-100);
    border: 1px solid var(--steel-300);
    border-radius: var(--radius);
    padding: 28px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    background-image:
      radial-gradient(circle, var(--steel-400) 2.4px, transparent 3px),
      radial-gradient(circle, var(--steel-400) 2.4px, transparent 3px),
      radial-gradient(circle, var(--steel-400) 2.4px, transparent 3px),
      radial-gradient(circle, var(--steel-400) 2.4px, transparent 3px);
    background-size: 8px 8px;
    background-repeat: no-repeat;
    background-position: 9px 9px, calc(100% - 9px) 9px, 9px calc(100% - 9px), calc(100% - 9px) calc(100% - 9px);
  }
  .plate-pro { background-color: var(--white); }
  .tier-name {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--steel-700);
    text-shadow: 0 1px 0 rgba(255,255,255,0.75);
  }
  .tier-price { margin: 0; display: flex; align-items: baseline; gap: 10px; }
  .tier-price .amount { font-size: 34px; font-weight: 600; letter-spacing: -0.01em; line-height: 1; }
  .tier-price .per { font-size: 15px; color: var(--steel-700); }
  .specs { margin: 4px 0 8px; display: grid; gap: 0; }
  .specs div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 0;
    border-top: 1px solid var(--steel-300);
    font-size: 16px;
  }
  .specs dt { color: var(--steel-700); flex: 0 0 auto; }
  .specs dd { margin: 0; text-align: right; font-weight: 500; }
  .plate-tier .btn { margin-top: auto; }

  /* Operating notes */
  .notes { margin-top: 72px; }
  .notes-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 28px 32px;
  }
  .note { min-width: 0; }
  .note h3 { margin: 0 0 10px; padding-bottom: 8px; border-bottom: 1px solid var(--steel-300); }
  .note p { margin: 0 0 10px; font-size: 16px; }
  .list { margin: 0; padding-left: 18px; font-size: 16px; }
  .list li { margin: 4px 0; }
  .mini {
    margin: 0;
    background: var(--slot);
    color: var(--slot-text);
    border-radius: 2px;
    padding: 12px 14px;
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* Footer */
  .footline .wordmark-text { font-size: 15px; }
  .footline .credit { font-size: 14px; color: var(--steel-700); }

  /* Widths */
  @media (max-width: 1000px) {
    .plates, .notes-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 860px) {
    .panes { grid-template-columns: 1fr; }
    .lamps { grid-template-columns: 1fr; gap: 6px; }
    .lamp { grid-template-columns: 16px auto 1fr; grid-template-rows: auto; padding: 10px 14px; }
    .bulb { grid-row: auto; }
    .lamp-value { text-align: right; }
  }
  @media (max-width: 640px) {
    :root { --gutter: 16px; }
    body { font-size: 16px; }
    .intro { padding: 36px 0 28px; }
    .plates, .notes-grid { grid-template-columns: 1fr; }
    .topline { flex-wrap: wrap; }
    .topline nav { width: 100%; justify-content: flex-start; margin-left: -12px; }
    .lamp-label, .engraved, .tier-name { font-size: 13px; }
    .fine, .action-note, .tier-price .per { font-size: 16px; }
    .files, .json, .mini, .lamp-value { font-size: 14px; }
    .specs div { flex-wrap: wrap; }
    .specs dd { text-align: left; }
    .pane { padding: 16px; }
    .footline { gap: 12px; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .btn, .topline nav a { transition: background-color 160ms cubic-bezier(0.16, 1, 0.3, 1); }
  }
</style>
${analytics}
</head>
<body>
<a class="skip" href="#top">Skip to content</a>

<header class="topline">
  <a class="wordmark" href="/" aria-label="vanish, home">
    <span class="rivet" aria-hidden="true"></span>
    <span class="wordmark-text">vanish</span>
    <span class="rivet" aria-hidden="true"></span>
  </a>
  <nav aria-label="Main">
    <a href="https://github.com/The-Vibe-Company/vanish" rel="noopener">GitHub</a>
    <a href="/dashboard">Dashboard</a>
    <a class="nav-signin" href="/auth/github?redirect=/dashboard">Sign in</a>
  </nav>
</header>

<main id="top">

  <section class="intro">
    <p class="engraved">Publish line for coding agents</p>
    <h1>The publish command your agent was missing.</h1>
    <p class="lead">Your agent can write a site, a report, a deck, a prototype. It cannot hand any of it to another person. Vanish is the way out: a folder goes in, a public URL comes back, and the URL expires on its own. No account needed to try.</p>
  </section>

  <section class="bench" aria-labelledby="bench-title">
    <h2 id="bench-title" class="sr-only">One command in, one URL out</h2>

    <div class="lamps" role="list" aria-label="Status of the last publish">
      <div class="lamp is-on-blue" role="listitem"><span class="bulb" aria-hidden="true"></span><span class="lamp-label">Sent</span><span class="lamp-value">17:58:00 UTC</span></div>
      <div class="lamp is-on-blue" role="listitem"><span class="bulb" aria-hidden="true"></span><span class="lamp-label">In transit</span><span class="lamp-value">4 files, 12.0 KB</span></div>
      <div class="lamp is-on-green" role="listitem"><span class="bulb" aria-hidden="true"></span><span class="lamp-label">Arrived</span><span class="lamp-value">quiet-river-42</span></div>
      <div class="lamp is-off" role="listitem"><span class="bulb" aria-hidden="true"></span><span class="lamp-label">Expires</span><span class="lamp-value">2026-10-30 17:58 UTC</span></div>
    </div>

    <div class="panes">

      <article class="pane pane-station" aria-labelledby="station-title">
        <header class="pane-head">
          <h3 id="station-title" class="engraved">Station · Send</h3>
          <span class="engraved dim">Any folder, any machine</span>
        </header>

        <div class="slot">
          <code id="publish-cmd" class="cmd"><span class="prompt" aria-hidden="true">$ </span>npx vanish-cli site ./demo --root index.html</code>
        </div>

        <div class="actions">
          <button type="button" class="btn btn-primary" id="copy-btn" data-copy="npx vanish-cli site ./demo --root index.html">Copy command</button>
          <span class="action-note" id="copy-status" role="status" aria-live="polite"></span>
        </div>

        <div class="plate plate-small">
          <p class="engraved">Capsule contents · ./demo</p>
          <table class="files">
            <caption class="sr-only">Files in the folder sent</caption>
            <tbody>
              <tr><td>index.html</td><td class="num">4,812 B</td><td class="tag">root</td></tr>
              <tr><td>styles.css</td><td class="num">2,140 B</td><td class="tag"></td></tr>
              <tr><td>app.js</td><td class="num">3,377 B</td><td class="tag"></td></tr>
              <tr><td>chart.svg</td><td class="num">1,906 B</td><td class="tag"></td></tr>
            </tbody>
            <tfoot>
              <tr><td>4 files</td><td class="num">12,235 B</td><td class="tag"></td></tr>
            </tfoot>
          </table>
        </div>

        <p class="fine">Nothing is transformed. HTML is served as HTML, Markdown as Markdown, assets as static files. No build step, no server code.</p>
      </article>

      <article class="pane pane-arrival" aria-labelledby="arrival-title">
        <header class="pane-head">
          <h3 id="arrival-title" class="engraved">Arrival · Delivered</h3>
          <span class="engraved dim">Public to anyone with the link</span>
        </header>

        <div class="capsule">
          <span class="cap cap-blue" aria-hidden="true"></span>
          <a class="capsule-url" href="https://quiet-river-42.vanish.sh/">https://quiet-river-42.vanish.sh/</a>
          <span class="cap cap-green" aria-hidden="true"></span>
        </div>

        <div class="acrylic">
          <p class="engraved">Answer with <code>--json</code></p>
<pre class="json" tabindex="0" aria-label="JSON answer returned by the command"><code>{
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

        <p class="fine">A script reads <code>url</code> and moves on. Run <code>updateCommand</code> later and the same URL serves the new files.</p>
      </article>

    </div>
  </section>

  <section class="ratings" id="pricing" aria-labelledby="ratings-title">
    <header class="section-head">
      <h2 id="ratings-title">Rating plates</h2>
      <p>Three tiers, one pipe. Every limit below is the real one.</p>
    </header>

    <div class="plates">

      <article class="plate plate-tier" aria-labelledby="tier-anon">
        <h3 id="tier-anon" class="tier-name">Anonymous</h3>
        <p class="tier-price"><span class="amount">Free</span><span class="per">no account</span></p>
        <dl class="specs">
          <div><dt>Mini-site</dt><dd>300 MB · 100 files</dd></div>
          <div><dt>File upload</dt><dd>Images only · 300 MB</dd></div>
          <div><dt>Total storage</dt><dd>Ephemeral only</dd></div>
          <div><dt>Retention</dt><dd>24 hours</dd></div>
          <div><dt>Rate limit</dt><dd>10 per hour</dd></div>
          <div><dt>Custom slug</dt><dd>No</dd></div>
          <div><dt>Update in place</dt><dd>Owned sites</dd></div>
        </dl>
        <a class="btn btn-outline" href="#publish-cmd">Run the command</a>
      </article>

      <article class="plate plate-tier" aria-labelledby="tier-free">
        <h3 id="tier-free" class="tier-name">Free</h3>
        <p class="tier-price"><span class="amount">Free</span><span class="per">GitHub login</span></p>
        <dl class="specs">
          <div><dt>Mini-site</dt><dd>500 files · within 50 MB</dd></div>
          <div><dt>File upload</dt><dd>All but executables · 50 MB</dd></div>
          <div><dt>Total storage</dt><dd>50 MB</dd></div>
          <div><dt>Retention</dt><dd>48 hours</dd></div>
          <div><dt>Rate limit</dt><dd>50 per hour</dd></div>
          <div><dt>Custom slug</dt><dd>No</dd></div>
          <div><dt>Update in place</dt><dd>Yes</dd></div>
        </dl>
        <a class="btn btn-outline" href="/auth/github?redirect=/dashboard">Sign in with GitHub</a>
      </article>

      <article class="plate plate-tier plate-pro" aria-labelledby="tier-pro">
        <h3 id="tier-pro" class="tier-name">Pro</h3>
        <p class="tier-price"><span class="amount">10 €</span><span class="per">per month</span></p>
        <dl class="specs">
          <div><dt>Mini-site</dt><dd>5,000 files · within 10 GB</dd></div>
          <div><dt>File upload</dt><dd>All but executables · 1 GB</dd></div>
          <div><dt>Total storage</dt><dd>10 GB</dd></div>
          <div><dt>Retention</dt><dd>30 days · up to 365 with <code>--days</code></dd></div>
          <div><dt>Rate limit</dt><dd>500 per hour</dd></div>
          <div><dt>Custom slug</dt><dd>Yes · <code>--slug</code></dd></div>
          <div><dt>Update in place</dt><dd>Yes</dd></div>
        </dl>
        <a class="btn btn-primary" href="/auth/github?redirect=/dashboard">Sign in, then <code>vanish upgrade</code></a>
      </article>

    </div>
  </section>

  <section class="notes" id="how" aria-labelledby="notes-title">
    <header class="section-head">
      <h2 id="notes-title">Operating notes</h2>
      <p>What the installation does, in the order you will meet it.</p>
    </header>

    <div class="notes-grid">

      <div class="note">
        <h3 class="engraved">01 · Agent skills</h3>
        <p>Three skills ship with the CLI and route each artifact to the right command. Each one asks before publishing anything that looks private.</p>
        <ul class="list">
          <li><code>vanish-publish-site</code> for folders, demos, HTML, Markdown.</li>
          <li><code>vanish-upload-files</code> for PDFs, decks, images, archives.</li>
          <li><code>vanish-connect-upgrade</code> for login, quota, slugs, retention.</li>
        </ul>
      </div>

      <div class="note">
        <h3 class="engraved">02 · Single file</h3>
        <p>A file keeps its extension in the URL. Images on every tier; every other type once signed in.</p>
        <pre class="mini"><code>$ npx vanish-cli upload screenshot.png
https://vanish.sh/f/a1b2c3d4e5f6.png</code></pre>
      </div>

      <div class="note">
        <h3 class="engraved">03 · Update in place</h3>
        <p>A site you own takes new files at the same URL. The reviewer's link keeps working.</p>
        <pre class="mini"><code>$ vanish site ./demo --root index.html --update quiet-river-42</code></pre>
      </div>

      <div class="note">
        <h3 class="engraved">04 · Expiry and slug</h3>
        <p>Every URL is public to anyone who has it. There is no password: expiry is the safety. Pro sets <code>--days 90</code>, up to 365, and names the site with <code>--slug workshop-demo</code>.</p>
        <pre class="mini"><code>https://workshop-demo.vanish.sh/</code></pre>
      </div>

      <div class="note">
        <h3 class="engraved">05 · Your pipe</h3>
        <p>Open source under MIT. Runs on Cloudflare Workers, R2 and D1. Clone it and run your own station.</p>
        <ul class="list">
          <li><a href="https://github.com/The-Vibe-Company/vanish" rel="noopener">Source on GitHub</a></li>
          <li><a href="https://github.com/The-Vibe-Company/vanish/blob/main/LICENSE" rel="noopener">MIT license</a></li>
        </ul>
      </div>

      <div class="note">
        <h3 class="engraved">06 · Account</h3>
        <p>Sign in with GitHub to reach the Free tier. The dashboard lists what is live and when it goes.</p>
        <ul class="list">
          <li><code>vanish login</code> · <code>vanish whoami</code> · <code>vanish status</code></li>
          <li><code>vanish ls</code> · <code>vanish rm &lt;id&gt;</code> · <code>vanish upgrade</code></li>
          <li><a href="/dashboard">Open the dashboard</a></li>
        </ul>
      </div>

    </div>
  </section>

</main>

<footer class="footline">
  <span class="wordmark-text">vanish</span>
  <nav aria-label="Footer">
    <a href="https://github.com/The-Vibe-Company/vanish" rel="noopener">GitHub</a>
    <a href="https://github.com/The-Vibe-Company/vanish/releases" rel="noopener">Changelog</a>
    <a href="/dashboard">Dashboard</a>
    <a href="mailto:abuse@vanish.sh?subject=Vanish%20abuse%20report">Report abuse</a>
  </nav>
  <span class="credit">© 2026 vanish.sh · Made by <a href="https://thevibecompany.co" rel="noopener">The Vibe Company</a> · MIT · Cloudflare Workers · R2 · D1</span>
</footer>

<script>
(function () {
  var btn = document.getElementById('copy-btn');
  var status = document.getElementById('copy-status');
  if (!btn || !status) return;
  btn.addEventListener('click', function () {
    var text = btn.getAttribute('data-copy') || '';
    function ok() { status.textContent = 'Copied to clipboard'; }
    function fail() { status.textContent = 'Copy failed. Select the command above.'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, fail);
    } else {
      fail();
    }
  });
})();
</script>
</body>
</html>`;

landing.get('/', (c) => c.html(renderLanding(posthogScriptTag(posthogConfig(c.env, c.req.url)))));

export default landing;
