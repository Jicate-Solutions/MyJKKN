'use client';

// components/permissions-audit/impact-preview-sheet.tsx
// ============================================================================
// Side sheet that renders the "what changes if I save?" delta for a role edit.
// Opens from the Role Edit dialog when the admin clicks "Preview Impact".
// Fetches /api/users/permissions-audit/impact-preview with AbortController +
// 15s timeout. Renders:
//   - Summary row (grantedBefore → grantedAfter, totalDefined)
//   - Added / removed permission lists (green / red)
//   - Affected users list (with super-admin bypass flag)
//   - Route gains / losses grouped by permission
//   - RLS table gains / losses grouped by permission
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  UserCheck,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import type { ImpactPreviewData } from '@/lib/services/permissions-audit/impact-preview-service';

interface ImpactPreviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleId: string;
  roleName: string;
  proposedPermissions: Record<string, boolean>;
}

export function ImpactPreviewSheet({
  open,
  onOpenChange,
  roleId,
  roleName,
  proposedPermissions,
}: ImpactPreviewSheetProps) {
  const [data, setData] = useState<ImpactPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !roleId) return;

    // Cancel any in-flight request from a previous open
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    setLoading(true);
    setError(null);
    setData(null);

    fetch('/api/users/permissions-audit/impact-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId, proposedPermissions }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        setData(json as ImpactPreviewData);
        // Reset scroll so new data starts at the top of the sheet even if the
        // user scrolled a previous preview.
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
          scrollRef.current?.focus?.({ preventScroll: true });
        });
      })
      .catch((err) => {
        if ((err as any)?.name === 'AbortError') {
          setError('Preview took too long — Please try again.');
        } else {
          console.error('[ImpactPreviewSheet] Fetch failed:', err);
          setError(err instanceof Error ? err.message : 'Failed to load preview');
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setLoading(false);
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
    // proposedPermissions is an object reference; we intentionally only
    // re-fetch when the sheet opens or the role changes, not on every keystroke
    // in the parent form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roleId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
        ref={scrollRef}
        tabIndex={-1}
      >
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-indigo-500" />
            Impact Preview — {roleName}
          </SheetTitle>
          <SheetDescription>
            Shows what changes when you save this role. Read-only — nothing is
            saved until you click Save Changes in the main dialog.
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div
            className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground gap-3"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" aria-hidden />
            <span>Computing impact preview…</span>
          </div>
        )}

        {error && !loading && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        {data && !loading && !error && (
          <div className="space-y-6 py-4">
            {/* ── Summary row ────────────────────────────────────────── */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Summary
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <SummaryCard
                  label="Granted before"
                  value={data.delta.grantedBefore}
                  tone="neutral"
                />
                <SummaryCard
                  label="Granted after"
                  value={data.delta.grantedAfter}
                  tone="accent"
                />
                <SummaryCard
                  label="Users affected"
                  value={data.users.total}
                  tone={data.users.total > 0 ? 'warn' : 'neutral'}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {data.delta.added.length > 0 || data.delta.removed.length > 0 ? (
                  <>
                    <span className="text-green-700 font-medium">
                      +{data.delta.added.length}
                    </span>{' '}
                    added,{' '}
                    <span className="text-red-700 font-medium">
                      −{data.delta.removed.length}
                    </span>{' '}
                    removed, {data.delta.unchangedCount} unchanged.
                  </>
                ) : (
                  'No changes from the saved state.'
                )}
                {data.users.bypassing > 0 && (
                  <>
                    {' '}
                    <span className="text-amber-700">
                      {data.users.bypassing} of the affected user(s) bypass
                      permission checks (super admin).
                    </span>
                  </>
                )}
              </p>
            </section>

            {/* ── Added + Removed permissions side by side ──────────── */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PermissionList
                title="Added"
                perms={data.delta.added}
                tone="positive"
                icon={<ArrowUpRight className="h-4 w-4" />}
                emptyText="No permissions added"
              />
              <PermissionList
                title="Removed"
                perms={data.delta.removed}
                tone="negative"
                icon={<ArrowDownRight className="h-4 w-4" />}
                emptyText="No permissions removed"
              />
            </section>

            {/* ── Affected users ────────────────────────────────────── */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Affected users ({data.users.total})
              </h3>
              {data.users.affected.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No users currently have this role assigned.
                </p>
              ) : (
                <div className="rounded-md border divide-y">
                  {data.users.affected.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {u.fullName || u.email || u.id}
                        </div>
                        {u.email && u.fullName && (
                          <div className="text-xs text-muted-foreground truncate">
                            {u.email}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {u.isPrimary && (
                          <Badge variant="outline" className="text-[10px] h-5">
                            primary
                          </Badge>
                        )}
                        {u.isSuperAdmin && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-5 border-amber-300 bg-amber-50 text-amber-800"
                          >
                            bypasses
                          </Badge>
                        )}
                        {!u.isSuperAdmin && (
                          <UserCheck
                            className="h-3.5 w-3.5 text-muted-foreground"
                            aria-label="Will be affected by this change"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  {data.users.truncated > 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground italic">
                      …and {data.users.truncated} more users not shown.
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ── Route impact ──────────────────────────────────────── */}
            {(data.routes.gained.length > 0 || data.routes.lost.length > 0) && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Navigation impact
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <RouteList
                    title="Newly visible"
                    items={data.routes.gained}
                    tone="positive"
                  />
                  <RouteList
                    title="No longer visible"
                    items={data.routes.lost}
                    tone="negative"
                  />
                </div>
              </section>
            )}

            {/* ── RLS impact ────────────────────────────────────────── */}
            {(data.rlsTables.gainedAccess.length > 0 ||
              data.rlsTables.lostAccess.length > 0) && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Database policy impact
                </h3>
                <p className="text-xs text-muted-foreground mb-2">
                  Row-Level Security policies that reference the changed
                  permissions. Gaining the permission means RLS will now allow
                  the action this policy guards.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <RlsList
                    title="Now allowed"
                    items={data.rlsTables.gainedAccess}
                    tone="positive"
                  />
                  <RlsList
                    title="Now blocked"
                    items={data.rlsTables.lostAccess}
                    tone="negative"
                  />
                </div>
              </section>
            )}

            {/* ── Nothing changes callout ────────────────────────────── */}
            {data.delta.added.length === 0 && data.delta.removed.length === 0 && (
              <div
                className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 flex items-start gap-2"
                role="status"
              >
                <Minus className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
                <span>
                  No changes detected. Your current form state matches the
                  saved permissions exactly.
                </span>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Small presentational helpers ────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'accent' | 'warn';
}) {
  const valueClass =
    tone === 'accent'
      ? 'text-indigo-600'
      : tone === 'warn'
      ? 'text-amber-700'
      : 'text-slate-900';
  return (
    <div className="rounded-md border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </div>
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

function PermissionList({
  title,
  perms,
  tone,
  icon,
  emptyText,
}: {
  title: string;
  perms: string[];
  tone: 'positive' | 'negative';
  icon: React.ReactNode;
  emptyText: string;
}) {
  const headerClass =
    tone === 'positive'
      ? 'text-green-700 bg-green-50 border-green-200'
      : 'text-red-700 bg-red-50 border-red-200';
  const itemClass =
    tone === 'positive' ? 'text-green-900' : 'text-red-900 line-through decoration-red-300';
  return (
    <div className="rounded-md border overflow-hidden">
      <div
        className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 border-b ${headerClass}`}
      >
        {icon}
        {title} ({perms.length})
      </div>
      {perms.length === 0 ? (
        <div className="px-3 py-3 text-xs text-muted-foreground italic">
          {emptyText}
        </div>
      ) : (
        <ul className="divide-y text-xs max-h-48 overflow-y-auto">
          {perms.map((p) => (
            <li key={p} className={`px-3 py-1.5 font-mono ${itemClass}`}>
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RouteList({
  title,
  items,
  tone,
}: {
  title: string;
  items: Array<{ path: string; permission: string }>;
  tone: 'positive' | 'negative';
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border p-3">
        <div className="text-xs font-semibold mb-1">{title}</div>
        <div className="text-xs text-muted-foreground italic">None</div>
      </div>
    );
  }
  const color = tone === 'positive' ? 'text-green-700' : 'text-red-700';
  return (
    <div className="rounded-md border overflow-hidden">
      <div className={`px-3 py-2 text-xs font-semibold ${color}`}>
        {title} ({items.length})
      </div>
      <ul className="divide-y text-xs max-h-40 overflow-y-auto">
        {items.map((r, i) => (
          <li key={`${r.path}-${r.permission}-${i}`} className="px-3 py-1.5">
            <div className="font-mono">{r.path}</div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <ArrowRight className="h-3 w-3" aria-hidden />
              {r.permission}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RlsList({
  title,
  items,
  tone,
}: {
  title: string;
  items: Array<{ table: string; policy: string; permission: string }>;
  tone: 'positive' | 'negative';
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border p-3">
        <div className="text-xs font-semibold mb-1">{title}</div>
        <div className="text-xs text-muted-foreground italic">None</div>
      </div>
    );
  }
  const color = tone === 'positive' ? 'text-green-700' : 'text-red-700';
  return (
    <div className="rounded-md border overflow-hidden">
      <div className={`px-3 py-2 text-xs font-semibold ${color}`}>
        {title} ({items.length})
      </div>
      <ul className="divide-y text-xs max-h-40 overflow-y-auto">
        {items.map((r, i) => (
          <li key={`${r.table}-${r.policy}-${i}`} className="px-3 py-1.5">
            <div className="font-mono">{r.table}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {r.policy}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
