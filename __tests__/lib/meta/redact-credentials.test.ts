import { describe, it, expect } from 'vitest';
import { redactCredentials } from '@/lib/meta/graph-api-client';

/**
 * Regression guard for a real production leak.
 *
 * On 2026-09-08, 3,536 rows of social_instagram_logs.error_message carried a
 * live Bearer prefix, accumulating since 19 June. The path: the configured Meta
 * token contained an illegal header character, fetch rejected inside
 * Headers.append, and the DOM spec puts the offending header VALUE into the
 * error message — which cron routes persist verbatim.
 *
 * These cases are shaped like the strings actually found in that column.
 */
describe('redactCredentials', () => {
  it('removes the Bearer token that Headers.append puts in its own error', () => {
    const real =
      'Meta Graph request failed: Headers.append: "Bearer EAAFakeTokenForUnitTestsOnlyNotARealMetaCredentialXXXXXXXXXXXXXXXXXXX" is an invalid header value.';
    const out = redactCredentials(real);
    expect(out).not.toContain('EAAFakeTokenForUnitTestsOnlyNotARealMeta');
    // Marker prefix, not the exact string: the Headers rule now substitutes the
    // whole quoted value as [REDACTED_HEADER_VALUE]. The security property this
    // test guards — the token is gone — is unchanged and asserted above.
    expect(out).toContain('[REDACTED');
  });

  it('redacts a bare Meta token with no Bearer prefix', () => {
    const out = redactCredentials('token EAAFakeTokenForUnitTestsOnlyNotARealM rejected');
    expect(out).not.toContain('EAAFakeTokenForUnitTestsOnlyNotARealM');
    expect(out).toContain('[REDACTED_META_TOKEN]');
  });

  it('redacts an access_token query parameter but keeps the rest of the URL', () => {
    const out = redactCredentials(
      'GET /v25.0/me/accounts?fields=id&access_token=EAAGsecretvalue123456 failed'
    );
    expect(out).not.toContain('EAAGsecretvalue123456');
    expect(out).toContain('fields=id');
  });


  // ── the real production shape, added 2026-09-09 ──
  // The first version of redactCredentials shipped on 2026-09-08 and did NOT
  // close the leak: all 29 rows written after it still carried raw token
  // characters. The stored Meta token contains a LINE BREAK, so a pattern
  // anchored on Bearer stopped at the break and left the tail in the clear.
  it('redacts a Bearer token that a line break splits in two', () => {
    const real =
      'Meta Graph request failed: Headers.append: "Bearer EAAFakeTokenForUnitTestsOnlyNotA\nzhpG0VE8IF8DEBFFGa3bFw9pZA0biHtWayFOoZD" is an invalid header value.';
    const out = redactCredentials(real);
    expect(out).not.toContain('EAAFakeTokenForUnitTestsOnlyNotA');
    expect(out).not.toContain('zhpG0VE8IF8DEBFFGa3bFw9pZA0biHtWayFOoZD');
    expect(out).toContain('[REDACTED');
  });

  it('leaves nothing token-shaped anywhere in the split case', () => {
    const real =
      'Headers.append: "Bearer EAAGabcdefghijklmnop\nqrstuvwxyz0123456789ABCD" is an invalid header value.';
    const out = redactCredentials(real);
    // No run of 16+ token characters may survive anywhere in the output.
    expect(/[A-Za-z0-9]{16,}/.test(out.replace(/REDACTED_HEADER_VALUE|REDACTED_META_TOKEN|REDACTED/g, ''))).toBe(false);
  });

  it('still redacts a carriage-return split', () => {
    const out = redactCredentials('Headers.append: "Bearer EAAGabcdefghij\r\nklmnopqrstuvwxyz0123" is invalid');
    expect(out).not.toContain('klmnopqrstuvwxyz0123');
  });

  it('leaves an ordinary diagnostic message untouched', () => {
    const plain = 'Meta Graph request timed out after 15000ms: GET /v25.0/me';
    expect(redactCredentials(plain)).toBe(plain);
  });

  it('does not mangle the word Bearer when no token follows', () => {
    const plain = 'Bearer token missing from configuration';
    expect(redactCredentials(plain)).toBe(plain);
  });
});
