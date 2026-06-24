'use client';

// Explicit, recoverable UI for the case where a signed-in user's PERMISSIONS
// FAILED TO LOAD (a transient network/RPC hiccup) — as opposed to genuinely
// lacking access. Used wherever a permission decision would otherwise collapse
// silently (the sidebar menu builder, a route/page PermissionGuard fallback), so
// a momentary failure never masquerades as "you've lost all your access"
// (BUG-004281 / BUG-004278; CLAUDE.md #27 — surface failures explicitly).
//
// This is deliberately distinct from PermissionError ("Access Denied"): that one
// is correct when the user truly lacks the permission; THIS one is for "we
// couldn't load your permissions — try again", which is recoverable.

import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface PermissionsLoadErrorProps {
  /** Refetch the permission query (from usePermissions().refetch). */
  onRetry?: () => void;
  /**
   * 'compact' — narrow column for the sidebar rail.
   * 'page'    — centered card for a full-page guard fallback (default).
   */
  variant?: 'compact' | 'page';
}

export function PermissionsLoadError({ onRetry, variant = 'page' }: PermissionsLoadErrorProps) {
  if (variant === 'compact') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">We couldn&apos;t load your menu</p>
          <p className="text-xs text-muted-foreground">
            Your access didn&apos;t load. This is almost always a temporary network
            hiccup — your permissions haven&apos;t changed.
          </p>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Retry
          </button>
        ) : null}
        <Link href="/" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          Go to Dashboard
        </Link>
        <p className="text-[11px] text-muted-foreground">
          If this keeps happening, refresh the page or contact your administrator.
        </p>
      </div>
    );
  }

  // Full-page variant — for a route/page PermissionGuard fallback.
  return (
    <div className="flex min-h-[500px] items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold">We couldn&apos;t load your access</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your permissions didn&apos;t load just now. This is almost always a temporary
          network hiccup — your access hasn&apos;t changed. Try again in a moment.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          {onRetry ? (
            <Button onClick={onRetry} variant="default">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          ) : null}
          <Button onClick={() => (window.location.href = '/')} variant="outline">
            <Home className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          If this keeps happening, refresh the page or contact your administrator.
        </p>
      </div>
    </div>
  );
}
