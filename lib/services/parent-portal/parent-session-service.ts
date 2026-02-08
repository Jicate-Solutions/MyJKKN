// lib/services/parent-portal/parent-session-service.ts
// Parent session management using SECURITY DEFINER RPCs to bypass RLS
// (Parent portal uses its own auth system, not Supabase auth)

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

// Session configuration constants
const SESSION_TOKEN_LENGTH = 32; // bytes (produces 64 hex characters)
const SESSION_EXPIRY_DAYS = 7;
const SESSION_EXPIRY_MS = SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const SESSION_EXPIRY_SECONDS = SESSION_EXPIRY_DAYS * 24 * 60 * 60; // 7 days in seconds
const SESSION_COOKIE_NAME = 'parent_session';
const SESSION_COOKIE_PATH = '/parent-portal'; // Scope to parent portal only

// Session token format: 64 hex characters
const SESSION_TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

export interface SessionData {
  sessionToken: string;
  parentId: string;
  expiresAt: Date;
}

export interface SessionValidationResult {
  valid: boolean;
  parentId?: string;
  error?: string;
}

export class ParentSessionService {
  /**
   * Creates a new secure session for a parent
   * Uses SECURITY DEFINER RPC to bypass RLS
   */
  static async createSession(
    parentId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<SessionData> {
    const supabase = await createClient();

    // Generate cryptographically secure session token
    const sessionToken = crypto.randomBytes(SESSION_TOKEN_LENGTH).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

    // Validate token was generated successfully
    if (!sessionToken || sessionToken.length !== SESSION_TOKEN_LENGTH * 2) {
      console.error('[ParentSessionService] Failed to generate valid session token');
      throw new Error('Failed to generate session token');
    }

    // Use SECURITY DEFINER RPC to bypass RLS
    const { data, error } = await supabase.rpc('create_parent_session', {
      p_session_token: sessionToken,
      p_parent_id: parentId,
      p_expires_at: expiresAt.toISOString(),
      p_ip_address: ipAddress || null,
      p_user_agent: userAgent || null,
    });

    if (error) {
      console.error('[ParentSessionService] Failed to create session:', error);
      throw new Error('Failed to create session');
    }

    if (!data?.success) {
      console.error('[ParentSessionService] Session creation failed');
      // Don't expose internal error messages to prevent information leakage
      throw new Error('Failed to create session');
    }

    return {
      sessionToken,
      parentId,
      expiresAt,
    };
  }

  /**
   * Validates a session token and returns the parent ID if valid
   * Uses SECURITY DEFINER RPC to bypass RLS
   */
  static async validateSession(token: string): Promise<SessionValidationResult> {
    if (!token) {
      return { valid: false, error: 'No session token provided' };
    }

    // Validate token format before database lookup to prevent wasted queries
    if (!SESSION_TOKEN_PATTERN.test(token)) {
      return { valid: false, error: 'Invalid token format' };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc('validate_parent_session', {
      p_token: token,
    });

    if (error) {
      console.error('[ParentSessionService] Session validation error:', error);
      return { valid: false, error: 'Session validation failed' };
    }

    if (!data?.valid) {
      return { valid: false, error: 'Invalid session' };
    }

    return {
      valid: true,
      parentId: data.parent_id,
    };
  }

  /**
   * Sets a secure httpOnly cookie with the session token
   * @param sessionToken - The session token to store
   */
  static async setSessionCookie(sessionToken: string): Promise<void> {
    const cookieStore = await cookies();

    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SESSION_EXPIRY_SECONDS,
      path: SESSION_COOKIE_PATH, // Scoped to parent portal only
    });
  }

  /**
   * Gets the session token from the httpOnly cookie
   * @returns The session token or null if not found
   */
  static async getSessionToken(): Promise<string | null> {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    return sessionCookie?.value || null;
  }

  /**
   * Clears the session cookie AND revokes the session in the database
   * SECURITY: This prevents stolen cookies from remaining valid after logout
   */
  static async clearSessionCookie(): Promise<void> {
    const cookieStore = await cookies();

    // Get token before deleting cookie
    const token = await this.getSessionToken();

    // Delete the cookie first
    cookieStore.delete(SESSION_COOKIE_NAME);

    // Revoke session in database if token exists
    // This prevents stolen cookies from being used after logout
    if (token) {
      try {
        await this.revokeSession(token, 'User logged out');
      } catch (error) {
        // Log error but don't throw - cookie is already cleared
        console.error('[ParentSessionService] Failed to revoke session during logout:', error);
      }
    }
  }

  /**
   * Revokes a session (logout)
   * Uses SECURITY DEFINER RPC to bypass RLS
   */
  static async revokeSession(token: string, reason?: string): Promise<void> {
    if (!token) {
      throw new Error('Session token is required for revocation');
    }

    // Validate token format
    if (!SESSION_TOKEN_PATTERN.test(token)) {
      throw new Error('Invalid session token format');
    }

    const supabase = await createClient();

    const { error } = await supabase.rpc('revoke_parent_session', {
      p_token: token,
      p_reason: reason || 'Session revoked',
    });

    if (error) {
      console.error('[ParentSessionService] Failed to revoke session:', error);
      throw new Error('Failed to revoke session');
    }
  }

  /**
   * Revokes all sessions for a parent (logout from all devices)
   * Uses SECURITY DEFINER RPC to bypass RLS
   */
  static async revokeAllSessions(parentId: string, reason?: string): Promise<void> {
    if (!parentId) {
      throw new Error('Parent ID is required for revocation');
    }

    const supabase = await createClient();

    const { error } = await supabase.rpc('revoke_all_parent_sessions', {
      p_parent_id: parentId,
      p_reason: reason || 'User logged out from all devices',
    });

    if (error) {
      console.error('[ParentSessionService] Failed to revoke all sessions:', error);
      throw new Error('Failed to revoke all sessions');
    }
  }

  /**
   * Gets the current authenticated parent ID from the session
   * @returns Parent ID or null if not authenticated
   */
  static async getCurrentParentId(): Promise<string | null> {
    const token = await this.getSessionToken();

    if (!token) {
      return null;
    }

    const result = await this.validateSession(token);

    return result.valid ? result.parentId! : null;
  }

  /**
   * Middleware helper to require authentication
   * @returns Parent ID if authenticated, throws error otherwise
   */
  static async requireAuth(): Promise<string> {
    const parentId = await this.getCurrentParentId();

    if (!parentId) {
      throw new Error('Authentication required');
    }

    return parentId;
  }

  /**
   * Clean up expired sessions (should be run periodically via cron job)
   * @returns Number of sessions cleaned up
   */
  static async cleanupExpiredSessions(): Promise<number> {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('cleanup_expired_parent_sessions');

    if (error) {
      console.error('[ParentSessionService] Failed to cleanup expired sessions:', error);
      throw new Error('Failed to cleanup expired sessions');
    }

    const cleanedCount = data?.count || 0;
    if (cleanedCount > 0) {
      console.log(`[ParentSessionService] Cleaned up ${cleanedCount} expired sessions`);
    }

    return cleanedCount;
  }
}
