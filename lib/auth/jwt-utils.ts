import * as jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';

// JWT configuration
const JWT_SECRET = process.env.CHILD_APP_JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_ACCESS_EXPIRES_IN = '24h';
const JWT_REFRESH_EXPIRES_IN = '7d';

// Types
export interface JWTPayload {
  user_id: string;
  email: string;
  full_name?: string;
  role: string;
  institution_id?: string;
  permissions?: Record<string, boolean>;
  scope?: string[];
  child_app_id: string;
  token_type: 'access' | 'refresh';
  token_version?: number;
  issued_by: string;
  issued_at: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface DecodedToken extends JWTPayload {
  iat: number;
  exp: number;
}

/**
 * Hash a token for storage
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate an access token
 */
export function generateAccessToken(payload: Omit<JWTPayload, 'token_type' | 'issued_at'>): string {
  const tokenPayload: JWTPayload = {
    ...payload,
    token_type: 'access',
    issued_at: new Date().toISOString(),
  };

  return jwt.sign(tokenPayload, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN,
    issuer: 'myjkkn-auth',
    audience: payload.child_app_id,
  });
}

/**
 * Generate a refresh token
 */
export function generateRefreshToken(
  userId: string,
  childAppId: string,
  tokenVersion: number = 1
): string {
  const payload: JWTPayload = {
    user_id: userId,
    email: '', // Minimal data in refresh token
    role: '',
    child_app_id: childAppId,
    token_type: 'refresh',
    token_version: tokenVersion,
    issued_by: 'myjkkn-auth',
    issued_at: new Date().toISOString(),
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
    issuer: 'myjkkn-auth',
    audience: childAppId,
  });
}

/**
 * Generate a token pair (access and refresh)
 */
export function generateTokenPair(
  payload: Omit<JWTPayload, 'token_type' | 'issued_at' | 'token_version'>
): TokenPair {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload.user_id, payload.child_app_id);

  return {
    accessToken,
    refreshToken,
    expiresIn: 24 * 60 * 60, // 24 hours in seconds
    refreshExpiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
  };
}

/**
 * Verify and decode a token
 */
export function verifyToken(token: string, childAppId?: string): DecodedToken | null {
  try {
    const options: jwt.VerifyOptions = {
      issuer: 'myjkkn-auth',
    };

    if (childAppId) {
      options.audience = childAppId;
    }

    const decoded = jwt.verify(token, JWT_SECRET, options) as DecodedToken;
    return decoded;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Check if a token is expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = jwt.decode(token) as DecodedToken;
    if (!decoded || !decoded.exp) return true;

    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  } catch {
    return true;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Generate a secure random API key
 */
export function generateApiKey(prefix: string = 'jkkn'): string {
  const randomHex = randomBytes(32).toString('hex');
  return `${prefix}_${randomHex.substring(0, 16)}_${randomHex.substring(16, 32)}`;
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  const pattern = /^[a-z]+_[a-f0-9]{16}_[a-f0-9]{16}$/;
  return pattern.test(apiKey);
}

/**
 * Create a session token for child app authentication page
 */
export function createChildAppAuthToken(
  userSessionToken: string,
  childAppId: string,
  redirectUri: string
): string {
  const payload = {
    session_token: userSessionToken,
    child_app_id: childAppId,
    redirect_uri: redirectUri,
    purpose: 'child_app_auth',
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '5m',
    issuer: 'myjkkn-auth',
  });
}

/**
 * Verify child app auth token
 */
export function verifyChildAppAuthToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'myjkkn-auth',
    });
  } catch {
    return null;
  }
}

/**
 * Calculate token expiry date
 */
export function getTokenExpiryDate(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}

/**
 * Generate a CSRF token for additional security
 */
export function generateCSRFToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(token: string, storedToken: string): boolean {
  return token === storedToken && token.length === 64;
}