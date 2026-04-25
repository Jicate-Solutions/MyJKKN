'use client';

/**
 * Dashboard v2 — Per-tile Error Boundary
 *
 * Wraps each <Suspense> boundary so that when a server component throws
 * (e.g. RPC failed, auth stale, cookie corrupt) the user sees a visible
 * "tile failed to load" card instead of an invisible blank zero-state.
 *
 * Two modes:
 *   - 'card'   (default) — renders a visible error card with message + refresh
 *   - 'silent' — renders null, used for optional widgets like MorningBrief
 *                where "no card" is an acceptable UX on failure
 *
 * Super admins see the raw error message + stack; other roles see a
 * generic message. This makes triage a browser-only operation for Omm —
 * no need to ssh into Vercel logs for 90% of "empty dashboard" reports.
 *
 * Created: 2026-04-21 — P0 fix for empty-dashboard silent-swallow class.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Mode = 'card' | 'silent';

type Props = {
  children: ReactNode;
  /** Short label for the failing tile. Shown in the error card. */
  label: string;
  /** 'card' renders a visible error card; 'silent' renders null. Default: 'card'. */
  mode?: Mode;
  /**
   * If true, include the full error message + stack in the rendered card.
   * Pass `isSuperAdmin` from the server so the card is verbose for Omm
   * and terse for everyone else.
   */
  showDetails?: boolean;
};

type State = {
  error: Error | null;
};

export class DashboardErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep console trace for DevTools. Also emits to Vercel function logs
    // via the browser's default error reporter.
    console.error(
      `[DashboardErrorBoundary:${this.props.label}]`,
      error,
      info.componentStack
    );
  }

  private handleRefresh = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.mode === 'silent') {
      // Caller opted into "no card on failure" (e.g., morning brief).
      // Still log to DevTools above; just don't render anything.
      return null;
    }

    const message = error.message || 'Unknown error';
    const details = this.props.showDetails
      ? `${message}${error.stack ? `\n\n${error.stack}` : ''}`
      : null;

    return (
      <div
        role='alert'
        className='rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/40 backdrop-blur-sm p-5'
      >
        <div className='flex items-start gap-3'>
          <span aria-hidden='true' className='text-xl leading-none'>
            ⚠️
          </span>
          <div className='flex-1 min-w-0'>
            <p className='text-sm font-semibold text-amber-900 dark:text-amber-100'>
              {this.props.label} failed to load
            </p>
            <p className='mt-1 text-xs text-amber-800 dark:text-amber-200 break-words'>
              {this.props.showDetails
                ? message
                : 'A server error prevented this tile from loading. Ask an admin to check /api/auth/session-debug.'}
            </p>
            {details && (
              <details className='mt-2'>
                <summary className='text-xs text-amber-700 dark:text-amber-300 cursor-pointer select-none'>
                  Stack trace (super-admin only)
                </summary>
                <pre className='mt-2 p-2 text-[10px] leading-snug bg-amber-100/60 dark:bg-amber-900/40 rounded overflow-x-auto whitespace-pre-wrap'>
                  {details}
                </pre>
              </details>
            )}
            <button
              type='button'
              onClick={this.handleRefresh}
              className='mt-3 inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors'
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default DashboardErrorBoundary;
