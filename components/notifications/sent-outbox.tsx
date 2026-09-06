// components/notifications/sent-outbox.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { SentListResult } from '@/lib/services/notification/sent-service';
import {
  getTargetRoleKeys,
  getTargetedUserIds
} from '@/lib/notifications/target-audience';
import { stripHtml } from '@/components/ui/rich-text-editor';

/**
 * Sender's outbox — what YOU broadcast.
 *
 * Companion to the inbox view at /notifications. This is the audit surface
 * Director asked for on 2026-05-11: without it, the only way to verify a
 * broadcast went out is a Supabase query.
 *
 * Visual continuity with the Briefing (PR #713): cream paper, ink text,
 * Newsreader display serif for title, Plex Mono for tabular numerals.
 * Severity ribbon stays consistent with the rest of the surface.
 */

const PRIORITY_INK: Record<string, { ink: string; ribbon: string; chip: string }> = {
  urgent: { ink: '#7a0a0a', ribbon: '#b40000', chip: '#fde4dc' },
  high: { ink: '#7a4a0a', ribbon: '#c47e1a', chip: '#f7e6c0' },
  normal: { ink: '#1f3f5f', ribbon: '#3a6da6', chip: '#dde8f3' },
  low: { ink: '#3a3a3a', ribbon: '#9a9a9a', chip: '#e6e6e6' }
};

function getInk(priority: string | null | undefined) {
  return PRIORITY_INK[priority || 'normal'] ?? PRIORITY_INK.normal;
}

function describeAudience(targeting: Record<string, unknown> | null): string {
  if (!targeting) return 'no targeting';
  const t = targeting as any;
  const parts: string[] = [];
  if (t.broadcast === true || t.broadcast === 'true') parts.push('Broadcast');
  // Hierarchy scalar keys — the primary path persisted by the admin create form
  // (notification-form.tsx onSubmit: institution_id/department_id/program_id/
  // semester_id/section_id). IDs aren't name-resolvable client-side (sent-service
  // selects only the targeting column, no joins), so scope labels are the honest
  // minimum. Without these branches a hierarchy-scoped notification fell through
  // every check and showed the placeholder 'targeting set'.
  if (t.institution_id) parts.push('Institution');
  if (t.department_id) parts.push('Department');
  if (t.program_id) parts.push('Program');
  if (t.semester_id) parts.push('Semester');
  if (t.section_id) parts.push('Section');
  // Role and person targeting are read through the shared rule
  // (lib/notifications/target-audience.ts, PR #3128) rather than a local
  // `t.target_roles` / `t.user_ids` check. Senders emit five different keys for
  // "these people": reading only two of them sent 3,491 person-targeted rows
  // through every branch below and out the bottom as the placeholder
  // 'targeting set', which says nothing about blast radius at all.
  const roleKeys = getTargetRoleKeys(t);
  if (roleKeys.length > 0) {
    parts.push(
      roleKeys.length === 1 ? `Role: ${roleKeys[0]}` : `${roleKeys.length} roles`
    );
  }
  // KEEP: BYOW single-user notifications persist targeting: { user_ids: [...] }
  // (lib/services/notification/byow-notification-service.ts:92) — this branch is live.
  const recipientIds = getTargetedUserIds(t);
  if (recipientIds.length > 0) {
    parts.push(
      recipientIds.length === 1 ? '1 person' : `${recipientIds.length} people`
    );
  }
  if (Array.isArray(t.audience_ids) && t.audience_ids.length > 0) {
    parts.push(`${t.audience_ids.length} audiences`);
  }
  if (parts.length === 0) return 'targeting set';
  return parts.join(' · ');
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-IN');
}

function formatPct(read: number, total: number): string {
  if (total === 0) return '—';
  return `${Math.round((read / total) * 100)}%`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function SentOutbox() {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    result: SentListResult | null;
    page: number;
    includeSystem: boolean;
  }>({
    loading: true,
    error: null,
    result: null,
    page: 1,
    includeSystem: false
  });

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function load() {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const params = new URLSearchParams({
          page: String(state.page),
          limit: '25',
          includeSystem: String(state.includeSystem)
        });
        const res = await fetch(`/api/notifications/sent?${params}`, {
          credentials: 'include',
          signal: ctrl.signal
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
        }
        const json = (await res.json()) as SentListResult;
        if (cancelled) return;
        setState((s) => ({ ...s, loading: false, result: json }));
      } catch (err: any) {
        if (cancelled || err?.name === 'AbortError') return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err?.message || 'Failed to load outbox'
        }));
      }
    }

    load();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [state.page, state.includeSystem]);

  if (state.loading && !state.result) {
    return (
      <div
        className="rounded-md p-10 text-center"
        style={{
          backgroundColor: '#fcfaf5',
          border: '1px solid rgba(13,13,13,0.08)',
          color: '#5a5a5a',
          fontFamily: 'var(--font-plex-sans), system-ui, sans-serif'
        }}
      >
        Loading sent notifications…
      </div>
    );
  }

  if (state.error) {
    return (
      <div
        className="rounded-md p-6"
        style={{
          backgroundColor: '#fef4f0',
          border: '1px solid #b40000',
          color: '#7a0a0a',
          fontFamily: 'var(--font-plex-sans), system-ui, sans-serif'
        }}
      >
        <strong>Could not load outbox.</strong> {state.error}
      </div>
    );
  }

  const rows = state.result?.rows ?? [];
  const total = state.result?.total ?? 0;

  return (
    <section
      aria-label="Sent notifications"
      style={{ fontFamily: 'var(--font-plex-sans), system-ui, sans-serif' }}
    >
      {/* Header */}
      <div
        className="rounded-t-md px-6 pt-5 pb-4"
        style={{
          backgroundColor: '#fcfaf5',
          border: '1px solid rgba(13,13,13,0.08)',
          borderBottom: '1px solid rgba(13,13,13,0.12)'
        }}
      >
        <div
          className="text-[10.5px] font-semibold uppercase tracking-[0.22em] mb-1"
          style={{ color: '#7a4a0a' }}
        >
          Outbox · what you broadcast
        </div>
        <h2
          className="text-2xl leading-tight"
          style={{
            color: '#0d0d0d',
            fontFamily:
              'var(--font-newsreader), Georgia, "Times New Roman", serif',
            fontWeight: 500,
            letterSpacing: '-0.015em'
          }}
        >
          Sent notifications
        </h2>
        <p className="text-[12.5px] mt-1.5" style={{ color: '#5a5a5a' }}>
          {total === 0
            ? "You haven't broadcast anything yet"
            : `${formatNumber(total)} ${total === 1 ? 'broadcast' : 'broadcasts'} authored by you`}
          {' · '}
          <button
            type="button"
            onClick={() =>
              setState((s) => ({ ...s, includeSystem: !s.includeSystem, page: 1 }))
            }
            className="underline underline-offset-2"
            style={{ color: '#3a6da6' }}
          >
            {state.includeSystem
              ? 'Hide system-generated work items'
              : 'Include system-generated work items'}
          </button>
        </p>
      </div>

      {/* Empty state */}
      {rows.length === 0 && !state.loading && (
        <div
          className="rounded-b-md py-12 text-center text-sm"
          style={{
            backgroundColor: '#fcfaf5',
            border: '1px solid rgba(13,13,13,0.08)',
            borderTop: 'none',
            color: '#5a5a5a'
          }}
        >
          No sent notifications to show.
          {!state.includeSystem &&
            ' Try including system-generated work items (toggle above).'}
        </div>
      )}

      {/* Rows */}
      {rows.length > 0 && (
        <div
          className="rounded-b-md"
          style={{
            backgroundColor: '#fcfaf5',
            border: '1px solid rgba(13,13,13,0.08)',
            borderTop: 'none'
          }}
        >
          {rows.map((row) => {
            const ink = getInk(row.priority);
            const readPct = formatPct(row.read_count, row.recipient_count);
            return (
              <Link
                key={row.id}
                href={`/notifications/admin/${row.id}`}
                className="group grid gap-3 px-6 py-4 border-b last:border-b-0 transition-colors hover:bg-stone-100/40 dark:hover:bg-stone-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
                style={{
                  borderBottomColor: 'rgba(13,13,13,0.08)',
                  gridTemplateColumns: 'auto 1fr auto'
                }}
                aria-label={`View details and recipient analytics for: ${row.title}`}
              >
                {/* Severity ribbon */}
                <div
                  aria-hidden
                  className="w-1 self-stretch rounded-sm"
                  style={{ backgroundColor: ink.ribbon }}
                />

                {/* Content */}
                <div className="min-w-0 space-y-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: ink.ink }}
                    >
                      {row.priority || 'normal'}
                    </span>
                    {row.category && (
                      <span
                        className="text-[10px] uppercase tracking-[0.12em]"
                        style={{ color: '#7a7a7a' }}
                      >
                        · {row.category}
                      </span>
                    )}
                  </div>
                  <h3
                    className="text-base leading-snug"
                    style={{
                      color: '#0d0d0d',
                      fontFamily:
                        'var(--font-newsreader), Georgia, "Times New Roman", serif',
                      fontWeight: 500
                    }}
                  >
                    {row.title}
                  </h3>
                  {row.body && (
                    <p
                      className="text-sm line-clamp-2"
                      style={{ color: '#3a3a3a' }}
                    >
                      {stripHtml(row.body)}
                    </p>
                  )}
                  <div
                    className="text-[11px] flex flex-wrap gap-x-3 gap-y-1 mt-1.5"
                    style={{ color: '#7a7a7a' }}
                  >
                    <span className="tabular-nums">{formatDate(row.created_at)}</span>
                    <span aria-hidden>·</span>
                    <span>{describeAudience(row.targeting)}</span>
                  </div>
                </div>

                {/* Right: dispatch metrics */}
                <div className="flex flex-col items-end justify-center text-right gap-0.5 min-w-[110px]">
                  <div
                    className="text-[1.4rem] leading-none tabular-nums"
                    style={{
                      color: ink.ink,
                      fontFamily:
                        'var(--font-plex-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 500
                    }}
                  >
                    {formatNumber(row.recipient_count)}
                  </div>
                  <div
                    className="text-[10px] uppercase tracking-[0.14em]"
                    style={{ color: '#7a7a7a' }}
                  >
                    recipients
                  </div>
                  <div
                    className="text-[11px] tabular-nums mt-1"
                    style={{
                      color: ink.ink,
                      fontFamily:
                        'var(--font-plex-mono), ui-monospace, monospace'
                    }}
                  >
                    {readPct} read
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {state.result && (state.page > 1 || state.result.has_more) && (
        <div className="flex items-center justify-between mt-4">
          <button
            type="button"
            onClick={() =>
              setState((s) => ({ ...s, page: Math.max(1, s.page - 1) }))
            }
            disabled={state.page <= 1}
            className={cn(
              'text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm border',
              state.page <= 1
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-stone-100 dark:hover:bg-stone-800'
            )}
            style={{ borderColor: 'rgba(13,13,13,0.18)', color: '#0d0d0d' }}
          >
            ← Newer
          </button>
          <div
            className="text-[11px] tabular-nums"
            style={{ color: '#7a7a7a' }}
          >
            Page {state.page} · {rows.length} of {total}
          </div>
          <button
            type="button"
            onClick={() => setState((s) => ({ ...s, page: s.page + 1 }))}
            disabled={!state.result.has_more}
            className={cn(
              'text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm border',
              !state.result.has_more
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-stone-100 dark:hover:bg-stone-800'
            )}
            style={{ borderColor: 'rgba(13,13,13,0.18)', color: '#0d0d0d' }}
          >
            Older →
          </button>
        </div>
      )}

      {/* Back link */}
      <div className="mt-6 text-center">
        <Link
          href="/notifications"
          className="text-xs uppercase tracking-wider underline underline-offset-4"
          style={{ color: '#3a6da6' }}
        >
          ← Back to inbox
        </Link>
      </div>
    </section>
  );
}
