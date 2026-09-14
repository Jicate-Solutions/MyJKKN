'use client';

// date-requests.tsx — Event Date Requests (CARRE instrumentation, Lane B)
// LC brief Q4: "no confirmed event dates; repeated Principal meetings". Every
// in-person ask was invisible — this surface turns the ask into a timestamped
// row so "how long has this been waiting" is measurable.
//
// Renders on /events/propose/[id]/status below the timeline:
//   • an open-requests line (count + oldest waiting days),
//   • a small "Request a date" button → fn_event_date_request_raise RPC,
//   • Confirm / Decline on each open request → fn_event_date_request_decide RPC,
//     shown only to someone the RPC will actually accept,
//   • explicit denial states — every RPC failure shows its reason inline
//     (rule #27: never a silent no-op or redirect).
// Writes are RPC-only; the base table is read-only under RLS.
//
// 2026-09-07 — the decide half. `fn_event_date_request_decide` shipped with the
// original migration (20260725150000) and had NO caller anywhere in the app, so
// a request could be raised and never answered. This adds the missing caller.
//
// Who may decide (mirrors the RPC's own check — the RPC is still the gate; this
// is only the affordance, and a refusal is rendered verbatim):
//   is_super_admin() OR is_admin()
//   OR event_proposals.decided_by = auth.uid()   ← the proposal's DECIDER,
//                                                  not the person who proposed it
//   OR (user_has_permission('events.dates.decide') AND institution access)

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Check, Loader2, X } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/use-permissions';

type DateRequestDecision = 'confirmed' | 'declined' | 'superseded';

interface DateRequestRow {
  id: string;
  requested_at: string;
  requested_by: string;
  note: string | null;
  decision: DateRequestDecision | null;
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
}

interface RaiseRpcResult {
  success: boolean;
  error?: string;
  message?: string;
  request_id?: string;
  requested_at?: string;
}

interface DecideRpcResult {
  success: boolean;
  error?: string;
  message?: string;
  request_id?: string;
  decision?: DateRequestDecision;
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const DECISION_LABEL: Record<DateRequestDecision, string> = {
  confirmed: 'confirmed',
  declined: 'declined',
  superseded: 'replaced by a newer request',
};

interface DateRequestsProps {
  proposalId: string;
}

export default function DateRequests({ proposalId }: DateRequestsProps) {
  const supabase = createClientSupabaseClient();
  const { can, isSuperAdmin, userProfile } = usePermissions();

  const [requests, setRequests] = useState<DateRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [raiseError, setRaiseError] = useState<string | null>(null);
  const [raised, setRaised] = useState(false);

  // The proposal's decision owner — one of the three ways the decide RPC says yes.
  const [proposalDecider, setProposalDecider] = useState<string | null>(null);
  // Best-effort display names. A failure here must never blank the panel:
  // the decision and its timestamp are the record, the name is a courtesy.
  const [names, setNames] = useState<Record<string, string>>({});

  const [decideTarget, setDecideTarget] =
    useState<{ row: DateRequestRow; action: 'confirmed' | 'declined' } | null>(null);
  const [decideNote, setDecideNote] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [decidedOk, setDecidedOk] = useState<string | null>(null);

  const loadNames = useCallback(async (ids: (string | null)[]) => {
    const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
    if (unique.length === 0) return;
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('id, full_name')
      .in('id', unique);
    if (error || !data) return; // silent by design — see `names` above
    setNames(prev => {
      const next = { ...prev };
      for (const p of data as { id: string; full_name: string | null }[]) {
        if (p.full_name) next[p.id] = p.full_name;
      }
      return next;
    });
  }, [supabase]);

  const loadRequests = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('event_date_requests')
      .select('id, requested_at, requested_by, note, decision, decision_note, decided_by, decided_at')
      .eq('proposal_id', proposalId)
      .order('requested_at', { ascending: false });

    if (error) {
      setLoadError(error.message);
    } else {
      setLoadError(null);
      const rows = (data ?? []) as DateRequestRow[];
      setRequests(rows);
      void loadNames(rows.flatMap(r => [r.requested_by, r.decided_by]));
    }
    setLoading(false);
  }, [proposalId, supabase, loadNames]);

  const loadProposalDecider = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('event_proposals')
      .select('decided_by')
      .eq('id', proposalId)
      .maybeSingle();
    setProposalDecider((data?.decided_by as string | null) ?? null);
  }, [proposalId, supabase]);

  useEffect(() => {
    if (!proposalId) return;
    void loadRequests();
    void loadProposalDecider();
  }, [proposalId, loadRequests, loadProposalDecider]);

  const handleRaise = async () => {
    setSubmitting(true);
    setRaiseError(null);
    try {
      const { data, error } = await (supabase as any).rpc('fn_event_date_request_raise', {
        p_proposal_id: proposalId,
      });

      if (error) {
        setRaiseError(error.message);
      } else {
        const result = data as RaiseRpcResult;
        if (result?.success) {
          setRaised(true);
          await loadRequests();
        } else {
          // Explicit denial — surface the exact reason from the RPC.
          setRaiseError(result?.message ?? 'The date request could not be raised.');
        }
      }
    } catch (err) {
      setRaiseError(err instanceof Error ? err.message : 'The date request could not be raised.');
    } finally {
      setSubmitting(false);
    }
  };

  const openDecision = (row: DateRequestRow, action: 'confirmed' | 'declined') => {
    setDecideTarget({ row, action });
    setDecideNote('');
    setDecideError(null);
    setDecidedOk(null);
  };

  const submitDecision = async () => {
    if (!decideTarget) return;
    const { row, action } = decideTarget;

    // Same convention as the proposal reject dialog: a refusal owes a reason.
    if (action === 'declined' && !decideNote.trim()) {
      setDecideError('Please add a short note saying why the date is declined.');
      return;
    }

    setDeciding(true);
    setDecideError(null);
    try {
      const { data, error } = await (supabase as any).rpc('fn_event_date_request_decide', {
        p_request_id: row.id,
        p_decision: action,
        p_note: decideNote.trim() || null,
      });

      if (error) {
        setDecideError(error.message);
        return;
      }

      const result = data as DecideRpcResult;
      if (result?.success) {
        setDecideTarget(null);
        setDecideNote('');
        setDecidedOk(
          action === 'confirmed'
            ? 'Date request confirmed — the waiting clock has stopped.'
            : 'Date request declined — the person who asked will see your note.'
        );
        await loadRequests();
      } else {
        // Explicit denial — the RPC's own words, never a silent no-op.
        setDecideError(result?.message ?? 'The date request could not be decided.');
      }
    } catch (err) {
      setDecideError(err instanceof Error ? err.message : 'The date request could not be decided.');
    } finally {
      setDeciding(false);
    }
  };

  const nameFor = (id: string | null): string | null => {
    if (!id) return null;
    if (userProfile?.id && id === userProfile.id) return 'you';
    return names[id] ?? null;
  };

  // The RPC is the real gate; this only decides whether to OFFER the buttons —
  // so it must not be NARROWER than the RPC, or someone the database would
  // accept is shown no control at all and has no way to act.
  //
  // fn_event_date_request_decide accepts FOUR paths:
  //   is_super_admin() OR is_admin()
  //   OR the proposal's own decision owner
  //   OR (user_has_permission('events.dates.decide') AND role_has_institution_access)
  //
  // usePermissions exposes isSuperAdmin but has no isAdmin, so the is_admin()
  // branch is spelled out here from the profile role — the same way the sibling
  // screen app/(routes)/events/proposals/page.tsx already does it. The role list
  // mirrors is_admin()'s own (admin / super_admin / administrator); omitting it
  // locked out every plain admin who was not also the proposal's decider.
  const isAdminRole =
    userProfile?.role === 'admin' ||
    userProfile?.role === 'super_admin' ||
    userProfile?.role === 'administrator';

  const canDecide =
    isSuperAdmin ||
    isAdminRole ||
    can('events.dates.decide') ||
    (!!proposalDecider && !!userProfile?.id && proposalDecider === userProfile.id);

  const open = requests.filter(r => r.decided_at === null);
  const decided = requests.filter(r => r.decided_at !== null);
  const latestDecided = decided[0] ?? null;
  const oldestOpen = open.length > 0 ? open[open.length - 1] : null;
  const latestDecidedBy = latestDecided ? nameFor(latestDecided.decided_by) : null;

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Event date</h3>
      </div>

      {loading ? (
        <div className="h-4 w-2/3 bg-muted rounded animate-pulse" aria-label="Loading date requests" />
      ) : loadError ? (
        <p className="text-sm text-destructive" role="alert">
          Could not load date requests: {loadError}
        </p>
      ) : (
        <>
          {/* Open-requests line — the measured wait, not anecdote */}
          {open.length > 0 && oldestOpen ? (
            <p className="text-sm text-muted-foreground" role="status">
              <span className="font-medium text-foreground">
                {open.length} open date request{open.length === 1 ? '' : 's'}
              </span>{' '}
              · oldest waiting {daysSince(oldestOpen.requested_at)} day
              {daysSince(oldestOpen.requested_at) === 1 ? '' : 's'} (asked{' '}
              {formatDate(oldestOpen.requested_at)})
            </p>
          ) : latestDecided ? (
            <p className="text-sm text-muted-foreground" role="status">
              Last date request {DECISION_LABEL[latestDecided.decision ?? 'confirmed']}
              {latestDecided.decided_at ? ` on ${formatDate(latestDecided.decided_at)}` : ''}
              {latestDecidedBy ? ` by ${latestDecidedBy}` : ''}.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No date request yet. If this event is still waiting for a confirmed date, raise
              one — it timestamps the ask so the wait is visible.
            </p>
          )}

          {/* Decide list — only for someone the RPC will accept. Everyone else
              keeps the summary line above and never sees a button that fails. */}
          {canDecide && open.length > 0 && (
            <ul className="space-y-2 border-t pt-3" aria-label="Open date requests to decide">
              {open.map(row => {
                const waited = daysSince(row.requested_at);
                const asker = nameFor(row.requested_by);
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-background p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{asker ?? 'Someone'}</span> asked on{' '}
                        {formatDate(row.requested_at)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Waiting {waited} day{waited === 1 ? '' : 's'}
                      </p>
                      {row.note && (
                        <p className="mt-1 text-xs text-muted-foreground">“{row.note}”</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => openDecision(row, 'confirmed')}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        aria-label={`Confirm the date request from ${asker ?? 'this person'}`}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => openDecision(row, 'declined')}
                        aria-label={`Decline the date request from ${asker ?? 'this person'}`}
                      >
                        <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        Decline
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* What was already decided, and by whom */}
          {canDecide && decided.length > 0 && (
            <ul className="space-y-1 border-t pt-3" aria-label="Decided date requests">
              {decided.slice(0, 3).map(row => {
                const decider = nameFor(row.decided_by);
                return (
                  <li key={row.id} className="text-xs text-muted-foreground">
                    <span
                      className={
                        row.decision === 'confirmed'
                          ? 'font-medium text-green-700 dark:text-emerald-400'
                          : 'font-medium text-red-600 dark:text-red-400'
                      }
                    >
                      {DECISION_LABEL[row.decision ?? 'confirmed']}
                    </span>
                    {row.decided_at ? ` on ${formatDate(row.decided_at)}` : ''}
                    {decider ? ` by ${decider}` : ''}
                    {row.decision_note ? ` — “${row.decision_note}”` : ''}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRaise}
              disabled={submitting}
              aria-label="Request a confirmed date for this event"
            >
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Request a date
            </Button>
            {raised && !raiseError && (
              <span className="text-xs text-green-700 dark:text-green-400" role="status">
                Date request raised — the wait is now on record.
              </span>
            )}
            {decidedOk && (
              <span className="text-xs text-green-700 dark:text-emerald-400" role="status">
                {decidedOk}
              </span>
            )}
          </div>

          {/* Explicit denial state — the exact reason, never a silent failure */}
          {raiseError && (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
              role="alert"
            >
              {raiseError}
            </p>
          )}

          {/* A decide refusal raised outside the dialog still has to be visible */}
          {decideError && !decideTarget && (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
              role="alert"
            >
              {decideError}
            </p>
          )}
        </>
      )}

      {/* Decision dialog */}
      <Dialog
        open={!!decideTarget}
        onOpenChange={(isOpen) => {
          if (!isOpen && !deciding) {
            setDecideTarget(null);
            setDecideError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decideTarget?.action === 'confirmed'
                ? 'Confirm this date request'
                : 'Decline this date request'}
            </DialogTitle>
            <DialogDescription>
              {decideTarget?.action === 'confirmed'
                ? 'This records that the date is settled and stops the waiting clock. It does not itself write the date onto the proposal — use “Edit details” on the proposal to set the actual date.'
                : 'The person who asked will see this decision and your note.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="date-decision-note" className="text-sm font-medium">
              Note{decideTarget?.action === 'declined' ? ' *' : ' (optional)'}
            </Label>
            <Textarea
              id="date-decision-note"
              rows={3}
              value={decideNote}
              onChange={(e) => setDecideNote(e.target.value)}
              placeholder={
                decideTarget?.action === 'confirmed'
                  ? 'Anything the person who asked should know (optional)…'
                  : 'Say why the date cannot be confirmed…'
              }
            />
          </div>

          {decideError && (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
              role="alert"
            >
              {decideError}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDecideTarget(null); setDecideError(null); }}
              disabled={deciding}
            >
              Cancel
            </Button>
            <Button
              onClick={submitDecision}
              disabled={deciding}
              variant={decideTarget?.action === 'declined' ? 'destructive' : 'default'}
              className={decideTarget?.action === 'confirmed' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
            >
              {deciding && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {decideTarget?.action === 'confirmed' ? 'Confirm date' : 'Decline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
