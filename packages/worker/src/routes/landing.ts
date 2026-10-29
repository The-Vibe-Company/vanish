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
<meta name="theme-color" content="#0a4bb0" />
<meta property="og:title" content="vanish: the publish command your agent was missing" />
<meta property="og:description" content="A folder goes in, a public URL comes back, and the URL expires on its own. No account needed to try." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://vanish.sh/" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='3' fill='%230a4bb0'/%3E%3Crect x='5' y='11' width='22' height='10' rx='5' fill='%23ffffff'/%3E%3Crect x='5' y='11' width='6' height='10' rx='3' fill='%23ffffff'/%3E%3Crect x='21' y='11' width='6' height='10' rx='3' fill='%231f7a44'/%3E%3C/svg%3E" />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo+Narrow:wght@400;500;600&family=Oswald:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />

<style>
  :root{
    --blue:#0a4bb0;
    --blue-d:#083a8a;
    --white:#fff;
    --green:#14893f;
    --green-lit:#2fcf6a;
    --blue-lit:#5fb4ff;
    --ink:#0a2a63;
    --dim:#46587a;
    --rule:#c4d1ea;
    --head:"Oswald","Archivo Narrow","Arial Narrow",sans-serif;
    --body:"Archivo Narrow","Arial Narrow",system-ui,sans-serif;
    --mono:"JetBrains Mono","IBM Plex Mono",ui-monospace,Menlo,monospace;
  }
  *{box-sizing:border-box;margin:0}
  html{background:var(--blue)}
  body{background:var(--blue);color:var(--white);font:400 19px/1.45 var(--body);overflow-x:hidden;-webkit-font-smoothing:antialiased}
  .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  a{color:inherit}
  code{font-family:var(--mono);font-size:.88em}
  main,.topline,.footline{max-width:1200px;margin:0 auto;padding-inline:24px}

  /* top line */
  .topline{position:sticky;top:0;z-index:5;background:var(--blue);display:flex;align-items:center;justify-content:space-between;gap:12px;padding-block:20px}
  .wordmark{display:inline-flex;align-items:center;gap:10px;text-decoration:none;min-height:44px}
  .wordmark-text{font:700 34px/1 var(--head);text-transform:lowercase;letter-spacing:.02em}
  .rivet{width:12px;height:12px;border-radius:50%;border:3px solid #fff}
  .topline nav,.footline nav{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .topline nav a,.footline nav a{font:600 16px/1 var(--head);text-transform:uppercase;letter-spacing:.08em;text-decoration:none;padding:14px 12px;min-height:44px;display:inline-flex;align-items:center;white-space:nowrap}
  .nav-signin{border:3px solid #fff;border-radius:10px}
  .engraved{font:600 15px/1.2 var(--head);text-transform:uppercase;letter-spacing:.12em}
  .engraved code{text-transform:none;letter-spacing:0}

  /* intro */
  .intro{padding:36px 0 40px}
  .intro .engraved{margin-bottom:14px}
  h1{font:700 clamp(46px,9vw,112px)/.95 var(--head);text-transform:uppercase;letter-spacing:.005em;max-width:14ch;text-wrap:balance}
  .lead{font-size:clamp(19px,2vw,24px);line-height:1.4;max-width:46em;margin-top:24px}

  /* lamps: lit = filled with light, off = hollow */
  .lamps{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-bottom:36px}
  .lamp{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;min-width:0}
  .bulb{width:clamp(84px,11vw,132px);aspect-ratio:1;border-radius:50%;border:8px solid #fff;background:var(--blue);display:block;position:relative}
  .bulb::after{content:"";position:absolute;inset:18%;border-radius:50%;background:transparent}
  .is-on-blue .bulb{background:var(--blue-lit);box-shadow:inset 0 0 0 6px var(--blue)}
  .is-on-blue .bulb::after{background:#fff}
  .is-on-green .bulb{background:var(--green-lit);box-shadow:inset 0 0 0 6px var(--blue)}
  .is-on-green .bulb::after{background:#fff}
  .is-off .bulb{background:var(--blue);border-color:rgba(255,255,255,.55)}
  .is-off .lamp-label,.is-off .lamp-value{color:rgba(255,255,255,.7)}
  .lamp-label{font:700 clamp(24px,3vw,40px)/1 var(--head);text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
  .lamp-value{font:500 14px/1.2 var(--mono);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

  /* enamel plates */
  .panes{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:stretch}
  .pane,.sign{position:relative;background:#fff;color:var(--ink);border-radius:22px;padding:30px;min-width:0}
  .pane::before,.sign::before{content:"";position:absolute;inset:8px;border:2px solid var(--blue);border-radius:15px;pointer-events:none}
  .pane>*,.sign>*{position:relative}
  .pane-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 16px;margin-bottom:20px}
  .pane-head h3{font:700 clamp(30px,3.4vw,44px)/1 var(--head);text-transform:uppercase;letter-spacing:.02em;color:var(--blue)}
  .dim{color:var(--dim)}
  .slot{background:var(--blue);color:#fff;border-radius:12px;padding:18px 18px}
  .cmd{display:block;font:500 15px/1.5 var(--mono);overflow-wrap:anywhere}
  .prompt{opacity:.7}
  .actions{display:flex;align-items:center;gap:14px;margin:16px 0 22px;flex-wrap:wrap}
  .btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:12px;font:600 17px/1 var(--head);text-transform:uppercase;letter-spacing:.08em;text-decoration:none;border:3px solid var(--blue);cursor:pointer;white-space:nowrap}
  .btn-primary{background:var(--blue);color:#fff}
  .btn-outline{background:#fff;color:var(--blue)}
  .btn code{text-transform:none;letter-spacing:0}
  .action-note{font-size:15px;color:var(--dim)}
  .inset{border-top:3px solid var(--blue);padding:14px 0 4px;margin-bottom:18px}
  .inset .engraved{color:var(--blue);margin-bottom:10px}
  .inset code{font-size:inherit}
  .files{width:100%;border-collapse:collapse;font:400 14px/1.4 var(--mono)}
  .files td{padding:6px 0;border-bottom:1px solid var(--rule)}
  .files td:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:1px;width:50%}
  .files .num{text-align:right;white-space:nowrap}
  .files .tag{text-align:right;width:56px;color:var(--blue);font-weight:700}
  .files tfoot td{border-bottom:0;border-top:3px solid var(--blue);font-weight:700}
  .fine{font-size:17px;color:var(--ink)}
  .fine code{background:#e3ebf8;padding:1px 5px;border-radius:5px}
  .capsule{display:flex;align-items:stretch;height:76px;border:3px solid var(--blue);border-radius:40px;overflow:hidden;margin-bottom:22px;background:#fff}
  .cap{flex:0 0 26px}
  .cap-blue{background:var(--blue)}
  .cap-green{background:var(--green);flex-basis:44px}
  .capsule-url{flex:1;min-width:0;display:flex;align-items:center;padding:0 14px;font:700 17px/1 var(--mono);color:var(--blue);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .json{font:400 13.5px/1.55 var(--mono);color:var(--ink);overflow-x:auto;padding:2px 0}
  .json code{font-size:inherit}
  .json .k{color:var(--blue);font-weight:700}.json .s{color:#0f7a37}.json .n{color:#a63d00}

  /* tiers */
  .section-head{margin:72px 0 28px}
  .section-head h2{font:700 clamp(44px,6vw,80px)/1 var(--head);text-transform:uppercase}
  .section-head p{font-size:21px;margin-top:10px}
  .plates{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
  .tier{padding:26px 24px 24px;display:flex;flex-direction:column;border-radius:18px}
  .tier::before{inset:7px;border-radius:12px}
  .badge{position:absolute!important;top:20px;right:20px;width:48px;height:48px;border-radius:50%;background:var(--blue);color:#fff;font:700 28px/48px var(--head);text-align:center}
  .tier-name{font:700 44px/1 var(--head);text-transform:uppercase;color:var(--blue);padding-right:56px}
  .tier-price{display:flex;align-items:baseline;gap:10px;margin:8px 0 16px;font-family:var(--head);text-transform:uppercase}
  .amount{font-size:30px;font-weight:600}.per{font:600 15px var(--head);letter-spacing:.1em;color:var(--dim)}
  .specs{margin-bottom:22px;flex:1}
  .specs div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--rule);font-size:17px}
  .specs dt{color:var(--dim);flex:0 0 auto}
  .specs dd{text-align:right;margin:0}
  .tier .btn{align-self:flex-start}
  .plate-pro .badge{background:var(--green)}

  /* notes */
  .notes-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px 32px}
  .note{border-top:5px solid #fff;padding-top:16px;min-width:0}
  .note h3{font:700 28px/1 var(--head);margin-bottom:12px;letter-spacing:.04em}
  .note p{font-size:20px}
  .list{margin:12px 0 0;padding-left:20px;font-size:17px}
  .list li{margin-bottom:4px}
  .mini{margin-top:14px;padding:0;font:500 13px/1.6 var(--mono);white-space:pre-wrap;overflow-wrap:anywhere;color:#fff}
  .mini code{font-size:inherit}

  /* foot line */
  .footline{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center;justify-content:space-between;padding-block:56px 36px}
  .footline .wordmark-text{font-size:30px}
  .footline .dim{color:#fff}
  .footline .credit{font-size:15px}
  .footline .credit a{text-decoration-thickness:1px;text-underline-offset:3px}
  .skip{position:absolute;left:16px;top:-100px;z-index:10;background:#fff;color:var(--blue);padding:12px 16px;border-radius:10px;font:600 16px/1 var(--head);text-transform:uppercase;letter-spacing:.08em;text-decoration:none}
  .skip:focus{top:16px}
  a:focus-visible,button:focus-visible,.json:focus-visible{outline:4px solid #ffd400;outline-offset:3px}

  @media (max-width:1000px){.plates,.notes-grid{grid-template-columns:1fr}.panes{grid-template-columns:1fr}}
  @media (max-width:640px){
    body{font-size:18px}
    main,.topline,.footline{padding-inline:16px}
    .topline nav a{padding:14px 8px}
    .topline nav a:nth-child(1){display:none}
    .lamps{grid-template-columns:1fr 1fr;gap:26px 12px}
    .bulb{width:92px;border-width:7px}
    .pane,.sign{padding:22px 18px}
    .capsule{height:68px}
    .capsule-url{font-size:13.5px;padding:0 8px}
    .cap-green{flex-basis:34px}.cap{flex-basis:18px}
    .json{font-size:12px}
    .mini,.mini code{font-size:12.5px}
    .section-head{margin-top:52px}
  }
  @media (prefers-reduced-motion:no-preference){
    html{scroll-behavior:smooth}
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

        <div class="inset">
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

        <div class="inset">
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

      <article class="sign tier" aria-labelledby="tier-anon"><span class="badge" aria-hidden="true">1</span>
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

      <article class="sign tier" aria-labelledby="tier-free"><span class="badge" aria-hidden="true">2</span>
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

      <article class="sign tier plate-pro" aria-labelledby="tier-pro"><span class="badge" aria-hidden="true">3</span>
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
        <h3 class="engraved">02 · Update in place</h3>
        <p>A site you own takes new files at the same URL. The reviewer's link keeps working.</p>
        <pre class="mini"><code>$ vanish site ./demo --root index.html --update quiet-river-42</code></pre>
      </div>

      <div class="note">
        <h3 class="engraved">03 · Expiry and slug</h3>
        <p>Every URL is public to anyone who has it. There is no password: expiry is the safety. Pro sets <code>--days 90</code>, up to 365, and names the site with <code>--slug workshop-demo</code>.</p>
        <pre class="mini"><code>https://workshop-demo.vanish.sh/</code></pre>
      </div>

    </div>
  </section>

</main>

<footer class="footline">
  <span class="wordmark-text">vanish</span>
  <nav aria-label="Footer">
    <a href="https://github.com/The-Vibe-Company/vanish" rel="noopener">GitHub</a>
    <a href="https://github.com/The-Vibe-Company/vanish/releases" rel="noopener">Changelog</a>
    <a href="https://github.com/The-Vibe-Company/vanish/blob/main/LICENSE" rel="noopener">MIT License</a>
    <a href="/dashboard">Dashboard</a>
    <a href="mailto:abuse@vanish.sh?subject=Vanish%20abuse%20report">Report abuse</a>
  </nav>
  <span class="credit">© 2026 vanish.sh · Made by <a href="https://thevibecompany.co" rel="noopener">The Vibe Company</a> · Cloudflare Workers · R2 · D1</span>
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
