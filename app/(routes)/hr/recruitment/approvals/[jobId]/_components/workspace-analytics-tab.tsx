'use client';

/**
 * Analytics tab — recruitment funnel for one job.
 *
 * Dataviz method: the funnel is discrete ordered magnitude → horizontal bars on
 * a single-hue ordinal ramp (validated blue ramp, light steps 250→700, dark
 * steps 150→600 — the ends nearest each surface clear 2:1). Counts are
 * direct-labeled so color never carries meaning alone; text stays in ink
 * tokens, never the series color. Source split is 2 categories → a stacked
 * bar with a 2px surface gap and direct labels beats a donut.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, BarChart3 } from 'lucide-react';
import { useJobAnalytics } from '@/hooks/hr/use-recruitment';
import {
  CANDIDATE_STATUS_LABELS,
  JOB_APPLICATION_STATUS_LABELS,
  type CandidateStatus,
  type JobAnalytics,
  type JobApplicationStatus,
} from '@/types/hr-recruitment';

// Ordinal blue ramp — light 250→700, dark 150→600 (see references/palette.md).
const FUNNEL_RAMP = [
  'bg-[#86b6ef] dark:bg-[#b7d3f6]',
  'bg-[#5598e7] dark:bg-[#86b6ef]',
  'bg-[#2a78d6] dark:bg-[#5598e7]',
  'bg-[#1c5cab] dark:bg-[#3987e5]',
  'bg-[#104281] dark:bg-[#256abf]',
  'bg-[#0d366b] dark:bg-[#184f95]',
] as const;

// Categorical slots 1 (blue) + 2 (aqua) for the two-source split.
const SOURCE_COLORS = {
  with_account: 'bg-[#2a78d6] dark:bg-[#3987e5]',
  anonymous: 'bg-[#1baf7a] dark:bg-[#199e70]',
} as const;

interface FunnelStage {
  label: string;
  count: number;
}

function buildFunnel(a: JobAnalytics): FunnelStage[] {
  const app = a.by_application_status;
  const cand = a.by_candidate_status;
  const approved =
    (cand.approved ?? 0) + (cand.package_fixed ?? 0) + (cand.offer_issued ?? 0) + (cand.joined ?? 0);
  return [
    { label: 'Applied', count: a.applications_total },
    { label: 'Screened', count: a.applications_total - app.pending },
    { label: 'Shortlisted', count: app.shortlisted + app.promoted },
    { label: 'In Pipeline', count: app.promoted },
    { label: 'Approved', count: approved },
    { label: 'Joined', count: cand.joined ?? 0 },
  ];
}

export function WorkspaceAnalyticsTab({ jobId }: { jobId: string }) {
  const { data, isLoading, error } = useJobAnalytics(jobId);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-7 w-14 rounded bg-muted/60 animate-pulse" />
                <div className="mt-2 h-3 w-24 rounded bg-muted/40 animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-4 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-3 rounded bg-muted/40 animate-pulse" style={{ width: `${100 - i * 12}%` }} />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.applications_total === 0 && Object.keys(data.by_candidate_status).length === 0) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-2 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">No data yet</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Analytics build up as candidates apply and move through screening and approval.
          </p>
        </CardContent>
      </Card>
    );
  }

  const funnel = buildFunnel(data);
  const maxCount = Math.max(1, funnel[0].count);
  const app = data.by_application_status;
  const cand = data.by_candidate_status;
  const inApprovalNow = (cand.submitted ?? 0) + (cand.pending_approval ?? 0);
  const shortlistRate = data.applications_total
    ? Math.round(((app.shortlisted + app.promoted) / data.applications_total) * 100)
    : null;
  const sourceTotal = data.source_split.with_account + data.source_split.anonymous;

  return (
    <div className="space-y-3">
      {/* Headline stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile value={String(data.applications_total)} label="Total applicants" />
        <StatTile
          value={shortlistRate !== null ? `${shortlistRate}%` : '—'}
          label="Shortlist rate"
        />
        <StatTile
          value={String(inApprovalNow)}
          label="In approval now"
          emphasis={inApprovalNow > 0}
        />
        <StatTile value={String(cand.joined ?? 0)} label="Joined" />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        {/* Funnel */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Hiring Funnel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {funnel.map((stage, i) => {
              const prev = i > 0 ? funnel[i - 1].count : null;
              const conversion =
                prev && prev > 0 ? Math.round((stage.count / prev) * 100) : null;
              const width = Math.max(stage.count > 0 ? 2 : 0, (stage.count / maxCount) * 100);
              return (
                <div key={stage.label}>
                  <div className="flex items-baseline justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{stage.label}</span>
                    <span className="tabular-nums font-semibold text-foreground">
                      {stage.count}
                      {conversion !== null && (
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          {conversion}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-3 rounded-[4px] bg-muted/40">
                    <div
                      className={`h-3 rounded-[4px] ${FUNNEL_RAMP[i]} transition-[width] duration-300 motion-reduce:transition-none`}
                      style={{ width: `${width}%` }}
                      role="img"
                      aria-label={`${stage.label}: ${stage.count}`}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground pt-1">
              Percentages are stage-to-stage conversion.
            </p>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-3">
          {/* Source split */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Application Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sourceTotal === 0 ? (
                <p className="text-xs text-muted-foreground">No applications yet.</p>
              ) : (
                <>
                  <div className="flex h-3 w-full gap-[2px] rounded-[4px] overflow-hidden">
                    {data.source_split.with_account > 0 && (
                      <div
                        className={SOURCE_COLORS.with_account}
                        style={{ width: `${(data.source_split.with_account / sourceTotal) * 100}%` }}
                      />
                    )}
                    {data.source_split.anonymous > 0 && (
                      <div
                        className={SOURCE_COLORS.anonymous}
                        style={{ width: `${(data.source_split.anonymous / sourceTotal) * 100}%` }}
                      />
                    )}
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <span className={`h-2 w-2 rounded-full ${SOURCE_COLORS.with_account}`} />
                        Signed-in applicants
                      </span>
                      <span className="tabular-nums font-semibold">{data.source_split.with_account}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <span className={`h-2 w-2 rounded-full ${SOURCE_COLORS.anonymous}`} />
                        Careers page (guest)
                      </span>
                      <span className="tabular-nums font-semibold">{data.source_split.anonymous}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Timing */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Timing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <TimingRow label="Avg. days to screen" value={data.avg_days_to_screen} />
              <TimingRow label="Avg. days in approval" value={data.avg_days_in_approval} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Status distribution table — the accessible, exact-values view */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Screening</p>
              {(Object.keys(app) as JobApplicationStatus[]).map((s) => (
                <div key={s} className="flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">{JOB_APPLICATION_STATUS_LABELS[s]}</span>
                  <span className="tabular-nums font-semibold text-foreground">{app[s]}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Approval Pipeline</p>
              {Object.keys(cand).length === 0 && (
                <p className="text-xs text-muted-foreground italic">No candidates promoted yet.</p>
              )}
              {(Object.keys(cand) as CandidateStatus[]).map((s) => (
                <div key={s} className="flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">{CANDIDATE_STATUS_LABELS[s]}</span>
                  <span className="tabular-nums font-semibold text-foreground">{cand[s]}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  value, label, emphasis,
}: { value: string; label: string; emphasis?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className={`text-2xl font-semibold leading-none tabular-nums ${
          emphasis ? 'text-primary' : 'text-foreground'
        }`}>
          {value}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function TimingRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-semibold text-foreground">
        {value === null ? '—' : `${value} d`}
      </span>
    </div>
  );
}
