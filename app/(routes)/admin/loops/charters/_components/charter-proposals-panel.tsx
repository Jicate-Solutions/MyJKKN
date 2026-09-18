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
  /**
   * charter = the MetaLoop's 5-leg draft (every row before 20261225070000) ·
   * bar = a proposed bar for a loop that has none · bar-review = "this loop
   * missed its bar 4 runs in a row, the bar may be wrong". The two bar kinds
   * are decided through fn_loop_bar_decide, not fn_loop_apply_charter_proposal.
   */
  kind: 'charter' | 'bar' | 'bar-review';
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  /** Bar cards only: the loop's last recorded headline numbers, newest first — the scale a typed bar lives on. */
  recent_values?: (number | null)[];
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
  // The Director's own bar text, per card. The machine only ever proposes prose;
  // a plain number typed here is the ONLY way a numeric bar reaches the
  // registry — and a numeric bar is what arms the four-miss alarm.
  const [barValues, setBarValues] = useState<Record<string, string>>({});
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

  // Bars decided here go through fn_loop_bar_decide (SECURITY DEFINER,
  // re-checks is_super_admin() server-side; it REFUSES a charter proposal, so
  // the two paths can never cross).
  async function decideBar(row: CharterProposalRow, decision: 'approved' | 'rejected') {
    setBusyId(row.id);
    try {
      const note = (notes[row.id] ?? '').trim() || null;
      const override = decision === 'approved' ? (barValues[row.id] ?? '').trim() || null : null;
      const { error } = await supabase.rpc('fn_loop_bar_decide', {
        p_proposal_id: row.id,
        p_decision: decision,
        p_note: note,
        p_bar_override: override,
      });
      if (error) {
        toast.error(
          /not authorized/i.test(error.message)
            ? 'Not authorized — only super administrators can set a loop’s bar.'
            : /already decided/i.test(error.message)
              ? 'This was already decided elsewhere — reload the page.'
              : `Failed for ${row.loop_key}: ${error.message}`
        );
        return;
      }
      markDecided(row.id, decision, note);
      toast.success(
        row.kind === 'bar-review'
          ? decision === 'approved'
            ? override
              ? `Re-set the bar on “${row.loop_name}” to “${override}” — the miss count starts again from zero.`
              : `Cleared the bar on “${row.loop_name}” — a fresh one is proposed on the next run.`
            : `Kept the bar on “${row.loop_name}” — the miss count starts again from zero.`
          : decision === 'approved'
            ? override
              ? `“${row.loop_name}” is now judged against “${override}”.`
              : `“${row.loop_name}” is now judged against this bar.`
            : `Rejected the proposed bar for “${row.loop_name}” — it will not be proposed again unless its charter changes.`
      );
    } finally {
      setBusyId(null);
    }
  }

  const charters = rows.filter((r) => r.kind === 'charter');
  const bars = rows.filter((r) => r.kind === 'bar' || r.kind === 'bar-review');

  const open = charters.filter((r) => r.status === 'proposed');
  const decided = charters.filter((r) => r.status === 'approved' || r.status === 'rejected');
  const barsOpen = bars.filter((r) => r.status === 'proposed');
  const barsDecided = bars.filter((r) => r.status === 'approved' || r.status === 'rejected');
  // Honest abstentions — the machine read the evidence and declined to draft.
  // Latest per loop only (history stays in the table); newest-first.
  const insufficient = useMemo(() => {
    const latest = new Map<string, CharterProposalRow>();
    for (const r of rows.filter((x) => x.status === 'insufficient' && x.kind === 'charter')) {
      const prev = latest.get(r.loop_key);
      if (!prev || r.created_at > prev.created_at) latest.set(r.loop_key, r);
    }
    return [...latest.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [rows]);
  // Loops the machine could not bar at all — a standing note, one per loop.
  const barsInsufficient = useMemo(
    () =>
      [
        ...new Set(
          rows.filter((r) => r.kind === 'bar' && r.status === 'insufficient').map((r) => r.loop_name)
        ),
      ].sort(),
    [rows]
  );

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

  const barCard = (row: CharterProposalRow) => {
    const busy = busyId === row.id;
    const isReview = row.kind === 'bar-review';
    const last4 = Array.isArray(row.proposed.last_4_values)
      ? (row.proposed.last_4_values as unknown[])
      : null;
    return (
      <article key={row.id} className="rounded-xl border border-border">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold tracking-tight">
              {isReview ? 'Bar may be wrong: ' : 'Bar: '}
              {row.loop_name}
            </h3>
            <span className="font-mono text-[11px] text-muted-foreground">
              {row.loop_key} · raised {row.created_at.slice(0, 10)}
              {row.decided_at ? ` · decided ${row.decided_at.slice(0, 10)}` : ''}
            </span>
          </div>
          <span
            className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${STATUS_BADGE[row.status]}`}
          >
            {row.status}
          </span>
        </header>

        <dl className="grid gap-x-6 gap-y-2 px-4 py-3">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {isReview ? 'The bar it has been missing' : 'Proposed bar'}
            </dt>
            <dd className="text-sm">
              {fieldText(row.proposed, isReview ? 'current_bar' : 'bar')}
            </dd>
          </div>
          {!isReview && (
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Bar kind
              </dt>
              <dd className="text-sm">{fieldText(row.proposed, 'bar_kind')}</dd>
            </div>
          )}
          {isReview && last4 && (
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Last four misses (newest first)
              </dt>
              <dd className="font-mono text-sm tabular-nums">
                {last4.length > 0 ? last4.map((v) => (v == null ? '—' : String(v))).join(' · ') : '—'}
              </dd>
            </div>
          )}
          {row.status === 'proposed' && (
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Recent readings of this loop (newest first)
              </dt>
              <dd className="font-mono text-sm tabular-nums">
                {row.recent_values && row.recent_values.length > 0
                  ? row.recent_values.map((v) => (v == null ? '—' : String(v))).join(' · ')
                  : 'no final readings recorded for this loop yet — it writes one per run once the bar migration is applied'}
              </dd>
            </div>
          )}
          {row.rationale && (
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Why
              </dt>
              <dd className="text-sm text-muted-foreground">{row.rationale}</dd>
            </div>
          )}
          {row.status !== 'proposed' && row.decision_note && (
            <div>
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
              aria-label={`Bar value for ${row.loop_name}`}
              value={barValues[row.id] ?? ''}
              onChange={(e) => setBarValues((b) => ({ ...b, [row.id]: e.target.value }))}
              placeholder={
                isReview
                  ? 'New bar (optional) — a plain number re-sets it instead of clearing'
                  : 'Bar value (optional) — a plain number, e.g. 85, arms the four-miss alarm'
              }
              inputMode="decimal"
              className="h-8 w-full text-xs sm:w-80"
              disabled={busy}
            />
            <Input
              aria-label={`Decision note for ${row.loop_name}`}
              value={notes[row.id] ?? ''}
              onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
              placeholder="Decision note (optional; kept with the record)"
              className="h-8 w-full text-xs sm:w-80"
              disabled={busy}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => decideBar(row, 'rejected')}
            >
              {busy ? 'Working…' : isReview ? 'The bar is fine — keep it' : 'Reject'}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => decideBar(row, 'approved')}>
              {busy
                ? 'Working…'
                : isReview
                  ? (barValues[row.id] ?? '').trim()
                    ? 'The bar was wrong — re-set it to this'
                    : 'The bar was wrong — clear it'
                  : (barValues[row.id] ?? '').trim()
                    ? 'Approve — use my bar value'
                    : 'Approve — make this the loop’s bar'}
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
          <h2 className="text-sm font-semibold tracking-tight">Bars</h2>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {barsOpen.length} waiting
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          One concrete bar per loop. The machine proposes; approving is what
          sets it. A loop that misses its bar four runs in a row raises a
          &ldquo;bar may be wrong&rdquo; card here instead of going quietly red
          — nothing is ever paused automatically.
        </p>
        {barsOpen.length === 0 ? (
          <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
            No bars are waiting on you.
          </div>
        ) : (
          barsOpen.map(barCard)
        )}
        {barsInsufficient.length > 0 && (
          <p className="text-xs text-muted-foreground">
            No bar could be proposed for{' '}
            <span className="tabular-nums">{barsInsufficient.length}</span> loop
            {barsInsufficient.length === 1 ? '' : 's'} — needs an owner
            interview: {barsInsufficient.join(', ')}.
          </p>
        )}
        {barsDecided.length > 0 && (
          <details className="rounded-xl border border-border px-4 py-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {barsDecided.length} decided bar record
              {barsDecided.length === 1 ? '' : 's'}
            </summary>
            <div className="mt-3 flex flex-col gap-3">{barsDecided.map(barCard)}</div>
          </details>
        )}
      </section>

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
