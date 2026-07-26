import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import type { Env } from '../src/types.js';

describe('dashboard route', () => {
  it('updates countdowns without rerendering the whole page every second', async () => {
    const html = await fetchDashboardHtml();

    expect(html).toContain('data-countdown-expires');
    expect(html).toContain('function updateVisibleCountdowns()');
    expect(html).not.toMatch(/setInterval\(function\(\) \{[\s\S]*?rerenderMain\(\);\s*\}\s*}, 1000\);/);
  });

  it('offers GitHub connect and existing API key login options', async () => {
    const html = await fetchDashboardHtml();

    expect(html).toContain('href="/auth/github?redirect=/dashboard"');
    expect(html).toContain('Connect with GitHub');
    expect(html).toContain('placeholder="vnsh_..."');
    expect(html).toContain('Use API key');
  });

  it('distinguishes drafts, exposes the 10GB Pro plan, and uses mobile card layouts', async () => {
    const html = await fetchDashboardHtml();

    expect(html).toContain("if (s.draft) return 'draft'");
    expect(html).toContain('cleaned after 6h');
    expect(html).toContain('"pro":10');
    expect(html).not.toContain('"max":10');
    expect(html).toContain('(me.stats.total_site_drafts || 0)');
    expect(html).toContain('(me.stats.published_sites || 0)');
    expect(html).toContain("fmtBytes(me.stats.bundle_bytes || 0)");
    expect(html).toContain(" + ' bundles</div>'");
    expect(html).toContain('s.lastActivity + 6 * 3600 * 1000');
    expect(html).toContain('billing managed in Stripe');
    expect(html).not.toContain("PLAN_PRICES_EUR[me.tier] ? '€'");
    expect(html).toContain('.files-head, .keys-head { display: none; }');
    expect(html).toContain('content: attr(data-label)');
    expect(html).not.toContain('/billing/checkout?key=');
  });

  it('covers the iOS browser chrome above the sticky mobile navigation', async () => {
    const html = await fetchDashboardHtml();
    const mobileCss = html.match(
      /@media \(max-width: 760px\) \{([\s\S]*?)\n\}\n@media \(max-width: 520px\)/
    )?.[1];
    const guardCss = mobileCss?.match(/\.sidebar::before\s*\{([^}]*)\}/)?.[1];

    expect(html).toContain('<meta name="theme-color" content="#1649e8">');
    expect(mobileCss).toBeDefined();
    expect(guardCss).toBeDefined();
    expect(guardCss).toMatch(/position:\s*absolute/);
    expect(guardCss).toMatch(/right:\s*0/);
    expect(guardCss).toMatch(/bottom:\s*100%/);
    expect(guardCss).toMatch(/left:\s*0/);
    expect(guardCss).toMatch(/height:\s*100vh/);
    expect(guardCss).toMatch(/height:\s*100svh/);
    expect(guardCss).toMatch(/background:\s*#1649e8/);
    expect(guardCss).toMatch(/pointer-events:\s*none/);
  });

  it('exposes custom domain and password-protection management', async () => {
    const html = await fetchDashboardHtml();

    expect(html).toContain("{ id: 'domains', label: 'Domains'");
    expect(html).toContain("apiFetch('/domains')");
    expect(html).toContain('data-domain-form');
    expect(html).toContain('data-namespace-form');
    expect(html).toContain("apiFetch('/domains/reservation'");
    expect(html).toContain('reserve an identity and route every site');
    expect(html).toContain("data-action=\"protect-site\"");
    expect(html).toContain("JSON.stringify({ mode: 'password', password: password })");
    expect(html).toContain('data-modal-password type="password"');
    expect(html).toContain('Remove password protection?');
    expect(html).toContain("s.access_mode === 'link' ? ' aria-current=\"true\"' : ''");
    expect(html).toContain('<span>Hostname</span><input name="hostname"');
    expect(html).toContain('<span>Channel</span><input name="channel"');
    expect(html).not.toContain("window.prompt('Password");
    expect(html).toContain('Apex domains are not supported yet');
  });

  it('keeps modal interactions accessible and prevents Cancel from confirming', async () => {
    const html = await fetchDashboardHtml();
    const confirmStart = html.indexOf('function confirmModal()');
    const validationIndex = html.indexOf('passwordInput.checkValidity()', confirmStart);
    const closeIndex = html.indexOf('closeModal();', validationIndex);

    expect(html).toContain('role="dialog" aria-modal="true"');
    expect(html).toContain('aria-labelledby="modal-title" aria-describedby="modal-description"');
    expect(html).toContain("rootEl.setAttribute('inert', '')");
    expect(html).toContain("rootEl.removeAttribute('inert')");
    expect(html).toContain('function trapModalFocus(e)');
    expect(html).toContain("target.closest('[data-action=\"modal-cancel\"]')) return");
    expect(html).toContain('modalReturnFocus');
    expect(html).toContain("c.destructive === false ? '[data-action=\"modal-confirm\"]' : 'button[data-action=\"modal-cancel\"]'");
    expect(validationIndex).toBeGreaterThan(confirmStart);
    expect(closeIndex).toBeGreaterThan(validationIndex);
  });

  it('serializes site access mutations and reports request failures inline', async () => {
    const html = await fetchDashboardHtml();

    expect(html).toContain('accessPending: {}');
    expect(html).toContain('accessErrors: {}');
    expect(html).toContain('state.accessPending[protectedSiteId] = true');
    expect(html).toContain('state.accessPending[linkedSiteId] = true');
    expect(html).toContain('delete state.accessPending[protectedSiteId]');
    expect(html).toContain('delete state.accessPending[linkedSiteId]');
    expect(html).toContain('Updating access…');
    expect(html).toContain('Unable to update password protection.');
    expect(html).toContain('Unable to enable link access.');
    expect(html).toContain('data-site-access-region="');
    expect(html).toContain('function focusSiteAccessRegion(siteId, preferredAction)');
    expect(html).toContain("focusSiteAccessRegion(protectedSiteId, 'protect-site')");
    expect(html).toContain("focusSiteAccessRegion(linkedSiteId, 'link-site')");
  });

  it('renders pending, inline error, and mobile overflow states for domains', async () => {
    const html = await fetchDashboardHtml();

    expect(html).toContain("domainPending: { connect: false, reserve: false, verify: {}, delete: {}, release: false }");
    expect(html).toContain("domainErrors: { connect: '', reserve: '', verify: {}, delete: {}, release: '' }");
    expect(html).toContain("state.domainPending.connect = true");
    expect(html).toContain("state.domainPending.reserve = true");
    expect(html).toContain("state.domainPending.verify[verifyHostname] = true");
    expect(html).toContain('Connecting…');
    expect(html).toContain('Reserving…');
    expect(html).toContain('Verifying…');
    expect(html).toContain('Removing…');
    expect(html).toContain('Releasing…');
    expect(html).toContain('Network error. Check your connection and try again.');
    expect(html).toContain('function focusDomainMutation(hostname)');
    expect(html).toContain('function focusDomainVerification(hostname)');
    expect(html).toContain('function focusDomainForm(hostname)');
    expect(html).toContain('function focusNamespaceReservation(reserved)');
    expect(html).toContain('focusDomainVerification(verifyHostname)');
    expect(html).toContain('focusDomainForm(connectedHostname)');
    expect(html).toContain('focusNamespaceReservation(reserved)');
    expect(html).toContain('function focusNamespaceMutation()');
    expect(html).toContain('role="alert"');
    expect(html).toContain('.set-row > * { min-width: 0; }');
    expect(html).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(html).toContain('overflow-wrap: anywhere');
    expect(html).toContain('class="set-hint domain-record"');
  });
});

async function fetchDashboardHtml(): Promise<string> {
  const response = await worker.fetch(new Request('https://vanish.sh/dashboard'), {
    DB: { prepare: () => { throw new Error('DB should not be used'); } } as unknown as D1Database,
    BUCKET: {} as R2Bucket,
    BASE_URL: 'https://vanish.sh',
    SELF_HOSTED: 'false',
    DEFAULT_TIER: 'free',
  } as Env, {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext);

  expect(response.status).toBe(200);
  return response.text();
}
