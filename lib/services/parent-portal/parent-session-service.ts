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

    const supabase = await createClient();

    const { data, error } = await supabase.rpc('validate_parent_session', {
      p_token: token,
    });

    if (error) {
      console.error('[ParentSessionService] Session validation error:', error);
      return { valid: false, error: 'Session validation failed' };
    }

    if (!data?.valid) {
      return { valid: false, error: data?.error || 'Invalid session' };
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

    cookieStore.set('parent_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });
  }

  /**
   * Gets the session token from the httpOnly cookie
   * @returns The session token or null if not found
   */
  static async getSessionToken(): Promise<string | null> {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('parent_session');

    return sessionCookie?.value || null;
  }

  /**
   * Clears the session cookie
   */
  static async clearSessionCookie(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete('parent_session');
  }

  /**
   * Revokes a session (logout)
   * Uses SECURITY DEFINER RPC to bypass RLS
   */
  static async revokeSession(token: string, reason?: string): Promise<void> {
    const supabase = await createClient();

    await supabase.rpc('revoke_parent_session', {
      p_token: token,
      p_reason: reason || null,
    });
  }

  /**
   * Revokes all sessions for a parent (logout from all devices)
   * Uses SECURITY DEFINER RPC to bypass RLS
   */
  static async revokeAllSessions(parentId: string, reason?: string): Promise<void> {
    const supabase = await createClient();

    await supabase.rpc('revoke_all_parent_sessions', {
      p_parent_id: parentId,
      p_reason: reason || 'User logged out from all devices',
    });
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
   * Clean up expired sessions (should be run periodically)
   */
  static async cleanupExpiredSessions(): Promise<void> {
    const supabase = await createClient();

    await supabase.rpc('cleanup_expired_parent_sessions');
  }
}
