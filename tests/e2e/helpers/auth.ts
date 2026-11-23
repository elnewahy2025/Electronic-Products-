import { createServerClient } from '@supabase/ssr';
import { authenticator } from 'otplib';
import type { BrowserContext } from '@playwright/test';
import { TEST_MFA_SECRET } from './db';

/**
 * Signs in via Supabase and returns cookies compatible with Playwright's
 * context.addCookies(). Uses the same @supabase/ssr client the app uses,
 * so the cookie names/format match exactly.
 */
export async function getAuthCookies(
  email: string,
  password: string
): Promise<Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite: 'Lax' }>> {
  const cookieJar = new Map<string, string>();

  const supabase = createServerClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value }));
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value }) => cookieJar.set(name, value));
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);

  // The real app gates every protected route on a server-issued MFA
  // cookie. Complete the challenge for test accounts that require it.
  const appUrl = process.env.TEST_APP_URL;
  if (appUrl) {
    const cookieHeader = Array.from(cookieJar.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    const post = (action: string, code?: string) =>
      fetch(`${appUrl}/api/auth/mfa`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: new URL(appUrl).origin,
          cookie: cookieHeader,
        },
        body: JSON.stringify(code ? { action, code } : { action }),
      });

    const statusRes = await post('status');
    const status = await statusRes.json().catch(() => ({}));
    if (status.required && !status.satisfied) {
      const challengeRes = await post('challenge', authenticator.generate(TEST_MFA_SECRET));
      if (!challengeRes.ok) {
        throw new Error(`mfa challenge failed for ${email}: ${await challengeRes.text()}`);
      }
      const setCookies = (challengeRes.headers as Headers & { getSetCookie?: () => string[] })
        .getSetCookie?.() ?? [];
      for (const header of setCookies) {
        const [pair] = header.split(';');
        const [name, ...rest] = pair.split('=');
        if (name.trim() === 'mfa_session') cookieJar.set(name.trim(), rest.join('='));
      }
    }
  }

  return Array.from(cookieJar.entries()).map(([name, value]) => ({
    name,
    value,
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
  }));
}

/**
 * Sets auth cookies on a Playwright BrowserContext, ready to make authenticated
 * requests to the Next.js app.
 */
export async function authenticateContext(
  context: BrowserContext,
  email: string,
  password: string
): Promise<void> {
  const cookies = await getAuthCookies(email, password);
  await context.addCookies(cookies);
}

/**
 * Returns a Cookie header string for use with fetch() calls inside tests.
 */
export async function getCookieHeader(email: string, password: string): Promise<string> {
  const cookies = await getAuthCookies(email, password);
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}