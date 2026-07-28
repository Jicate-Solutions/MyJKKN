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
  GitPullRequest,
  ExternalLink,
  CircleAlert,
  Info,
  ScanSearch,
  MessageCircleQuestion,
  Send,
  UserRound
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

/** Deployed-surface check (Mac runner bug-cluster-deployed-check.mjs): confirms
 *  the fix's new user-facing wording actually renders on prod, on the exact
 *  pages the reporters filed from. This is the ONE part of "did it work?" that
 *  is confidently knowable for a copy/UX fix — the AI re-check is data-blind to
 *  it and can only return "inconclusive". Claim A (the change is live) — decided
 *  here; Claim C (reporters find it clear) stays reporter-confirmation ground
 *  truth. */
interface DeployedSurface {
  checked_at: string;
  // null when the check does not apply (see `applicable`).
  all_live: boolean | null;
  // false when the fix changed no user-facing wording, so there is nothing to
  // look for on the deployed page. Absent on records written before this
  // distinction existed — treat as applicable.
  applicable?: boolean;
  prs?: number[];
  surfaces: { route: string; live: boolean; anchors_found: number; anchors_total: number }[];
  claim?: string;
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
  deployed_surface?: DeployedSurface;
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
  const { data: clusters, isLoading, refetch } = useQuery<BugCluster[]>({
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
          : 'Fix queued (AI Max, ₹0) — the fix PR appears here for you to review and merge; it opens ready-for-review once its local checks pass.'
      );
      queryClient.invalidateQueries({ queryKey: [...queryKeys.bugReports.all, 'clusters'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Could not queue the fix')
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
          {/* flex-wrap: the segmented status filter (~215px) plus "Scan now"
              cannot both fit beside the title below ~400px, and Button carries
              whitespace-nowrap with no shrink — so without wrapping the button
              simply hangs off the card. */}
          <div className='flex flex-wrap items-center gap-2'>
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
        <AutoResolveStrip />
      </CardHeader>
      <CardContent>
        {/* Initial load ONLY (isLoading = no cached data yet). Never gate on
            isFetching here: while a diagnosis is queued the query polls every
            8s, and swapping the whole list for this spinner on every tick
            collapsed the page height — scroll jumped to top and the tab
            jittered for minutes after clicking Diagnose. Background refetches
            keep the list mounted; React Query serves cached rows meanwhile. */}
        {isLoading ? (
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
                    // No `shrink-0` here: the pair is ~235px of nowrap buttons,
                    // wider than the card's content box below ~380px, and
                    // shrink-0 pinned it at max-content so flex-wrap could
                    // never trigger — the buttons hung 46px past the card
                    // border at 320px. Shrinkable + wrapping stacks them only
                    // when they genuinely don't fit; ≥414px is unchanged.
                    <div className='flex flex-wrap items-center gap-2'>
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

                <LoopStepper
                  cluster={cluster}
                  onAnalyze={() => fixabilityMutation.mutate(cluster.id)}
                  analyzeQueuing={
                    fixabilityMutation.isPending &&
                    fixabilityMutation.variables === cluster.id
                  }
                  onFix={() => fixMutation.mutate(cluster.id)}
                  fixQueuing={
                    fixMutation.isPending && fixMutation.variables === cluster.id
                  }
                  onVerify={() => verifyMutation.mutate(cluster.id)}
                  verifyQueuing={
                    verifyMutation.isPending && verifyMutation.variables === cluster.id
                  }
                />

                <Separator className='my-3' />

                {/* `grid-cols-1` is load-bearing, not decoration. A bare
                    `grid` leaves the implicit column an `auto` track, and an
                    `auto` track sizes to its items' MAX-content: the member
                    row's `truncate` description sets white-space:nowrap, so
                    its max-content is the whole 200-char string (~940px).
                    The track grew to ~1209px inside an ~800px card and, with
                    no overflow-x containment anywhere above, pushed the entire
                    page ~330px past a 1280px viewport (~970px at 320px).
                    grid-cols-1 compiles to repeat(1, minmax(0,1fr)) — the
                    minmax(0,…) floor is what clamps the track to the card.
                    `min-w-0` on the row is the same guard one level down
                    (flex items default to min-width:auto). */}
                <div className='grid grid-cols-1 gap-1.5'>
                  {(cluster.members ?? []).map((member, idx) => (
                    <Link
                      key={member.id}
                      href={`/admin/bug-reports/${member.id}`}
                      className='flex min-w-0 items-center gap-2 text-xs rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors'
                    >
                      {idx === 0 ? (
                        <Crown className='w-3.5 h-3.5 text-amber-500 shrink-0' aria-label='canonical (oldest)' />
                      ) : (
                        <span className='w-3.5' />
                      )}
                      <span className='font-mono font-semibold shrink-0'>{member.display_id}</span>
                      <span className='text-muted-foreground truncate'>{member.description}</span>
                      {/* Shrinkable + ellipsized rather than `shrink-0`: a
                          26-char reporter name that refuses to shrink is
                          itself an overflow source. Below `sm` it is dropped
                          entirely (same responsive-label convention as
                          BugStatusBadge on the Reports List tab) — at 390px
                          the shrink budget clipped it to "M..", which costs
                          the description room and tells the reader nothing.
                          `max-w-[40%]` keeps a long name from crowding out
                          the description on wider screens. */}
                      <span className='ml-auto hidden max-w-[40%] truncate text-muted-foreground sm:block'>
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

/**
 * Auto-resolve gate strip (R1-R4, built dormant): shows whether the
 * earn-it rule is met — how many CLEAN human-approved resolutions exist
 * toward the required track record — and the circuit-breaker state.
 * Display only; flipping the policy on is a human decision (a migration).
 */
function AutoResolveStrip() {
  const { data } = useQuery<any>({
    queryKey: [...queryKeys.bugReports.all, 'auto-resolve-status'],
    queryFn: async () => {
      const response = await fetch('/api/bug-reports/auto-resolve/status');
      if (!response.ok) return null;
      const json = await response.json();
      return json.status ?? null;
    },
    staleTime: 5 * 60 * 1000
  });
  if (!data) return null;
  const suspended = data.suspended && Object.keys(data.suspended).length > 0;
  const earned = Number(data.clean ?? 0);
  const required = Number(data.required ?? 10);
  return (
    <p className='text-[11px] text-muted-foreground mt-1'>
      {suspended ? (
        <span className='text-red-700 dark:text-red-300 font-medium'>
          Auto-resolve SUSPENDED — a reporter said still-broken after an
          automatic resolve; a person must review and re-enable.
        </span>
      ) : data.enabled ? (
        <span className='text-green-700 dark:text-green-300'>
          Auto-resolve ON — settled groups with zero still-broken and at least
          one confirmed fix resolve nightly; you are notified each time.
        </span>
      ) : (
        <>
          Auto-resolve off — earned {Math.min(earned, required)}/{required}{' '}
          clean human-approved resolutions. It can be switched on once the
          track record is complete.
        </>
      )}
    </p>
  );
}

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
 * "Fix this group" — shown only when the verdict says one fix resolves the whole
 * group. Queues a Mac-side write runner that applies the minimal fix and opens a
 * PR — READY when its local Step-2.7 gates pass (so CI attests fully green on
 * first push; Director policy 2026-07-20), draft only if a gate regressed.
 * Never merges, never resolves, never emails — a human reviews the PR,
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
          checks (AI Max · ₹0). The PR appears here to review — ready-for-review
          when its checks pass.
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
            Fix PR ready for review
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
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className='mt-2 flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2'>
        <CircleAlert className='w-4 h-4 text-red-600 shrink-0' />
        <span className='text-xs text-red-800 dark:text-red-200'>
          Fix attempt failed{fix?.note ? `: ${fix.note}` : '.'}
        </span>
        <Button size='sm' variant='ghost' onClick={onFix} disabled={isFixing} className='ml-auto h-7 text-xs'>
          <RefreshCw className='w-3.5 h-3.5 mr-1' /> Try again
        </Button>
      </div>
    );
  }

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
        AI writes the one fix as a PR for you to review and merge — it opens
        ready-for-review when its local checks pass (draft only if a check
        regressed). It never merges or emails on its own.
      </span>
    </div>
  );
}

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

interface FeedbackState {
  total: number;
  pending_send: number;
  sent: number;
  delivered: number;
  answered: number;
  expired: number;
  yes: number;
  no: number;
}

type StepState = 'done' | 'active' | 'running' | 'locked' | 'attention' | 'human';

/**
 * One row of the loop stepper: circle + connector on the left, content on the
 * right. The circle's look encodes the state; the connector goes DASHED where
 * the pipeline crosses a human gate — the machine's line literally breaks
 * where only a person may act.
 */
function StepShell({
  n,
  state,
  title,
  last,
  dashed,
  lockedReason,
  children
}: {
  n: number;
  state: StepState;
  title: string;
  last?: boolean;
  dashed?: boolean;
  lockedReason?: string;
  children?: React.ReactNode;
}) {
  const circle = (() => {
    switch (state) {
      case 'done':
        return (
          <span className='flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-white shrink-0'>
            <Check className='h-3.5 w-3.5' />
          </span>
        );
      case 'running':
        return (
          <span className='flex h-6 w-6 items-center justify-center rounded-full border-2 border-sky-500 text-sky-600 shrink-0'>
            <Loader2 className='h-3.5 w-3.5 animate-spin' />
          </span>
        );
      case 'active':
        return (
          <span className='flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary text-primary text-[11px] font-bold shrink-0'>
            {n}
          </span>
        );
      case 'attention':
        return (
          <span className='flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shrink-0'>
            <CircleAlert className='h-3.5 w-3.5' />
          </span>
        );
      case 'human':
        return (
          <span className='flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-amber-950 shrink-0 ring-2 ring-amber-200 dark:ring-amber-700'>
            <UserRound className='h-3.5 w-3.5' />
          </span>
        );
      default:
        return (
          <span className='flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground text-[11px] font-semibold shrink-0'>
            {n}
          </span>
        );
    }
  })();

  const muted = state === 'locked';
  return (
    <div className='flex gap-2.5'>
      <div className='flex flex-col items-center'>
        {circle}
        {!last && (
          <span
            className={`w-px flex-1 min-h-3 ${
              dashed
                ? 'border-l border-dashed border-amber-400/80'
                : 'bg-border'
            }`}
          />
        )}
      </div>
      <div className={`min-w-0 flex-1 ${last ? '' : 'pb-2.5'}`}>
        <p
          className={`text-xs font-semibold leading-6 ${
            muted ? 'text-muted-foreground' : ''
          }`}
        >
          {title}
        </p>
        {state === 'locked' && lockedReason && (
          <p className='text-[11px] text-muted-foreground'>{lockedReason}</p>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * The whole fix loop for one group as a single numbered pipeline:
 * ① diagnose → ② write the fix → ③ YOU merge & deploy → ④ did it work?
 * → ⑤ ask the reporters → ⑥ YOU resolve. Amber person-steps are the human
 * gates; exactly one step is actionable at a time, and every AI output is a
 * recommendation — nothing here resolves a group or emails anyone by itself.
 */
function LoopStepper({
  cluster,
  onAnalyze,
  analyzeQueuing,
  onFix,
  fixQueuing,
  onVerify,
  verifyQueuing
}: {
  cluster: BugCluster;
  onAnalyze: () => void;
  analyzeQueuing: boolean;
  onFix: () => void;
  fixQueuing: boolean;
  onVerify: () => void;
  verifyQueuing: boolean;
}) {
  const queryClient = useQueryClient();
  const fx = cluster.fixability;
  const verdict = fx?.verdict ?? null;
  const analyzing = fx?.status === 'requested' || fx?.status === 'running';
  const singleFix = verdict?.single_fix_feasible === true;
  const fix = fx?.fix ?? null;
  // Human path (walk-2 lesson): single_fix_feasible=false only means the fix
  // was not machine-writable. When the verdict still traces ONE shared cause
  // (at most 1 subgroup) and a human-written fix PR is recorded, reporters
  // are eligible per E3 — mirror of fn_bug_feedback_prepare's gate.
  const oneCauseVerdict = !!verdict && (verdict.subgroups?.length ?? 0) <= 1;
  const oneCauseHumanFix =
    !singleFix && oneCauseVerdict && fix?.status === 'pr_opened';
  const feedbackEligible = singleFix || oneCauseHumanFix;

  // ── verify: poll the aggregator while a run is active (each GET advances
  // the tally server-side and returns fresh state).
  const listVerify = cluster.verify ?? null;
  const { data: polledVerify } = useQuery<VerifyState | null>({
    queryKey: [...queryKeys.bugReports.all, 'cluster-verify', cluster.id],
    queryFn: async () => {
      const response = await fetch(`/api/bug-reports/clusters/${cluster.id}/verify`);
      if (!response.ok) throw new Error('Failed to read the re-check');
      const json = await response.json();
      return json.verify ?? null;
    },
    enabled: listVerify?.status === 'running',
    refetchInterval: (query) =>
      (query.state.data as VerifyState | null)?.status === 'running' ? 8000 : false
  });
  useEffect(() => {
    if (listVerify?.status === 'running' && polledVerify && polledVerify.status !== 'running') {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.bugReports.all, 'clusters'] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polledVerify?.status]);
  const v = polledVerify ?? listVerify;

  // ── reporter feedback state + actions
  const feedbackKey = [...queryKeys.bugReports.all, 'cluster-feedback', cluster.id];
  const { data: fb } = useQuery<FeedbackState | null>({
    queryKey: feedbackKey,
    queryFn: async () => {
      const response = await fetch(`/api/bug-reports/clusters/${cluster.id}/feedback`);
      if (!response.ok) return null;
      const json = await response.json();
      return json.feedback ?? null;
    },
    enabled: feedbackEligible,
    staleTime: 30 * 1000,
    refetchInterval: (query) => {
      const s = query.state.data as FeedbackState | null;
      return s && (s.sent > 0 || s.delivered > 0) ? 30000 : false;
    }
  });
  const feedbackMutation = useMutation({
    mutationFn: async (action: 'prepare' | 'send') => {
      const response = await fetch(`/api/bug-reports/clusters/${cluster.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || `${action} failed`);
      return { action, ...json };
    },
    onSuccess: (data) => {
      if (data.action === 'prepare') {
        toast.success(
          `${data.prepared ?? 0} reporter question(s) prepared (not sent — you approve the send).` +
            (data.excluded_off_cause
              ? ` ${data.excluded_off_cause} different-cause report(s) excluded.`
              : '')
        );
      } else {
        toast.success(
          `Sent to ${data.sent ?? 0} reporter(s).` +
            (data.queued_by_cap
              ? ` ${data.queued_by_cap} waiting (3-question cap per learner).`
              : '')
        );
      }
      queryClient.invalidateQueries({ queryKey: feedbackKey });
    },
    onError: (err: any) => toast.error(err?.message || 'Action failed')
  });
  const fbBusy = feedbackMutation.isPending;

  // ★ HUMAN ACTION ★ — split a multi-cause group into per-cause groups
  // (S1-S4 Director-locked): children born confirmed, unsorted members kept
  // in a needs-another-look group, the split is final. The button appears
  // only when the diagnosis found 2+ distinct causes.
  const splitMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/bug-reports/clusters/${cluster.id}/split`, {
        method: 'POST'
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'split failed');
      return json;
    },
    onSuccess: (data) => {
      const kids = Array.isArray(data.children) ? data.children.length : 0;
      toast.success(
        `Split into ${kids} smaller group(s)` +
          (data.leftover_id ? ' + 1 needs-another-look group' : '') +
          (data.unparked ? `; ${data.unparked} report(s) returned to the open list` : '') +
          '. Each new group starts its own pipeline.'
      );
      queryClient.invalidateQueries({ queryKey: [...queryKeys.bugReports.all, 'clusters'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Split failed')
  });
  const multiCause = !singleFix && (verdict?.subgroups?.length ?? 0) >= 2;

  if (cluster.status === 'dismissed') return null;

  // ── step states ─────────────────────────────────────────────────────
  const s1: StepState = !fx
    ? 'active'
    : analyzing
      ? 'running'
      : fx.status === 'error' || !verdict
        ? 'attention'
        : 'done';

  const s2: StepState =
    s1 !== 'done'
      ? 'locked'
      : !singleFix
        ? 'locked'
        : !fix
          ? 'active'
          : fix.status === 'requested' || fix.status === 'running'
            ? 'running'
            : fix.status === 'pr_opened'
              ? 'done'
              : 'attention';
  const s2Reason =
    s1 !== 'done'
      ? 'Run the diagnosis first.'
      : !singleFix
        ? oneCauseVerdict
          ? 'One shared cause, but not machine-fixable — a person writes this fix (a fix PR on step 3 unlocks the rest).'
          : 'Diagnosis found separate causes — there is no single fix to write.'
        : undefined;

  const s3: StepState = fix?.status === 'pr_opened' ? 'human' : 'locked';

  const fixLive = fix?.status === 'pr_opened'; // truthfully: PR exists; you know when it went live
  const s4: StepState = v
    ? v.status === 'running'
      ? 'running'
      : v.status === 'error'
        ? 'attention'
        : 'done'
    : fixLive
      ? 'active'
      : 'locked';

  const anySent = !!fb && fb.sent + fb.delivered + fb.answered > 0;
  const s5: StepState = !feedbackEligible
    ? 'locked'
    : !fixLive && !(fb && fb.total > 0)
      ? 'locked'
      : !fb || fb.total === 0
        ? 'active'
        : fb.pending_send > 0
          ? 'human'
          : 'done';
  const s5Reason = !feedbackEligible
    ? 'Needs a one-fix diagnosis.'
    : 'Waiting for the fix to go live.';

  const s6: StepState = anySent ? 'human' : 'locked';

  return (
    <div className='mt-3 rounded-md border bg-muted/20 px-3 pt-2.5 pb-2'>
      <StepShell n={1} state={s1} title="What's causing this?">
        {s1 === 'active' && (
          <div className='mt-1 flex flex-wrap items-center gap-2'>
            <Button size='sm' variant='outline' onClick={onAnalyze} disabled={analyzeQueuing}>
              {analyzeQueuing ? (
                <Loader2 className='w-4 h-4 mr-1.5 animate-spin' />
              ) : (
                <Wand2 className='w-4 h-4 mr-1.5' />
              )}
              Diagnose (AI reads the code)
            </Button>
            <span className='text-[11px] text-muted-foreground'>
              Says whether these {cluster.member_count} reports share one cause.
            </span>
          </div>
        )}
        {s1 === 'running' && (
          <p className='text-[11px] text-sky-700 dark:text-sky-300 mt-0.5'>
            Reading the code behind these reports — the answer appears here in a
            few minutes.
          </p>
        )}
        {s1 === 'attention' && (
          <div className='mt-1 flex flex-wrap items-center gap-2'>
            <span className='text-[11px] text-red-700 dark:text-red-300'>
              Diagnosis couldn&apos;t complete{fx?.error ? `: ${fx.error}` : '.'}
            </span>
            <Button size='sm' variant='ghost' onClick={onAnalyze} disabled={analyzeQueuing} className='h-6 text-xs'>
              <RefreshCw className='w-3 h-3 mr-1' /> Try again
            </Button>
          </div>
        )}
        {s1 === 'done' && verdict && (
          <div className='mt-1'>
            <div className='flex flex-wrap items-center gap-2'>
              {singleFix ? (
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
                  {verdict.subgroups.length} distinct root cause
                  {verdict.subgroups.length === 1 ? '' : 's'} — separate fixes
                </Badge>
              )}
              <span className={`text-[11px] ${CONFIDENCE_CLS[verdict.confidence]}`}>
                confidence: {verdict.confidence}
              </span>
              <Button
                size='sm'
                variant='ghost'
                onClick={onAnalyze}
                disabled={analyzeQueuing}
                className='ml-auto h-6 text-[11px] text-muted-foreground'
              >
                <RefreshCw className='w-3 h-3 mr-1' /> Re-diagnose
              </Button>
            </div>
            {verdict.summary && (
              <p className='text-xs mt-1.5 leading-relaxed'>{verdict.summary}</p>
            )}
            {singleFix ? (
              <>
                {verdict.root_cause && (
                  <p className='text-[11px] text-muted-foreground mt-1'>
                    <span className='font-medium text-foreground'>Root cause: </span>
                    {verdict.root_cause}
                  </p>
                )}
                <FileList files={verdict.files} />
              </>
            ) : (
              <div className='mt-1.5 space-y-1.5'>
                {verdict.subgroups.map((sg, i) => (
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
          </div>
        )}
      </StepShell>

      <StepShell n={2} state={s2} title='Write the fix' dashed lockedReason={s2Reason}>
        {s2 === 'done' && fix?.pr_url ? (
          <div className='mt-0.5 flex flex-wrap items-center gap-2'>
            <GitPullRequest className='w-3.5 h-3.5 text-green-600 shrink-0' />
            <a
              href={fix.pr_url}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-300 hover:underline'
            >
              Fix PR #{fix.pr_number} <ExternalLink className='w-3 h-3' />
            </a>
            {fix.needs_migration && (
              <span className='text-[11px] text-amber-700 dark:text-amber-300'>
                includes a database change written on the human path
              </span>
            )}
          </div>
        ) : s2 !== 'locked' ? (
          <FixSection
            fix={fix}
            onFix={onFix}
            isFixing={fixQueuing}
            count={cluster.member_count}
          />
        ) : multiCause ? (
          <div className='mt-1 flex flex-wrap items-center gap-2'>
            <Button
              size='sm'
              onClick={() => splitMutation.mutate()}
              disabled={splitMutation.isPending}
              className='bg-amber-500 hover:bg-amber-600 text-amber-950'
            >
              {splitMutation.isPending ? (
                <Loader2 className='w-4 h-4 mr-1.5 animate-spin' />
              ) : (
                <GitBranch className='w-4 h-4 mr-1.5' />
              )}
              Split into {verdict!.subgroups.length} groups
            </Button>
            <span className='text-[11px] text-amber-800 dark:text-amber-200'>
              Re-sorts these reports by cause — each smaller group gets its own
              pipeline. This is final.
            </span>
          </div>
        ) : null}
      </StepShell>

      <StepShell n={3} state={s3} title='You: merge & deploy' dashed lockedReason='Waiting for a fix PR.'>
        {s3 === 'human' && (
          <p className='text-[11px] text-amber-800 dark:text-amber-200 mt-0.5'>
            Review and merge PR #{fix?.pr_number}, then deploy. The fix reaches
            learners only after this — no AI can do it.
          </p>
        )}
      </StepShell>

      <StepShell n={4} state={s4} title='Did the fix work?' lockedReason='Waiting for the fix to go live.'>
        {s4 === 'active' && (
          <div className='mt-1 flex flex-wrap items-center gap-2'>
            <Button size='sm' variant='outline' onClick={onVerify} disabled={verifyQueuing}>
              {verifyQueuing ? (
                <Loader2 className='w-4 h-4 mr-1.5 animate-spin' />
              ) : (
                <ScanSearch className='w-4 h-4 mr-1.5' />
              )}
              Re-check as the reporters
            </Button>
            <span className='text-[11px] text-muted-foreground'>
              Read-only look from each reporter&apos;s account — run it once the
              fix is live.
            </span>
          </div>
        )}
        {s4 === 'running' && v && (
          <p className='text-[11px] text-sky-700 dark:text-sky-300 mt-0.5'>
            Re-checking each report as its reporter — {v.total - v.tally.pending} of{' '}
            {v.total} done.
          </p>
        )}
        {s4 === 'attention' && (
          <div className='mt-1 flex flex-wrap items-center gap-2'>
            <span className='text-[11px] text-red-700 dark:text-red-300'>
              Re-check couldn&apos;t start{v?.error ? `: ${v.error}` : '.'}
            </span>
            <Button size='sm' variant='ghost' onClick={onVerify} disabled={verifyQueuing} className='h-6 text-xs'>
              <RefreshCw className='w-3 h-3 mr-1' /> Try again
            </Button>
          </div>
        )}
        {s4 === 'done' && v && (
          <div className='mt-1'>
            {/* Decisive, confidently-knowable signal for a copy/UX fix: is the new
                wording actually live on prod for the reported pages? Rendered
                ABOVE the AI re-check tally because it answers what the re-check
                cannot — the re-check is data-blind to a wording change and so
                reads "inconclusive"; this line says plainly whether the fix
                shipped. Reporter confirmation of clarity is still the ground
                truth (step 5). */}
            {v.deployed_surface && (
              <div
                className={`mb-2 rounded-md border px-3 py-2 text-xs ${
                  v.deployed_surface.applicable === false
                    ? 'border-muted bg-muted/40 text-muted-foreground'
                    : v.deployed_surface.all_live
                      ? 'border-green-300 bg-green-50 text-green-900 dark:bg-green-950/40 dark:text-green-100'
                      : 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
                }`}
              >
                <div className='flex items-center gap-1.5 font-medium'>
                  {v.deployed_surface.applicable === false ? (
                    <Info className='w-3.5 h-3.5 shrink-0' />
                  ) : v.deployed_surface.all_live ? (
                    <Check className='w-3.5 h-3.5 shrink-0' />
                  ) : (
                    <CircleAlert className='w-3.5 h-3.5 shrink-0' />
                  )}
                  {v.deployed_surface.applicable === false
                    ? 'Live-on-prod check does not apply here'
                    : v.deployed_surface.all_live
                      ? 'Fix verified live on prod'
                      : 'Fix not fully live on prod'}
                </div>
                <p className='mt-0.5 text-[11px] opacity-90'>
                  {v.deployed_surface.applicable === false
                    ? 'This fix changed behaviour, not wording, so there is no new text to look for on the page. Whether it worked is answered by the re-check below and by the reporters themselves.'
                    : v.deployed_surface.all_live
                      ? 'The fix’s new wording renders on every reported page. What it changed is confirmed shipped; whether reporters now find it clear is the open question below.'
                      : 'At least one reported page does not show the fix wording yet — the deploy may be incomplete.'}
                </p>
                <div className='mt-1 flex flex-wrap gap-1'>
                  {v.deployed_surface.surfaces.map((s) => (
                    // min-w-0 + break-all: a route carrying query params has no
                    // break opportunity, so an unbreakable chip wider than the
                    // card overflows it (flex-wrap only wraps BETWEEN chips).
                    <span
                      key={s.route}
                      className={`inline-flex min-w-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono break-all ${
                        s.live
                          ? 'border-green-300 text-green-800 dark:text-green-200'
                          : 'border-amber-300 text-amber-800 dark:text-amber-200'
                      }`}
                    >
                      {s.live ? '✓' : '✗'} {s.route}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className='flex flex-wrap items-center gap-1.5'>
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
              <Button
                size='sm'
                variant='ghost'
                onClick={onVerify}
                disabled={verifyQueuing}
                className='ml-auto h-6 text-[11px] text-muted-foreground'
              >
                <RefreshCw className='w-3 h-3 mr-1' /> Re-run
              </Button>
            </div>
            <div className='mt-1.5 flex flex-wrap gap-1.5'>
              {Object.entries(v.per_bug ?? {}).map(([bugId, e]) => {
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
            <p className='text-[11px] text-muted-foreground mt-1'>
              {v.deployed_surface?.all_live
                ? 'For a wording fix the AI re-check is data-blind, so it reads “inconclusive” — that is expected, not a failure. Whether the fix shipped is answered above; the reporters’ own answers confirm it’s clearer.'
                : 'AI re-check — not reporter-confirmed. The reporters’ own answers are the ground truth.'}
            </p>
          </div>
        )}
      </StepShell>

      <StepShell n={5} state={s5} title='Ask the reporters' dashed lockedReason={s5Reason}>
        {s5 === 'active' && (
          <div className='mt-1 flex flex-wrap items-center gap-2'>
            <Button size='sm' variant='outline' onClick={() => feedbackMutation.mutate('prepare')} disabled={fbBusy}>
              {fbBusy ? (
                <Loader2 className='w-4 h-4 mr-1.5 animate-spin' />
              ) : (
                <MessageCircleQuestion className='w-4 h-4 mr-1.5' />
              )}
              Prepare the questions
            </Button>
            <span className='text-[11px] text-muted-foreground'>
              Drafts a private &quot;is this fixed for you?&quot; per reporter.
              Nothing sends yet.
            </span>
          </div>
        )}
        {s5 === 'human' && fb && (
          <div className='mt-1 flex flex-wrap items-center gap-2'>
            <Button
              size='sm'
              onClick={() => feedbackMutation.mutate('send')}
              disabled={fbBusy}
              className='bg-amber-500 hover:bg-amber-600 text-amber-950'
            >
              {fbBusy ? (
                <Loader2 className='w-4 h-4 mr-1.5 animate-spin' />
              ) : (
                <Send className='w-4 h-4 mr-1.5' />
              )}
              Send to {fb.pending_send} reporter{fb.pending_send === 1 ? '' : 's'}
            </Button>
            <span className='text-[11px] text-amber-800 dark:text-amber-200'>
              This messages real learners — your click is the approval.
            </span>
          </div>
        )}
        {(s5 === 'done' || (fb && anySent)) && fb && (
          <div className='mt-1 flex flex-wrap items-center gap-1.5'>
            {fb.sent + fb.delivered > 0 && (
              <span className='text-[11px] text-muted-foreground'>
                {fb.sent + fb.delivered} awaiting answer
              </span>
            )}
            {fb.answered > 0 && (
              <>
                <Badge variant='outline' className={VERIFY_CHIP_CLS.likely_fixed}>
                  👍 {fb.yes}
                </Badge>
                <Badge variant='outline' className={VERIFY_CHIP_CLS.still_broken}>
                  👎 {fb.no}
                </Badge>
              </>
            )}
            {fb.expired > 0 && (
              <span className='text-[11px] text-muted-foreground'>
                {fb.expired} expired (counts as no data)
              </span>
            )}
          </div>
        )}
      </StepShell>

      <StepShell
        n={6}
        state={s6}
        title='You: resolve the group'
        last
        lockedReason='Waiting on reporter answers.'
      >
        {s6 === 'human' && fb && (
          <p
            className={`text-[11px] mt-0.5 ${
              fb.no > 0
                ? 'font-medium text-red-700 dark:text-red-300'
                : 'text-amber-800 dark:text-amber-200'
            }`}
          >
            {fb.no > 0
              ? 'A reporter says this is still broken — review before resolving.'
              : fb.yes > 0
                ? `Reporters confirm it's fixed — resolve when ready. Resolving emails all ${cluster.member_count} reporters.`
                : `Answers are still arriving — resolving now would email all ${cluster.member_count} reporters before they've confirmed.`}
          </p>
        )}
      </StepShell>

      <p className='text-[11px] text-muted-foreground border-t border-border/60 mt-1 pt-1.5'>
        AI proposes and never acts alone — you own merge &amp; deploy, sending to
        reporters, and resolve. AI runs cost ₹0 (Max lane).
      </p>
    </div>
  );
}
