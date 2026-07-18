'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Layers,
  Loader2,
  RefreshCw,
  Check,
  X,
  Crown,
  Wand2,
  Wrench,
  GitBranch,
  CircleAlert,
  ScanSearch,
  GitPullRequest,
  ExternalLink
} from 'lucide-react';

interface ClusterMember {
  id: string;
  display_id: string;
  description: string;
  status: string;
  module_name: string | null;
  created_at: string;
  reporter_name: string | null;
}

interface FixabilitySubgroup {
  root_cause: string;
  bug_ids: string[];
  files: string[];
}

interface FixabilityVerdict {
  shared_root_cause: boolean;
  root_cause: string;
  files: string[];
  single_fix_feasible: boolean;
  confidence: 'low' | 'medium' | 'high';
  subgroups: FixabilitySubgroup[];
  summary: string;
  model?: string;
}

interface FixState {
  status: 'requested' | 'running' | 'pr_opened' | 'error' | 'no_change';
  pr_url?: string;
  pr_number?: number;
  note?: string;
  needs_migration?: boolean;
  human_note?: string;
  ran_at?: string;
}

interface Fixability {
  status: 'requested' | 'running' | 'done' | 'error';
  requested_at?: string;
  ran_at?: string;
  verdict?: FixabilityVerdict | null;
  error?: string | null;
  fix?: FixState | null;
}

interface VerifyPerBug {
  display_id: string | null;
  verdict?: 'likely_fixed' | 'still_broken' | 'inconclusive';
  confidence?: string;
  reproducible?: string;
  failed?: boolean;
  error?: string;
}

interface VerifyState {
  status: 'running' | 'done' | 'error';
  requested_at: string;
  completed_at?: string;
  total: number;
  per_bug: Record<string, VerifyPerBug>;
  tally: {
    likely_fixed: number;
    still_broken: number;
    inconclusive: number;
    failed: number;
    pending: number;
  };
  error?: string;
}

interface BugCluster {
  id: string;
  seed_bug_id: string;
  member_count: number;
  sample_description: string;
  module_names: string[];
  status: 'proposed' | 'confirmed' | 'dismissed';
  first_seen_at: string;
  last_scan_at: string;
  members: ClusterMember[] | null;
  fixability?: Fixability | null;
  verify?: VerifyState | null;
}

const fetchClusters = async (status: string): Promise<BugCluster[]> => {
  const response = await fetch(`/api/bug-reports/clusters?status=${status}`);
  if (!response.ok) throw new Error('Failed to load groups');
  const json = await response.json();
  return json.clusters ?? [];
};

/**
 * Groups tab: nightly-scan duplicate-group proposals. AI proposes, the admin
 * confirms — confirming parks every member under the canonical (oldest) bug,
 * after which resolving the canonical cascades + emails every reporter.
 */
export function BugGroupsTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'proposed' | 'confirmed' | 'dismissed'>('proposed');
  const [actingOn, setActingOn] = useState<string | null>(null);

  const clustersKey = [...queryKeys.bugReports.all, 'clusters', statusFilter];
  const { data: clusters, isLoading, refetch, isFetching } = useQuery<BugCluster[]>({
    queryKey: clustersKey,
    queryFn: () => fetchClusters(statusFilter),
    staleTime: 60 * 1000,
    // While any cluster is queued/running a fixability analysis, poll so the
    // verdict appears when the Mac runner finishes (usually a few minutes).
    refetchInterval: (query) => {
      const rows = query.state.data as BugCluster[] | undefined;
      const working = rows?.some((c) => {
        const fxs = c.fixability?.status;
        const fixs = c.fixability?.fix?.status;
        return (
          fxs === 'requested' || fxs === 'running' || fixs === 'requested' || fixs === 'running'
        );
      });
      return working ? 8000 : false;
    }
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/bug-reports/clusters/scan', { method: 'POST' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Scan failed');
      return json;
    },
    onSuccess: (data) => {
      toast.success(
        `Scan complete: ${data.proposed_now ?? 0} group(s) proposed from ${data.pool_size ?? 0} open bugs.`
      );
      queryClient.invalidateQueries({ queryKey: [...queryKeys.bugReports.all, 'clusters'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Scan failed')
  });

  const actionMutation = useMutation({
    mutationFn: async ({ clusterId, action }: { clusterId: string; action: 'confirm' | 'dismiss' }) => {
      const response = await fetch(`/api/bug-reports/clusters/${clusterId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Action failed');
      return json;
    },
    onSuccess: (data) => {
      if (data.action === 'confirmed') {
        toast.success(
          `${data.parkedCount} report(s) parked under ${data.canonical}. Resolving it now resolves them all and emails every reporter.`
        );
      } else {
        toast.success('Group dismissed — it will not be proposed again.');
      }
      queryClient.invalidateQueries({ queryKey: [...queryKeys.bugReports.all, 'clusters'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.stats() });
    },
    onError: (err: any) => toast.error(err?.message || 'Action failed'),
    onSettled: () => setActingOn(null)
  });

  const fixabilityMutation = useMutation({
    mutationFn: async (clusterId: string) => {
      const response = await fetch(`/api/bug-reports/clusters/${clusterId}/fixability`, {
        method: 'POST'
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Could not queue analysis');
      return json;
    },
    onSuccess: (data) => {
      toast.success(
        data.note === 'already_queued'
          ? 'Analysis already running for this group.'
          : 'Fixability analysis queued (AI Max, ₹0) — the verdict appears here in a few minutes.'
      );
      queryClient.invalidateQueries({ queryKey: [...queryKeys.bugReports.all, 'clusters'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Could not queue analysis')
  });

  const verifyMutation = useMutation({
    mutationFn: async (clusterId: string) => {
      const response = await fetch(`/api/bug-reports/clusters/${clusterId}/verify`, {
        method: 'POST'
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Could not start the re-check');
      return { clusterId, ...json };
    },
    onSuccess: (data) => {
      toast.success(
        `Re-checking ${data.enqueued ?? 0} report(s) as their reporters (AI Max, ₹0) — the tally fills in below.`
      );
      if (data.verify) {
        queryClient.setQueryData(
          [...queryKeys.bugReports.all, 'cluster-verify', data.clusterId],
          data.verify
        );
      }
      queryClient.invalidateQueries({ queryKey: [...queryKeys.bugReports.all, 'clusters'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Could not start the re-check')
  });

  const fixMutation = useMutation({
    mutationFn: async (clusterId: string) => {
      const response = await fetch(`/api/bug-reports/clusters/${clusterId}/fix`, {
        method: 'POST'
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Could not queue the fix');
      return json;
    },
    onSuccess: (data) => {
      toast.success(
        data.note === 'already_queued'
          ? 'A fix is already being prepared for this group.'
          : 'Fix queued (AI Max, ₹0) — a draft PR will appear here for you to review and merge.'
      );
      queryClient.invalidateQueries({ queryKey: [...queryKeys.bugReports.all, 'clusters'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Could not queue the fix')
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <Layers className='w-5 h-5' />
            Duplicate Groups
            {clusters && (
              <Badge variant='secondary' className='ml-1'>
                {clusters.length}
              </Badge>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <div className='flex rounded-md border overflow-hidden'>
              {(['proposed', 'confirmed', 'dismissed'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 text-xs capitalize transition-colors ${
                    statusFilter === s
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <Button
              size='sm'
              variant='outline'
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
            >
              {scanMutation.isPending ? (
                <Loader2 className='w-4 h-4 mr-1 animate-spin' />
              ) : (
                <RefreshCw className='w-4 h-4 mr-1' />
              )}
              Scan now
            </Button>
          </div>
        </CardTitle>
        <p className='text-sm text-muted-foreground'>
          The nightly scan groups similar open reports. Confirming a group parks
          every report under the original (oldest) one — resolving the original
          then resolves the whole group and emails every reporter.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading || isFetching ? (
          <div className='flex items-center justify-center h-32'>
            <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
          </div>
        ) : !clusters || clusters.length === 0 ? (
          <div className='text-center py-10 text-sm text-muted-foreground'>
            No {statusFilter} groups.
            {statusFilter === 'proposed' && ' Run "Scan now" to refresh proposals.'}
          </div>
        ) : (
          <div className='space-y-4'>
            {clusters.map((cluster) => (
              <div key={cluster.id} className='rounded-lg border p-4'>
                <div className='flex flex-wrap items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Badge className='bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900 dark:text-purple-200'>
                        {cluster.member_count} reports
                      </Badge>
                      {cluster.module_names.map((m) => (
                        <Badge key={m} variant='outline' className='text-xs'>
                          {m}
                        </Badge>
                      ))}
                      <span className='text-[11px] text-muted-foreground'>
                        last scan {new Date(cluster.last_scan_at).toLocaleString()}
                      </span>
                    </div>
                    <p className='text-sm mt-2 line-clamp-2'>{cluster.sample_description}</p>
                  </div>
                  {cluster.status === 'proposed' && (
                    <div className='flex items-center gap-2 shrink-0'>
                      <Button
                        size='sm'
                        onClick={() => {
                          setActingOn(cluster.id);
                          actionMutation.mutate({ clusterId: cluster.id, action: 'confirm' });
                        }}
                        disabled={actionMutation.isPending && actingOn === cluster.id}
                      >
                        {actionMutation.isPending && actingOn === cluster.id ? (
                          <Loader2 className='w-4 h-4 mr-1 animate-spin' />
                        ) : (
                          <Check className='w-4 h-4 mr-1' />
                        )}
                        Confirm group
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => {
                          setActingOn(cluster.id);
                          actionMutation.mutate({ clusterId: cluster.id, action: 'dismiss' });
                        }}
                        disabled={actionMutation.isPending && actingOn === cluster.id}
                      >
                        <X className='w-4 h-4 mr-1' />
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>

                <FixabilityPanel
                  cluster={cluster}
                  onAnalyze={() => fixabilityMutation.mutate(cluster.id)}
                  isQueuing={
                    fixabilityMutation.isPending &&
                    fixabilityMutation.variables === cluster.id
                  }
                  onFix={() => fixMutation.mutate(cluster.id)}
                  isFixing={
                    fixMutation.isPending && fixMutation.variables === cluster.id
                  }
                />

                <VerifyPanel
                  cluster={cluster}
                  onVerify={() => verifyMutation.mutate(cluster.id)}
                  isQueuing={
                    verifyMutation.isPending && verifyMutation.variables === cluster.id
                  }
                />

                <Separator className='my-3' />

                <div className='grid gap-1.5'>
                  {(cluster.members ?? []).map((member, idx) => (
                    <Link
                      key={member.id}
                      href={`/admin/bug-reports/${member.id}`}
                      className='flex items-center gap-2 text-xs rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors'
                    >
                      {idx === 0 ? (
                        <Crown className='w-3.5 h-3.5 text-amber-500 shrink-0' aria-label='canonical (oldest)' />
                      ) : (
                        <span className='w-3.5' />
                      )}
                      <span className='font-mono font-semibold shrink-0'>{member.display_id}</span>
                      <span className='text-muted-foreground truncate'>{member.description}</span>
                      <span className='ml-auto text-muted-foreground shrink-0'>
                        {member.reporter_name ?? 'Unknown'}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const CONFIDENCE_CLS: Record<FixabilityVerdict['confidence'], string> = {
  high: 'text-green-700 dark:text-green-300',
  medium: 'text-amber-700 dark:text-amber-300',
  low: 'text-muted-foreground'
};

function FileList({ files }: { files: string[] }) {
  if (!files || files.length === 0) return null;
  return (
    <div className='flex flex-wrap gap-1 mt-1'>
      {files.map((f) => (
        <code
          key={f}
          className='text-[11px] bg-muted rounded px-1.5 py-0.5 font-mono break-all'
        >
          {f}
        </code>
      ))}
    </div>
  );
}

/**
 * Per-cluster fixability strip. Lets an admin queue a READ-ONLY, codebase-
 * grounded analysis (a Mac runner reads the actual code behind the member
 * reports on the Claude Max subscription, ₹0) and renders the verdict:
 * one-fix-fixes-all vs N distinct-root-cause subgroups.
 *
 * RECOMMENDATION ONLY — the verdict never resolves the group or emails
 * reporters. It only tells a human whether one fix would clear the whole group.
 */
function FixabilityPanel({
  cluster,
  onAnalyze,
  isQueuing,
  onFix,
  isFixing
}: {
  cluster: BugCluster;
  onAnalyze: () => void;
  isQueuing: boolean;
  onFix: () => void;
  isFixing: boolean;
}) {
  const fx = cluster.fixability;
  const analyzing = fx?.status === 'requested' || fx?.status === 'running';

  // Never analyzed — offer the button.
  if (!fx) {
    return (
      <div className='mt-3 flex flex-wrap items-center gap-2'>
        <Button size='sm' variant='outline' onClick={onAnalyze} disabled={isQueuing}>
          {isQueuing ? (
            <Loader2 className='w-4 h-4 mr-1.5 animate-spin' />
          ) : (
            <Wand2 className='w-4 h-4 mr-1.5' />
          )}
          Analyze fixability (AI Max, ₹0)
        </Button>
        <span className='text-[11px] text-muted-foreground'>
          Reads the actual code behind these reports and says whether one fix
          clears the whole group.
        </span>
      </div>
    );
  }

  if (analyzing) {
    return (
      <div className='mt-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2'>
        <Loader2 className='w-4 h-4 animate-spin text-amber-600 shrink-0' />
        <span className='text-xs text-amber-800 dark:text-amber-200'>
          Analyzing — reading the code behind these reports (AI Max · ₹0). The
          verdict appears here in a few minutes.
        </span>
      </div>
    );
  }

  if (fx.status === 'error' || !fx.verdict) {
    return (
      <div className='mt-3 flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2'>
        <CircleAlert className='w-4 h-4 text-red-600 shrink-0' />
        <span className='text-xs text-red-800 dark:text-red-200'>
          Analysis couldn&apos;t complete{fx.error ? `: ${fx.error}` : '.'}
        </span>
        <Button size='sm' variant='ghost' onClick={onAnalyze} disabled={isQueuing} className='ml-auto'>
          <RefreshCw className='w-3.5 h-3.5 mr-1' />
          Try again
        </Button>
      </div>
    );
  }

  const v = fx.verdict;
  const single = v.single_fix_feasible;

  return (
    <div
      className={`mt-3 rounded-md border px-3 py-2.5 ${
        single
          ? 'border-green-300 bg-green-50 dark:bg-green-950/40'
          : 'border-amber-300 bg-amber-50 dark:bg-amber-950/40'
      }`}
    >
      <div className='flex flex-wrap items-center gap-2'>
        {single ? (
          <Badge
            variant='outline'
            className='bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200'
          >
            <Wrench className='w-3.5 h-3.5 mr-1' />
            One fix can resolve all {cluster.member_count}
          </Badge>
        ) : (
          <Badge
            variant='outline'
            className='bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200'
          >
            <GitBranch className='w-3.5 h-3.5 mr-1' />
            {v.subgroups.length} distinct root cause
            {v.subgroups.length === 1 ? '' : 's'} — separate fixes
          </Badge>
        )}
        <span className={`text-[11px] ${CONFIDENCE_CLS[v.confidence]}`}>
          confidence: {v.confidence}
        </span>
        {fx.ran_at && (
          <span className='text-[11px] text-muted-foreground ml-auto'>
            {new Date(fx.ran_at).toLocaleString()}
          </span>
        )}
      </div>

      {v.summary && <p className='text-sm mt-2 leading-relaxed'>{v.summary}</p>}

      {single ? (
        <div className='mt-2'>
          {v.root_cause && (
            <p className='text-xs text-muted-foreground'>
              <span className='font-medium text-foreground'>Root cause: </span>
              {v.root_cause}
            </p>
          )}
          <FileList files={v.files} />
        </div>
      ) : (
        <div className='mt-2 space-y-2'>
          {v.subgroups.map((sg, i) => (
            <div key={i} className='rounded border bg-background/60 px-2 py-1.5'>
              <div className='flex flex-wrap items-center gap-1.5'>
                <span className='text-[11px] font-semibold text-muted-foreground'>
                  Cause {i + 1}
                </span>
                {sg.bug_ids.map((bid) => (
                  <Badge key={bid} variant='outline' className='text-[10px] font-mono px-1'>
                    {bid}
                  </Badge>
                ))}
              </div>
              {sg.root_cause && <p className='text-xs mt-1'>{sg.root_cause}</p>}
              <FileList files={sg.files} />
            </div>
          ))}
        </div>
      )}

      {single && (
        <FixSection
          fix={fx.fix ?? null}
          onFix={onFix}
          isFixing={isFixing}
          count={cluster.member_count}
        />
      )}

      <div className='flex items-center gap-2 mt-2.5 pt-2 border-t border-border/60'>
        <p className='text-[11px] text-muted-foreground'>
          AI recommendation only — the analysis and the fix never resolve this
          group or email reporters. A human merges the fix and clicks Resolve.
        </p>
        <Button
          size='sm'
          variant='ghost'
          onClick={onAnalyze}
          disabled={isQueuing}
          className='ml-auto text-muted-foreground'
        >
          {isQueuing ? (
            <Loader2 className='w-3.5 h-3.5 mr-1 animate-spin' />
          ) : (
            <RefreshCw className='w-3.5 h-3.5 mr-1' />
          )}
          Re-analyze
        </Button>
      </div>
    </div>
  );
}

<<<<<<< HEAD
const VERIFY_CHIP_CLS: Record<string, string> = {
  likely_fixed:
    'bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200',
  still_broken: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200',
  inconclusive:
    'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200',
  failed: 'bg-muted text-muted-foreground border-border'
};

const VERIFY_CHIP_LABEL: Record<string, string> = {
  likely_fixed: 'likely fixed',
  still_broken: 'still broken',
  inconclusive: 'inconclusive',
  failed: 'check failed'
};

/**
 * Verify-group strip — increment #1 of the self-improving loop. After a fix
 * for this group deploys, fan the live per-bug re-check across every member:
 * each report's symptom is re-checked AS ITS REPORTER (read-only) and judged.
 *
 * MOAT HONESTY: this is the AI re-checking its own fix — a weak signal, so the
 * card always says "AI re-check — not reporter-confirmed". The real ground
 * truth is increment #2 (the reporter 👍/👎). RECOMMENDATION ONLY — it never
 * resolves the group and never emails anyone.
 */
function VerifyPanel({
  cluster,
  onVerify,
  isQueuing
}: {
  cluster: BugCluster;
  onVerify: () => void;
  isQueuing: boolean;
}) {
  const queryClient = useQueryClient();
  const listState = cluster.verify ?? null;

  // While a run is active, poll the aggregator: each GET advances the tally
  // server-side (collects finished member verdicts) and returns fresh state.
  const { data: polled } = useQuery<VerifyState | null>({
    queryKey: [...queryKeys.bugReports.all, 'cluster-verify', cluster.id],
    queryFn: async () => {
      const response = await fetch(`/api/bug-reports/clusters/${cluster.id}/verify`);
      if (!response.ok) throw new Error('Failed to read the re-check');
      const json = await response.json();
      return json.verify ?? null;
    },
    enabled: listState?.status === 'running',
    refetchInterval: (query) =>
      (query.state.data as VerifyState | null)?.status === 'running' ? 8000 : false
  });

  // When the poll sees the run finish, refresh the list so the completed tally
  // also lives in the clusters fetch (and survives revisits without polling).
  useEffect(() => {
    if (listState?.status === 'running' && polled && polled.status !== 'running') {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.bugReports.all, 'clusters']
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polled?.status]);

  if (cluster.status === 'dismissed') return null;

  const v = polled ?? listState;

  if (!v) {
    return (
      <div className='mt-2 flex flex-wrap items-center gap-2'>
        <Button size='sm' variant='outline' onClick={onVerify} disabled={isQueuing}>
          {isQueuing ? (
            <Loader2 className='w-4 h-4 mr-1.5 animate-spin' />
          ) : (
            <ScanSearch className='w-4 h-4 mr-1.5' />
          )}
          Verify group (AI re-check, ₹0)
        </Button>
        <span className='text-[11px] text-muted-foreground'>
          After a fix goes live: re-checks every report as its reporter
          (read-only) and tallies how many look fixed.
        </span>
=======
/**
 * "Fix this group" — shown only when the verdict says one fix resolves the whole
 * group. Queues a Mac-side write runner that applies the minimal fix and opens a
 * DRAFT PR. Never merges, never resolves, never emails — a human reviews the PR,
 * merges + deploys, then verifies + resolves.
 */
function FixSection({
  fix,
  onFix,
  isFixing,
  count
}: {
  fix: FixState | null;
  onFix: () => void;
  isFixing: boolean;
  count: number;
}) {
  const status = fix?.status;

  if (status === 'requested' || status === 'running') {
    return (
      <div className='mt-2 flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/40 px-3 py-2'>
        <Loader2 className='w-4 h-4 animate-spin text-blue-600 shrink-0' />
        <span className='text-xs text-blue-800 dark:text-blue-200'>
          Preparing a fix — writing the change in a scratch copy and running
          checks (AI Max · ₹0). A draft PR will appear here to review.
        </span>
      </div>
    );
  }

  if (status === 'pr_opened' && fix?.pr_url) {
    return (
      <div className='mt-2 rounded-md border border-green-300 bg-green-50 dark:bg-green-950/40 px-3 py-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <GitPullRequest className='w-4 h-4 text-green-600 shrink-0' />
          <span className='text-sm font-medium text-green-900 dark:text-green-100'>
            Draft fix ready for review
          </span>
          <a
            href={fix.pr_url}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-300 hover:underline'
          >
            PR #{fix.pr_number} <ExternalLink className='w-3 h-3' />
          </a>
        </div>
        <p className='text-[11px] text-muted-foreground mt-1'>
          Review + merge the PR, then deploy. After it&apos;s live, re-verify the
          reports before resolving the group — resolving emails all {count}{' '}
          reporters.
        </p>
      </div>
    );
  }

  if (status === 'no_change') {
    return (
      <div className='mt-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2'>
        <div className='flex items-center gap-2'>
          <CircleAlert className='w-4 h-4 text-amber-600 shrink-0' />
          <span className='text-xs font-medium text-amber-900 dark:text-amber-100'>
            {fix?.needs_migration
              ? 'Needs a database change — a human must make this'
              : 'AI made no code change'}
          </span>
        </div>
        {(fix?.human_note || fix?.note) && (
          <p className='text-[11px] text-muted-foreground mt-1'>
            {fix.human_note || fix.note}
          </p>
        )}
        <Button size='sm' variant='ghost' onClick={onFix} disabled={isFixing} className='mt-1 h-7 text-xs'>
          <RefreshCw className='w-3.5 h-3.5 mr-1' /> Try the fix again
        </Button>
>>>>>>> jicate/main
      </div>
    );
  }

<<<<<<< HEAD
  if (v.status === 'running') {
    const done = v.total - v.tally.pending;
    return (
      <div className='mt-2 flex items-center gap-2 rounded-md border border-sky-300 bg-sky-50 dark:bg-sky-950/40 px-3 py-2'>
        <Loader2 className='w-4 h-4 animate-spin text-sky-600 shrink-0' />
        <span className='text-xs text-sky-800 dark:text-sky-200'>
          Re-checking each report as its reporter (AI Max · ₹0) — {done} of {v.total} done.
          The tally fills in as members finish.
        </span>
      </div>
    );
  }

  if (v.status === 'error') {
=======
  if (status === 'error') {
>>>>>>> jicate/main
    return (
      <div className='mt-2 flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2'>
        <CircleAlert className='w-4 h-4 text-red-600 shrink-0' />
        <span className='text-xs text-red-800 dark:text-red-200'>
<<<<<<< HEAD
          Group re-check couldn&apos;t start{v.error ? `: ${v.error}` : '.'}
        </span>
        <Button size='sm' variant='ghost' onClick={onVerify} disabled={isQueuing} className='ml-auto'>
          <RefreshCw className='w-3.5 h-3.5 mr-1' />
          Try again
=======
          Fix attempt failed{fix?.note ? `: ${fix.note}` : '.'}
        </span>
        <Button size='sm' variant='ghost' onClick={onFix} disabled={isFixing} className='ml-auto h-7 text-xs'>
          <RefreshCw className='w-3.5 h-3.5 mr-1' /> Try again
>>>>>>> jicate/main
        </Button>
      </div>
    );
  }

<<<<<<< HEAD
  // done
  const entries = Object.entries(v.per_bug ?? {});
  return (
    <div className='mt-2 rounded-md border border-sky-300 bg-sky-50 dark:bg-sky-950/40 px-3 py-2.5'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='outline' className={VERIFY_CHIP_CLS.likely_fixed}>
          {v.tally.likely_fixed} likely fixed
        </Badge>
        <Badge variant='outline' className={VERIFY_CHIP_CLS.still_broken}>
          {v.tally.still_broken} still broken
        </Badge>
        <Badge variant='outline' className={VERIFY_CHIP_CLS.inconclusive}>
          {v.tally.inconclusive} inconclusive
        </Badge>
        {v.tally.failed > 0 && (
          <Badge variant='outline' className={VERIFY_CHIP_CLS.failed}>
            {v.tally.failed} check failed
          </Badge>
        )}
        {v.completed_at && (
          <span className='text-[11px] text-muted-foreground ml-auto'>
            {new Date(v.completed_at).toLocaleString()}
          </span>
        )}
      </div>

      <p className='text-[11px] font-medium text-sky-800 dark:text-sky-200 mt-1.5'>
        AI re-check — not reporter-confirmed. Reporter answers (👍/👎) are the
        ground truth and arrive separately.
      </p>

      {entries.length > 0 && (
        <div className='mt-2 flex flex-wrap gap-1.5'>
          {entries.map(([bugId, e]) => {
            const kind = e.failed ? 'failed' : (e.verdict ?? 'inconclusive');
            return (
              <Link
                key={bugId}
                href={`/admin/bug-reports/${bugId}`}
                title={e.error ?? (e.reproducible === 'write' ? 'write symptom — cannot be read-verified' : undefined)}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono hover:opacity-80 transition-opacity ${VERIFY_CHIP_CLS[kind]}`}
              >
                {e.display_id ?? bugId.slice(0, 8)}
                <span className='font-sans'>· {VERIFY_CHIP_LABEL[kind]}</span>
              </Link>
            );
          })}
        </div>
      )}

      <div className='flex items-center gap-2 mt-2.5 pt-2 border-t border-border/60'>
        <p className='text-[11px] text-muted-foreground'>
          AI recommendation only — it never resolves this group or emails
          reporters. A human decides.
        </p>
        <Button
          size='sm'
          variant='ghost'
          onClick={onVerify}
          disabled={isQueuing}
          className='ml-auto text-muted-foreground'
        >
          {isQueuing ? (
            <Loader2 className='w-3.5 h-3.5 mr-1 animate-spin' />
          ) : (
            <RefreshCw className='w-3.5 h-3.5 mr-1' />
          )}
          Re-run
        </Button>
      </div>
=======
  // No fix attempted yet — offer the button.
  return (
    <div className='mt-2 flex flex-wrap items-center gap-2'>
      <Button
        size='sm'
        onClick={onFix}
        disabled={isFixing}
        className='bg-green-600 hover:bg-green-700 text-white'
      >
        {isFixing ? (
          <Loader2 className='w-4 h-4 mr-1.5 animate-spin' />
        ) : (
          <Wrench className='w-4 h-4 mr-1.5' />
        )}
        Fix this group (AI Max, ₹0)
      </Button>
      <span className='text-[11px] text-muted-foreground'>
        AI writes the one fix as a draft PR for you to review and merge. It never
        merges or emails on its own.
      </span>
>>>>>>> jicate/main
    </div>
  );
}
