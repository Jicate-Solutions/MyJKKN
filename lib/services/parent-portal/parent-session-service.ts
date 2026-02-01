// lib/services/parent-portal/parent-session-service.ts

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

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
   * @param parentId - The parent's UUID
   * @param ipAddress - Client IP address (optional)
   * @param userAgent - Client user agent (optional)
   * @returns Session data including secure token
   */
  static async createSession(
    parentId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<SessionData> {
    const supabase = await createClient();

    // Generate cryptographically secure session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store session in database
    const { error } = await supabase.from('parent_sessions').insert({
      session_token: sessionToken,
      parent_id: parentId,
      expires_at: expiresAt.toISOString(),
      ip_address: ipAddress,
      user_agent: userAgent,
      created_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[ParentSessionService] Failed to create session:', error);
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
   * @param token - The session token to validate
   * @returns Validation result with parent ID if valid
   */
  static async validateSession(token: string): Promise<SessionValidationResult> {
    if (!token) {
      return { valid: false, error: 'No session token provided' };
    }

    const supabase = await createClient();
    const now = new Date();

    // Query session
    const { data, error } = await supabase
      .from('parent_sessions')
      .select('parent_id, expires_at, revoked')
      .eq('session_token', token)
      .single();

    if (error || !data) {
      return { valid: false, error: 'Invalid session token' };
    }

    // Check if revoked
    if (data.revoked) {
      return { valid: false, error: 'Session has been revoked' };
    }

    // Check if expired
    if (new Date(data.expires_at) < now) {
      // Clean up expired session
      await supabase
        .from('parent_sessions')
        .delete()
        .eq('session_token', token);

      return { valid: false, error: 'Session has expired' };
    }

    // Update last activity
    await supabase
      .from('parent_sessions')
      .update({ last_activity_at: now.toISOString() })
      .eq('session_token', token);

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
   * @param token - The session token to revoke
   * @param reason - Reason for revocation (optional)
   */
  static async revokeSession(token: string, reason?: string): Promise<void> {
    const supabase = await createClient();

    await supabase
      .from('parent_sessions')
      .update({
        revoked: true,
        revoked_at: new Date().toISOString(),
        revoked_reason: reason,
      })
      .eq('session_token', token);
  }

  /**
   * Revokes all sessions for a parent (logout from all devices)
   * @param parentId - The parent's UUID
   * @param reason - Reason for revocation (optional)
   */
  static async revokeAllSessions(parentId: string, reason?: string): Promise<void> {
    const supabase = await createClient();

    await supabase
      .from('parent_sessions')
      .update({
        revoked: true,
        revoked_at: new Date().toISOString(),
        revoked_reason: reason || 'User logged out from all devices',
      })
      .eq('parent_id', parentId)
      .eq('revoked', false);
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
