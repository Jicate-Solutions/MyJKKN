// lib/utils/csrf.ts

import crypto from 'crypto';
import { cookies } from 'next/headers';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Generates a cryptographically secure CSRF token
 * @returns A random CSRF token
 */
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Sets a CSRF token in a cookie (NOT httpOnly so client can read it)
 * SECURITY: CSRF tokens must be readable by JavaScript to send in request headers
 * The double-submit cookie pattern protects against CSRF attacks because:
 * 1. Attacker cannot read the cookie from a different origin (Same-Origin Policy)
 * 2. Attacker cannot set a cookie on our domain
 * 3. Validation checks that cookie value matches header value
 *
 * @param token - The CSRF token to set (generates one if not provided)
 * @returns The CSRF token that was set
 */
export async function setCSRFCookie(token?: string, cookieStore?: Awaited<ReturnType<typeof cookies>>): Promise<string> {
  const csrfToken = token || generateCSRFToken();
  const store = cookieStore ?? await cookies();

  store.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false, // MUST be false so JavaScript can read it for double-submit pattern
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/', // Must be '/' so cookie is sent to both /parent-portal and /api/parent-portal
  });

  return csrfToken;
}

/**
 * Gets the CSRF token from the cookie
 * @returns The CSRF token or null if not found
 */
export async function getCSRFTokenFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const csrfCookie = cookieStore.get(CSRF_COOKIE_NAME);

  return csrfCookie?.value || null;
}

/**
 * Validates a CSRF token from the request header against the cookie
 * @param headerToken - The CSRF token from the request header
 * @returns True if valid, false otherwise
 */
export async function validateCSRFToken(headerToken: string | null): Promise<boolean> {
  if (!headerToken) {
    return false;
  }

  const cookieToken = await getCSRFTokenFromCookie();

  if (!cookieToken) {
    return false;
  }

  // Validate token format (should be 64 hex characters)
  const tokenPattern = /^[0-9a-f]{64}$/i;
  if (!tokenPattern.test(headerToken) || !tokenPattern.test(cookieToken)) {
    return false;
  }

  // Check buffer lengths match before timing-safe comparison
  // crypto.timingSafeEqual throws an error if lengths differ
  const headerBuffer = Buffer.from(headerToken, 'utf8');
  const cookieBuffer = Buffer.from(cookieToken, 'utf8');

  if (headerBuffer.length !== cookieBuffer.length) {
    return false;
  }

  try {
    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(headerBuffer, cookieBuffer);
  } catch (error) {
    // Catch any unexpected errors during comparison
    console.error('[CSRF] Token comparison error:', error);
    return false;
  }
}

/**
 * Middleware helper to validate CSRF token from request headers
 * @param request - The Next.js request object
 * @returns True if valid, false otherwise
 */
export async function validateCSRFFromRequest(request: Request): Promise<boolean> {
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  return validateCSRFToken(headerToken);
}

/**
 * Clears the CSRF cookie
 */
export async function clearCSRFCookie(cookieStore?: Awaited<ReturnType<typeof cookies>>): Promise<void> {
  const store = cookieStore ?? await cookies();
  store.delete(CSRF_COOKIE_NAME);
}

/**
 * Gets a CSRF token for client-side use (not httpOnly)
 * This token should be included in form submissions and AJAX requests
 * @returns The CSRF token
 */
export async function getCSRFTokenForClient(): Promise<string> {
  let token = await getCSRFTokenFromCookie();

  if (!token) {
    token = await setCSRFCookie();
  }

  return token;
}

export { CSRF_HEADER_NAME };
