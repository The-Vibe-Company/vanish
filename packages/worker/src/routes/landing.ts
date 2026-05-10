import { Hono } from 'hono';
import type { Env } from '../types.js';

const landing = new Hono<{ Bindings: Env }>();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>vanish — temporary mini-sites for AI agents</title>
<meta name="description" content="Publish temporary HTML, Markdown, CSS, JS, and asset folders from Claude Code, Codex, or your terminal.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --bg: #0a0a0a;
    --fg: #b0ada8;
    --fg-dim: #5a5752;
    --fg-bright: #e8e4de;
    --accent: #d4a850;
    --accent-dim: #a07830;
    --code-bg: #111110;
    --border: #1e1d1b;
    --green: #7dba5a;
    --blue: #6a9fd8;
    --red: #d46a6a;
  }

  html {
    background: var(--bg);
    color: var(--fg);
    font-family: 'IBM Plex Mono', 'SF Mono', 'Fira Code', monospace;
    font-size: 14px;
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
  }

  body {
    max-width: 680px;
    margin: 0 auto;
    padding: 4rem 1.5rem 3rem;
  }

  /* — Header — */
  .logo {
    font-size: 1.8rem;
    font-weight: 600;
    color: var(--fg-bright);
    letter-spacing: -0.03em;
    display: inline-block;
  }

  .logo .dot {
    color: var(--accent);
  }

  .tagline {
    margin-top: 0.3rem;
    color: var(--fg-dim);
    font-size: 0.85rem;
  }

  /* — Sections — */
  section {
    margin-top: 3rem;
  }

  h2 {
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--fg-dim);
    margin-bottom: 1rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--border);
  }

  /* — Code blocks — */
  .cmd {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1rem 1.2rem;
    overflow-x: auto;
    margin-bottom: 0.75rem;
    position: relative;
  }

  .cmd code {
    font-family: inherit;
    font-size: 0.9rem;
    color: var(--fg-bright);
    white-space: pre;
  }

  .prompt {
    color: var(--accent);
    user-select: none;
  }

  .flag { color: var(--blue); }
  .url { color: var(--fg-dim); }
  .output { color: var(--green); }
  .comment { color: var(--fg-dim); font-style: italic; }

  /* — Terminal widget — */
  .terminal {
    margin-top: 2rem;
    border: 1px solid var(--accent-dim);
    border-radius: 6px;
    background: linear-gradient(135deg, #11100e 0%, #0f0e0c 100%);
    box-shadow: 0 0 40px rgba(212, 168, 80, 0.03);
    overflow: hidden;
    position: relative;
  }

  .terminal-chrome {
    display: flex;
    align-items: center;
    padding: 0.6rem 1rem;
    background: #161514;
    border-bottom: 1px solid var(--border);
    user-select: none;
  }

  .terminal-dots {
    display: flex;
    gap: 6px;
  }

  .terminal-dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .dot-red { background: #ff5f57; }
  .dot-yellow { background: #febc2e; }
  .dot-green { background: #28c840; }

  .terminal-title {
    flex: 1;
    text-align: center;
    font-size: 0.72rem;
    color: var(--fg-dim);
    letter-spacing: 0.02em;
  }

  .terminal-spacer {
    width: 52px;
  }

  .terminal-body {
    padding: 1rem 1.2rem;
    min-height: 180px;
    position: relative;
    font-size: 0.88rem;
    line-height: 1.6;
    overflow-x: auto;
    transition: opacity 0.3s ease;
  }

  .terminal-body.fading {
    opacity: 0;
  }

  .term-line {
    white-space: pre;
    min-height: 1.6em;
  }

  .terminal-cursor {
    display: inline-block;
    width: 0.55em;
    height: 1.15em;
    background: var(--fg-bright);
    vertical-align: text-bottom;
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    50.01%, 100% { opacity: 0; }
  }

  .terminal-paused {
    position: absolute;
    top: 0.6rem;
    right: 1rem;
    font-size: 0.65rem;
    color: var(--fg-dim);
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .terminal.paused .terminal-paused {
    opacity: 1;
  }

  .terminal.paused .terminal-cursor {
    animation: none;
    opacity: 1;
  }

  .t-prompt { color: var(--accent); }
  .t-green { color: var(--green); }
  .t-dim { color: var(--fg-dim); }
  .t-blue { color: var(--blue); }
  .t-bright { color: var(--fg-bright); }

  /* — Tier table — */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  th {
    text-align: left;
    color: var(--fg-dim);
    font-weight: 500;
    padding: 0.5rem 0.8rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  td {
    padding: 0.6rem 0.8rem;
    border-bottom: 1px solid var(--border);
    color: var(--fg);
  }

  tr:last-child td {
    border-bottom: none;
  }

  .tier-name {
    color: var(--fg-bright);
    font-weight: 500;
  }

  .tier-pro .tier-name {
    color: var(--accent);
  }

  .price-free {
    color: var(--green);
  }

  /* — Inline code — */
  code.inline {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0.15em 0.4em;
    font-size: 0.88em;
    color: var(--fg-bright);
  }

  /* — Description text — */
  p {
    margin-bottom: 0.6rem;
  }

  p + .cmd {
    margin-top: 0.8rem;
  }

  /* — Footer — */
  footer {
    margin-top: 4rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border);
    color: var(--fg-dim);
    font-size: 0.78rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  a {
    color: var(--accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  /* — Responsive — */
  @media (max-width: 500px) {
    body { padding: 2.5rem 1rem 2rem; }
    .terminal-body { padding: 0.8rem 1rem; font-size: 0.78rem; min-height: 150px; }
    .terminal-chrome { padding: 0.5rem 0.8rem; }
    .terminal-dots span { width: 8px; height: 8px; }
    table {
      display: block;
      overflow-x: auto;
      font-size: 0.78rem;
      white-space: nowrap;
    }
    th, td { padding: 0.5rem 0.5rem; }
    footer { flex-direction: column; align-items: flex-start; }
  }
</style>
</head>
<body>

<header>
  <div class="logo">vanish<span class="dot">.</span></div>
  <p class="tagline">temporary mini-sites for Claude Code, Codex, and terminal workflows.</p>
</header>

<div class="terminal" id="terminal">
  <div class="terminal-chrome">
    <div class="terminal-dots">
      <span class="dot-red"></span>
      <span class="dot-yellow"></span>
      <span class="dot-green"></span>
    </div>
    <div class="terminal-title">vanish site ./demo --root index.html</div>
    <div class="terminal-spacer"></div>
  </div>
  <div class="terminal-body" id="terminal-body">
    <div id="terminal-content"></div>
  </div>
  <div class="terminal-paused" id="terminal-paused">paused</div>
</div>

<section>
  <h2>Install</h2>
  <div class="cmd">
    <code><span class="prompt">$ </span>npm i <span class="flag">-g</span> vanish-cli</code>
  </div>
  <p>Or use directly with npx:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>npx vanish-cli site ./demo <span class="flag">--root</span> index.html</code>
  </div>
</section>

<section>
  <h2>Usage</h2>

  <p>Publish a static folder:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>vanish site ./lesson-demo <span class="flag">--root</span> index.html
<span class="output">https://k8m2q9z4p1ad.vanish.sh/</span>
<span class="comment"># copied to clipboard</span></code>
  </div>

  <p>Choose any root file. Vanish serves it as-is:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>vanish site ./notes <span class="flag">--root</span> README.md
<span class="output">https://p4d8n2x7q0ab.vanish.sh/</span></code>
  </div>

  <p>Keep sharing single files and screenshots:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>vanish screenshot.png
<span class="output">https://vanish.sh/f/a7xK9mQ2.png</span></code>
  </div>

  <p>JSON output:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>vanish site ./demo <span class="flag">--root</span> index.html <span class="flag">--json</span>
<span class="output">{"url":"...","id":"...","rootPath":"index.html","fileCount":7}</span></code>
  </div>
</section>

<section>
  <h2>cURL / API</h2>

  <p>Set your key once:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>export <span class="flag">VANISH_KEY</span>=<span class="url">"vnsh_your_key_here"</span></code>
  </div>

  <p>Create a mini-site draft:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>curl <span class="flag">-X POST</span> <span class="flag">\\
  -H</span> <span class="url">"Authorization: Bearer $VANISH_KEY"</span> <span class="flag">\\
  -H</span> <span class="url">"Content-Type: application/json"</span> <span class="flag">\\
  -d</span> <span class="url">'{"name":"demo","rootPath":"index.html","fileCount":3,"totalBytes":8120}'</span> <span class="flag">\\
  </span><span class="url">https://vanish.sh/sites</span>
<span class="output">{"id":"k8m2q9z4p1ad","token":"vnst_...","url":"https://k8m2q9z4p1ad.vanish.sh/"}</span></code>
  </div>

  <p>Upload site files and publish:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>curl <span class="flag">-X PUT</span> <span class="flag">--data-binary</span> @index.html <span class="flag">\\
  -H</span> <span class="url">"X-Site-Token: vnst_..."</span> <span class="flag">\\
  </span><span class="url">"https://vanish.sh/sites/k8m2q9z4p1ad/files?path=index.html"</span>
<span class="prompt">$ </span>curl <span class="flag">-X POST</span> <span class="flag">-H</span> <span class="url">"X-Site-Token: vnst_..."</span> <span class="url">https://vanish.sh/sites/k8m2q9z4p1ad/publish</span></code>
  </div>

  <p>Upload a single file (authenticated, all file types):</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>curl <span class="flag">-X POST</span> <span class="flag">--data-binary</span> @report.pdf <span class="flag">\\
  -H</span> <span class="url">"X-Filename: report.pdf"</span> <span class="flag">\\
  -H</span> <span class="url">"Authorization: Bearer $VANISH_KEY"</span> <span class="flag">\\
  </span><span class="url">https://vanish.sh/upload</span>
<span class="output">{"url":"https://vanish.sh/f/b3kL8nR4.pdf","id":"b3kL8nR4",...}</span></code>
  </div>

  <p>Custom retention (Pro, up to 365 days):</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>curl <span class="flag">-X POST</span> <span class="flag">--data-binary</span> @doc.pdf <span class="flag">\\
  -H</span> <span class="url">"X-Filename: doc.pdf"</span> <span class="flag">\\
  -H</span> <span class="url">"Authorization: Bearer $VANISH_KEY"</span> <span class="flag">\\
  -H</span> <span class="url">"X-Expires-Days: 90"</span> <span class="flag">\\
  </span><span class="url">https://vanish.sh/upload</span></code>
  </div>

  <p>Download:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>curl <span class="flag">-OJ</span> <span class="url">https://vanish.sh/f/b3kL8nR4.pdf</span></code>
  </div>

  <p>Delete:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>curl <span class="flag">-X DELETE</span> <span class="flag">\\
  -H</span> <span class="url">"Authorization: Bearer $VANISH_KEY"</span> <span class="flag">\\
  </span><span class="url">https://vanish.sh/f/b3kL8nR4.pdf</span>
<span class="output">{"ok":true}</span></code>
  </div>

  <p>List uploads:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>curl <span class="flag">-H</span> <span class="url">"Authorization: Bearer $VANISH_KEY"</span> <span class="flag">\\
  </span><span class="url">https://vanish.sh/uploads</span></code>
  </div>

  <p>Account info:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>curl <span class="flag">-H</span> <span class="url">"Authorization: Bearer $VANISH_KEY"</span> <span class="flag">\\
  </span><span class="url">https://vanish.sh/me</span></code>
  </div>
</section>

<section>
  <h2>Tiers</h2>
  <table>
    <thead>
      <tr>
        <th>Tier</th>
        <th>File types</th>
        <th>Sites</th>
        <th>Max file</th>
        <th>Storage</th>
        <th>Retention</th>
        <th>Rate limit</th>
        <th>Price</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="tier-name">Anonymous</td>
        <td>images only</td>
        <td>10 MB</td>
        <td>5 MB</td>
        <td>\u2014</td>
        <td>24 hours</td>
        <td>10/hour</td>
        <td class="price-free">free</td>
      </tr>
      <tr>
        <td class="tier-name">Free</td>
        <td>all</td>
        <td>included</td>
        <td>50 MB</td>
        <td>50 MB</td>
        <td>48 hours</td>
        <td>50/hour</td>
        <td class="price-free">free</td>
      </tr>
      <tr class="tier-pro">
        <td class="tier-name">Pro</td>
        <td>all</td>
        <td>custom slug</td>
        <td>1 GB</td>
        <td>1 GB</td>
        <td>30 days <span style="color:var(--fg-dim)">(up to 365)</span></td>
        <td>200/hour</td>
        <td>2\u20AC/mo</td>
      </tr>
    </tbody>
  </table>
  <p style="margin-top: 0.8rem;">
    Anonymous sites: 10 MB, 24h, random subdomain.
    <a href="/auth/github">Sign in with GitHub</a> for 48h retention and 50 MB total storage.
  </p>
</section>

<section>
  <h2>Auth &amp; API Keys</h2>

  <p>Get your API key via CLI:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>vanish login
<span class="comment"># opens GitHub OAuth in your browser</span>
<span class="output">\u2713 logged in as @username</span>
<span class="comment"># key saved to ~/.config/vanish/config.json</span></code>
  </div>

  <p>Or <a href="/auth/github">sign in with GitHub</a> in your browser to get your key.</p>

  <p>Create additional keys via API:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>curl <span class="flag">-X POST</span> <span class="flag">\\
  -H</span> <span class="url">"Authorization: Bearer $VANISH_KEY"</span> <span class="flag">\\
  -H</span> <span class="url">"Content-Type: application/json"</span> <span class="flag">\\
  -d</span> <span class="url">'{"name":"ci-bot"}'</span> <span class="flag">\\
  </span><span class="url">https://vanish.sh/keys</span>
<span class="output">{"api_key":"vnsh_...","name":"ci-bot"}</span>
<span class="comment"># key shown only once — save it</span></code>
  </div>

  <p>Manage your keys and uploads on the <a href="/dashboard">dashboard</a>.</p>

  <div class="cmd">
    <code><span class="prompt">$ </span>vanish site ./demo <span class="flag">--root</span> index.html <span class="flag">--slug</span> agent-demo
<span class="comment"># Pro: https://agent-demo.vanish.sh/</span></code>
  </div>
</section>

<section>
  <h2>More</h2>
  <div class="cmd">
    <code><span class="prompt">$ </span>vanish site ./demo --root index.html  <span class="comment"># publish a static folder</span>
<span class="prompt">$ </span>vanish screenshot.png                 <span class="comment"># share a single file</span>
<span class="prompt">$ </span>vanish ls                             <span class="comment"># list file uploads</span>
<span class="prompt">$ </span>vanish status                         <span class="comment"># show storage &amp; tier info</span>
<span class="prompt">$ </span>vanish upgrade                        <span class="comment"># Pro slugs + custom retention</span></code>
  </div>
  <p>Static HTML/CSS/JS is served as-is. Markdown is served as Markdown, not transformed.</p>
</section>

<footer>
  <span>\u00A9 vanish.sh</span>
  <a href="https://github.com/The-Vibe-Company/vanish">github</a>
</footer>

<script>
(function() {
  var SCENARIOS = [
    [
      { type: 'cmd', text: 'vanish site ./lesson --root index.html' },
      { type: 'spinner', text: 'Publishing lesson (7 files, 84 KB)...', duration: 1800 },
      { type: 'output', text: '\u2713 https://k8m2q9z4p1ad.vanish.sh/', color: 'green' },
      { type: 'output', text: '  Copied to clipboard.', color: 'dim' },
      { type: 'output', text: '  Expires in 24h. Anonymous mini-sites max out at 10 MB.', color: 'dim' },
      { type: 'pause', duration: 2000 }
    ],
    [
      { type: 'cmd', text: 'vanish login' },
      { type: 'output', text: '  Opening browser for GitHub login...', color: 'dim', delay: 300 },
      { type: 'output', text: '  Waiting for authentication...', color: 'dim', delay: 1000 },
      { type: 'pause', duration: 1500 },
      { type: 'output', text: '\u2713 Logged in as @johndoe. API key saved.', color: 'green' },
      { type: 'output', text: '  48h retention, all file types, 50 MB total storage.', color: 'dim' },
      { type: 'pause', duration: 2000 }
    ],
    [
      { type: 'cmd', text: 'vanish site ./demo --root index.html --slug pitch-demo' },
      { type: 'spinner', text: 'Publishing demo (18 files, 2.3 MB)...', duration: 1500 },
      { type: 'output', text: '\u2713 https://pitch-demo.vanish.sh/', color: 'green' },
      { type: 'output', text: '  Copied to clipboard.', color: 'dim' },
      { type: 'output', text: '  Pro slug. Default retention: 30 days.', color: 'dim' },
      { type: 'pause', duration: 2000 }
    ],
    [
      { type: 'cmd', text: 'vanish screenshot.png' },
      { type: 'spinner', text: 'Uploading screenshot.png (1.2 MB)...', duration: 1300 },
      { type: 'output', text: '\u2713 https://vanish.sh/f/a7xK9mQ2.png', color: 'green' },
      { type: 'output', text: '  Single-file sharing still works.', color: 'dim' },
      { type: 'pause', duration: 2500 }
    ]
  ];

  var SPINNER_FRAMES = ['\u280b','\u2819','\u2839','\u2838','\u283c','\u2834','\u2826','\u2827','\u2807','\u280f'];

  var contentEl = document.getElementById('terminal-content');
  var bodyEl = document.getElementById('terminal-body');
  var terminalEl = document.getElementById('terminal');
  var paused = false;
  var cursorEl = document.createElement('span');
  cursorEl.className = 'terminal-cursor';

  terminalEl.addEventListener('mouseenter', function() {
    paused = true;
    terminalEl.classList.add('paused');
  });

  terminalEl.addEventListener('mouseleave', function() {
    paused = false;
    terminalEl.classList.remove('paused');
  });

  function wait(ms) {
    return new Promise(function(resolve) {
      var remaining = ms;
      var last = Date.now();
      function tick() {
        if (paused) {
          last = Date.now();
          setTimeout(tick, 50);
          return;
        }
        var now = Date.now();
        remaining -= (now - last);
        last = now;
        if (remaining <= 0) {
          resolve();
        } else {
          setTimeout(tick, Math.min(remaining, 16));
        }
      }
      tick();
    });
  }

  function addLine(text, colorClass) {
    var line = document.createElement('div');
    line.className = 'term-line';
    if (text) {
      var span = document.createElement('span');
      span.className = 't-' + colorClass;
      span.textContent = text;
      line.appendChild(span);
    }
    contentEl.appendChild(line);
    bodyEl.scrollTop = bodyEl.scrollHeight;
    return line;
  }

  function removeCursor() {
    if (cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);
  }

  async function typeCommand(text) {
    var line = document.createElement('div');
    line.className = 'term-line';

    var promptSpan = document.createElement('span');
    promptSpan.className = 't-prompt';
    promptSpan.textContent = '$ ';
    line.appendChild(promptSpan);

    var textSpan = document.createElement('span');
    textSpan.className = 't-bright';
    line.appendChild(textSpan);

    line.appendChild(cursorEl);
    contentEl.appendChild(line);
    bodyEl.scrollTop = bodyEl.scrollHeight;

    for (var i = 0; i < text.length; i++) {
      await wait(40 + Math.random() * 40);
      textSpan.textContent += text[i];
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }

    removeCursor();
    await wait(300);
  }

  async function showSpinner(text, duration) {
    var line = document.createElement('div');
    line.className = 'term-line';

    var spinSpan = document.createElement('span');
    spinSpan.className = 't-green';
    spinSpan.textContent = SPINNER_FRAMES[0];
    line.appendChild(spinSpan);

    var textSpan = document.createElement('span');
    textSpan.className = 't-bright';
    textSpan.textContent = ' ' + text;
    line.appendChild(textSpan);

    contentEl.appendChild(line);
    bodyEl.scrollTop = bodyEl.scrollHeight;

    var frameIndex = 0;
    var interval = setInterval(function() {
      if (!paused) {
        frameIndex++;
        spinSpan.textContent = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
      }
    }, 80);

    await wait(duration);

    clearInterval(interval);
    contentEl.removeChild(line);
  }

  async function showOutput(text, color, delay) {
    if (delay) await wait(delay);
    addLine(text, color);
  }

  async function clearWithFade() {
    bodyEl.classList.add('fading');
    await wait(300);
    contentEl.innerHTML = '';
    bodyEl.classList.remove('fading');
  }

  async function runScenario(steps) {
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (s.type === 'cmd') {
        await typeCommand(s.text);
      } else if (s.type === 'spinner') {
        await showSpinner(s.text, s.duration);
      } else if (s.type === 'output') {
        await showOutput(s.text, s.color, s.delay || 0);
      } else if (s.type === 'pause') {
        await wait(s.duration);
      }
    }
  }

  async function runLoop() {
    var idx = 0;
    while (true) {
      await runScenario(SCENARIOS[idx]);
      await clearWithFade();
      idx = (idx + 1) % SCENARIOS.length;
    }
  }

  runLoop();
})();
</script>

</body>
</html>`;

landing.get('/', (c) => {
  return c.html(html);
});

export default landing;
