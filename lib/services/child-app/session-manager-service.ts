/**
 * Child App Session Manager Service - JSON-based Implementation
 * Manages user sessions using the new consolidated JSON structure
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { createHash } from 'crypto';

export interface ChildAppSession {
  token_hash: string;
  refresh_token_hash: string;
  expires_at: string;
  created_at: string;
  ip_address?: string;
  user_agent?: string;
  device_info?: {
    browser?: string;
    os?: string;
    device_type?: string;
  };
}

export interface UserSessionData {
  active_sessions: ChildAppSession[];
  session_history: {
    session_id: string;
    started_at: string;
    ended_at: string;
    end_reason: 'logout' | 'expired' | 'revoked' | 'replaced';
  }[];
}

export interface UserPermissions {
  scopes: string[];
  custom_permissions: Record<string, any>;
  granted_at: string | null;
  expires_at: string | null;
}

export interface UserMetadata {
  login_count: number;
  last_login_at: string | null;
  preferred_language: string;
  timezone: string;
  device_preferences?: Record<string, any>;
}

export class ChildAppSessionManagerService {
  /**
   * Create or update user session with JSON storage
   */
  static async createUserSession(params: {
    userId: string;
    appId: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    scopes: string[];
    ipAddress?: string;
    userAgent?: string;
    deviceInfo?: ChildAppSession['device_info'];
  }): Promise<{
    success: boolean;
    sessionData?: UserSessionData;
    error?: string;
  }> {
    try {
      const supabase = createAdminClient();

      // Hash tokens for security
      const tokenHash = createHash('sha256')
        .update(params.accessToken)
        .digest('hex');
      const refreshTokenHash = createHash('sha256')
        .update(params.refreshToken)
        .digest('hex');

      const expiresAt = new Date(
        Date.now() + params.expiresIn * 1000
      ).toISOString();

      const newSession: ChildAppSession = {
        token_hash: tokenHash,
        refresh_token_hash: refreshTokenHash,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
        device_info: params.deviceInfo
      };

      // Use the utility function to add session
      const { error: functionError } = await supabase.rpc('add_user_session', {
        p_user_id: params.userId,
        p_app_id: params.appId,
        p_session_data: newSession
      });

      if (functionError) {
        throw new Error(`Failed to create session: ${functionError.message}`);
      }

      // Update permissions if provided
      if (params.scopes.length > 0) {
        const permissions: UserPermissions = {
          scopes: params.scopes,
          custom_permissions: {},
          granted_at: new Date().toISOString(),
          expires_at: null // No expiration for now
        };

        const { error: permError } = await supabase
          .from('child_app_user_sessions')
          .update({ permissions })
          .eq('user_id', params.userId)
          .eq('app_id', params.appId);

        if (permError) {
          console.warn('Failed to update permissions:', permError);
        }
      }

      // Fetch the updated session data
      const { data: sessionData } = await supabase
        .from('child_app_user_sessions')
        .select('session_data')
        .eq('user_id', params.userId)
        .eq('app_id', params.appId)
        .single();

      return {
        success: true,
        sessionData: sessionData?.session_data as UserSessionData
      };
    } catch (error) {
      console.error('Error creating user session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate user session using token hash
   */
  static async validateSession(params: {
    userId: string;
    appId: string;
    accessToken: string;
  }): Promise<{
    valid: boolean;
    sessionData?: UserSessionData;
    permissions?: UserPermissions;
  }> {
    try {
      const supabase = createAdminClient();
      const tokenHash = createHash('sha256')
        .update(params.accessToken)
        .digest('hex');

      const { data, error } = await supabase
        .from('child_app_user_sessions')
        .select('session_data, permissions, last_activity_at')
        .eq('user_id', params.userId)
        .eq('app_id', params.appId)
        .single();

      if (error || !data) {
        return { valid: false };
      }

      const sessionData = data.session_data as UserSessionData;
      const activeSessions = sessionData.active_sessions || [];

      // Find session with matching token hash
      const activeSession = activeSessions.find(
        (session) => session.token_hash === tokenHash
      );

      if (!activeSession) {
        return { valid: false };
      }

      // Check if session is expired
      const expiresAt = new Date(activeSession.expires_at);
      if (expiresAt < new Date()) {
        // Remove expired session
        await this.removeExpiredSessions(params.userId, params.appId);
        return { valid: false };
      }

      // Update last activity
      await supabase
        .from('child_app_user_sessions')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('user_id', params.userId)
        .eq('app_id', params.appId);

      return {
        valid: true,
        sessionData,
        permissions: data.permissions as UserPermissions
      };
    } catch (error) {
      console.error('Error validating session:', error);
      return { valid: false };
    }
  }

  /**
   * Revoke user session
   */
  static async revokeSession(params: {
    userId: string;
    appId: string;
    accessToken?: string;
    reason?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = createAdminClient();

      const { data, error: fetchError } = await supabase
        .from('child_app_user_sessions')
        .select('session_data')
        .eq('user_id', params.userId)
        .eq('app_id', params.appId)
        .single();

      if (fetchError || !data) {
        return { success: false, error: 'Session not found' };
      }

      const sessionData = data.session_data as UserSessionData;
      let activeSessions = sessionData.active_sessions || [];

      if (params.accessToken) {
        // Revoke specific session
        const tokenHash = createHash('sha256')
          .update(params.accessToken)
          .digest('hex');

        // Find and remove the specific session
        const sessionToRevoke = activeSessions.find(
          (s) => s.token_hash === tokenHash
        );
        activeSessions = activeSessions.filter(
          (s) => s.token_hash !== tokenHash
        );

        // Add to history
        if (sessionToRevoke) {
          sessionData.session_history = sessionData.session_history || [];
          sessionData.session_history.push({
            session_id: tokenHash.substring(0, 16),
            started_at: sessionToRevoke.created_at,
            ended_at: new Date().toISOString(),
            end_reason: 'revoked'
          });
        }
      } else {
        // Revoke all sessions
        activeSessions.forEach((session) => {
          sessionData.session_history = sessionData.session_history || [];
          sessionData.session_history.push({
            session_id: session.token_hash.substring(0, 16),
            started_at: session.created_at,
            ended_at: new Date().toISOString(),
            end_reason: 'revoked'
          });
        });
        activeSessions = [];
      }

      // Update session data
      const updatedSessionData = {
        ...sessionData,
        active_sessions: activeSessions
      };

      const { error: updateError } = await supabase
        .from('child_app_user_sessions')
        .update({ session_data: updatedSessionData })
        .eq('user_id', params.userId)
        .eq('app_id', params.appId);

      if (updateError) {
        throw new Error(`Failed to revoke session: ${updateError.message}`);
      }

      return { success: true };
    } catch (error) {
      console.error('Error revoking session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Remove expired sessions
   */
  static async removeExpiredSessions(
    userId: string,
    appId: string
  ): Promise<void> {
    try {
      const supabase = createAdminClient();

      const { data, error: fetchError } = await supabase
        .from('child_app_user_sessions')
        .select('session_data')
        .eq('user_id', userId)
        .eq('app_id', appId)
        .single();

      if (fetchError || !data) return;

      const sessionData = data.session_data as UserSessionData;
      const now = new Date();

      const activeSessions = (sessionData.active_sessions || []).filter(
        (session) => {
          const expired = new Date(session.expires_at) < now;

          if (expired) {
            // Add to history
            sessionData.session_history = sessionData.session_history || [];
            sessionData.session_history.push({
              session_id: session.token_hash.substring(0, 16),
              started_at: session.created_at,
              ended_at: now.toISOString(),
              end_reason: 'expired'
            });
          }

          return !expired;
        }
      );

      if (activeSessions.length !== sessionData.active_sessions.length) {
        const updatedSessionData = {
          ...sessionData,
          active_sessions: activeSessions
        };

        await supabase
          .from('child_app_user_sessions')
          .update({ session_data: updatedSessionData })
          .eq('user_id', userId)
          .eq('app_id', appId);
      }
    } catch (error) {
      console.error('Error removing expired sessions:', error);
    }
  }

  /**
   * Get user session statistics
   */
  static async getUserSessionStats(
    userId: string,
    appId: string
  ): Promise<{
    activeSessionCount: number;
    totalLoginCount: number;
    lastLoginAt: string | null;
    sessionHistory: UserSessionData['session_history'];
  } | null> {
    try {
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from('child_app_user_sessions')
        .select('session_data, metadata')
        .eq('user_id', userId)
        .eq('app_id', appId)
        .single();

      if (error || !data) return null;

      const sessionData = data.session_data as UserSessionData;
      const metadata = data.metadata as UserMetadata;

      return {
        activeSessionCount: sessionData.active_sessions?.length || 0,
        totalLoginCount: metadata.login_count || 0,
        lastLoginAt: metadata.last_login_at,
        sessionHistory: sessionData.session_history || []
      };
    } catch (error) {
      console.error('Error getting user session stats:', error);
      return null;
    }
  }
}
