export async function unlockSiteForVerification(
  url: string,
  siteId: string,
  password: string,
): Promise<Record<string, string>> {
  const response = await fetch(new URL('/.vanish/access', url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site: siteId, password, return: '/' }),
    redirect: 'manual',
  });

  if (!response.ok) {
    throw new Error(`Password verification failed (${response.status})`);
  }

  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) {
    throw new Error('Password verification did not return an access session');
  }

  return { Cookie: cookie };
}

export function isPasswordGate(response: Response): boolean {
  return response.headers.get('x-vanish-access') === 'password-required';
}
