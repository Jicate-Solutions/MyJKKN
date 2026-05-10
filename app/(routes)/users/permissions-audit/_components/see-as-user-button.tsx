'use client';

// ============================================================================
// "See As User" trigger button shown on the User Resolver tab.
// Handles the full flow:
//   1. Fetch caller's profile to decide whether to offer Write mode.
//   2. Show a confirmation dialog with the mode choice.
//   3. POST /api/users/permissions-audit/preview/start
//   4. On success, open a new browser tab at "/" so the user sees the target's
//      view in isolation while keeping their own admin session in the origin tab.
//      NOTE: The preview cookie is attached to the domain — the new tab inherits
//      it automatically, no query-string token shuttling needed.
// ============================================================================

import { useEffect, useState } from 'react';
import { ArrowUpRight, Eye, ShieldAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type Mode = 'read' | 'write';

interface CallerProfile {
  isSuperAdmin: boolean;
  canUseWrite: boolean; // director-only
}

async function fetchCallerCapability(): Promise<CallerProfile> {
  try {
    const res = await fetch('/api/users/permissions-audit/preview/capabilities', {
      method: 'GET',
    });
    if (!res.ok) return { isSuperAdmin: false, canUseWrite: false };
    const data = await res.json();
    return {
      isSuperAdmin: !!data.isSuperAdmin,
      canUseWrite: !!data.canUseWriteMode,
    };
  } catch {
    return { isSuperAdmin: false, canUseWrite: false };
  }
}

export function SeeAsUserButton({
  targetUserId,
  targetName,
  targetEmail,
}: {
  targetUserId: string;
  targetName: string;
  targetEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [caller, setCaller] = useState<CallerProfile | null>(null);
  const [mode, setMode] = useState<Mode>('read');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy-fetch caller profile when dialog opens (no wasted calls on render).
  useEffect(() => {
    if (open && !caller) {
      fetchCallerCapability().then(setCaller);
    }
  }, [open, caller]);

  if (caller && !caller.isSuperAdmin) {
    // Button hidden entirely for non-super-admins.
    return null;
  }

  async function handleStart() {
    setSubmitting(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s hard timeout
    try {
      const res = await fetch('/api/users/permissions-audit/preview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, mode }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Failed to start preview');
        return;
      }
      // The start API swapped the browser's Supabase session cookies to the
      // target's session. We hard-navigate to '/' so Next.js re-evaluates the
      // entire page as the target user — any in-memory React state from the
      // admin view would otherwise be stale. A new tab would share the same
      // cookies anyway (they're domain-scoped), so redirecting is simpler.
      setOpen(false);
      window.location.href = '/';
    } catch (err) {
      const msg =
        (err as any)?.name === 'AbortError'
          ? 'The preview start request timed out. Please try again.'
          : err instanceof Error
            ? err.message
            : 'Unexpected error starting preview';
      setError(msg);
    } finally {
      clearTimeout(timeoutId);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1.5 mt-1"
        >
          <Eye className="h-3.5 w-3.5" />
          See as this user
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            Preview as another user
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed pt-2">
            You are about to view MyJKKN as{' '}
            <span className="font-semibold text-foreground">{targetName}</span>{' '}
            <span className="text-muted-foreground">({targetEmail})</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1.5">
            <p className="font-medium text-foreground">What happens next</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>This tab will reload showing <b>exactly</b> what {targetName} sees — the real dashboard, real RLS-filtered data.</li>
              <li>Your admin session is safely backed up and restored automatically when you exit.</li>
              <li>A coloured banner stays visible the whole time.</li>
              <li>Session auto-expires in 60 minutes.</li>
              <li>Every action is logged in the audit trail.</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Access mode</p>
            <div className="grid grid-cols-1 gap-2">
              <label
                className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                  mode === 'read'
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-border hover:bg-muted/30'
                }`}
              >
                <input
                  type="radio"
                  name="preview-mode"
                  value="read"
                  checked={mode === 'read'}
                  onChange={() => setMode('read')}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">Read-only (recommended)</div>
                  <div className="text-xs text-muted-foreground">
                    You can browse but cannot send messages, edit records, or delete anything.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                  !caller?.canUseWrite
                    ? 'border-border bg-muted/30 opacity-60 cursor-not-allowed'
                    : mode === 'write'
                      ? 'border-red-300 bg-red-50'
                      : 'border-border hover:bg-muted/30'
                }`}
              >
                <input
                  type="radio"
                  name="preview-mode"
                  value="write"
                  checked={mode === 'write'}
                  onChange={() => caller?.canUseWrite && setMode('write')}
                  disabled={!caller?.canUseWrite}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium flex items-center gap-2">
                    Write mode
                    {!caller?.canUseWrite && (
                      <span className="text-[10px] uppercase tracking-wide bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                        Director only
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Actions you take will genuinely happen as this user. Use with extreme care.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleStart}
            disabled={submitting || !caller}
            className={mode === 'write' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <ArrowUpRight className="h-4 w-4 mr-1" />
            )}
            {submitting ? 'Starting…' : `Start ${mode === 'write' ? 'Write' : 'Read-only'} Preview`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
