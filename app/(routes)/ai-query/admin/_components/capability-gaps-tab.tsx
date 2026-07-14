'use client';

// =====================================================================
// Capability Gaps tab (Phase 1 — READ-ONLY insight)
// =====================================================================
// Renders clusters of AI-assistant refusals mined from the chat log by
// fn_capgap_scan, ranked by demand (occurrence_count * distinct_users).
// Phase 1 is detection + insight ONLY: no disposition buttons, no
// draft-tool / leak-test / fix-dispatch controls (those are Phase 2/3).
// Fns are not in generated types → the (supabase as any).rpc(...) cast is
// the repo's standard pattern for SECDEF RPCs.

import { useCallback, useEffect, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
} from 'lucide-react';

// ---- shapes (fn_capgap_list returns untyped jsonb) --------------------
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
  gap_class: '1a' | '1b' | '2' | '3' | 'non_gap' | null;
  gap_class_source: 'auto' | 'human' | null;
  suggested_fix: string | null;
  candidate_tool: string | null;
  status: string;
  actionable: boolean;
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

export function CapabilityGapsTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<CapGapStats | null>(null);
  const [clusters, setClusters] = useState<CapGapRow[]>([]);
  const [showLatent, setShowLatent] = useState(false); // G12: default = actionable only
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const actionable = clusters.filter((c) => c.actionable);
  const latent = clusters.filter((c) => !c.actionable);
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
      {/* Phase-1 banner */}
      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                Phase 1 — detection &amp; insight only
              </p>
              <p className="text-blue-800/80 dark:text-blue-200/80">
                This surfaces what the assistant keeps failing to answer for
                learners, clusters it, and proposes the cheapest correct fix.
                Fixes (exposing or drafting tools) are dispatched in a later
                phase — nothing here changes what the assistant can access.
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
            <p className="text-xs text-muted-foreground">Gaps closed by a fix</p>
          </CardContent>
        </Card>
      </div>

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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
