'use client';

// components/layout/preview-banner-client.tsx
// ============================================================================
// Client half of the preview banner. Shows a live countdown to expiry and
// an "Exit Preview" button that POSTs /api/users/permissions-audit/preview/end
// then hard-reloads the page so the user returns to their own session.
// ============================================================================

import { useEffect, useState } from 'react';
import { Eye, LogOut, ShieldAlert } from 'lucide-react';

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return 'Expired';
  const totalSec = Math.floor(remainingMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PreviewBannerClient({
  targetName,
  targetEmail,
  targetRole,
  mode,
  expiresAtMs,
}: {
  targetName: string;
  targetEmail: string;
  targetRole: string;
  mode: 'read' | 'write';
  expiresAtMs: number;
}) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(expiresAtMs);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, expiresAtMs - now);
  const countdown = mounted ? formatCountdown(remainingMs) : '—:—';
  const isExpired = mounted && remainingMs <= 0;

  async function handleExit() {
    if (exiting) return;
    setExiting(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);
    try {
      await fetch('/api/users/permissions-audit/preview/end', {
        method: 'POST',
        signal: controller.signal,
      });
    } catch (err) {
      // best effort — even if the call fails (timeout, network error, etc.)
      // we still do the hard redirect below so the user is never stuck.
      console.error('[PreviewBanner] Exit request failed — Redirecting to permissions-audit anyway', err);
    } finally {
      clearTimeout(timeoutId);
      // Hard reload so the server re-evaluates the session without the cookie.
      window.location.href = '/users/permissions-audit';
    }
  }

  // Auto-exit when expired so users aren't stuck with a dead session.
  useEffect(() => {
    if (isExpired && !exiting) {
      handleExit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpired]);

  const bgClass = mode === 'write' ? 'bg-red-600' : 'bg-amber-600';
  const modeLabel = mode === 'write' ? 'WRITE MODE' : 'READ-ONLY';

  return (
    <div
      role="alert"
      className={`${bgClass} text-white sticky top-0 z-[9999] shadow-md`}
      style={{ position: 'sticky', top: 0 }}
    >
      <div className="mx-auto max-w-7xl px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <div className="flex items-center gap-2 font-semibold shrink-0">
          <ShieldAlert className="h-4 w-4" aria-hidden />
          <span>PREVIEWING AS</span>
        </div>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Eye className="h-4 w-4 shrink-0" aria-hidden />
          <span className="font-medium truncate">{targetName}</span>
          <span className="opacity-80 truncate">({targetEmail})</span>
          <span className="opacity-80 shrink-0 uppercase tracking-wide text-[10px] border border-white/40 rounded px-1.5 py-0.5">
            {targetRole}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="font-semibold tracking-wide text-xs">
            {modeLabel}
          </span>
          <span className="font-mono text-xs tabular-nums" aria-label="Time remaining in preview session">
            {countdown}
          </span>
          <button
            type="button"
            onClick={handleExit}
            disabled={exiting}
            className="inline-flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-60"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            {exiting ? 'Exiting…' : 'Exit Preview'}
          </button>
        </div>
      </div>
    </div>
  );
}
