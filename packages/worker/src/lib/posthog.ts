import type { Env } from '../types.js';

// Public project key for the hosted vanish.sh PostHog project. Safe to ship in client code.
const HOSTED_POSTHOG_KEY = 'phc_BCpPQFoAM6qMoomUS96dA2otiwkmMPF2VrYqiWdbiHBP';
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
const HOSTED_HOSTNAME = 'vanish.sh';

export interface PostHogConfig {
  key: string;
  host: string;
}

/**
 * Resolve PostHog settings for a request. An explicit POSTHOG_KEY always wins;
 * otherwise the hosted key is only used on the real vanish.sh host so local dev
 * and self-hosted deployments never report into the hosted project.
 */
export function posthogConfig(env: Env, requestUrl: string): PostHogConfig | null {
  const host = (env.POSTHOG_HOST || DEFAULT_POSTHOG_HOST).replace(/\/+$/, '');
  if (env.POSTHOG_KEY) {
    return { key: env.POSTHOG_KEY, host };
  }

  if (env.SELF_HOSTED === 'true') {
    return null;
  }

  try {
    if (new URL(requestUrl).hostname !== HOSTED_HOSTNAME) {
      return null;
    }
  } catch {
    return null;
  }

  return { key: HOSTED_POSTHOG_KEY, host };
}

/**
 * Dashboard pages render user filenames, share URLs, and site IDs. Keep
 * autocapture and replay on, but never send that text or those attributes.
 */
export const POSTHOG_MASK_USER_CONTENT = {
  mask_all_text: true,
  mask_all_element_attributes: true,
  session_recording: { maskAllInputs: true, maskTextSelector: '*' },
};

/**
 * Official posthog-js HTML snippet plus init call, as plain JS (no <script> tag)
 * so pages can run it after scrubbing secrets from the URL.
 */
export function posthogInitScript(config: PostHogConfig | null, extraOptions: Record<string, unknown> = {}): string {
  if (!config) {
    return '';
  }

  const options = {
    api_host: config.host,
    defaults: '2026-05-30',
    capture_pageview: 'history_change',
    // OAuth hands API keys over in the URL fragment; never record fragments.
    disable_capture_url_hashes: true,
    // User mini-sites live on *.vanish.sh and must not read or overwrite our identity cookie.
    cross_subdomain_cookie: false,
    ...extraOptions,
  };

  return `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(${scriptJson(config.key)}, ${scriptJson(options)});`;
}

export function posthogScriptTag(config: PostHogConfig | null): string {
  const script = posthogInitScript(config);
  return script ? `<script>\n${script}\n</script>` : '';
}

/**
 * Server-side capture. Never throws: analytics must not break the request path.
 */
export async function capturePostHogEvent(
  config: PostHogConfig | null,
  event: string,
  distinctId: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (!config) {
    return;
  }

  try {
    const response = await fetch(`${config.host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: config.key,
        event,
        distinct_id: distinctId,
        properties,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!response.ok) {
      console.error(`PostHog capture ${event} failed with status ${response.status}`);
    }
  } catch (err) {
    console.error(`PostHog capture ${event} failed:`, err);
  }
}

// JSON that is safe to inline inside a <script> element.
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
