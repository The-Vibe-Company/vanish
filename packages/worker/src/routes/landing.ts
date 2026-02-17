import { Hono } from 'hono';
import type { Env } from '../types.js';

const landing = new Hono<{ Bindings: Env }>();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>vanish — temporary file uploads</title>
<meta name="description" content="Upload files, get temporary public URLs. Dead simple.">
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

  /* — Hero command — */
  .hero-cmd {
    margin-top: 2rem;
    padding: 1.4rem 1.6rem;
    font-size: 1rem;
    border-color: var(--accent-dim);
    background: linear-gradient(135deg, #11100e 0%, #0f0e0c 100%);
    box-shadow: 0 0 40px rgba(212, 168, 80, 0.03);
  }

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
    .hero-cmd { font-size: 0.88rem; padding: 1rem 1.2rem; }
    table { font-size: 0.78rem; }
    th, td { padding: 0.5rem 0.5rem; }
    footer { flex-direction: column; align-items: flex-start; }
  }
</style>
</head>
<body>

<header>
  <div class="logo">vanish<span class="dot">.</span></div>
  <p class="tagline">upload files, get temporary public URLs. dead simple.</p>
</header>

<div class="cmd hero-cmd">
  <code><span class="prompt">$ </span>vanish screenshot.png
<span class="output">https://vanish.sh/f/a7xK9mQ2.png</span></code>
</div>

<section>
  <h2>Install</h2>
  <div class="cmd">
    <code><span class="prompt">$ </span>npm i <span class="flag">-g</span> vanish-cli</code>
  </div>
  <p>Or use directly with npx:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>npx vanish-cli upload file.png</code>
  </div>
</section>

<section>
  <h2>Usage</h2>

  <p>Upload a file:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>vanish photo.jpg
<span class="output">https://vanish.sh/f/b3kL8nR4.jpg</span>
<span class="comment"># copied to clipboard</span></code>
  </div>

  <p>Multiple files:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>vanish a.png b.png c.png
<span class="output">https://vanish.sh/f/a7xK9mQ2.png</span>
<span class="output">https://vanish.sh/f/c2mP5vX8.png</span>
<span class="output">https://vanish.sh/f/d9nQ3wY1.png</span></code>
  </div>

  <p>With curl:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>curl <span class="flag">-T</span> file.png <span class="url">https://vanish.sh/upload</span>
<span class="output">{"url":"https://vanish.sh/f/e4rS7tU6.png"}</span></code>
  </div>

  <p>JSON output:</p>
  <div class="cmd">
    <code><span class="prompt">$ </span>vanish <span class="flag">--json</span> file.png
<span class="output">{"url":"...","id":"...","expires":"2026-02-19T..."}</span></code>
  </div>
</section>

<section>
  <h2>Tiers</h2>
  <table>
    <thead>
      <tr>
        <th>Tier</th>
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
        <td>2 MB</td>
        <td>\u2014</td>
        <td>48 hours</td>
        <td>10/hour</td>
        <td class="price-free">free</td>
      </tr>
      <tr>
        <td class="tier-name">Free</td>
        <td>50 MB</td>
        <td>50 MB</td>
        <td>30 days</td>
        <td>50/hour</td>
        <td class="price-free">free</td>
      </tr>
      <tr class="tier-pro">
        <td class="tier-name">Pro</td>
        <td>1 GB</td>
        <td>1 GB</td>
        <td>unlimited</td>
        <td>200/hour</td>
        <td>2\u20AC/mo</td>
      </tr>
    </tbody>
  </table>
  <p style="margin-top: 0.8rem;">
    No account needed for anonymous uploads.
    <a href="/auth/github">Sign in with GitHub</a> for 30-day retention.
  </p>
</section>

<section>
  <h2>Auth</h2>
  <div class="cmd">
    <code><span class="prompt">$ </span>vanish login
<span class="comment"># opens GitHub OAuth in your browser</span>
<span class="output">\u2713 logged in as @username</span></code>
  </div>
  <div class="cmd">
    <code><span class="prompt">$ </span>vanish upgrade
<span class="comment"># upgrade to pro for unlimited retention</span></code>
  </div>
</section>

<section>
  <h2>More</h2>
  <div class="cmd">
    <code><span class="prompt">$ </span>vanish ls              <span class="comment"># list your uploads</span>
<span class="prompt">$ </span>vanish rm &lt;id&gt;         <span class="comment"># delete an upload</span>
<span class="prompt">$ </span>vanish whoami          <span class="comment"># show current user &amp; tier</span></code>
  </div>
  <p>CORS-enabled \u2014 embed URLs directly in GitHub PRs and GitLab issues.</p>
</section>

<footer>
  <span>\u00A9 vanish.sh</span>
  <a href="https://github.com/The-Vibe-Company/vanish">github</a>
</footer>

</body>
</html>`;

landing.get('/', (c) => {
  return c.html(html);
});

export default landing;
