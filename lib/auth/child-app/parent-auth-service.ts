import axios, { AxiosInstance } from 'axios';
import Cookies from 'js-cookie';

// Configuration
const PARENT_APP_URL =
  process.env.NEXT_PUBLIC_PARENT_APP_URL || 'https://my.jkkn.ac.in';
const CHILD_APP_ID = process.env.NEXT_PUBLIC_CHILD_APP_ID || '';
const CHILD_APP_API_KEY = process.env.NEXT_PUBLIC_CHILD_APP_API_KEY || '';

// Cookie keys
const TOKEN_COOKIE = 'parent_auth_token';
const REFRESH_TOKEN_COOKIE = 'parent_auth_refresh';
const USER_COOKIE = 'parent_auth_user';
const SESSION_COOKIE = 'parent_auth_session';
const STATE_COOKIE = 'parent_auth_state';

// Types
export interface ParentAppUser {
  id: string;
  email: string;
  full_name: string;
  phone_number?: string;
  role: string;
  institution_id?: string;
  is_super_admin?: boolean;
  permissions: Record<string, boolean>;
  profile_completed?: boolean;
  avatar_url?: string;
  last_login?: string;
}

export interface AuthSession {
  id: string;
  expires_at: string;
  created_at: string;
  last_used_at?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: ParentAppUser;
}

export interface ValidationResponse {
  valid: boolean;
  user?: ParentAppUser;
  session?: AuthSession;
  error?: string;
}

class ParentAuthService {
  private api: AxiosInstance;
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: PARENT_APP_URL,
      headers: {
        'X-API-Key': CHILD_APP_API_KEY
      }
    });

    // Add request interceptor to include token
    this.api.interceptors.request.use(
      (config) => {
        const token = this.getAccessToken();
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor to handle token refresh
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          const refreshed = await this.refreshToken();
          if (refreshed) {
            const token = this.getAccessToken();
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return this.api(originalRequest);
            }
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Generate a random state parameter for CSRF protection
   */
  private generateState(): string {
    // Generate a cryptographically secure random state
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
      ''
    );
  }

  /**
   * Store state parameter temporarily for validation
   */
  private storeState(state: string): void {
    Cookies.set(STATE_COOKIE, state, {
      expires: 1 / 288, // 5 minutes (1/288 of a day)
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
  }

  /**
   * Retrieve and clear stored state parameter
   */
  private getAndClearState(): string | null {
    const state = Cookies.get(STATE_COOKIE);
    if (state) {
      Cookies.remove(STATE_COOKIE);
      return state;
    }
    return null;
  }

  /**
   * Validate state parameter against stored value
   */
  private validateState(receivedState: string | null): boolean {
    const storedState = this.getAndClearState();

    if (!receivedState || !storedState) {
      console.warn('CSRF Warning: Missing state parameter in OAuth callback');
      return false;
    }

    if (receivedState !== storedState) {
      console.error('CSRF Error: State parameter mismatch!', {
        received: receivedState,
        expected: storedState
      });
      return false;
    }

    return true;
  }

  /**
   * Initiate login by redirecting to parent app login with child app parameters
   */
  login(redirectUrl?: string): void {
    const currentUrl = redirectUrl || window.location.href;

    // Generate random state for CSRF protection
    const state = this.generateState();

    // Store state temporarily for validation (expires in 5 minutes)
    this.storeState(state);

    const authUrl =
      `${PARENT_APP_URL}/auth/login?` +
      `app_id=${CHILD_APP_ID}&` +
      `redirect_uri=${encodeURIComponent(currentUrl)}&` +
      `scope=read,write,profile&` +
      `state=${encodeURIComponent(state)}`;

    window.location.href = authUrl;
  }

  /**
   * Handle callback from parent app after login
   */
  async handleCallback(
    token: string,
    refreshToken?: string,
    state?: string
  ): Promise<ParentAppUser | null> {
    // Validate state parameter for CSRF protection
    if (!this.validateState(state || null)) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }
    try {
      // Validate the token first
      const validation = await this.validateToken(token);

      if (!validation.valid || !validation.user) {
        console.error('Token validation failed');
        return null;
      }

      // Store tokens and user data
      this.setAccessToken(token);
      if (refreshToken) {
        this.setRefreshToken(refreshToken);
      }
      this.setUser(validation.user);
      if (validation.session) {
        this.setSession(validation.session);
      }

      return validation.user;
    } catch (error) {
      console.error('Auth callback error:', error);
      return null;
    }
  }

  /**
   * Validate a token with the parent app
   */
  async validateToken(token: string): Promise<ValidationResponse> {
    try {
      const response = await axios.post(
        `${PARENT_APP_URL}/api/auth/child-app/validate`,
        {
          token,
          child_app_id: CHILD_APP_ID
        },
        {
          headers: {
            'X-API-Key': CHILD_APP_API_KEY
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Token validation error:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  /**
   * Refresh the access token
   */
  async refreshToken(): Promise<boolean> {
    // Prevent multiple simultaneous refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this._doRefreshToken();
    const result = await this.refreshPromise;
    this.refreshPromise = null;
    return result;
  }

  private async _doRefreshToken(): Promise<boolean> {
    try {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) {
        return false;
      }

      const response = await axios.post(
        `${PARENT_APP_URL}/api/auth/child-app/refresh`,
        {
          refresh_token: refreshToken,
          child_app_id: CHILD_APP_ID
        },
        {
          headers: {
            'X-API-Key': CHILD_APP_API_KEY
          }
        }
      );

      const data: TokenResponse = response.data;

      // Update stored tokens and user
      this.setAccessToken(data.access_token);
      this.setRefreshToken(data.refresh_token);
      this.setUser(data.user);

      return true;
    } catch (error) {
      console.error('Token refresh error:', error);
      // Clear session on refresh failure
      this.clearSession();
      return false;
    }
  }

  /**
   * Logout user
   */
  logout(redirectToParent: boolean = true): void {
    // Clear local session
    this.clearSession();

    if (redirectToParent) {
      // Redirect to parent app logout
      const returnUrl = encodeURIComponent(window.location.origin);
      window.location.href = `${PARENT_APP_URL}/auth/logout?redirect_uri=${returnUrl}`;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    const user = this.getUser();
    return !!token && !!user;
  }

  /**
   * Validate current session
   */
  async validateSession(): Promise<boolean> {
    const token = this.getAccessToken();
    if (!token) {
      return false;
    }

    const validation = await this.validateToken(token);

    if (validation.valid && validation.user) {
      // Update user data with latest from server
      this.setUser(validation.user);
      if (validation.session) {
        this.setSession(validation.session);
      }
      return true;
    }

    // Try to refresh if validation failed
    return await this.refreshToken();
  }

  /**
   * Check if user has a specific permission
   */
  hasPermission(permission: string): boolean {
    const user = this.getUser();
    return user?.permissions?.[permission] === true;
  }

  /**
   * Check if user has a specific role
   */
  hasRole(role: string): boolean {
    const user = this.getUser();
    return user?.role === role;
  }

  /**
   * Check if user has any of the specified roles
   */
  hasAnyRole(roles: string[]): boolean {
    const user = this.getUser();
    return user ? roles.includes(user.role) : false;
  }

  /**
   * Get access token
   */
  getAccessToken(): string | null {
    return Cookies.get(TOKEN_COOKIE) || null;
  }

  /**
   * Set access token
   */
  private setAccessToken(token: string): void {
    Cookies.set(TOKEN_COOKIE, token, {
      expires: 1, // 1 day
      secure: true,
      sameSite: 'strict'
    });
  }

  /**
   * Get refresh token
   */
  private getRefreshToken(): string | null {
    return Cookies.get(REFRESH_TOKEN_COOKIE) || null;
  }

  /**
   * Set refresh token
   */
  private setRefreshToken(token: string): void {
    Cookies.set(REFRESH_TOKEN_COOKIE, token, {
      expires: 7, // 7 days
      secure: true,
      sameSite: 'strict'
    });
  }

  /**
   * Get current user
   */
  getUser(): ParentAppUser | null {
    const userStr = Cookies.get(USER_COOKIE);
    if (!userStr) return null;

    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  /**
   * Set user data
   */
  private setUser(user: ParentAppUser): void {
    Cookies.set(USER_COOKIE, JSON.stringify(user), {
      expires: 1, // 1 day
      secure: true,
      sameSite: 'strict'
    });
  }

  /**
   * Get session data
   */
  getSession(): AuthSession | null {
    const sessionStr = Cookies.get(SESSION_COOKIE);
    if (!sessionStr) return null;

    try {
      return JSON.parse(sessionStr);
    } catch {
      return null;
    }
  }

  /**
   * Set session data
   */
  private setSession(session: AuthSession): void {
    Cookies.set(SESSION_COOKIE, JSON.stringify(session), {
      expires: 1, // 1 day
      secure: true,
      sameSite: 'strict'
    });
  }

  /**
   * Clear all session data
   */
  private clearSession(): void {
    Cookies.remove(TOKEN_COOKIE);
    Cookies.remove(REFRESH_TOKEN_COOKIE);
    Cookies.remove(USER_COOKIE);
    Cookies.remove(SESSION_COOKIE);
  }

  /**
   * Get API client for authenticated requests
   */
  getApiClient(): AxiosInstance {
    return this.api;
  }
}

// Export singleton instance
export const parentAuth = new ParentAuthService();

// Export class for testing
export { ParentAuthService };
