'use client';

// ============================================================================
// Prompt Graduation — champion–challenger surface on /admin/ai-models.
// Added 2026-07-26 (migration 20260803030000, on the 20260726073915 substrate).
//
// Every AI job's live prompt is its CHAMPION. A proposed replacement is a
// CHALLENGER: a neutral judge (the DARK 'prompt_compare.judge' registry row)
// scores both prompts' outputs on the same real inputs, and once a challenger
// clears the policy bar (ai_prompt_graduation.min_samples / .win_margin) a
// graduation PROPOSAL appears here. PROMOTION IS HUMAN-ONLY: the Approve
// button calls fn_prompt_graduation_decide, which calls the substrate's
// fn_prompt_promote_version — nothing ever promotes automatically.
//
// Reads /api/admin/ai-models/prompt-graduation (super_admin-gated). The page
// already wraps this in <SuperAdminOnly>. With no challengers and no proposals
// (the normal dark state) the card renders nothing.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, GraduationCap, Loader2, RefreshCw, ThumbsDown, Trophy, XCircle } from 'lucide-react';

interface ProposalRow {
  id: string;
  job_type: string;
  challenger_version: number;
  champion_version: number | null;
  samples: number;
  challenger_wins: number;
  champion_wins: number;
  ties: number;
  min_samples_at_proposal: number;
  win_margin_at_proposal: number;
  status: 'pending' | 'approved' | 'rejected';
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

interface CollectingRow {
  job_type: string;
  challenger_version: number;
  notes: string | null;
  created_at: string;
  samples: number;
  challenger_wins: number;
  champion_wins: number;
  ties: number;
}

interface Payload {
  proposals: ProposalRow[];
  collecting: CollectingRow[];
  bar: { min_samples: number; win_margin: number };
}

export function PromptGraduationCard() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/admin/ai-models/prompt-graduation', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setData(json.data ?? null);
    } catch {
      setError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (proposalId: string, approve: boolean) => {
      setDecidingId(proposalId);
      setDecideError(null);
      try {
        const res = await fetch('/api/admin/ai-models/prompt-graduation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposal_id: proposalId, approve }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(typeof json?.error === 'string' ? json.error : `Request failed (${res.status})`);
        }
        await load();
      } catch (e) {
        setDecideError(e instanceof Error ? e.message : 'Could not record the decision');
      } finally {
        setDecidingId(null);
        setConfirmId(null);
      }
    },
    [load],
  );

  const proposals = data?.proposals ?? [];
  const collecting = data?.collecting ?? [];
  const pending = proposals.filter((p) => p.status === 'pending');
  const decided = proposals.filter((p) => p.status !== 'pending').slice(0, 5);

  // Normal dark state: no challengers, no proposals, no error → render nothing.
  if (!loading && !error && proposals.length === 0 && collecting.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="h-4 w-4 text-muted-foreground" />
          Prompt graduation
          <span className="text-xs font-normal text-muted-foreground">
            challenger prompts vs the live champion — you approve, nothing promotes itself
          </span>
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} aria-label="Refresh">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-muted-foreground">Couldn&apos;t load prompt graduation state right now.</p>}
        {decideError && <p className="text-sm text-destructive">{decideError}</p>}

        {/* Pending proposals — the human decision point. */}
        {pending.map((p) => (
          <div
            key={p.id}
            className="rounded-md border border-emerald-500/40 bg-emerald-50 p-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-950/30"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-emerald-900 dark:text-emerald-200">
                  <Trophy className="mr-1 inline h-4 w-4" />
                  <span className="font-mono">{p.job_type}</span>: challenger v{p.challenger_version} beat champion
                  {p.champion_version !== null ? ` v${p.champion_version}` : ''}
                </p>
                <p className="text-emerald-800 dark:text-emerald-300">
                  {p.challenger_wins} wins · {p.ties} ties · {p.champion_wins} losses over {p.samples} judged inputs
                  (bar: {p.min_samples_at_proposal} samples, +{p.win_margin_at_proposal} margin) ·{' '}
                  {formatDistanceToNow(parseISO(p.created_at), { addSuffix: true })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {confirmId === p.id ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => void decide(p.id, true)}
                      disabled={decidingId !== null}
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {decidingId === p.id ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                      )}
                      Confirm graduation
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)} disabled={decidingId !== null}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" onClick={() => setConfirmId(p.id)} disabled={decidingId !== null}>
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void decide(p.id, false)}
                      disabled={decidingId !== null}
                    >
                      {decidingId === p.id ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <ThumbsDown className="mr-1 h-3 w-3" />
                      )}
                      Reject
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Challengers still collecting judgments. */}
        {collecting.length > 0 && (
          <div className="divide-y divide-border rounded-md border border-border">
            {collecting.map((c) => (
              <div
                key={`${c.job_type}#${c.challenger_version}`}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs text-foreground">{c.job_type}</span>
                  <span className="ml-2 text-muted-foreground">challenger v{c.challenger_version}</span>
                  {c.notes ? <span className="ml-2 text-xs text-muted-foreground">{c.notes}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {c.champion_wins}·{c.ties}·{c.challenger_wins} (champion·tie·challenger)
                  </span>
                  <Badge variant="secondary" className="gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    judged {c.samples}/{data?.bar.min_samples ?? 10}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent decisions, for the audit glance. */}
        {decided.length > 0 && (
          <div className="divide-y divide-border rounded-md border border-border">
            {decided.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-foreground">{p.job_type}</span>
                  <span className="ml-2 text-muted-foreground">
                    v{p.champion_version ?? '—'} → v{p.challenger_version}
                  </span>
                  {p.decided_at ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatDistanceToNow(parseISO(p.decided_at), { addSuffix: true })}
                    </span>
                  ) : null}
                </div>
                {p.status === 'approved' ? (
                  <Badge className="gap-1 border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    graduated
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    rejected
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
