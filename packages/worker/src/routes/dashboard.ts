import { Hono } from 'hono';
import type { Env } from '../types.js';

const dashboard = new Hono<{ Bindings: Env }>();

dashboard.get('/dashboard', (c) => {
  const baseUrl = c.env.BASE_URL;
  const selfHosted = c.env.SELF_HOSTED === 'true';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>vanish — dashboard</title>
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
    padding: 2.5rem 1.5rem 3rem;
  }

  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* — Header — */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .logo {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--fg-bright);
    letter-spacing: -0.03em;
    text-decoration: none;
  }

  .logo .dot { color: var(--accent); }
  .logo:hover { text-decoration: none; }

  .header-right {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.85rem;
  }

  .username { color: var(--fg-bright); }

  .badge {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0.15em 0.5em;
    border-radius: 3px;
    font-weight: 500;
  }

  .badge-free { color: var(--green); border: 1px solid var(--green); }
  .badge-pro { color: var(--accent); border: 1px solid var(--accent); }

  .btn-logout {
    background: none;
    border: 1px solid var(--border);
    color: var(--fg-dim);
    font-family: inherit;
    font-size: 0.78rem;
    padding: 0.3em 0.7em;
    border-radius: 3px;
    cursor: pointer;
  }

  .btn-logout:hover { color: var(--fg); border-color: var(--fg-dim); }

  /* — Sections — */
  section { margin-bottom: 2.5rem; }

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

  /* — Account — */
  .account-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
    margin-bottom: 1rem;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--fg-dim);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .stat-value {
    font-size: 1rem;
    color: var(--fg-bright);
    margin-top: 0.15rem;
  }

  .storage-bar-container {
    margin-top: 0.8rem;
  }

  .storage-bar {
    width: 100%;
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
    margin-top: 0.4rem;
  }

  .storage-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .storage-fill.warn { background: var(--red); }

  .storage-text {
    font-size: 0.8rem;
    color: var(--fg-dim);
    margin-top: 0.3rem;
  }

  .btn-upgrade {
    display: inline-block;
    margin-top: 0.8rem;
    padding: 0.4em 1em;
    background: var(--accent-dim);
    color: var(--fg-bright);
    border: 1px solid var(--accent);
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.82rem;
    cursor: pointer;
    text-decoration: none;
  }

  .btn-upgrade:hover { background: var(--accent); color: var(--bg); text-decoration: none; }

  /* — Tables — */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  th {
    text-align: left;
    color: var(--fg-dim);
    font-weight: 500;
    padding: 0.5rem 0.5rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  td {
    padding: 0.55rem 0.5rem;
    border-bottom: 1px solid var(--border);
    color: var(--fg);
    vertical-align: middle;
  }

  tr:last-child td { border-bottom: none; }

  .url-cell {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .url-cell a { color: var(--blue); font-size: 0.78rem; }

  .filename-cell {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg-bright);
  }

  /* — Action buttons — */
  .btn-icon {
    background: none;
    border: 1px solid var(--border);
    color: var(--fg-dim);
    font-family: inherit;
    font-size: 0.72rem;
    padding: 0.2em 0.5em;
    border-radius: 3px;
    cursor: pointer;
    margin-left: 0.3rem;
  }

  .btn-icon:hover { color: var(--fg); border-color: var(--fg-dim); }
  .btn-icon.danger:hover { color: var(--red); border-color: var(--red); }

  .btn-create {
    background: none;
    border: 1px solid var(--accent-dim);
    color: var(--accent);
    font-family: inherit;
    font-size: 0.8rem;
    padding: 0.3em 0.8em;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 1rem;
  }

  .btn-create:hover { background: var(--accent-dim); color: var(--fg-bright); }

  .btn-more {
    display: block;
    width: 100%;
    margin-top: 0.8rem;
    padding: 0.5em;
    background: none;
    border: 1px solid var(--border);
    color: var(--fg-dim);
    font-family: inherit;
    font-size: 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    text-align: center;
  }

  .btn-more:hover { color: var(--fg); border-color: var(--fg-dim); }

  /* — Key reveal — */
  .key-reveal {
    background: var(--code-bg);
    border: 1px solid var(--accent-dim);
    border-radius: 4px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .key-reveal code {
    font-family: inherit;
    color: var(--accent);
    font-size: 0.85rem;
    word-break: break-all;
  }

  .key-reveal .warn {
    font-size: 0.75rem;
    color: var(--fg-dim);
    margin-top: 0.4rem;
  }

  /* — Curl hint — */
  .curl-hint {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.8rem 1rem;
    margin-top: 1rem;
    font-size: 0.8rem;
  }

  .curl-hint code {
    font-family: inherit;
    color: var(--fg-bright);
    white-space: pre-wrap;
    word-break: break-all;
  }

  .curl-hint .prompt { color: var(--accent); }

  /* — Empty state — */
  .empty {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--fg-dim);
    font-size: 0.85rem;
  }

  .empty code {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0.15em 0.4em;
    color: var(--fg-bright);
    font-size: 0.85em;
  }

  /* — Login screen — */
  .login-screen {
    text-align: center;
    padding: 6rem 1rem 4rem;
  }

  .login-logo {
    font-size: 2.2rem;
    font-weight: 600;
    color: var(--fg-bright);
    letter-spacing: -0.03em;
    margin-bottom: 1rem;
  }

  .login-logo .dot { color: var(--accent); }

  .login-msg {
    color: var(--fg-dim);
    font-size: 0.9rem;
    margin-bottom: 2rem;
  }

  .btn-github {
    display: inline-block;
    padding: 0.6em 1.5em;
    background: var(--fg-bright);
    color: var(--bg);
    font-family: inherit;
    font-size: 0.9rem;
    font-weight: 500;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    text-decoration: none;
  }

  .btn-github:hover { opacity: 0.9; text-decoration: none; }

  .login-alt {
    margin-top: 1.5rem;
    font-size: 0.8rem;
    color: var(--fg-dim);
  }

  .login-alt code {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0.15em 0.4em;
    color: var(--fg-bright);
    font-size: 0.9em;
  }

  /* — Loading — */
  .loading {
    text-align: center;
    padding: 4rem 1rem;
    color: var(--fg-dim);
    font-size: 0.85rem;
  }

  /* — Toast — */
  .toast {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--code-bg);
    border: 1px solid var(--border);
    color: var(--fg-bright);
    font-family: inherit;
    font-size: 0.8rem;
    padding: 0.5em 1.2em;
    border-radius: 4px;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
    z-index: 100;
  }

  .toast.show { opacity: 1; }

  /* — Footer — */
  footer {
    margin-top: 3rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
    color: var(--fg-dim);
    font-size: 0.78rem;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* — Responsive — */
  @media (max-width: 500px) {
    body { padding: 1.5rem 1rem 2rem; }
    .header-right { gap: 0.5rem; }
    .account-grid { grid-template-columns: 1fr; }
    table {
      display: block;
      overflow-x: auto;
      font-size: 0.75rem;
      white-space: nowrap;
    }
    th, td { padding: 0.4rem 0.3rem; }
    .url-cell { max-width: 100px; }
    .filename-cell { max-width: 90px; }
    .btn-icon { min-width: 44px; min-height: 44px; }
    .btn-more, .btn-create, .btn-logout, .btn-upgrade, .btn-github { min-height: 44px; }
  }
</style>
</head>
<body>

<div id="app">
  <div class="loading">loading...</div>
</div>

<div class="toast" id="toast"></div>

<footer>
  <a href="/">vanish.sh</a>
  <a href="https://github.com/The-Vibe-Company/vanish">github</a>
</footer>

<script>
(function() {
  var BASE = '';
  var SELF_HOSTED = ${selfHosted};
  var apiKey = localStorage.getItem('vanish_api_key');
  var appEl = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  var uploadsOffset = 0;
  var sitesOffset = 0;
  var allUploads = [];
  var allSites = [];

  // Check URL params for key (from OAuth redirect)
  var params = new URLSearchParams(window.location.search);
  if (params.get('key')) {
    apiKey = params.get('key');
    localStorage.setItem('vanish_api_key', apiKey);
    history.replaceState({}, '', '/dashboard');
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { toastEl.classList.remove('show'); }, 2000);
  }

  function apiFetch(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (apiKey) opts.headers['Authorization'] = 'Bearer ' + apiKey;
    return fetch(BASE + path, opts).then(function(r) { return r.json(); });
  }

  function formatBytes(b) {
    if (b === 0) return '0 B';
    var u = ['B','KB','MB','GB'];
    var i = Math.floor(Math.log(b) / Math.log(1024));
    if (i >= u.length) i = u.length - 1;
    return (b / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + u[i];
  }

  function relTime(iso) {
    if (!iso) return '—';
    var diff = new Date(iso) - Date.now();
    if (diff < 0) return 'expired';
    var h = Math.floor(diff / 3600000);
    if (h < 1) return 'in ' + Math.max(1, Math.floor(diff / 60000)) + 'min';
    if (h < 48) return 'in ' + h + 'h';
    var d = Math.floor(h / 24);
    return 'in ' + d + 'd';
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function attr(s) {
    return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showLogin() {
    appEl.innerHTML =
      '<div class="login-screen">' +
        '<div class="login-logo">vanish<span class="dot">.</span></div>' +
        '<p class="login-msg">sign in to manage your uploads and mini-sites</p>' +
        '<a class="btn-github" href="/auth/github?redirect=/dashboard">Sign in with GitHub</a>' +
        '<p class="login-alt">or use the CLI: <code>vanish login</code></p>' +
      '</div>';
  }

  function renderDashboard(me) {
    var tierClass = me.tier === 'pro' ? 'badge-pro' : 'badge-free';
    var storageMax = me.limits.maxTotalStorage;
    var used = me.stats.total_bytes;
    var pct = storageMax ? Math.min(100, Math.round((used / storageMax) * 100)) : 0;
    var warnClass = pct > 85 ? ' warn' : '';
    var maxExpH = me.limits.maxExpiryHours;
    var retention = maxExpH >= 720 ? Math.round(maxExpH / 24) + ' days' : maxExpH + 'h';

    var storageHtml = '';
    if (storageMax) {
      storageHtml =
        '<div class="storage-bar-container">' +
          '<div class="stat-label">storage</div>' +
          '<div class="storage-bar"><div class="storage-fill' + warnClass + '" style="width:' + pct + '%"></div></div>' +
          '<div class="storage-text">' + formatBytes(used) + ' / ' + formatBytes(storageMax) + ' (' + pct + '%)</div>' +
        '</div>';
    } else {
      storageHtml =
        '<div class="storage-bar-container">' +
          '<div class="stat-label">storage</div>' +
          '<div class="storage-text">' + formatBytes(used) + ' used (ephemeral)</div>' +
        '</div>';
    }

    var upgradeHtml = '';
    if (me.tier !== 'pro' && !SELF_HOSTED) {
      upgradeHtml = '<a class="btn-upgrade" href="/billing/checkout?key=' + encodeURIComponent(apiKey) + '">Upgrade to Pro</a>';
    }

    appEl.innerHTML =
      '<div class="header">' +
        '<a href="/" class="logo">vanish<span class="dot">.</span></a>' +
        '<div class="header-right">' +
          '<span class="username">@' + esc(me.username || '') + '</span>' +
          '<span class="badge ' + tierClass + '">' + esc(me.tier) + '</span>' +
          '<button class="btn-logout" onclick="logout()">logout</button>' +
        '</div>' +
      '</div>' +
      '<section>' +
        '<h2>Account</h2>' +
        '<div class="account-grid">' +
          '<div><div class="stat-label">uploads</div><div class="stat-value">' + me.stats.total_uploads + '</div></div>' +
          '<div><div class="stat-label">sites</div><div class="stat-value">' + (me.stats.total_sites || 0) + '</div></div>' +
          '<div><div class="stat-label">retention</div><div class="stat-value">' + retention + '</div></div>' +
        '</div>' +
        storageHtml +
        upgradeHtml +
      '</section>' +
      '<section id="sites-section">' +
        '<h2>Mini-sites</h2>' +
        '<div id="sites-content"><div class="loading">loading...</div></div>' +
      '</section>' +
      '<section id="uploads-section">' +
        '<h2>Uploads</h2>' +
        '<div id="uploads-content"><div class="loading">loading...</div></div>' +
      '</section>' +
      '<section id="keys-section">' +
        '<h2>API Keys</h2>' +
        '<button class="btn-create" onclick="promptCreateKey()">+ new key</button>' +
        '<div id="key-reveal"></div>' +
        '<div id="keys-content"><div class="loading">loading...</div></div>' +
        '<div class="curl-hint" id="curl-hint"></div>' +
      '</section>';
  }

  function renderUploads(uploads, hasMore) {
    var el = document.getElementById('uploads-content');
    if (!el) return;

    if (uploads.length === 0) {
      el.innerHTML =
        '<div class="empty">' +
          '<p>no uploads yet</p>' +
          '<p style="margin-top:0.5rem">upload files with <code>vanish file.png</code></p>' +
        '</div>';
      return;
    }

    var html = '<table><thead><tr>' +
      '<th>file</th><th>size</th><th>expires</th><th>url</th><th></th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < uploads.length; i++) {
      var u = uploads[i];
      var exp = u.expired ? '<span style="color:var(--red)">expired</span>' : relTime(u.expires_at);
      html += '<tr>' +
        '<td class="filename-cell" title="' + attr(u.filename) + '">' + esc(u.filename) + '</td>' +
        '<td>' + formatBytes(u.size_bytes) + '</td>' +
        '<td>' + exp + '</td>' +
        '<td class="url-cell"><a href="' + esc(u.url) + '" target="_blank">' + esc(u.url.replace(/^https?:\\/\\/[^/]+/, '')) + '</a></td>' +
        '<td style="white-space:nowrap">' +
          '<button class="btn-icon" onclick="copyUrl(\\'' + esc(u.url) + '\\')" title="copy URL" aria-label="Copy URL for ' + attr(u.filename) + '">cp</button>' +
          (u.expired ? '' : '<button class="btn-icon danger" onclick="deleteUpload(\\'' + esc(u.id) + '\\')" title="delete" aria-label="Delete upload ' + attr(u.filename) + '">rm</button>') +
        '</td>' +
      '</tr>';
    }

    html += '</tbody></table>';

    if (hasMore) {
      html += '<button class="btn-more" onclick="loadMore()">load more</button>';
    }

    el.innerHTML = html;
  }

  function renderSites(sites, hasMore) {
    var el = document.getElementById('sites-content');
    if (!el) return;

    if (sites.length === 0) {
      el.innerHTML =
        '<div class="empty">' +
          '<p>no mini-sites yet</p>' +
          '<p style="margin-top:0.5rem">publish a folder with <code>vanish site ./demo --root index.html</code></p>' +
        '</div>';
      return;
    }

    var html = '<table><thead><tr>' +
      '<th>site</th><th>files</th><th>size</th><th>expires</th><th>url</th><th></th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < sites.length; i++) {
      var s = sites[i];
      var exp = s.expired ? '<span style="color:var(--red)">expired</span>' : relTime(s.expires_at);
      var label = s.slug || s.name || s.id;
      html += '<tr>' +
        '<td class="filename-cell" title="' + attr(s.root_path) + '">' + esc(label) + '</td>' +
        '<td>' + s.file_count + '</td>' +
        '<td>' + formatBytes(s.size_bytes) + '</td>' +
        '<td>' + exp + '</td>' +
        '<td class="url-cell"><a href="' + esc(s.url) + '" target="_blank">' + esc(s.url.replace(/^https?:\\/\\//, '')) + '</a></td>' +
        '<td style="white-space:nowrap">' +
          '<button class="btn-icon" onclick="copyUrl(\\'' + esc(s.url) + '\\')" title="copy URL" aria-label="Copy URL for mini-site ' + attr(label) + '">cp</button>' +
          (s.expired ? '' : '<button class="btn-icon danger" onclick="deleteSite(\\'' + esc(s.id) + '\\')" title="delete" aria-label="Delete mini-site ' + attr(label) + '">rm</button>') +
        '</td>' +
      '</tr>';
    }

    html += '</tbody></table>';

    if (hasMore) {
      html += '<button class="btn-more" onclick="loadMoreSites()">load more sites</button>';
    }

    el.innerHTML = html;
  }

  function renderKeys(keys) {
    var el = document.getElementById('keys-content');
    if (!el) return;

    if (keys.length === 0) {
      el.innerHTML = '<div class="empty"><p>no API keys</p></div>';
      return;
    }

    var html = '<table><thead><tr>' +
      '<th>prefix</th><th>name</th><th>last used</th><th></th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var lastUsed = k.last_used_at ? relTime(k.last_used_at).replace('in ', '') + ' ago' : 'never';
      if (k.last_used_at) {
        var diff = Date.now() - new Date(k.last_used_at);
        var hAgo = Math.floor(diff / 3600000);
        if (hAgo < 1) lastUsed = 'just now';
        else if (hAgo < 48) lastUsed = hAgo + 'h ago';
        else lastUsed = Math.floor(hAgo / 24) + 'd ago';
      }
      html += '<tr>' +
        '<td style="color:var(--fg-bright);font-size:0.78rem">' + esc(k.prefix) + '...</td>' +
        '<td>' + esc(k.name) + '</td>' +
        '<td style="color:var(--fg-dim)">' + lastUsed + '</td>' +
        '<td><button class="btn-icon danger" onclick="revokeKey(\\'' + esc(k.prefix) + '\\')" title="revoke" aria-label="Revoke API key">revoke</button></td>' +
      '</tr>';
    }

    html += '</tbody></table>';
    el.innerHTML = html;
  }

  // Actions
  window.logout = function() {
    localStorage.removeItem('vanish_api_key');
    apiKey = null;
    showLogin();
  };

  window.copyUrl = function(url) {
    navigator.clipboard.writeText(url).then(function() { toast('copied'); });
  };

  window.deleteUpload = function(id) {
    if (!confirm('Delete this upload? This cannot be undone.')) return;
    apiFetch('/f/' + id, { method: 'DELETE' }).then(function(res) {
      if (res.ok) {
        toast('deleted');
        allUploads = allUploads.filter(function(u) { return u.id !== id; });
        renderUploads(allUploads, false);
      } else {
        toast('error: ' + (res.error || 'failed'));
      }
    });
  };

  window.deleteSite = function(id) {
    if (!confirm('Delete this mini-site? This cannot be undone.')) return;
    apiFetch('/sites/' + id, { method: 'DELETE' }).then(function(res) {
      if (res.ok) {
        toast('deleted');
        allSites = allSites.filter(function(s) { return s.id !== id; });
        renderSites(allSites, false);
      } else {
        toast('error: ' + (res.error || 'failed'));
      }
    });
  };

  window.loadMore = function() {
    uploadsOffset += 50;
    apiFetch('/uploads?limit=50&offset=' + uploadsOffset + '&active=false').then(function(res) {
      if (res.uploads) {
        allUploads = allUploads.concat(res.uploads);
        renderUploads(allUploads, res.uploads.length === 50);
      }
    });
  };

  window.loadMoreSites = function() {
    sitesOffset += 50;
    apiFetch('/sites?limit=50&offset=' + sitesOffset + '&active=false').then(function(res) {
      if (res.sites) {
        allSites = allSites.concat(res.sites);
        renderSites(allSites, res.sites.length === 50);
      }
    });
  };

  window.promptCreateKey = function() {
    var name = prompt('Key name (optional):', 'default');
    if (name === null) return;
    apiFetch('/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || 'default' }),
    }).then(function(res) {
      if (res.api_key) {
        var el = document.getElementById('key-reveal');
        if (el) {
          el.innerHTML =
            '<div class="key-reveal">' +
              '<code>' + esc(res.api_key) + '</code>' +
              '<div class="warn">save this key — it will not be shown again</div>' +
              '<button class="btn-icon" style="margin-top:0.5rem" onclick="navigator.clipboard.writeText(\\'' + esc(res.api_key) + '\\');toast(\\'copied\\')" aria-label="Copy API key">copy</button>' +
            '</div>';
        }
        loadKeys();
      } else {
        toast('error: ' + (res.error || 'failed'));
      }
    });
  };

  window.revokeKey = function(prefix) {
    if (!confirm('Revoke key ' + prefix + '...? It will stop working immediately.')) return;
    apiFetch('/keys/' + prefix, { method: 'DELETE' }).then(function(res) {
      if (res.ok) {
        toast('key revoked');
        loadKeys();
      } else {
        toast('error: ' + (res.error || 'failed'));
      }
    });
  };

  window.toast = toast;

  function renderCurlHint() {
    var el = document.getElementById('curl-hint');
    if (!el) return;
    var key = apiKey || 'vnsh_...';
    var lines = [
      '$ curl -X POST --data-binary @file.pdf \\\\',
      '  -H "X-Filename: file.pdf" \\\\',
      '  -H "Authorization: Bearer ' + key + '" \\\\',
      '  ${baseUrl}/upload'
    ];
    var code = document.createElement('code');
    var prompt = document.createElement('span');
    prompt.className = 'prompt';
    prompt.textContent = '$ ';
    code.appendChild(prompt);
    code.appendChild(document.createTextNode(lines[0].slice(2) + '\\n'));
    for (var i = 1; i < lines.length; i++) {
      code.appendChild(document.createTextNode(lines[i] + (i < lines.length - 1 ? '\\n' : '')));
    }
    el.innerHTML = '';
    el.appendChild(code);
  }

  function loadUploads() {
    uploadsOffset = 0;
    allUploads = [];
    apiFetch('/uploads?limit=50&offset=0&active=false').then(function(res) {
      if (res.uploads) {
        allUploads = res.uploads;
        renderUploads(allUploads, res.uploads.length === 50);
      }
    });
  }

  function loadSites() {
    sitesOffset = 0;
    allSites = [];
    apiFetch('/sites?limit=50&offset=0&active=false').then(function(res) {
      if (res.sites) {
        allSites = res.sites;
        renderSites(allSites, res.sites.length === 50);
      }
    });
  }

  function loadKeys() {
    apiFetch('/keys').then(function(res) {
      if (res.keys) renderKeys(res.keys);
    });
  }

  // Init
  if (!apiKey) {
    showLogin();
  } else {
    apiFetch('/me').then(function(me) {
      if (me.error) {
        localStorage.removeItem('vanish_api_key');
        apiKey = null;
        showLogin();
        return;
      }
      renderDashboard(me);
      renderCurlHint();
      loadSites();
      loadUploads();
      loadKeys();
    }).catch(function() {
      showLogin();
    });
  }
})();
</script>

</body>
</html>`;

  return c.html(html);
});

export default dashboard;
