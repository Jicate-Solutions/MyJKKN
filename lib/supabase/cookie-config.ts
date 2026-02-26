// lib/supabase/cookie-config.ts
// Optimized cookie configuration to prevent HTTP 431 errors

import { CookieOptions } from '@supabase/ssr';

/**
 * Cookie configuration that prevents HTTP 431 errors by:
 * 1. Using chunked cookies for large tokens
 * 2. Setting appropriate size limits
 * 3. Cleaning up stale cookies
 */
export const SUPABASE_COOKIE_CONFIG = {
  /**
   * Maximum cookie size before chunking (3.5KB to stay under 4KB limit)
   * Browser limit is ~4KB per cookie, we use 3.5KB for safety margin
   */
  MAX_COOKIE_SIZE: 3500,

  /**
   * Cookie options optimized for security and size
   */
  cookieOptions: {
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true
  } satisfies Partial<CookieOptions>,

  /**
   * Chunk large cookie values to prevent 431 errors
   */
  chunkCookie(name: string, value: string): Array<{ name: string; value: string }> {
    if (value.length <= this.MAX_COOKIE_SIZE) {
      return [{ name, value }];
    }

    // Split into chunks
    const chunks: Array<{ name: string; value: string }> = [];
    const chunkCount = Math.ceil(value.length / this.MAX_COOKIE_SIZE);

    for (let i = 0; i < chunkCount; i++) {
      const start = i * this.MAX_COOKIE_SIZE;
      const end = start + this.MAX_COOKIE_SIZE;
      const chunk = value.slice(start, end);

      chunks.push({
        name: `${name}.${i}`,
        value: chunk
      });
    }

    // Store metadata about chunking
    chunks.push({
      name: `${name}.chunks`,
      value: chunkCount.toString()
    });

    return chunks;
  },

  /**
   * Reassemble chunked cookie values
   */
  reassembleCookie(
    name: string,
    getCookie: (name: string) => string | undefined
  ): string | undefined {
    // Check if cookie is chunked
    const chunksCount = getCookie(`${name}.chunks`);

    if (!chunksCount) {
      // Not chunked, return as-is
      return getCookie(name);
    }

    // Reassemble chunks
    const chunks: string[] = [];
    const count = parseInt(chunksCount, 10);

    for (let i = 0; i < count; i++) {
      const chunk = getCookie(`${name}.${i}`);
      if (!chunk) {
        console.warn(`[Cookie] Missing chunk ${i} for ${name}`);
        return undefined;
      }
      chunks.push(chunk);
    }

    return chunks.join('');
  },

  /**
   * Clean up all chunks of a cookie
   */
  removeChunkedCookie(
    name: string,
    getCookie: (name: string) => string | undefined,
    removeCookie: (name: string) => void
  ): void {
    const chunksCount = getCookie(`${name}.chunks`);

    if (!chunksCount) {
      // Not chunked, remove normally
      removeCookie(name);
      return;
    }

    // Remove all chunks
    const count = parseInt(chunksCount, 10);
    for (let i = 0; i < count; i++) {
      removeCookie(`${name}.${i}`);
    }
    removeCookie(`${name}.chunks`);
    removeCookie(name); // Remove base cookie if exists
  }
};

/**
 * Clean up old/stale auth cookies to prevent accumulation
 * Call this on logout or when cookies become corrupted
 */
export function cleanupAuthCookies(
  getAllCookies: () => Array<{ name: string }>,
  removeCookie: (name: string) => void
): void {
  const cookies = getAllCookies();

  // Remove all Supabase auth cookies
  const authCookiePatterns = [
    /^sb-.*-auth-token/,
    /^sb-access-token/,
    /^sb-refresh-token/,
    /^supabase-auth-token/
  ];

  cookies.forEach((cookie) => {
    if (authCookiePatterns.some((pattern) => pattern.test(cookie.name))) {
      removeCookie(cookie.name);
    }
  });

  console.log('[Auth] Cleaned up stale auth cookies');
}
