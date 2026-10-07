import { describe, expect, it } from 'vitest';
import { safeReturnPath } from '@/lib/auth/safe-return-path';

describe('safeReturnPath — where to land after sign-in', () => {
  it.each([
    '/',
    '/instasolver/r/abc123',
    '/instasolver/r/abc123?from=qr#top',
    '/meet/some-handle',
    '/campus-walk/fix?tab=open&page=2',
  ])('accepts a path on this site unchanged: %s', (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it.each([
    ['protocol-relative', '//evil.com'],
    ['protocol-relative with path', '//evil.com/instasolver/r/x'],
    ['slash-backslash', '/\\evil.com'],
    ['double backslash', '\\\\evil.com'],
    ['backslash later in the path', '/instasolver\\..\\..\\evil'],
    ['absolute https URL', 'https://evil.com'],
    ['absolute http URL', 'http://evil.com/instasolver/r/x'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,hi'],
    ['encoded double slash', '/%2f%2fevil.com'],
    ['encoded double slash, upper case', '/%2F%2Fevil.com'],
    ['encoded backslash', '/%5cevil.com'],
    ['encoded backslash, upper case', '/%5Cevil.com'],
    ['leading space', ' /instasolver/r/x'],
    ['tab after first slash', '/\t/evil.com'],
    ['newline', '/instasolver/r/x\n'],
    ['relative path', 'instasolver/r/x'],
    ['back to the login page', '/auth/login'],
    ['back to the login page with query', '/auth/login?redirectedFrom=/x'],
    ['back to the OAuth callback', '/auth/callback?code=abc'],
    ['the error page', '/error'],
    ['dev overlay frames', '/__nextjs_original-stack-frames?x=1'],
    ['empty string', ''],
  ])('refuses %s', (_label, value) => {
    expect(safeReturnPath(value)).toBeNull();
  });

  it.each([null, undefined, 42, {}, ['/x']])('refuses a non-string value: %j', (value) => {
    expect(safeReturnPath(value)).toBeNull();
  });

  it('refuses an overlong value', () => {
    expect(safeReturnPath(`/${'a'.repeat(3000)}`)).toBeNull();
  });

  it('survives the proxy → login → OAuth callback round trip for a QR scan', () => {
    // proxy.ts: redirectedFrom = path + search on the /auth/login URL
    const scanned = '/instasolver/r/tok_123?src=qr';
    const loginUrl = new URL('/auth/login', 'https://www.jkkn.ai');
    loginUrl.searchParams.set('redirectedFrom', scanned);

    // login page: threads it into the OAuth redirect_to as ?next=
    const fromLogin = safeReturnPath(new URL(loginUrl.toString()).searchParams.get('redirectedFrom'));
    const callbackUrl = new URL('/auth/callback', 'https://www.jkkn.ai');
    callbackUrl.searchParams.set('samlReqId', 'keep-me');
    if (fromLogin) callbackUrl.searchParams.set('next', fromLogin);

    // callback: reads it back and lands there
    const back = new URL(callbackUrl.toString());
    expect(safeReturnPath(back.searchParams.get('next'))).toBe(scanned);
    expect(back.searchParams.get('samlReqId')).toBe('keep-me');
  });
});
