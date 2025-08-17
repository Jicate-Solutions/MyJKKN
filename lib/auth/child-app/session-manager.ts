import { parentAuth } from './parent-auth-service';

interface SessionManagerOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  warningThreshold?: number;
  onSessionExpiring?: () => void;
  onSessionExpired?: () => void;
  onRefreshSuccess?: () => void;
  onRefreshError?: (error: Error) => void;
}

/**
 * Session Manager
 * Handles automatic token refresh and session monitoring
 */
export class SessionManager {
  private refreshTimer?: NodeJS.Timeout;
  private warningTimer?: NodeJS.Timeout;
  private isRefreshing = false;
  private options: Required<SessionManagerOptions>;

  constructor(options: SessionManagerOptions = {}) {
    this.options = {
      autoRefresh: options.autoRefresh ?? true,
      refreshInterval: options.refreshInterval ?? 10 * 60 * 1000, // 10 minutes
      warningThreshold: options.warningThreshold ?? 5 * 60 * 1000, // 5 minutes before expiry
      onSessionExpiring: options.onSessionExpiring ?? (() => {}),
      onSessionExpired: options.onSessionExpired ?? (() => {}),
      onRefreshSuccess: options.onRefreshSuccess ?? (() => {}),
      onRefreshError: options.onRefreshError ?? (() => {}),
    };
  }

  /**
   * Start session management
   */
  start(): void {
    this.stop(); // Clear any existing timers
    
    if (!this.options.autoRefresh) {
      return;
    }

    // Check session immediately
    this.checkSession();

    // Set up refresh timer
    this.refreshTimer = setInterval(() => {
      this.checkSession();
    }, this.options.refreshInterval);

    // Monitor for session expiry warning
    this.setupWarningTimer();
  }

  /**
   * Stop session management
   */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = undefined;
    }
  }

  /**
   * Check and refresh session if needed
   */
  private async checkSession(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }

    try {
      this.isRefreshing = true;

      const token = parentAuth.getAccessToken();
      if (!token) {
        this.options.onSessionExpired();
        return;
      }

      // Check if token is about to expire
      const session = parentAuth.getSession();
      if (session) {
        const expiresAt = new Date(session.expires_at);
        const now = new Date();
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();

        // If token expires in less than the refresh interval, refresh it
        if (timeUntilExpiry < this.options.refreshInterval) {
          const refreshed = await parentAuth.refreshToken();
          
          if (refreshed) {
            this.options.onRefreshSuccess();
            this.setupWarningTimer();
          } else {
            this.options.onSessionExpired();
          }
        }
      }
    } catch (error) {
      console.error('Session check error:', error);
      this.options.onRefreshError(error as Error);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Set up warning timer for session expiry
   */
  private setupWarningTimer(): void {
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
    }

    const session = parentAuth.getSession();
    if (!session) {
      return;
    }

    const expiresAt = new Date(session.expires_at);
    const now = new Date();
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    const timeUntilWarning = timeUntilExpiry - this.options.warningThreshold;

    if (timeUntilWarning > 0) {
      this.warningTimer = setTimeout(() => {
        this.options.onSessionExpiring();
      }, timeUntilWarning);
    }
  }

  /**
   * Manually refresh the session
   */
  async refresh(): Promise<boolean> {
    if (this.isRefreshing) {
      return false;
    }

    try {
      this.isRefreshing = true;
      const refreshed = await parentAuth.refreshToken();
      
      if (refreshed) {
        this.options.onRefreshSuccess();
        this.setupWarningTimer();
        return true;
      } else {
        this.options.onSessionExpired();
        return false;
      }
    } catch (error) {
      console.error('Manual refresh error:', error);
      this.options.onRefreshError(error as Error);
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Get session status
   */
  getStatus(): {
    isAuthenticated: boolean;
    expiresAt: Date | null;
    timeUntilExpiry: number | null;
    isExpiring: boolean;
    isExpired: boolean;
  } {
    const token = parentAuth.getAccessToken();
    const session = parentAuth.getSession();

    if (!token || !session) {
      return {
        isAuthenticated: false,
        expiresAt: null,
        timeUntilExpiry: null,
        isExpiring: false,
        isExpired: true,
      };
    }

    const expiresAt = new Date(session.expires_at);
    const now = new Date();
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();

    return {
      isAuthenticated: true,
      expiresAt,
      timeUntilExpiry,
      isExpiring: timeUntilExpiry < this.options.warningThreshold,
      isExpired: timeUntilExpiry <= 0,
    };
  }
}

/**
 * Create a singleton session manager instance
 */
let sessionManager: SessionManager | null = null;

export function getSessionManager(options?: SessionManagerOptions): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager(options);
  }
  return sessionManager;
}

/**
 * Hook-like function to use session manager in React components
 * Note: This should be called within a React component or custom hook
 */
export function useSessionManager(options?: SessionManagerOptions): SessionManager {
  const manager = getSessionManager(options);
  
  // Start on mount and stop on unmount
  if (typeof window !== 'undefined') {
    manager.start();
  }
  
  return manager;
}

/**
 * Activity tracker to refresh session on user activity
 */
export class ActivityTracker {
  private lastActivity: number = Date.now();
  private activityTimer?: NodeJS.Timeout;
  private readonly events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
  private readonly inactivityThreshold: number;
  private readonly onInactive?: () => void;
  private readonly onActive?: () => void;
  private sessionManager: SessionManager;

  constructor(options: {
    inactivityThreshold?: number;
    onInactive?: () => void;
    onActive?: () => void;
    sessionManager?: SessionManager;
  } = {}) {
    this.inactivityThreshold = options.inactivityThreshold ?? 30 * 60 * 1000; // 30 minutes
    this.onInactive = options.onInactive;
    this.onActive = options.onActive;
    this.sessionManager = options.sessionManager ?? getSessionManager();
  }

  /**
   * Start tracking user activity
   */
  start(): void {
    this.stop(); // Clear any existing listeners
    
    // Add event listeners
    this.events.forEach(event => {
      window.addEventListener(event, this.handleActivity);
    });

    // Start inactivity timer
    this.startInactivityTimer();
  }

  /**
   * Stop tracking user activity
   */
  stop(): void {
    // Remove event listeners
    this.events.forEach(event => {
      window.removeEventListener(event, this.handleActivity);
    });

    // Clear timer
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
      this.activityTimer = undefined;
    }
  }

  /**
   * Handle user activity
   */
  private handleActivity = (): void => {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivity;
    
    // If user was inactive and is now active
    if (timeSinceLastActivity > this.inactivityThreshold) {
      if (this.onActive) {
        this.onActive();
      }
      
      // Refresh session on reactivation
      this.sessionManager.refresh();
    }
    
    this.lastActivity = now;
    this.startInactivityTimer();
  };

  /**
   * Start inactivity timer
   */
  private startInactivityTimer(): void {
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
    }

    this.activityTimer = setTimeout(() => {
      if (this.onInactive) {
        this.onInactive();
      }
    }, this.inactivityThreshold);
  }

  /**
   * Check if user is currently active
   */
  isActive(): boolean {
    const timeSinceLastActivity = Date.now() - this.lastActivity;
    return timeSinceLastActivity < this.inactivityThreshold;
  }

  /**
   * Get last activity timestamp
   */
  getLastActivity(): Date {
    return new Date(this.lastActivity);
  }
}

/**
 * Create a singleton activity tracker instance
 */
let activityTracker: ActivityTracker | null = null;

export function getActivityTracker(options?: {
  inactivityThreshold?: number;
  onInactive?: () => void;
  onActive?: () => void;
  sessionManager?: SessionManager;
}): ActivityTracker {
  if (!activityTracker) {
    activityTracker = new ActivityTracker(options);
  }
  return activityTracker;
}