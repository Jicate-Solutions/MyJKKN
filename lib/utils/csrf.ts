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
 * Sets a CSRF token in an httpOnly cookie
 * @param token - The CSRF token to set (generates one if not provided)
 * @returns The CSRF token that was set
 */
export async function setCSRFCookie(token?: string): Promise<string> {
  const csrfToken = token || generateCSRFToken();
  const cookieStore = await cookies();

  cookieStore.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
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

  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(headerToken),
    Buffer.from(cookieToken)
  );
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
export async function clearCSRFCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CSRF_COOKIE_NAME);
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
