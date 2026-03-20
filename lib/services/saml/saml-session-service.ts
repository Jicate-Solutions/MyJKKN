/**
 * SAML Session Management Service
 *
 * Handles SAML SSO session tracking for Single Logout support
 */

import { createClient } from '@/lib/supabase/server';
import {
  SamlSession,
  SamlSessionInsert,
  SamlError,
  SamlStatusCode,
} from '@/types/saml';
import { v4 as uuidv4 } from 'uuid';

export class SamlSessionService {
  /**
   * Create new SAML session
   */
  static async createSession(
    sessionData: Omit<SamlSessionInsert, 'session_index' | 'expires_at'>,
    expiryMinutes = 480 // 8 hours default
  ): Promise<SamlSession> {
    const supabase = await createClient();

    const sessionIndex = uuidv4();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

    const { data, error } = await supabase
      .from('saml_sessions')
      .insert({
        session_index: sessionIndex,
        ...sessionData,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[saml-session] Failed to create session:', error);
      throw new SamlError(
        'Failed to create SAML session',
        SamlStatusCode.RESPONDER,
        'session_creation_failed'
      );
    }

    return data as SamlSession;
  }

  /**
   * Get session by session index
   */
  static async getSessionByIndex(
    sessionIndex: string
  ): Promise<SamlSession | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('saml_sessions')
      .select('*')
      .eq('session_index', sessionIndex)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('[saml-session] Failed to fetch session:', error);
      throw new SamlError(
        'Failed to fetch session',
        SamlStatusCode.RESPONDER,
        'database_error'
      );
    }

    // Check expiry
    const session = data as SamlSession;
    if (new Date(session.expires_at) < new Date()) {
      await this.deleteSession(sessionIndex);
      return null;
    }

    return session;
  }

  /**
   * Get all sessions for a user
   */
  static async getUserSessions(userId: string): Promise<SamlSession[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('saml_sessions')
      .select('*')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[saml-session] Failed to fetch user sessions:', error);
      throw new SamlError(
        'Failed to fetch user sessions',
        SamlStatusCode.RESPONDER,
        'database_error'
      );
    }

    return data as SamlSession[];
  }

  /**
   * Delete session by session index
   */
  static async deleteSession(sessionIndex: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from('saml_sessions')
      .delete()
      .eq('session_index', sessionIndex);

    if (error) {
      console.error('[saml-session] Failed to delete session:', error);
      throw new SamlError(
        'Failed to delete session',
        SamlStatusCode.RESPONDER,
        'database_error'
      );
    }
  }

  /**
   * Delete all sessions for a user
   */
  static async deleteUserSessions(userId: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from('saml_sessions')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('[saml-session] Failed to delete user sessions:', error);
      throw new SamlError(
        'Failed to delete user sessions',
        SamlStatusCode.RESPONDER,
        'database_error'
      );
    }
  }

  /**
   * Cleanup expired sessions (call from cron job)
   */
  static async cleanupExpiredSessions(): Promise<number> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('saml_sessions')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      console.error('[saml-session] Failed to cleanup expired sessions:', error);
      throw new SamlError(
        'Failed to cleanup expired sessions',
        SamlStatusCode.RESPONDER,
        'database_error'
      );
    }

    return data?.length || 0;
  }
}
