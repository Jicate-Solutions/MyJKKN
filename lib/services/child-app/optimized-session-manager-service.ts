/**
 * Optimized Child App Session Manager Service
 * Uses unified session storage: one record per user for ALL apps
 * Reduces database records by 90%+
 */

import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';

export interface OptimizedSession {
  token_hash: string;
  refresh_token_hash: string;
  expires_at: string;
  created_at: string;
  ip_address?: string;
  user_agent?: string;
  last_used_at?: string;
  device_info?: {
    browser?: string;
    os?: string;
    device_type?: string;
  };
}

export interface AppSessionData {
  active_sessions: OptimizedSession[];
  permissions: {
    scopes: string[];
    custom_permissions?: Record<string, any>;
    granted_at: string | null;
    expires_at?: string | null;
  };
  metadata: {
    login_count: number;
    last_login_at: string | null;
    preferred_language?: string;
    timezone?: string;
  };
  last_activity_at: string;
}

export interface UnifiedSessionRecord {
  user_id: string;
  app_sessions: Record<string, AppSessionData>;
  global_metadata?: Record<string, any>;
  total_apps_connected: number;
}

export class OptimizedSessionManagerService {
  /**
   * Create or update user session for a specific app
   * This now updates a single record per user instead of creating new records
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
    deviceInfo?: OptimizedSession['device_info'];
  }): Promise<{
    success: boolean;
    sessionData?: AppSessionData;
    error?: string;
  }> {
    try {
      const supabase = createServiceRoleClient();

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

      const newSession: OptimizedSession = {
        token_hash: tokenHash,
        refresh_token_hash: refreshTokenHash,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
        device_info: params.deviceInfo,
        last_used_at: new Date().toISOString()
      };

      // Prepare session data for this app
      const appSessionData: AppSessionData = {
        active_sessions: [newSession],
        permissions: {
          scopes: params.scopes,
          custom_permissions: {},
          granted_at: new Date().toISOString()
        },
        metadata: {
          login_count: 1,
          last_login_at: new Date().toISOString(),
          preferred_language: 'en',
          timezone: 'UTC'
        },
        last_activity_at: new Date().toISOString()
      };

      // Use the optimized upsert function
      const { data, error } = await supabase.rpc('upsert_user_app_session', {
        p_user_id: params.userId,
        p_app_id: params.appId,
        p_session_data: appSessionData
      });

      if (error) {
        throw new Error(`Failed to create session: ${error.message}`);
      }

      // Clean up expired sessions for this user (async, don't wait)
      this.cleanupUserExpiredSessions(params.userId).catch(console.error);

      return {
        success: true,
        sessionData: appSessionData
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
   * Queries a single record and checks the specific app's sessions
   */
  static async validateSession(params: {
    userId: string;
    appId: string;
    accessToken: string;
  }): Promise<{
    valid: boolean;
    sessionData?: AppSessionData;
    session?: OptimizedSession;
  }> {
    try {
      const supabase = createServiceRoleClient();
      const tokenHash = createHash('sha256')
        .update(params.accessToken)
        .digest('hex');

      // Get the user's unified session record
      const { data, error } = await supabase
        .from('child_app_unified_sessions')
        .select('app_sessions')
        .eq('user_id', params.userId)
        .single();

      if (error || !data) {
        return { valid: false };
      }

      // Get the specific app's session data
      const appSessionData = data.app_sessions[params.appId] as AppSessionData;
      
      if (!appSessionData) {
        return { valid: false };
      }

      // Find the session with matching token hash
      const activeSession = appSessionData.active_sessions?.find(
        (session) => session.token_hash === tokenHash
      );

      if (!activeSession) {
        return { valid: false };
      }

      // Check if session is expired
      if (new Date(activeSession.expires_at) < new Date()) {
        // Remove expired session asynchronously
        this.removeExpiredSession(params.userId, params.appId, tokenHash).catch(console.error);
        return { valid: false };
      }

      // Update last activity for this app
      await this.updateAppActivity(params.userId, params.appId);

      return {
        valid: true,
        sessionData: appSessionData,
        session: activeSession
      };
    } catch (error) {
      console.error('Error validating session:', error);
      return { valid: false };
    }
  }

  /**
   * Get all apps a user has sessions with
   */
  static async getUserConnectedApps(userId: string): Promise<{
    apps: string[];
    totalSessions: number;
  }> {
    try {
      const supabase = createServiceRoleClient();

      const { data, error } = await supabase
        .from('child_app_unified_sessions')
        .select('app_sessions, total_apps_connected')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return { apps: [], totalSessions: 0 };
      }

      const apps = Object.keys(data.app_sessions);
      const totalSessions = Object.values(data.app_sessions).reduce<number>(
        (sum, appData: any) => sum + (Number(appData.active_sessions?.length) || 0),
        0
      );

      return { apps, totalSessions };
    } catch (error) {
      console.error('Error getting user apps:', error);
      return { apps: [], totalSessions: 0 };
    }
  }

  /**
   * Revoke sessions for a specific app or all apps
   */
  static async revokeSession(params: {
    userId: string;
    appId?: string;
    accessToken?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = createServiceRoleClient();

      if (params.appId) {
        // Revoke sessions for specific app
        const { data, error } = await supabase
          .from('child_app_unified_sessions')
          .select('app_sessions')
          .eq('user_id', params.userId)
          .single();

        if (error || !data) {
          return { success: false, error: 'User sessions not found' };
        }

        const appSessions = data.app_sessions;
        
        if (params.accessToken) {
          // Revoke specific session
          const tokenHash = createHash('sha256')
            .update(params.accessToken)
            .digest('hex');

          if (appSessions[params.appId]) {
            appSessions[params.appId].active_sessions = 
              appSessions[params.appId].active_sessions.filter(
                (s: OptimizedSession) => s.token_hash !== tokenHash
              );
          }
        } else {
          // Revoke all sessions for the app
          delete appSessions[params.appId];
        }

        // Update the record
        const { error: updateError } = await supabase
          .from('child_app_unified_sessions')
          .update({ 
            app_sessions: appSessions,
            total_apps_connected: Object.keys(appSessions).length,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', params.userId);

        if (updateError) {
          throw updateError;
        }
      } else {
        // Revoke all sessions for all apps
        const { error: updateError } = await supabase
          .from('child_app_unified_sessions')
          .update({ 
            app_sessions: {},
            total_apps_connected: 0,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', params.userId);

        if (updateError) {
          throw updateError;
        }
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
   * Update last activity timestamp for an app
   */
  private static async updateAppActivity(userId: string, appId: string): Promise<void> {
    try {
      const supabase = createServiceRoleClient();
      
      // Use JSONB path update for efficiency
      await supabase.rpc('execute_sql', {
        query: `
          UPDATE child_app_unified_sessions
          SET app_sessions = jsonb_set(
            app_sessions,
            '{${appId},last_activity_at}',
            to_jsonb(NOW())
          ),
          updated_at = NOW()
          WHERE user_id = $1
        `,
        params: [userId]
      });
    } catch (error) {
      console.error('Error updating activity:', error);
    }
  }

  /**
   * Remove a specific expired session
   */
  private static async removeExpiredSession(
    userId: string,
    appId: string,
    tokenHash: string
  ): Promise<void> {
    try {
      const supabase = createServiceRoleClient();

      const { data, error } = await supabase
        .from('child_app_unified_sessions')
        .select('app_sessions')
        .eq('user_id', userId)
        .single();

      if (error || !data) return;

      const appSessions = data.app_sessions;
      
      if (appSessions[appId]) {
        appSessions[appId].active_sessions = 
          appSessions[appId].active_sessions.filter(
            (s: OptimizedSession) => s.token_hash !== tokenHash
          );

        // If no more sessions for this app, remove the app entry
        if (appSessions[appId].active_sessions.length === 0) {
          delete appSessions[appId];
        }

        await supabase
          .from('child_app_unified_sessions')
          .update({ 
            app_sessions: appSessions,
            total_apps_connected: Object.keys(appSessions).length,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);
      }
    } catch (error) {
      console.error('Error removing expired session:', error);
    }
  }

  /**
   * Clean up all expired sessions for a user
   */
  private static async cleanupUserExpiredSessions(userId: string): Promise<number> {
    try {
      const supabase = createServiceRoleClient();
      
      const { data, error } = await supabase.rpc('cleanup_user_expired_sessions', {
        p_user_id: userId
      });

      return data || 0;
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
      return 0;
    }
  }

  /**
   * Get session statistics for analytics
   */
  static async getSessionStats(appId?: string): Promise<{
    totalUsers: number;
    totalSessions: number;
    activeUsers: number;
    averageSessionsPerUser: number;
  }> {
    try {
      const supabase = createServiceRoleClient();

      if (appId) {
        // Stats for specific app
        const { data, error } = await supabase
          .from('child_app_unified_sessions')
          .select('app_sessions')
          .not('app_sessions', 'is', null);

        if (error || !data) {
          return { totalUsers: 0, totalSessions: 0, activeUsers: 0, averageSessionsPerUser: 0 };
        }

        let totalUsers = 0;
        let totalSessions = 0;
        let activeUsers = 0;

        data.forEach(record => {
          const appData = record.app_sessions[appId];
          if (appData) {
            totalUsers++;
            const sessions = appData.active_sessions || [];
            totalSessions += sessions.length;
            
            // Check if any session is active (not expired)
            const hasActive = sessions.some((s: OptimizedSession) => 
              new Date(s.expires_at) > new Date()
            );
            if (hasActive) activeUsers++;
          }
        });

        return {
          totalUsers,
          totalSessions,
          activeUsers,
          averageSessionsPerUser: totalUsers > 0 ? totalSessions / totalUsers : 0
        };
      } else {
        // Global stats
        const { data, error } = await supabase
          .from('child_app_unified_sessions')
          .select('app_sessions, total_apps_connected');

        if (error || !data) {
          return { totalUsers: 0, totalSessions: 0, activeUsers: 0, averageSessionsPerUser: 0 };
        }

        const totalUsers = data.length;
        let totalSessions = 0;
        let activeUsers = 0;

        data.forEach(record => {
          const allSessions = Object.values(record.app_sessions).flatMap(
            (appData: any) => appData.active_sessions || []
          );
          totalSessions += allSessions.length;
          
          const hasActive = allSessions.some((s: OptimizedSession) => 
            new Date(s.expires_at) > new Date()
          );
          if (hasActive) activeUsers++;
        });

        return {
          totalUsers,
          totalSessions,
          activeUsers,
          averageSessionsPerUser: totalUsers > 0 ? totalSessions / totalUsers : 0
        };
      }
    } catch (error) {
      console.error('Error getting session stats:', error);
      return { totalUsers: 0, totalSessions: 0, activeUsers: 0, averageSessionsPerUser: 0 };
    }
  }
}