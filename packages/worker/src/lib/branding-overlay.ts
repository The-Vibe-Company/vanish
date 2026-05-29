interface OverlayOptions {
  baseUrl: string;
  expiresAt: string | null;
}

interface HtmlOverlayOptions extends OverlayOptions {
  request: Request;
}

interface ViewerOptions extends OverlayOptions {
  request: Request;
  filename: string;
  contentType: string;
}

export function isHtmlContent(contentType: string | null): boolean {
  return /^text\/html(?:\s*;|$)/i.test(contentType || '');
}

export async function maybeAddBrandingOverlay(
  body: ReadableStream | null,
  headers: Headers,
  options: HtmlOverlayOptions,
): Promise<Response> {
  addBrowserNegotiationVary(headers);

  if (!body || !isBrowserNavigation(options.request) || !isHtmlContent(headers.get('Content-Type'))) {
    return new Response(body, { headers });
  }

  const html = await new Response(body).text();
  const enhanced = injectBrandingOverlay(html, options);
  const encoded = new TextEncoder().encode(enhanced);
  headers.set('Content-Length', String(encoded.byteLength));

  return new Response(encoded, { headers });
}

export function shouldServeBrandingViewer(request: Request, contentType: string | null, forceViewer = false): boolean {
  return isBrowserNavigation(request) && (forceViewer || !isHtmlContent(contentType));
}

export function brandedViewerResponse(headers: Headers, options: ViewerOptions): Response {
  const body = buildViewerHtml(options);
  const encoded = new TextEncoder().encode(body);
  const viewerHeaders = new Headers();
  viewerHeaders.set('Content-Type', 'text/html; charset=utf-8');
  viewerHeaders.set('Content-Length', String(encoded.byteLength));
  viewerHeaders.set('X-Content-Type-Options', 'nosniff');
  viewerHeaders.set('X-Robots-Tag', headers.get('X-Robots-Tag') || 'noindex, nofollow, noarchive');
  viewerHeaders.set('Referrer-Policy', headers.get('Referrer-Policy') || 'no-referrer');
  viewerHeaders.set('Cache-Control', headers.get('Cache-Control') || 'public, max-age=300');
  viewerHeaders.set('Access-Control-Allow-Origin', headers.get('Access-Control-Allow-Origin') || '*');
  viewerHeaders.set('Link', headers.get('Link') || '<mailto:abuse@vanish.sh>; rel="abuse"');
  addBrowserNegotiationVary(viewerHeaders);

  return new Response(encoded, { headers: viewerHeaders });
}

export function injectBrandingOverlay(html: string, options: OverlayOptions): string {
  const overlay = buildOverlayMarkup(options);
  const closingBody = /<\/body\s*>/i;

  if (closingBody.test(html)) {
    return html.replace(closingBody, `${overlay}</body>`);
  }

  return html + overlay;
}

function isBrowserNavigation(request: Request): boolean {
  if (request.method !== 'GET') {
    return false;
  }

  const url = new URL(request.url);
  if (url.searchParams.get('raw') === '1') {
    return false;
  }

  const destination = request.headers.get('Sec-Fetch-Dest')?.toLowerCase();
  if (destination && destination !== 'document') {
    return false;
  }

  const mode = request.headers.get('Sec-Fetch-Mode')?.toLowerCase();
  if (destination === 'document' || mode === 'navigate') {
    return true;
  }

  const accept = request.headers.get('Accept')?.toLowerCase() || '';
  return accept.includes('text/html');
}

function buildViewerHtml(options: ViewerOptions): string {
  const rawUrl = buildRawUrl(options.request.url);
  const mediaType = options.contentType.split(';', 1)[0].trim().toLowerCase();
  const escapedFilename = escapeHtml(options.filename || 'download');
  const preview = buildPreviewMarkup(rawUrl, mediaType, escapedFilename);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedFilename} - vanish</title>
  <style>
    html,body{margin:0;min-height:100%;background:#f5f7fb;color:#121417;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .viewer{min-height:100vh;display:grid;grid-template-rows:auto 1fr}
    .bar{height:48px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 14px;border-bottom:1px solid #dde3ec;background:rgba(255,255,255,.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
    .name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:650;color:#171a1f}
    .actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
    .actions a{box-sizing:border-box;min-height:30px;display:inline-flex;align-items:center;border:1px solid #c8d1de;border-radius:7px;padding:6px 10px;color:#111827;background:#fff;text-decoration:none;font-size:12px;font-weight:650}
    main{min-height:0}
    iframe,.media{display:block;width:100%;height:calc(100vh - 48px);border:0;background:#fff}
    img.media,video.media{object-fit:contain;background:#111827}
    .fallback{min-height:calc(100vh - 48px);display:grid;place-items:center;padding:32px;box-sizing:border-box}
    .fallback-inner{max-width:460px;text-align:center}
    .fallback h1{margin:0 0 10px;font-size:22px;line-height:1.2}
    .fallback p{margin:0 0 18px;color:#4b5563;font-size:14px;line-height:1.5}
    .download{display:inline-flex;align-items:center;min-height:38px;border-radius:8px;background:#111827;color:#fff;padding:0 14px;text-decoration:none;font-size:14px;font-weight:700}
    @media (prefers-color-scheme:dark){
      html,body{background:#111827;color:#f8fafc}
      .bar{border-bottom-color:#263244;background:rgba(17,24,39,.88)}
      .name{color:#f8fafc}
      .actions a{border-color:#374151;background:#1f2937;color:#f8fafc}
      iframe{background:#fff}
      .fallback p{color:#cbd5e1}
      .download{background:#f8fafc;color:#111827}
    }
  </style>
</head>
<body>
  <div class="viewer">
    <header class="bar">
      <div class="name">${escapedFilename}</div>
      <div class="actions"><a href="${escapeHtml(rawUrl)}" download>Original file</a></div>
    </header>
    <main>${preview}</main>
  </div>
  ${buildOverlayMarkup(options)}
</body>
</html>`;
}

function buildPreviewMarkup(rawUrl: string, mediaType: string, filename: string): string {
  const escapedUrl = escapeHtml(rawUrl);

  if (mediaType.startsWith('image/')) {
    return `<img class="media" src="${escapedUrl}" alt="${filename}">`;
  }

  if (mediaType.startsWith('video/')) {
    return `<video class="media" src="${escapedUrl}" controls playsinline></video>`;
  }

  if (
    mediaType === 'application/pdf' ||
    mediaType === 'application/json' ||
    mediaType === 'application/xml' ||
    mediaType === 'text/xml' ||
    mediaType.startsWith('text/')
  ) {
    return `<iframe src="${escapedUrl}" title="${filename}"></iframe>`;
  }

  return `<section class="fallback">
    <div class="fallback-inner">
      <h1>Download ${filename}</h1>
      <p>This file type cannot be previewed reliably in every browser, so Vanish is keeping the original file untouched.</p>
      <a class="download" href="${escapedUrl}" download>Open original file</a>
    </div>
  </section>`;
}

function buildRawUrl(input: string): string {
  const url = new URL(input);
  url.searchParams.set('raw', '1');
  return url.toString();
}

function buildOverlayMarkup(options: OverlayOptions): string {
  const homeUrl = normalizeHomeUrl(options.baseUrl);
  const datetime = options.expiresAt ? ` datetime="${escapeHtml(options.expiresAt)}"` : '';
  const expiryLabel = formatExpiryLabel(options.expiresAt);
  const exactLabel = formatExactExpiryLabel(options.expiresAt);

  return `
<div id="vanish-overlay" aria-label="Vanish temporary share information" data-vanish-expires="${escapeHtml(options.expiresAt || '')}" style="all:initial;position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:2147483647;display:block;pointer-events:none;">
  <div style="all:initial;box-sizing:border-box;display:block;width:min(282px,calc(100vw - 28px));padding:12px 12px 11px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:rgba(12,14,18,.88);box-shadow:0 18px 48px rgba(0,0,0,.30),0 3px 10px rgba(0,0,0,.24);color:#f7f7f2;backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);pointer-events:auto;">
    <div style="all:initial;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 9px;">
      <a href="${escapeHtml(homeUrl)}" target="_blank" rel="noopener noreferrer" style="all:initial;display:inline-flex;align-items:center;gap:7px;min-width:0;color:#cbd5e1;font:700 12px/1.2 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;text-decoration:none;letter-spacing:0;cursor:pointer;">
        <span style="all:initial;box-sizing:border-box;display:inline-block;width:7px;height:7px;border-radius:50%;background:#67e8a5;box-shadow:0 0 0 3px rgba(103,232,165,.16);flex:0 0 auto;"></span>
        <span style="all:initial;display:block;color:#cbd5e1;font:700 12px/1.2 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;letter-spacing:0;white-space:nowrap;">vanish.sh</span>
      </a>
      <button id="vanish-overlay-dismiss" type="button" aria-label="Hide Vanish overlay" title="Hide Vanish overlay" style="all:initial;box-sizing:border-box;display:grid;place-items:center;width:24px;height:24px;border-radius:6px;color:#cbd5e1;background:rgba(255,255,255,.06);font:700 15px/1 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;cursor:pointer;flex:0 0 auto;">&times;</button>
    </div>
    <a href="${escapeHtml(homeUrl)}" target="_blank" rel="noopener noreferrer" style="all:initial;display:block;min-width:0;text-decoration:none;cursor:pointer;">
      <time id="vanish-overlay-countdown"${datetime} style="all:initial;display:block;margin:0 0 4px;color:#f8fafc;font:800 16px/1.25 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(expiryLabel)}</time>
      <span id="vanish-overlay-date" style="all:initial;display:block;color:#cbd5e1;font:500 12px/1.35 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(exactLabel)}</span>
    </a>
  </div>
</div>
<script>(function(){var o=document.getElementById('vanish-overlay');if(!o)return;var k='vanish-overlay:hidden:'+location.origin+location.pathname;try{if(localStorage.getItem(k)==='1'){o.style.display='none';return;}}catch(e){}var b=document.getElementById('vanish-overlay-dismiss');if(b){b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();o.style.display='none';try{localStorage.setItem(k,'1');}catch(_){};});}var exp=o.getAttribute('data-vanish-expires');var c=document.getElementById('vanish-overlay-countdown');var d=document.getElementById('vanish-overlay-date');function pad(n){return String(n).padStart(2,'0');}function update(){if(!exp||!c)return;var t=new Date(exp);if(isNaN(t.getTime()))return;var ms=t.getTime()-Date.now();if(ms<=0){c.textContent='Expired';}else{var m=Math.ceil(ms/60000);var days=Math.floor(m/1440);var hours=Math.floor((m%1440)/60);var mins=m%60;var parts=[];if(days>0)parts.push(days+'d');if(hours>0||days>0)parts.push(hours+'h');parts.push(mins+'m');c.textContent='Vanishes in '+parts.join(' ');}if(d){var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];d.textContent=months[t.getMonth()]+' '+t.getDate()+', '+pad(t.getHours())+':'+pad(t.getMinutes());}}update();setInterval(update,60000);})();</script>`;
}

function normalizeHomeUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return 'https://vanish.sh/';
  }
}

function addBrowserNegotiationVary(headers: Headers): void {
  const existing = headers.get('Vary');
  const values = new Set(
    (existing || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  );
  values.add('Accept');
  values.add('Sec-Fetch-Dest');
  values.add('Sec-Fetch-Mode');
  headers.set('Vary', Array.from(values).join(', '));
}

function formatExpiryLabel(expiresAt: string | null): string {
  if (!expiresAt) {
    return 'No expiry';
  }

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return 'Expiry date unavailable';
  }

  const remainingMs = date.getTime() - Date.now();
  if (remainingMs <= 0) {
    return 'Expired';
  }

  const totalMinutes = Math.ceil(remainingMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }
  parts.push(`${minutes}m`);

  return `Vanishes in ${parts.join(' ')}`;
}

function formatExactExpiryLabel(expiresAt: string | null): string {
  if (!expiresAt) {
    return 'No expiry date';
  }

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return 'Expiry date unavailable';
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${hh}:${min} UTC`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
