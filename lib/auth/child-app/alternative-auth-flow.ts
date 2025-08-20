/**
 * Alternative Authentication Flow for Child Apps
 *
 * This provides a more robust authentication flow that:
 * 1. Uses URL state parameter instead of cookies
 * 2. Completely bypasses Google One Tap for child app flows
 * 3. Provides better error handling and recovery
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface ChildAppAuthState {
  app_id: string;
  redirect_uri: string;
  scope?: string;
  state?: string;
  timestamp: number;
  flow_id: string;
}

export class AlternativeAuthFlow {
  private static readonly STATE_KEY = 'child_app_auth_state';
  private static readonly STATE_EXPIRY = 10 * 60 * 1000; // 10 minutes

  /**
   * Initiates the authentication flow from a child app
   */
  static initiateFlow(params: {
    app_id: string;
    redirect_uri: string;
    scope?: string;
    state?: string;
    parent_app_url: string;
  }): string {
    // Generate a unique flow ID
    const flowId = this.generateFlowId();

    // Create auth state
    const authState: ChildAppAuthState = {
      app_id: params.app_id,
      redirect_uri: params.redirect_uri,
      scope: params.scope,
      state: params.state,
      timestamp: Date.now(),
      flow_id: flowId
    };

    // Encode state as base64
    const encodedState = btoa(JSON.stringify(authState));

    // Store in sessionStorage as backup
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(
        `${this.STATE_KEY}_${flowId}`,
        JSON.stringify(authState)
      );
    }

    // Build login URL with encoded state
    const loginUrl = new URL(`${params.parent_app_url}/auth/login`);
    loginUrl.searchParams.append('child_app_state', encodedState);
    loginUrl.searchParams.append('flow_id', flowId);
    loginUrl.searchParams.append('disable_one_tap', 'true');

    return loginUrl.toString();
  }

  /**
   * Retrieves and validates auth state from URL or storage
   */
  static getAuthState(): ChildAppAuthState | null {
    if (typeof window === 'undefined') return null;

    const params = new URLSearchParams(window.location.search);

    // Try to get from URL first
    const encodedState = params.get('child_app_state');
    if (encodedState) {
      try {
        const state = JSON.parse(atob(encodedState)) as ChildAppAuthState;
        if (this.isValidState(state)) {
          return state;
        }
      } catch (e) {
        console.error('Failed to parse child_app_state from URL:', e);
      }
    }

    // Try to get from sessionStorage using flow_id
    const flowId = params.get('flow_id');
    if (flowId) {
      const storedState = sessionStorage.getItem(`${this.STATE_KEY}_${flowId}`);
      if (storedState) {
        try {
          const state = JSON.parse(storedState) as ChildAppAuthState;
          if (this.isValidState(state)) {
            return state;
          }
        } catch (e) {
          console.error('Failed to parse state from storage:', e);
        }
      }
    }

    // Legacy fallback - check for direct params
    const appId = params.get('app_id');
    const redirectUri = params.get('redirect_uri');
    if (appId && redirectUri) {
      return {
        app_id: appId,
        redirect_uri: redirectUri,
        scope: params.get('scope') || undefined,
        state: params.get('state') || undefined,
        timestamp: Date.now(),
        flow_id: this.generateFlowId()
      };
    }

    return null;
  }

  /**
   * Validates auth state
   */
  private static isValidState(state: ChildAppAuthState): boolean {
    if (!state.app_id || !state.redirect_uri) return false;

    // Check if state has expired
    if (Date.now() - state.timestamp > this.STATE_EXPIRY) {
      console.warn('Child app auth state has expired');
      return false;
    }

    return true;
  }

  /**
   * Generates a unique flow ID
   */
  private static generateFlowId(): string {
    return `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clears auth state
   */
  static clearAuthState(flowId?: string) {
    if (typeof window === 'undefined') return;

    if (flowId) {
      sessionStorage.removeItem(`${this.STATE_KEY}_${flowId}`);
    } else {
      // Clear all auth states
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith(this.STATE_KEY)) {
          sessionStorage.removeItem(key);
        }
      });
    }
  }

  /**
   * Handles the OAuth callback with child app support
   */
  static async handleCallback(
    code: string,
    origin: string
  ): Promise<{
    success: boolean;
    redirectUrl?: string;
    error?: string;
  }> {
    try {
      const authState = this.getAuthState();
      const supabase = createClientSupabaseClient();

      // Exchange code for session
      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        return { success: false, error: exchangeError.message };
      }

      // Get user
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();
      if (userError || !user) {
        return { success: false, error: 'Failed to get user session' };
      }

      // Check profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('profile_completed')
        .eq('id', user.id)
        .single();

      // If profile not completed, redirect there first
      if (!profile?.profile_completed) {
        // Preserve child app state in the redirect
        const profileUrl = new URL('/auth/complete-profile', origin);
        if (authState) {
          profileUrl.searchParams.append(
            'child_app_state',
            btoa(JSON.stringify(authState))
          );
          profileUrl.searchParams.append('flow_id', authState.flow_id);
        }
        return { success: true, redirectUrl: profileUrl.toString() };
      }

      // If this is a child app flow
      if (authState) {
        // Clear the state
        this.clearAuthState(authState.flow_id);

        // Redirect to consent page
        const consentUrl = new URL('/auth/child-app/login', origin);
        consentUrl.searchParams.append('app_id', authState.app_id);
        consentUrl.searchParams.append('redirect_uri', authState.redirect_uri);
        if (authState.scope)
          consentUrl.searchParams.append('scope', authState.scope);
        if (authState.state)
          consentUrl.searchParams.append('state', authState.state);

        return { success: true, redirectUrl: consentUrl.toString() };
      }

      // Normal flow - redirect based on role
      let destination = '/';
      if (profile.role === 'guest') {
        destination = '/guest';
      } else if (profile.role === 'student') {
        destination = '/learner';
      }

      return {
        success: true,
        redirectUrl: new URL(destination, origin).toString()
      };
    } catch (error) {
      console.error('Callback error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  /**
   * Builds OAuth URL with proper state handling
   */
  static buildOAuthUrl(provider: string, origin: string): string {
    const authState = this.getAuthState();
    const redirectTo = new URL('/auth/callback', origin);

    // Add child app state to callback URL if present
    if (authState) {
      redirectTo.searchParams.append(
        'child_app_state',
        btoa(JSON.stringify(authState))
      );
      redirectTo.searchParams.append('flow_id', authState.flow_id);
    }

    return redirectTo.toString();
  }
}

/**
 * Hook for child app authentication
 */
export function useChildAppAuth() {
  const authState = AlternativeAuthFlow.getAuthState();

  return {
    isChildAppAuth: !!authState,
    authState,
    clearState: () => AlternativeAuthFlow.clearAuthState(authState?.flow_id)
  };
}
