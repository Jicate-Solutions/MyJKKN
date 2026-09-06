'use client';

// =====================================================================
// Capability Gaps tab (Phase 2 — human-gated fix loop + measured drop-check)
// =====================================================================
// Moat proven on prod 2026-07-14: billing.fee_defaulters refusal-frequency
// 1.0 → 0.0 after the class-1b tool exposure → fn_capgap_measure auto-resolved.
// Phase 1 rendered clusters of AI-assistant refusals read-only. Phase 2 turns
// each cluster into a human-gated workflow:
//   • Confirm / change the auto-proposed gap class      → fn_capgap_triage
//   • Mark an exposed 1b tool "fix live" (+ a copy-able Windows READ_TOOLS
//     snippet the Director/Windows session runs out-of-band)  → fn_capgap_set_status('fix_live')
//   • Measure the post-fix refusal-frequency drop        → fn_capgap_measure
//   • Mark data gap / privacy wall / dismiss             → fn_capgap_set_status
// and shows a before→after measurement panel (baseline→post-fix frequency with
// sample sizes, a ✓ dropped / ✗ no-drop verdict, and the captured retest answer).
//
// Everything stays super-admin only (the page is SuperAdminOnly and every RPC
// is is_super_admin()-gated). Phase 2 does NOT run an in-browser leak-test —
// the leak-test + the actual Windows READ_TOOLS edit are out-of-band; this tab
// only tracks disposition state and generates the handoff text.
//
// Fns are not in generated types → the (supabase as any).rpc(...) cast is the
// repo's standard pattern for SECDEF RPCs.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  AlertCircle,
  Inbox,
  ChevronDown,
  ChevronRight,
  Info,
  Users,
  Repeat,
  Wrench,
  ShieldQuestion,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Ban,
  ShieldOff,
  FlaskConical,
  Gauge,
  ArrowRight,
} from 'lucide-react';

// ---- shapes (fn_capgap_list returns untyped jsonb; now includes the
//      Phase-2 measurement + disposition columns via to_jsonb(cg.*)) --------
type GapClass = '1a' | '1b' | '2' | '3' | 'non_gap';

interface CapGapRow {
  id: string;
  cluster_key: string;
  title: string;
  sample_questions: string[] | null;
  sample_job_ids: string[] | null;
  first_seen: string | null;
  last_seen: string | null;
  occurrence_count: number;
  distinct_users: number;
  gap_class: GapClass | null;
  gap_class_source: 'auto' | 'human' | null;
  suggested_fix: string | null;
  candidate_tool: string | null;
  status: string;
  actionable: boolean;
  // Phase 2 fields
  fix_applied_at: string | null;
  linked_tool_id: string | null;
  baseline_freq: number | null;
  baseline_n: number | null;
  post_fix_freq: number | null;
  post_fix_n: number | null;
  freq_dropped: boolean | null;
  retest_answer: string | null;
  retest_at: string | null;
  disposed_reason: string | null;
  resolved_at: string | null;
  // Phase 3 fields (spec §8/§9)
  draft_sql: string | null;
  leaktest_result: LeaktestResult | null;
  leaktest_at: string | null;
  retest_enqueued_at: string | null;
  retest_job_ids: string[] | null;
}

// Phase 3 (§8): the in-app leak-test verdict written by fn_capgap_leaktest.
interface LeaktestResult {
  pass?: boolean;
  isolation_ok?: boolean;
  spoof_blocked?: boolean;
  tool?: string;
  user_a?: string;
  user_b?: string;
  institution_a?: string;
  institution_b?: string;
  note?: string;
  checked_at?: string;
}

interface CapGapStats {
  open: number;
  resolved: number;
  total: number;
  refusals_week: number;
  class_mix: {
    '1a': number;
    '1b': number;
    '2': number;
    '3': number;
    non_gap: number;
    uncategorized: number;
  };
}

const TERMINAL_STATUSES = new Set([
  'resolved',
  'dismissed',
  'data_gap',
  'privacy_wall',
]);

// ---- gap-class badge presentation ------------------------------------
function gapClassLabel(gc: CapGapRow['gap_class']): string {
  switch (gc) {
    case '1a':
      return '1a · exists + exposed';
    case '1b':
      return '1b · exists, not exposed';
    case '2':
      return '2 · no tool, data exists';
    case '3':
      return '3 · data gap';
    case 'non_gap':
      return 'non-gap';
    default:
      return 'uncategorized';
  }
}

function gapClassColor(gc: CapGapRow['gap_class']): string {
  switch (gc) {
    case '1a':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200';
    case '1b':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200';
    case '2':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200';
    case '3':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 border-slate-200';
    case 'non_gap':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 border-slate-200';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case 'open':
      return 'Open';
    case 'triaged':
      return 'Triaged';
    case 'fix_drafted':
      return 'Fix drafted';
    case 'leak_testing':
      return 'Leak-testing';
    case 'awaiting_approval':
      return 'Awaiting approval';
    case 'fix_live':
      return 'Fix live';
    case 'resolved':
      return 'Resolved';
    case 'dismissed':
      return 'Dismissed';
    case 'data_gap':
      return 'Data gap';
    case 'privacy_wall':
      return 'Privacy wall';
    default:
      return s;
  }
}

function statusColor(s: string): string {
  switch (s) {
    case 'fix_live':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 border-indigo-200';
    case 'resolved':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200';
    case 'dismissed':
    case 'data_gap':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 border-slate-200';
    case 'privacy_wall':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

// frequency as a percentage with its sample size, e.g. "100% (n=2)".
function fmtFreq(freq: number | null | undefined, n: number | null | undefined): string {
  if (freq === null || freq === undefined) {
    return n && n > 0 ? `— (n=${n})` : 'no data yet';
  }
  const pct = Math.round(freq * 100);
  return `${pct}%${n !== null && n !== undefined ? ` (n=${n})` : ''}`;
}

// Phase 3 (spec §10, D5): the sibling "answer quality" signal — user-flagged
// WRONG answers (ai_query_feedback), complementary to the model-flagged NO-answer
// capability gaps. Read-only fold via the existing super-admin fn_ai_feedback_list.
interface FeedbackRow {
  id: string;
  job_id: string | null;
  flagger_email: string | null;
  note: string | null;
  created_at?: string | null;
  question?: string | null;
  answer?: string | null;
}

function AnswerQualityFlags() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadFb = useCallback(async () => {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc('fn_ai_feedback_list', {
        p_limit: 25,
      });
      if (error) throw new Error(error.message);
      setRows((Array.isArray(data) ? data : []) as FeedbackRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    loadFb();
  }, [loadFb]);

  const count = rows?.length ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldQuestion className="h-4 w-4 text-amber-600" />
            Answer-quality flags
            <Badge variant="secondary" className="ml-1">
              {count} user-reported
            </Badge>
          </CardTitle>
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <p className="text-xs text-muted-foreground">
          The complementary signal: answers that came back but were flagged{' '}
          <em>wrong</em> by a user (vs. the capability gaps below, where{' '}
          <em>no</em> answer came back). Distinct fixes; same answer-quality surface.
        </p>
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          {err && <p className="text-sm text-destructive">{err}</p>}
          {!err && count === 0 && (
            <p className="text-sm text-muted-foreground">
              No wrong-answer flags recorded.
            </p>
          )}
          {!err && count > 0 && (
            <div className="space-y-2">
              {rows!.map((f) => (
                <div
                  key={f.id}
                  className="rounded-md border p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {f.flagger_email ?? 'user'}
                    </span>
                    {f.created_at && (
                      <span className="text-muted-foreground">
                        {fmtDate(f.created_at)}
                      </span>
                    )}
                  </div>
                  {f.question && (
                    <div className="text-muted-foreground">
                      Q: {f.question.slice(0, 160)}
                    </div>
                  )}
                  {f.note && <div>“{f.note}”</div>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function CapabilityGapsTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<CapGapStats | null>(null);
  const [clusters, setClusters] = useState<CapGapRow[]>([]);
  const [showLatent, setShowLatent] = useState(false); // G12: default = actionable only
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // per-row interaction state
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowNote, setRowNote] = useState<Record<string, string>>({}); // dismiss / data-gap / privacy-wall reason
  const [classDraft, setClassDraft] = useState<Record<string, GapClass>>({});
  const [fixLiveOpen, setFixLiveOpen] = useState<Set<string>>(new Set());
  const [fixTool, setFixTool] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [measureMsg, setMeasureMsg] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClientSupabaseClient();
      const { data, error: rpcError } = await (supabase as any).rpc(
        'fn_capgap_list',
        { p_status: null, p_limit: 100 }
      );
      if (rpcError) throw new Error(rpcError.message);
      if (!data || data.success === false) {
        throw new Error(data?.error || 'Failed to load capability gaps');
      }
      setStats((data.data?.stats ?? null) as CapGapStats | null);
      setClusters((data.data?.clusters ?? []) as CapGapRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Call a Phase-2 SECDEF RPC; returns its `data` payload or throws.
  const callRpc = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      const supabase = createClientSupabaseClient();
      const { data, error: rpcError } = await (supabase as any).rpc(fn, args);
      if (rpcError) throw new Error(rpcError.message);
      if (!data || data.success === false) {
        throw new Error(data?.error || `${fn} failed`);
      }
      return data.data;
    },
    []
  );

  const runAction = useCallback(
    async (
      id: string,
      fn: string,
      args: Record<string, unknown>,
      onResult?: (payload: unknown) => void
    ) => {
      setBusyId(id);
      setRowError((prev) => ({ ...prev, [id]: '' }));
      try {
        const payload = await callRpc(fn, args);
        onResult?.(payload);
        await load();
      } catch (e) {
        setRowError((prev) => ({
          ...prev,
          [id]: e instanceof Error ? e.message : String(e),
        }));
      } finally {
        setBusyId(null);
      }
    },
    [callRpc, load]
  );

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFixLive = (c: CapGapRow) => {
    setFixLiveOpen((prev) => {
      const next = new Set(prev);
      if (next.has(c.id)) next.delete(c.id);
      else {
        next.add(c.id);
        // prefill the linked-tool input with the candidate tool
        setFixTool((f) => ({
          ...f,
          [c.id]: f[c.id] ?? c.candidate_tool ?? '',
        }));
      }
      return next;
    });
  };

  const copySnippet = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((v) => (v === id ? null : v)), 2000);
    } catch {
      /* clipboard blocked — the snippet is still visible to copy manually */
    }
  };

  const actionable = useMemo(() => clusters.filter((c) => c.actionable), [clusters]);
  const latent = useMemo(() => clusters.filter((c) => !c.actionable), [clusters]);
  const visible = showLatent ? clusters : actionable;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Could not load capability gaps</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={load}>
                Retry
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Phase-2 banner */}
      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                Phase 2 — triage, fix &amp; measure
              </p>
              <p className="text-blue-800/80 dark:text-blue-200/80">
                Confirm the gap class, mark a fix live once an existing tool is
                exposed, then measure whether the assistant&rsquo;s refusal rate
                for learners actually dropped. The leak-test and the Windows
                READ_TOOLS edit happen out-of-band — this tab tracks state and
                generates the handoff text; it never grants data access itself.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Header stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Gaps</CardTitle>
            <ShieldQuestion className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.open ?? 0}</div>
            <p className="text-xs text-muted-foreground">Unresolved capability clusters</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Refusals This Week</CardTitle>
            <Repeat className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.refusals_week ?? 0}</div>
            <p className="text-xs text-muted-foreground">&ldquo;I can&rsquo;t access that&rdquo; moments, last 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Class Mix</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {(['1a', '1b', '2', '3'] as const).map((k) => (
                <Badge key={k} variant="outline" className={`text-[10px] ${gapClassColor(k)}`}>
                  {k}: {stats?.class_mix?.[k] ?? 0}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Auto-proposed gap classes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <Inbox className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.resolved ?? 0}</div>
            <p className="text-xs text-muted-foreground">Gaps closed by a measured drop</p>
          </CardContent>
        </Card>
      </div>

      {/* Phase 3: sibling wrong-answer signal (ai_query_feedback) */}
      <AnswerQualityFlags />

      {/* Actionable toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing{' '}
          <span className="font-medium text-foreground">{visible.length}</span>{' '}
          {showLatent ? 'gaps (all)' : 'actionable gaps'}
          {!showLatent && latent.length > 0 && (
            <span> · {latent.length} latent one-off{latent.length === 1 ? '' : 's'} hidden</span>
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLatent((v) => !v)}
        >
          {showLatent ? 'Show actionable only' : `Show latent one-offs (${latent.length})`}
        </Button>
      </div>

      {/* Cluster list */}
      {visible.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center py-8 gap-2">
              <Inbox className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">
                {clusters.length === 0
                  ? 'No capability gaps detected yet'
                  : 'No actionable gaps'}
              </p>
              <p className="text-sm text-muted-foreground max-w-md">
                {clusters.length === 0
                  ? 'The daily scan populates this. It looks for moments the assistant told a learner it could not access something, then clusters them here.'
                  : 'Only recurring gaps (asked more than once, or by more than one person) are actionable. Toggle above to see latent one-offs.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((c) => {
            const isOpen = expanded.has(c.id);
            const samples = Array.isArray(c.sample_questions)
              ? c.sample_questions
              : [];
            const busy = busyId === c.id;
            const terminal = TERMINAL_STATUSES.has(c.status);
            const showMeasure =
              c.status === 'fix_live' || c.fix_applied_at !== null;
            const snippet = `Add \`${c.candidate_tool ?? fixTool[c.id] ?? '<tool>'}\` to READ_TOOLS in ai-chat-drain.mjs (then confirm the previously-refused question now answers).`;

            return (
              <Card key={c.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold">{c.title}</h3>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${gapClassColor(c.gap_class)}`}
                        >
                          {gapClassLabel(c.gap_class)}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {c.gap_class_source === 'human' ? 'human-set' : 'auto'}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${statusColor(c.status)}`}
                        >
                          {statusLabel(c.status)}
                        </Badge>
                        {!c.actionable && (
                          <Badge variant="outline" className="text-[10px]">
                            latent
                          </Badge>
                        )}
                      </div>
                      <code className="text-xs text-muted-foreground font-mono">
                        {c.cluster_key}
                      </code>
                    </div>
                    <div className="flex items-center gap-4 text-sm shrink-0">
                      <div className="flex items-center gap-1.5" title="Total refusals mapped to this cluster">
                        <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{c.occurrence_count}</span>
                        <span className="text-xs text-muted-foreground">
                          refusal{c.occurrence_count === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5" title="Distinct people who hit this gap">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{c.distinct_users}</span>
                        <span className="text-xs text-muted-foreground">
                          user{c.distinct_users === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* meta row */}
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                    <span>First seen {fmtDate(c.first_seen)}</span>
                    <span>Last seen {fmtDate(c.last_seen)}</span>
                    <span className="text-muted-foreground/70">
                      (sample size n={c.occurrence_count})
                    </span>
                  </div>

                  {/* suggested fix */}
                  {c.suggested_fix && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
                      <Wrench className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="text-sm min-w-0">
                        <span className="font-medium">Suggested fix: </span>
                        <span className="text-muted-foreground">{c.suggested_fix}</span>
                        {c.candidate_tool && (
                          <span className="ml-1">
                            &rarr;{' '}
                            <code className="text-xs font-mono bg-background px-1.5 py-0.5 rounded border">
                              {c.candidate_tool}
                            </code>
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* sample questions (expandable, verbatim) */}
                  {samples.length > 0 && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => toggleExpand(c.id)}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        {samples.length} sample question{samples.length === 1 ? '' : 's'}
                      </button>
                      {isOpen && (
                        <div className="mt-2 space-y-2 pl-5">
                          {samples.map((q, i) => (
                            <div
                              key={i}
                              className="text-sm italic text-muted-foreground border-l-2 border-muted pl-3"
                            >
                              &ldquo;{q}&rdquo;
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ---- Measurement / before→after panel (§9, G13) ---- */}
                  {c.fix_applied_at && (
                    <div className="mt-4 rounded-lg border bg-muted/30 p-3 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Gauge className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Measurement</span>
                        <span className="text-xs text-muted-foreground">
                          fix live {fmtDate(c.fix_applied_at)}
                          {c.linked_tool_id && (
                            <>
                              {' · '}
                              <code className="font-mono">{c.linked_tool_id}</code>
                            </>
                          )}
                        </span>
                        {c.freq_dropped === true && c.status === 'resolved' && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200"
                          >
                            Resolved — fix confirmed by measured drop
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 flex-wrap text-sm">
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground">
                            Baseline refusal rate
                          </div>
                          <div className="font-semibold">
                            {fmtFreq(c.baseline_freq, c.baseline_n)}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="text-[10px] uppercase text-muted-foreground">
                            Post-fix refusal rate
                          </div>
                          <div className="font-semibold">
                            {fmtFreq(c.post_fix_freq, c.post_fix_n)}
                          </div>
                        </div>
                        {c.freq_dropped === true ? (
                          <span className="flex items-center gap-1 text-green-700 dark:text-green-400 text-sm font-medium">
                            <CheckCircle2 className="h-4 w-4" /> dropped
                          </span>
                        ) : c.freq_dropped === false ? (
                          <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 text-sm font-medium">
                            <XCircle className="h-4 w-4" /> no drop
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            not measured yet
                          </span>
                        )}
                      </div>

                      {c.post_fix_n !== null && c.post_fix_n !== undefined && c.post_fix_n < 2 && (
                        <p className="text-xs text-muted-foreground">
                          Small sample — treat as directional until more learner
                          traffic accrues.
                        </p>
                      )}

                      {/* before → after proof */}
                      {(samples.length > 0 || c.retest_answer) && (
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="rounded-md border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 p-2">
                            <div className="text-[10px] uppercase text-amber-700 dark:text-amber-400 mb-1">
                              Before — refused
                            </div>
                            <div className="text-xs italic text-muted-foreground">
                              {samples.length > 0
                                ? `“${samples[0]}”`
                                : 'a previously-refused question in this cluster'}
                            </div>
                          </div>
                          <div className="rounded-md border border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20 p-2">
                            <div className="text-[10px] uppercase text-green-700 dark:text-green-400 mb-1">
                              After — now answers
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {c.retest_answer
                                ? c.retest_answer
                                : 'no non-refused answer captured yet — run Measure after fresh traffic.'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ---- Disposition controls (active statuses only) ---- */}
                  {!terminal && (
                    <div className="mt-4 pt-3 border-t space-y-3">
                      {/* Triage: confirm / change class */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-muted-foreground">
                          Triage:
                        </span>
                        {c.gap_class && c.gap_class_source !== 'human' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              runAction(c.id, 'fn_capgap_triage', {
                                p_id: c.id,
                                p_gap_class: c.gap_class,
                                p_candidate_tool: c.candidate_tool,
                                p_reason: 'confirmed auto class',
                              })
                            }
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Confirm {c.gap_class}
                          </Button>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Select
                            value={classDraft[c.id] ?? undefined}
                            onValueChange={(v) =>
                              setClassDraft((prev) => ({ ...prev, [c.id]: v as GapClass }))
                            }
                          >
                            <SelectTrigger className="h-8 w-[150px] text-xs">
                              <SelectValue placeholder="Change class…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1a">1a · exists + exposed</SelectItem>
                              <SelectItem value="1b">1b · exists, not exposed</SelectItem>
                              <SelectItem value="2">2 · no tool, data exists</SelectItem>
                              <SelectItem value="3">3 · data gap</SelectItem>
                              <SelectItem value="non_gap">non-gap</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || !classDraft[c.id]}
                            onClick={() =>
                              runAction(c.id, 'fn_capgap_triage', {
                                p_id: c.id,
                                p_gap_class: classDraft[c.id],
                                p_candidate_tool: c.candidate_tool,
                                p_reason: 'human re-classified',
                              })
                            }
                          >
                            Apply
                          </Button>
                        </div>
                      </div>

                      {/* Phase 3: draft tool (class 2) · in-app leak-test · auto-retest */}
                      {!TERMINAL_STATUSES.has(c.status) && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-muted-foreground">
                              Phase 3:
                            </span>
                            {c.gap_class === '2' && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  runAction(c.id, 'fn_capgap_draft_tool', { p_id: c.id })
                                }
                              >
                                <Wrench className="h-3.5 w-3.5 mr-1" />
                                Draft tool
                              </Button>
                            )}
                            {c.candidate_tool && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  runAction(c.id, 'fn_capgap_leaktest', { p_id: c.id })
                                }
                              >
                                {busy ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                ) : (
                                  <ShieldQuestion className="h-3.5 w-3.5 mr-1" />
                                )}
                                Run leak-test
                              </Button>
                            )}
                            {['fix_live', 'awaiting_approval', 'resolved'].includes(
                              c.status
                            ) && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  runAction(c.id, 'fn_capgap_retest', { p_id: c.id })
                                }
                              >
                                <Repeat className="h-3.5 w-3.5 mr-1" />
                                Re-ask samples
                              </Button>
                            )}
                          </div>

                          {/* Leak-test verdict panel (§8) */}
                          {c.leaktest_result && (
                            <div
                              className={`rounded-lg border p-3 text-xs space-y-1 ${
                                c.leaktest_result.pass
                                  ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/20'
                                  : 'border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 font-medium">
                                {c.leaktest_result.pass ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-600" />
                                )}
                                Leak-test{' '}
                                {c.leaktest_result.pass ? 'PASSED (3/3)' : 'FAILED'} —{' '}
                                <code className="font-mono">{c.leaktest_result.tool}</code>
                              </div>
                              <div className="text-muted-foreground">
                                isolation {c.leaktest_result.isolation_ok ? '✓' : '✗'} ·
                                spoof-blocked{' '}
                                {c.leaktest_result.spoof_blocked ? '✓' : '✗'} · two
                                colleges impersonated + id-spoof
                              </div>
                              {c.leaktest_result.note && (
                                <div className="text-muted-foreground">
                                  {c.leaktest_result.note}
                                </div>
                              )}
                              {c.leaktest_result.pass && (
                                <div className="text-emerald-700 dark:text-emerald-400">
                                  Advanced to awaiting approval — the Director approves,
                                  then Windows exposes it to the drain.
                                </div>
                              )}
                            </div>
                          )}

                          {/* Candidate tool draft SQL (class 2) */}
                          {c.draft_sql && (
                            <div className="rounded-md border bg-background p-2">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-[10px] uppercase text-muted-foreground">
                                  Candidate tool draft — review, complete the query, then
                                  leak-test before exposing
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs"
                                  onClick={() =>
                                    copySnippet(`${c.id}-draft`, c.draft_sql ?? '')
                                  }
                                >
                                  {copied === `${c.id}-draft` ? (
                                    <>
                                      <Check className="h-3 w-3 mr-1" /> Copied
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3 w-3 mr-1" /> Copy
                                    </>
                                  )}
                                </Button>
                              </div>
                              <code className="block max-h-48 overflow-auto text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                                {c.draft_sql}
                              </code>
                            </div>
                          )}

                          {/* Auto-retest note (§9/G13) */}
                          {c.retest_enqueued_at && (
                            <div className="text-xs text-muted-foreground">
                              Re-asked {c.retest_job_ids?.length ?? 0} sample question(s)
                              as the original askers at {fmtDate(c.retest_enqueued_at)} —
                              the owner-scoped answers feed the before→after proof.
                            </div>
                          )}
                        </div>
                      )}

                      {/* 1b: mark fix live (+ Windows exposure snippet) */}
                      {c.gap_class === '1b' && c.status !== 'fix_live' && (
                        <div className="space-y-2">
                          <Button
                            size="sm"
                            variant="default"
                            disabled={busy}
                            onClick={() => toggleFixLive(c)}
                          >
                            <FlaskConical className="h-3.5 w-3.5 mr-1" />
                            {fixLiveOpen.has(c.id) ? 'Cancel' : 'Mark fix live'}
                          </Button>

                          {fixLiveOpen.has(c.id) && (
                            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                              <div className="text-xs text-muted-foreground">
                                Record that this existing tool has been exposed to
                                the assistant. Do this only after the out-of-band
                                cross-college leak-test passes and the Director
                                approves — this tab does not run the leak-test.
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <label className="text-xs font-medium">Linked tool</label>
                                <Input
                                  value={fixTool[c.id] ?? ''}
                                  onChange={(e) =>
                                    setFixTool((prev) => ({ ...prev, [c.id]: e.target.value }))
                                  }
                                  placeholder="ai_rpc_fee_defaulters"
                                  className="h-8 w-[240px] text-xs font-mono"
                                />
                              </div>

                              {/* copy-able Windows exposure snippet */}
                              <div className="rounded-md border bg-background p-2">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="text-[10px] uppercase text-muted-foreground">
                                    Windows exposure handoff
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => copySnippet(c.id, snippet)}
                                  >
                                    {copied === c.id ? (
                                      <>
                                        <Check className="h-3 w-3 mr-1" /> Copied
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-3 w-3 mr-1" /> Copy
                                      </>
                                    )}
                                  </Button>
                                </div>
                                <code className="block text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                                  {snippet}
                                </code>
                              </div>

                              <Button
                                size="sm"
                                variant="default"
                                disabled={busy || !(fixTool[c.id]?.trim())}
                                onClick={() =>
                                  runAction(
                                    c.id,
                                    'fn_capgap_set_status',
                                    {
                                      p_id: c.id,
                                      p_status: 'fix_live',
                                      p_linked_tool_id: fixTool[c.id]?.trim(),
                                      p_reason: 'tool exposed to assistant (leak-test out-of-band)',
                                    },
                                    () =>
                                      setFixLiveOpen((prev) => {
                                        const next = new Set(prev);
                                        next.delete(c.id);
                                        return next;
                                      })
                                  )
                                }
                              >
                                {busy ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                ) : (
                                  <FlaskConical className="h-3.5 w-3.5 mr-1" />
                                )}
                                Confirm fix live &amp; capture baseline
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Measure (once fix live) */}
                      {showMeasure && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              runAction(
                                c.id,
                                'fn_capgap_measure',
                                { p_id: c.id },
                                (payload) => {
                                  const p = payload as {
                                    freq_dropped?: boolean;
                                    new_status?: string;
                                    post_fix_freq?: number | null;
                                    post_fix_n?: number | null;
                                  };
                                  const dropped = p?.freq_dropped
                                    ? 'refusal rate dropped'
                                    : 'no drop';
                                  setMeasureMsg((prev) => ({
                                    ...prev,
                                    [c.id]: `Measured: ${dropped} → status ${p?.new_status ?? '—'} (post-fix ${fmtFreq(
                                      p?.post_fix_freq ?? null,
                                      p?.post_fix_n ?? null
                                    )})`,
                                  }));
                                }
                              )
                            }
                          >
                            {busy ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <Gauge className="h-3.5 w-3.5 mr-1" />
                            )}
                            Measure drop
                          </Button>
                          {measureMsg[c.id] && (
                            <span className="text-xs text-muted-foreground">
                              {measureMsg[c.id]}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Disposition: data gap / privacy wall / dismiss */}
                      <div className="space-y-2">
                        <Textarea
                          value={rowNote[c.id] ?? ''}
                          onChange={(e) =>
                            setRowNote((prev) => ({ ...prev, [c.id]: e.target.value }))
                          }
                          placeholder="Optional note (kept as the disposition reason)…"
                          className="text-xs min-h-[52px]"
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          {c.gap_class === '3' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                runAction(c.id, 'fn_capgap_set_status', {
                                  p_id: c.id,
                                  p_status: 'data_gap',
                                  p_reason: rowNote[c.id]?.trim() || null,
                                })
                              }
                            >
                              <Inbox className="h-3.5 w-3.5 mr-1" />
                              Mark data gap
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              runAction(c.id, 'fn_capgap_set_status', {
                                p_id: c.id,
                                p_status: 'privacy_wall',
                                p_reason: rowNote[c.id]?.trim() || null,
                              })
                            }
                          >
                            <ShieldOff className="h-3.5 w-3.5 mr-1" />
                            Mark privacy wall
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              runAction(c.id, 'fn_capgap_set_status', {
                                p_id: c.id,
                                p_status: 'dismissed',
                                p_reason: rowNote[c.id]?.trim() || null,
                              })
                            }
                          >
                            <Ban className="h-3.5 w-3.5 mr-1" />
                            Dismiss
                          </Button>
                        </div>
                      </div>

                      {rowError[c.id] && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" /> {rowError[c.id]}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Terminal disposition note */}
                  {terminal && c.disposed_reason && (
                    <div className="mt-3 text-xs text-muted-foreground">
                      Disposition note: {c.disposed_reason}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
