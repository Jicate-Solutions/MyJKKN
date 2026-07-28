'use client';

// =============================================================================
// RCLTP Principal (school-head) dashboard — data-driven (Phase 4e/RPC)
// =============================================================================
// Four panels, each reading `fn_rcltp_school_dashboard(p_institution_id)` via
// useRcltpSchoolDashboard:
//   (a) Cohort band distribution   (b) Cycle progress
//   (c) At-risk learners           (d) Class / section comparison
//
// CONTENT-SAFETY: the scoring engine is not MyJKKN-validated yet, so the RPC
// always marks `provisional: true`. Whenever ANY array is non-empty we render
// a persistent "Provisional — pending MyJKKN validation" banner near the top —
// never a band or score without it nearby. Each panel independently falls
// back to the EXISTING honest empty state (AwaitingScoring) when its own
// array is empty — we never invent numbers to fill a chart.
//
// institution_id: RCLTP has no per-page institution selector today, so this
// reads the signed-in user's OWN institution off usePermissions().userProfile
// (same source used by /rcltp/principal/page.tsx for the gate). A user with
// no institution_id on their profile (e.g. a super-admin with a global
// profile) sees an explicit "no institution" message rather than a silent
// empty dashboard.
//
// WidgetContainer (dashboard/classic/_components/widgets/shared) was
// evaluated per the build brief but NOT used here: its "glass-card" motion
// styling belongs to the glassmorphic classic-dashboard widget grid, and
// would clash with the Card/CardHeader shell this page (and every other
// RCLTP admin/teacher console) already uses. Loading/error states are
// instead handled inline with the existing <Skeleton> + <Alert>, matching
// the RCLTP page family's established look.
// =============================================================================

import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Users,
  ShieldAlert,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { useRcltpSchoolDashboard } from '@/hooks/rcltp/use-rcltp-school-dashboard';
import type {
  RcltpBand,
  RcltpBandDistRow,
  RcltpCycleRow,
  RcltpAtRiskRow,
  RcltpSectionRow,
} from '@/types/rcltp';
import { AwaitingScoring } from './awaiting-scoring';

// ---------------------------------------------------------------------------
// Shared band styling (colors mirror the required content-safety mapping)
// ---------------------------------------------------------------------------

const BAND_COLORS: Record<RcltpBand, string> = {
  emergent: '#EF4444', // red
  transitional: '#F59E0B', // amber
  proficient: '#3B82F6', // blue
  super_proficient: '#10B981', // green
};

const BAND_LABELS: Record<RcltpBand, string> = {
  emergent: 'Emergent',
  transitional: 'Transitional',
  proficient: 'Proficient',
  super_proficient: 'Super proficient',
};

const AT_RISK_REASON_LABELS: Record<RcltpAtRiskRow['reason'], string> = {
  low_band: 'Low band',
  regression: 'Regression',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Section shell
// ---------------------------------------------------------------------------

function SectionCard({
  icon: Icon,
  title,
  description,
  badge,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <div className='flex items-start gap-3'>
            <div className='mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
              <Icon className='h-5 w-5' aria-hidden='true' />
            </div>
            <div>
              <CardTitle className='text-base'>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          {badge}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Provisional banner — HARD REQUIREMENT: visible whenever any panel below
// renders real (non-empty) data. Never render a band/score without it.
// ---------------------------------------------------------------------------

function ProvisionalBanner() {
  return (
    <Alert className='border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100'>
      <ShieldAlert
        className='h-4 w-4 text-amber-600 dark:text-amber-400'
        aria-hidden='true'
      />
      <AlertTitle className='font-semibold'>
        Provisional — pending MyJKKN validation.
      </AlertTitle>
      <AlertDescription className='text-sm'>
        Not an authoritative band/score. The figures below come from the
        RCLTP scoring engine ahead of MyJKKN&apos;s validated composite-score
        formula and band cutoffs — treat them as indicative only.
      </AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// (a) Cohort band distribution — donut, per-band color, center total
// ---------------------------------------------------------------------------

function BandDistributionChart({ data }: { data: RcltpBandDistRow[] }) {
  const total = data.reduce((sum, row) => sum + row.count, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const row = payload[0].payload as RcltpBandDistRow;
      return (
        <div className='rounded-lg border border-border bg-background p-3 shadow-lg'>
          <p className='mb-1 text-sm font-medium text-foreground'>
            {BAND_LABELS[row.band]}
          </p>
          <p className='text-sm text-muted-foreground'>
            Learners: <span className='font-semibold text-foreground'>{row.count}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className='relative'>
      <ResponsiveContainer width='100%' height={240}>
        <PieChart>
          <Pie
            data={data}
            cx='50%'
            cy='50%'
            innerRadius={55}
            outerRadius={90}
            dataKey='count'
            nameKey='band'
          >
            {data.map((row) => (
              <Cell key={row.band} fill={BAND_COLORS[row.band]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={(value: string) => BAND_LABELS[value as RcltpBand] ?? value} />
        </PieChart>
      </ResponsiveContainer>
      <div className='pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center'>
        <p className='text-2xl font-bold text-foreground'>{total}</p>
        <p className='text-xs text-muted-foreground'>Learners</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// (b) Cycle progress — line chart, cycle 1–6 on X, avgOverall 0–100 on Y
// ---------------------------------------------------------------------------

function CycleProgressChart({ data }: { data: RcltpCycleRow[] }) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const row = payload[0].payload as RcltpCycleRow;
      return (
        <div className='rounded-lg border border-border bg-background p-3 shadow-lg'>
          <p className='mb-1 text-sm font-medium text-foreground'>Cycle {label}</p>
          <p className='text-sm text-muted-foreground'>
            Avg overall: <span className='font-semibold text-foreground'>{row.avgOverall}</span>
          </p>
          <p className='text-sm text-muted-foreground'>
            Sittings: <span className='font-semibold text-foreground'>{row.count}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width='100%' height={240}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray='3 3' stroke='#E5E7EB' />
        <XAxis
          dataKey='cycle'
          tickFormatter={(cycle: number) => `Cycle ${cycle}`}
          stroke='#6B7280'
          style={{ fontSize: '12px' }}
          tick={{ fill: '#6B7280' }}
        />
        <YAxis
          domain={[0, 100]}
          stroke='#6B7280'
          style={{ fontSize: '12px' }}
          tick={{ fill: '#6B7280' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type='monotone'
          dataKey='avgOverall'
          name='Avg overall'
          stroke='#3B82F6'
          strokeWidth={2}
          dot={{ fill: '#3B82F6', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// (c) At-risk learners — row list, name + roll + severity badge
// ---------------------------------------------------------------------------

function atRiskBadgeProps(reason: RcltpAtRiskRow['reason']) {
  if (reason === 'low_band') {
    return { variant: 'destructive' as const, className: undefined };
  }
  if (reason === 'regression') {
    return {
      variant: 'outline' as const,
      className:
        'border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-300',
    };
  }
  return { variant: 'outline' as const, className: undefined };
}

function AtRiskList({ rows }: { rows: RcltpAtRiskRow[] }) {
  return (
    <div className='space-y-2'>
      {rows.map((row) => {
        const badgeProps = atRiskBadgeProps(row.reason);
        return (
          <div
            key={row.learnerId}
            className='flex items-center justify-between gap-3 rounded-lg border border-border p-3'
          >
            <div className='min-w-0'>
              <p className='truncate text-sm font-medium text-foreground'>{row.name}</p>
              <p className='truncate text-xs text-muted-foreground'>
                Roll {row.roll} · {BAND_LABELS[row.band]} · Overall {row.overall}
              </p>
            </div>
            <Badge variant={badgeProps.variant} className={badgeProps.className}>
              {AT_RISK_REASON_LABELS[row.reason]}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// (d) Class / section comparison — one bar per "Grade{grade}-{section}"
// ---------------------------------------------------------------------------

function SectionComparisonChart({ data }: { data: RcltpSectionRow[] }) {
  const chartData = data.map((row) => ({
    ...row,
    label: `Grade ${row.grade}-${row.section}`,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const row = payload[0].payload;
      return (
        <div className='rounded-lg border border-border bg-background p-3 shadow-lg'>
          <p className='mb-1 text-sm font-medium text-foreground'>{row.label}</p>
          <p className='text-sm text-muted-foreground'>
            Avg overall: <span className='font-semibold text-foreground'>{row.avgOverall}</span>
          </p>
          <p className='text-sm text-muted-foreground'>
            Learners: <span className='font-semibold text-foreground'>{row.count}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width='100%' height={240}>
      <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray='3 3' stroke='#E5E7EB' vertical={false} />
        <XAxis
          dataKey='label'
          stroke='#6B7280'
          style={{ fontSize: '12px' }}
          tick={{ fill: '#6B7280' }}
          angle={-30}
          textAnchor='end'
          height={50}
        />
        <YAxis
          domain={[0, 100]}
          stroke='#6B7280'
          style={{ fontSize: '12px' }}
          tick={{ fill: '#6B7280' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey='avgOverall' name='Avg overall' radius={[6, 6, 0, 0]} fill='#3B82F6' />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Panel loading skeleton
// ---------------------------------------------------------------------------

function PanelSkeleton() {
  return (
    <div className='space-y-2'>
      <Skeleton className='h-40 w-full' />
      <Skeleton className='h-4 w-2/3' />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export function PrincipalDashboard() {
  const { userProfile } = usePermissions();
  const institutionId = userProfile?.institution_id ?? undefined;

  const { data, isLoading, isError, error } = useRcltpSchoolDashboard(institutionId);

  const hasAnyData =
    !!data &&
    (data.bandDistribution.length > 0 ||
      data.cycleProgress.length > 0 ||
      data.atRisk.length > 0 ||
      data.sectionComparison.length > 0);

  return (
    <div className='space-y-6'>
      {/* School-head context header */}
      <div className='rounded-xl border bg-card p-5'>
        <h1 className='text-xl font-semibold'>School-head dashboard</h1>
        <p className='mt-1 max-w-prose text-sm text-muted-foreground'>
          This is the school-head (principal) view of reading across your school.
          Every panel shows an honest waiting state until a section has scored
          data — we never display an estimated or placeholder result.
        </p>
        {data && (
          <p className='mt-2 text-xs text-muted-foreground'>
            {data.totals.scoredSittings} sitting{data.totals.scoredSittings === 1 ? '' : 's'}{' '}
            scored across {data.totals.learners} learner
            {data.totals.learners === 1 ? '' : 's'} so far.
          </p>
        )}
      </div>

      {/* HARD REQUIREMENT: provisional banner whenever any real data renders */}
      {hasAnyData && <ProvisionalBanner />}

      {!institutionId && !isLoading && (
        <Alert variant='destructive'>
          <AlertTitle>No institution on your profile</AlertTitle>
          <AlertDescription>
            We can&apos;t load the school-head dashboard because your profile has
            no institution assigned. Contact your administrator.
          </AlertDescription>
        </Alert>
      )}

      {isError && (
        <Alert variant='destructive'>
          <AlertTitle>Couldn&apos;t load the dashboard</AlertTitle>
          <AlertDescription>
            {(error as Error)?.message || 'Something went wrong loading the school-head dashboard.'}
          </AlertDescription>
        </Alert>
      )}

      <div className='grid gap-5 lg:grid-cols-2'>
        {/* (a) Cohort band distribution */}
        <SectionCard
          icon={BarChart3}
          title='Cohort band distribution'
          description='How learners across the school are spread over reading bands.'
        >
          {isLoading ? (
            <PanelSkeleton />
          ) : data && data.bandDistribution.length > 0 ? (
            <BandDistributionChart data={data.bandDistribution} />
          ) : (
            <AwaitingScoring what='Band distribution for your school will appear here.' />
          )}
        </SectionCard>

        {/* (b) Cycle progress across the 6 cycles */}
        <SectionCard
          icon={TrendingUp}
          title='Cycle progress'
          description='Progress across the six assessment cycles for the school.'
        >
          {isLoading ? (
            <PanelSkeleton />
          ) : data && data.cycleProgress.length > 0 ? (
            <CycleProgressChart data={data.cycleProgress} />
          ) : (
            <AwaitingScoring what='Progress across the six cycles will appear here.' />
          )}
        </SectionCard>

        {/* (c) At-risk learners alert list */}
        <SectionCard
          icon={AlertTriangle}
          title='At-risk learners'
          description='Learners who may need additional reading support.'
          badge={
            data && data.atRisk.length > 0 ? (
              <Badge variant='destructive' className='shrink-0'>
                {data.atRisk.length}
              </Badge>
            ) : undefined
          }
        >
          {isLoading ? (
            <PanelSkeleton />
          ) : data && data.atRisk.length > 0 ? (
            <AtRiskList rows={data.atRisk} />
          ) : (
            <AwaitingScoring what='The at-risk learner list will appear here.' />
          )}
        </SectionCard>

        {/* (d) Class / section comparison */}
        <SectionCard
          icon={Users}
          title='Class & section comparison'
          description='Compare reading outcomes across classes and sections.'
        >
          {isLoading ? (
            <PanelSkeleton />
          ) : data && data.sectionComparison.length > 0 ? (
            <SectionComparisonChart data={data.sectionComparison} />
          ) : (
            <AwaitingScoring what='Class and section comparison will appear here.' />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
