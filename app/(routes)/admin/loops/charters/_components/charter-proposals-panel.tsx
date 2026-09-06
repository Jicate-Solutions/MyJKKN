'use client';

// ============================================================================
// CHARTER PROPOSALS — the MetaLoop's machine-drafts-humans-sign surface
// ============================================================================
// One card per loop_charter_proposals row (undecided first — the work queue).
// Each card shows the machine's full draft: the 5 charter legs + kill rule +
// suggested verdict owner + rationale. Two decisions, both explicit:
//
//   APPROVE → fn_loop_apply_charter_proposal (SECURITY DEFINER, re-checks
//     is_super_admin() server-side) — the ONLY path that writes charter legs
//     onto loop_registry. kill_rule / suggested_verdict_owner stay on this
//     proposal row (no registry column / owners are fn_loop_set_owner's job).
//   REJECT → a direct status UPDATE under the table's admin-gated RLS policy,
//     with the optional note preserved. `.select('id')` detects the 0-row RLS
//     refusal so it surfaces as an explicit toast, never a silent no-op
//     (CLAUDE.md rule #27).
//
// Sibling styling: owners-panel.tsx (same section/table idiom, same untyped-
// client cast — loop_charter_proposals isn't in the generated Database types).
// ============================================================================

import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface CharterProposalRow {
  id: string;
  loop_key: string;
  /** Resolved server-side from loop_registry; falls back to the key. */
  loop_name: string;
  proposed: Record<string, unknown>;
  rationale: string | null;
  status: 'proposed' | 'approved' | 'rejected' | 'insufficient';
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

const FIELD_LABELS: Array<{ key: string; label: string }> = [
  { key: 'outcome_metric', label: 'Outcome metric' },
  { key: 'counter_metric', label: 'Counter metric (Goodhart pair)' },
  { key: 'intervention', label: 'Intervention' },
  { key: 'baseline_window', label: 'Baseline window' },
  { key: 'remeasure_window', label: 'Remeasure window' },
  { key: 'kill_rule', label: 'Kill rule' },
  { key: 'suggested_verdict_owner', label: 'Suggested verdict owner' },
];

const STATUS_BADGE: Record<CharterProposalRow['status'], string> = {
  proposed:
    'border-amber-400/60 bg-amber-50/60 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300',
  approved:
    'border-emerald-400/60 bg-emerald-50/60 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300',
  rejected:
    'border-rose-400/60 bg-rose-50/60 text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-300',
  insufficient:
    'border-slate-400/60 bg-slate-50/60 text-slate-700 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-300',
};

function fieldText(proposed: Record<string, unknown>, key: string): string {
  const v = proposed[key];
  return typeof v === 'string' && v.trim() ? v.trim() : '—';
}

export function CharterProposalsPanel({ rows: initialRows }: { rows: CharterProposalRow[] }) {
  // Untyped-client cast, same as owners-panel.tsx — the table/RPC aren't in the
  // generated Database types; authorization is enforced server-side regardless.
  const supabase = useMemo(
    () => createClientSupabaseClient() as unknown as SupabaseClient,
    []
  );
  const [rows, setRows] = useState<CharterProposalRow[]>(initialRows);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const markDecided = (id: string, status: 'approved' | 'rejected', note: string | null) =>
    setRows((rs) =>
      rs.map((r) =>
        r.id === id
          ? { ...r, status, decided_at: new Date().toISOString(), decision_note: note }
          : r
      )
    );

  async function approve(row: CharterProposalRow) {
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.rpc('fn_loop_apply_charter_proposal', {
        p_proposal_id: row.id,
      });
      if (error) {
        // Explicit refusal, never silent — the RPC raises 'not authorized' for
        // non-super-admins and 'already decided' on a stale card.
        toast.error(
          /not authorized/i.test(error.message)
            ? 'Not authorized — only super administrators can approve charters.'
            : /already decided/i.test(error.message)
              ? `This proposal was already decided elsewhere — reload the page.`
              : `Approve failed for ${row.loop_key}: ${error.message}`
        );
        return;
      }
      if (data !== true) {
        toast.error(`No proposal matched — nothing was applied. Reload the page.`);
        return;
      }
      markDecided(row.id, 'approved', row.decision_note);
      toast.success(
        `Charter applied to “${row.loop_name}” — the 5 legs are now on the registry. Kill rule stays recorded here; assign the verdict owner on the Owners & verdicts panel.`
      );
    } finally {
      setBusyId(null);
    }
  }

  async function reject(row: CharterProposalRow) {
    setBusyId(row.id);
    try {
      const note = (notes[row.id] ?? '').trim() || null;
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('loop_charter_proposals')
        .update({
          status: 'rejected',
          decision_note: note,
          decided_by: userData?.user?.id ?? null,
          decided_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('status', 'proposed')
        .select('id');
      if (error) {
        toast.error(`Reject failed for ${row.loop_key}: ${error.message}`);
        return;
      }
      if (!data || data.length === 0) {
        // RLS refusal or an already-decided row both land here as 0 rows —
        // surface it explicitly, never a silent no-op.
        toast.error(
          'Nothing was updated — either you lack permission (admins only) or this proposal was already decided. Reload the page.'
        );
        return;
      }
      markDecided(row.id, 'rejected', note);
      toast.success(`Rejected the draft charter for “${row.loop_name}”.`);
    } finally {
      setBusyId(null);
    }
  }

  const open = rows.filter((r) => r.status === 'proposed');
  const decided = rows.filter((r) => r.status === 'approved' || r.status === 'rejected');
  // Honest abstentions — the machine read the evidence and declined to draft.
  // Latest per loop only (history stays in the table); newest-first.
  const insufficient = useMemo(() => {
    const latest = new Map<string, CharterProposalRow>();
    for (const r of rows.filter((x) => x.status === 'insufficient')) {
      const prev = latest.get(r.loop_key);
      if (!prev || r.created_at > prev.created_at) latest.set(r.loop_key, r);
    }
    return [...latest.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [rows]);

  const card = (row: CharterProposalRow) => {
    const busy = busyId === row.id;
    return (
      <article key={row.id} className="rounded-xl border border-border">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold tracking-tight">{row.loop_name}</h3>
            <span className="font-mono text-[11px] text-muted-foreground">
              {row.loop_key} · drafted {row.created_at.slice(0, 10)}
              {row.decided_at ? ` · decided ${row.decided_at.slice(0, 10)}` : ''}
            </span>
          </div>
          <span
            className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${STATUS_BADGE[row.status]}`}
          >
            {row.status}
          </span>
        </header>

        <dl className="grid gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-2">
          {FIELD_LABELS.map(({ key, label }) => (
            <div key={key} className={key === 'kill_rule' ? 'sm:col-span-2' : ''}>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {label}
              </dt>
              <dd className="text-sm">{fieldText(row.proposed, key)}</dd>
            </div>
          ))}
          {row.rationale && (
            <div className="sm:col-span-2">
              <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Machine rationale
              </dt>
              <dd className="text-sm text-muted-foreground">{row.rationale}</dd>
            </div>
          )}
          {row.status !== 'proposed' && row.decision_note && (
            <div className="sm:col-span-2">
              <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Decision note
              </dt>
              <dd className="text-sm text-muted-foreground">{row.decision_note}</dd>
            </div>
          )}
        </dl>

        {row.status === 'proposed' && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
            <Input
              aria-label={`Decision note for ${row.loop_name}`}
              value={notes[row.id] ?? ''}
              onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
              placeholder="Decision note (optional; kept with the record)"
              className="h-8 w-full text-xs sm:w-80"
              disabled={busy}
            />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => reject(row)}>
              {busy ? 'Working…' : 'Reject'}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => approve(row)}>
              {busy ? 'Working…' : 'Approve — write legs to registry'}
            </Button>
          </footer>
        )}
      </article>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Awaiting decision</h2>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {open.length} proposed
          </span>
        </div>
        {open.length === 0 ? (
          <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
            No charter drafts are waiting. MetaLoop drafts on Sundays and
            finished drafts surface daily; when the machine judges a loop&rsquo;s
            evidence too thin to charter honestly, its reason appears below
            instead.
          </div>
        ) : (
          open.map(card)
        )}
      </section>

      {insufficient.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">
              Can&rsquo;t charter yet — the machine&rsquo;s reasons
            </h2>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {insufficient.length} loop{insufficient.length === 1 ? '' : 's'} waiting on a human
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            MetaLoop read each loop&rsquo;s live evidence and declined to draft a
            charter. Each reason names what has to change first — usually a
            human action, not a code fix. The loop is re-examined every Sunday;
            this list shows the latest verdict per loop.
          </p>
          {insufficient.map((row) => (
            <article key={row.id} className="rounded-xl border border-border">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-sm font-semibold tracking-tight">{row.loop_name}</h3>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {row.loop_key} · examined {row.created_at.slice(0, 10)}
                  </span>
                </div>
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${STATUS_BADGE.insufficient}`}
                >
                  insufficient evidence
                </span>
              </header>
              <p className="px-4 py-3 text-sm text-muted-foreground">
                {row.rationale ?? '(no reason recorded)'}
              </p>
            </article>
          ))}
        </section>
      )}

      {decided.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Decided</h2>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {decided.length} record{decided.length === 1 ? '' : 's'}
            </span>
          </div>
          {decided.map(card)}
        </section>
      )}
    </div>
  );
}
