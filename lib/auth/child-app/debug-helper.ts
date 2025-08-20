/**
 * Debug Helper for Child App Authentication
 *
 * This module provides comprehensive debugging tools to track
 * the authentication flow between child apps and the parent app.
 */

import React from 'react';

export interface DebugLog {
  timestamp: string;
  location: string;
  event: string;
  data: any;
  url: string;
  cookies: string[];
}

class ChildAppDebugger {
  private logs: DebugLog[] = [];
  private enabled: boolean = false;

  constructor() {
    // Enable debugging if localStorage flag is set or URL param exists
    if (typeof window !== 'undefined') {
      this.enabled =
        localStorage.getItem('DEBUG_CHILD_APP_AUTH') === 'true' ||
        new URLSearchParams(window.location.search).has('debug_auth');

      if (this.enabled) {
        console.log('🔍 Child App Auth Debugging Enabled');
        this.setupGlobalErrorHandler();
      }
    }
  }

  private setupGlobalErrorHandler() {
    window.addEventListener('error', (event) => {
      if (event.message.includes('auth') || event.message.includes('cookie')) {
        this.log('global-error', 'Uncaught Error', {
          message: event.message,
          stack: event.error?.stack
        });
      }
    });
  }

  log(location: string, event: string, data: any = {}) {
    if (!this.enabled) return;

    const log: DebugLog = {
      timestamp: new Date().toISOString(),
      location,
      event,
      data,
      url: window.location.href,
      cookies: document.cookie
        .split('; ')
        .filter(
          (c) =>
            c.includes('child_app') ||
            c.includes('auth') ||
            c.includes('session')
        )
    };

    this.logs.push(log);

    // Console output with color coding
    const style = this.getStyleForEvent(event);
    console.log(`%c[${log.timestamp}] ${location} - ${event}`, style, data);

    // Also log URL and cookies
    console.log('%cURL:', 'color: #666', log.url);
    console.log('%cRelevant Cookies:', 'color: #666', log.cookies);
    console.log('---');

    // Store in sessionStorage for persistence
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('child_app_auth_logs', JSON.stringify(this.logs));
    }
  }

  private getStyleForEvent(event: string): string {
    if (event.includes('error') || event.includes('fail')) {
      return 'color: #ff0000; font-weight: bold';
    }
    if (event.includes('success')) {
      return 'color: #00aa00; font-weight: bold';
    }
    if (event.includes('redirect')) {
      return 'color: #0066cc; font-weight: bold';
    }
    return 'color: #333; font-weight: normal';
  }

  getLogs(): DebugLog[] {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
    sessionStorage.removeItem('child_app_auth_logs');
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  enable() {
    this.enabled = true;
    localStorage.setItem('DEBUG_CHILD_APP_AUTH', 'true');
    console.log('🔍 Child App Auth Debugging Enabled');
  }

  disable() {
    this.enabled = false;
    localStorage.removeItem('DEBUG_CHILD_APP_AUTH');
    console.log('🔍 Child App Auth Debugging Disabled');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // Helper to track OAuth flow
  trackOAuthFlow(step: string, params: Record<string, any>) {
    this.log('oauth-flow', step, {
      ...params,
      searchParams: Object.fromEntries(
        new URLSearchParams(window.location.search)
      ),
      timestamp: Date.now()
    });
  }

  // Helper to verify child app parameters
  verifyChildAppParams(): {
    hasParams: boolean;
    params: Record<string, string | null>;
    issues: string[];
  } {
    const params = new URLSearchParams(window.location.search);
    const result = {
      hasParams: false,
      params: {
        app_id: params.get('app_id'),
        redirect_uri: params.get('redirect_uri'),
        scope: params.get('scope'),
        state: params.get('state')
      },
      issues: [] as string[]
    };

    // Check direct params
    if (result.params.app_id && result.params.redirect_uri) {
      result.hasParams = true;
    } else {
      // Check redirect param
      const redirectParam = params.get('redirect');
      if (redirectParam) {
        try {
          const redirectUrl = new URL(decodeURIComponent(redirectParam));
          const redirectParams = new URLSearchParams(redirectUrl.search);
          result.params.app_id =
            result.params.app_id || redirectParams.get('app_id');
          result.params.redirect_uri =
            result.params.redirect_uri || redirectParams.get('redirect_uri');
          result.params.scope =
            result.params.scope || redirectParams.get('scope');
          result.params.state =
            result.params.state || redirectParams.get('state');

          if (result.params.app_id && result.params.redirect_uri) {
            result.hasParams = true;
          }
        } catch (e) {
          result.issues.push('Invalid redirect parameter URL');
        }
      }
    }

    // Check for issues
    if (!result.params.app_id) {
      result.issues.push('Missing app_id parameter');
    }
    if (!result.params.redirect_uri) {
      result.issues.push('Missing redirect_uri parameter');
    }

    // Check cookies
    const childAppCookie = document.cookie
      .split('; ')
      .find((row) => row.startsWith('child_app_auth='));

    if (childAppCookie) {
      try {
        const cookieData = JSON.parse(childAppCookie.split('=')[1]);
        this.log('cookie-check', 'Found child_app_auth cookie', cookieData);
      } catch (e) {
        result.issues.push('Invalid child_app_auth cookie format');
      }
    } else if (result.hasParams) {
      result.issues.push('Child app params present but no cookie set');
    }

    this.log('verify-params', 'Parameter verification', result);
    return result;
  }
}

// Export singleton instance
export const childAppDebug = new ChildAppDebugger();

// Debug component to show in UI
export function ChildAppDebugPanel(): JSX.Element | null {
  if (!childAppDebug.isEnabled()) return null;

  const logs = childAppDebug.getLogs();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 400,
        maxHeight: 300,
        backgroundColor: 'white',
        border: '2px solid #333',
        borderRadius: 8,
        padding: 10,
        overflowY: 'auto',
        fontSize: 12,
        fontFamily: 'monospace',
        zIndex: 9999,
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
      }}
    >
      <div style={{ marginBottom: 10, fontWeight: 'bold' }}>
        🔍 Child App Auth Debug ({logs.length} logs)
      </div>
      {logs
        .slice(-10)
        .reverse()
        .map((log, i) => (
          <div
            key={i}
            style={{
              marginBottom: 5,
              padding: 5,
              backgroundColor: i % 2 === 0 ? '#f5f5f5' : 'white',
              borderRadius: 4
            }}
          >
            <div style={{ color: '#666' }}>
              {new Date(log.timestamp).toLocaleTimeString()} - {log.location}
            </div>
            <div style={{ fontWeight: 'bold' }}>{log.event}</div>
            {Object.keys(log.data).length > 0 && (
              <pre style={{ fontSize: 10, margin: 0 }}>
                {JSON.stringify(log.data, null, 2)}
              </pre>
            )}
          </div>
        ))}
      <button
        onClick={() => {
          console.log('Full logs:', childAppDebug.exportLogs());
          alert('Logs exported to console');
        }}
        style={{
          marginTop: 10,
          padding: '5px 10px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer'
        }}
      >
        Export Logs
      </button>
    </div>
  );
}
