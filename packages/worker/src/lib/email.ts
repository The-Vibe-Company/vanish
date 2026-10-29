import type { Env } from '../types.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Sends a one-time access code through Resend. Never logs the address or code.
 */
export async function sendAccessCodeEmail(
  env: Env,
  message: { to: string; code: string; label: string; minutes: number },
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.ACCESS_EMAIL_FROM) {
    throw new Error('Email delivery is not configured');
  }

  const subject = `${message.code} is your Vanish access code`;
  const text = [
    `Your code to open "${message.label}" on Vanish is ${message.code}.`,
    '',
    `It expires in ${message.minutes} minutes. If you did not request it, ignore this email.`,
  ].join('\n');

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.ACCESS_EMAIL_FROM,
      to: [message.to],
      subject,
      text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend responded with ${response.status}`);
  }
}
