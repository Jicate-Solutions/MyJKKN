import { createServiceRoleClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';
import { IPDetector } from '@/lib/utils/ip-detector';

export interface SessionData {
  userId: string;
  role: string;
  institutionId?: string;
  departmentId?: string;
  programId?: string;
  semesterId?: string;
  sectionId?: string;
  request: NextRequest;
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  loginAt: string;
}

/**
 * Service for tracking user sessions and engagement
 */
export class SessionTrackingService {
  /**
   * Generate a unique session ID
   */
  static generateSessionId(): string {
    return crypto.randomUUID();
  }

  /**
   * Detect device type from user agent
   */
  static detectDeviceType(userAgent: string): 'mobile' | 'tablet' | 'desktop' {
    const ua = userAgent.toLowerCase();

    // Check for mobile devices
    if (
      /mobile|android|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop/.test(
        ua
      )
    ) {
      return 'mobile';
    }

    // Check for tablets
    if (/tablet|ipad|playbook|silk/.test(ua)) {
      return 'tablet';
    }

    // Default to desktop
    return 'desktop';
  }

  /**
   * Get user organizational context from database
   */
  static async getUserOrganizationalContext(userId: string) {
    const supabase = await createServiceRoleClient();

    const { data, error } = await supabase.rpc(
      'get_user_organizational_context',
      {
        p_user_id: userId
      }
    );

    if (error) {
      console.error(
        '[SessionTracking] Error getting organizational context:',
        error
      );
      return null;
    }

    // Return the first row (function returns a table)
    return data && data.length > 0 ? data[0] : null;
  }

  /**
   * Create a new session record
   */
  static async createSession(
    sessionData: SessionData
  ): Promise<SessionInfo | null> {
    try {
      const sessionId = this.generateSessionId();
      const supabase = await createServiceRoleClient();

      // Get IP address
      const ipInfo = IPDetector.extractIPInfo(sessionData.request);
      const ipAddress = ipInfo.public_ip;

      // Get user agent and detect device type
      const userAgent = sessionData.request.headers.get('user-agent') || '';
      const deviceType = this.detectDeviceType(userAgent);

      // Get organizational context
      const orgContext = await this.getUserOrganizationalContext(
        sessionData.userId
      );

      // Insert session record
      const { data, error } = await supabase
        .from('user_sessions')
        .insert({
          session_id: sessionId,
          user_id: sessionData.userId,
          login_at: new Date().toISOString(),
          is_active: true,
          role: sessionData.role,
          institution_id:
            sessionData.institutionId || orgContext?.institution_id || null,
          department_id:
            sessionData.departmentId || orgContext?.department_id || null,
          program_id: sessionData.programId || orgContext?.program_id || null,
          semester_id: sessionData.semesterId || orgContext?.semester_id || null,
          section_id: sessionData.sectionId || orgContext?.section_id || null,
          ip_address: ipAddress || null,  // Fix: Use NULL for empty string to match inet type
          user_agent: userAgent,
          device_type: deviceType,
          actions_count: 0,
          modules_accessed: []
        })
        .select('session_id, user_id, login_at')
        .single();

      if (error) {
        console.error('[SessionTracking] Error creating session:', error);
        return null;
      }

      return {
        sessionId: data.session_id,
        userId: data.user_id,
        loginAt: data.login_at
      };
    } catch (error) {
      console.error('[SessionTracking] Unexpected error creating session:', error);
      // Don't throw - session creation failure should not block login
      return null;
    }
  }

  /**
   * Close an active session
   */
  static async closeSession(sessionId: string): Promise<boolean> {
    try {
      const supabase = await createServiceRoleClient();

      const { error } = await supabase.rpc('close_user_session', {
        p_session_id: sessionId,
        p_logout_at: new Date().toISOString()
      });

      if (error) {
        console.error('[SessionTracking] Error closing session:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[SessionTracking] Unexpected error closing session:', error);
      return false;
    }
  }

  /**
   * Track module access during a session
   */
  static async trackModuleAccess(
    sessionId: string,
    moduleName: string
  ): Promise<boolean> {
    try {
      const supabase = await createServiceRoleClient();

      const { error } = await supabase.rpc('add_module_to_session', {
        p_session_id: sessionId,
        p_module_name: moduleName
      });

      if (error) {
        console.error('[SessionTracking] Error tracking module access:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error(
        '[SessionTracking] Unexpected error tracking module access:',
        error
      );
      return false;
    }
  }

  /**
   * Get active session for a user
   */
  static async getActiveSession(userId: string): Promise<string | null> {
    try {
      const supabase = await createServiceRoleClient();

      const { data, error } = await supabase
        .from('user_sessions')
        .select('session_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('login_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[SessionTracking] Error getting active session:', error);
        return null;
      }

      return data?.session_id || null;
    } catch (error) {
      console.error(
        '[SessionTracking] Unexpected error getting active session:',
        error
      );
      return null;
    }
  }

  /**
   * Get session history for a user
   */
  static async getSessionHistory(
    userId: string,
    limit: number = 10
  ): Promise<any[]> {
    try {
      const supabase = await createServiceRoleClient();

      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('login_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[SessionTracking] Error getting session history:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error(
        '[SessionTracking] Unexpected error getting session history:',
        error
      );
      return [];
    }
  }
}
