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
      'Meta Graph request failed: Headers.append: "Bearer EAAGNeb4CWZCUBRgixZCZAioTE3vC1OAzhpG0VE8IF8DEBFFGa3bFw9pZA0biHtWayFOo" is an invalid header value.';
    const out = redactCredentials(real);
    expect(out).not.toContain('EAAGNeb4CWZCUBRgixZCZAioTE3vC1OAzhpG0VE8');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts a bare Meta token with no Bearer prefix', () => {
    const out = redactCredentials('token EAAGNeb4CWZCUBRgixZCZAioTE3vC1OAzhpG0 rejected');
    expect(out).not.toContain('EAAGNeb4CWZCUBRgixZCZAioTE3vC1OAzhpG0');
    expect(out).toContain('[REDACTED_META_TOKEN]');
  });

  it('redacts an access_token query parameter but keeps the rest of the URL', () => {
    const out = redactCredentials(
      'GET /v25.0/me/accounts?fields=id&access_token=EAAGsecretvalue123456 failed'
    );
    expect(out).not.toContain('EAAGsecretvalue123456');
    expect(out).toContain('fields=id');
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
