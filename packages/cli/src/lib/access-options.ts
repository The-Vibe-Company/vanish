import type { AccessInput } from './api-client.js';

/** Commander collector for repeatable `--allow-email` (also accepts comma lists). */
export function collectEmail(value: string, previous: string[] = []): string[] {
  return [...previous, ...value.split(',').map(email => email.trim()).filter(Boolean)];
}

/** Parses the file argument of `vanish files access`: an ID, `id.ext`, or a /f/ URL. */
export function parseFileTarget(target: string): string {
  let value = target.trim();
  try {
    value = new URL(value).pathname.replace(/^\/f\//, '');
  } catch {
    // Not a URL.
  }
  return value.replace(/\.[^./]+$/, '');
}

export function describeAccessMode(access: { mode: string; emailCount?: number } | undefined): string {
  if (!access || access.mode === 'link') return 'Anyone with the link can open it.';
  if (access.mode === 'password') return 'Password protection enabled.';
  const count = access.emailCount ?? 0;
  return `Restricted to ${count} email${count === 1 ? '' : 's'}; visitors get a one-time code.`;
}

export type { AccessInput };
