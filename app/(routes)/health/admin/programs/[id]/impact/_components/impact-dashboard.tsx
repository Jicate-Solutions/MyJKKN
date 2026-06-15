'use client';

// app/(routes)/health/admin/programs/[id]/impact/_components/impact-dashboard.tsx
// Created: 2026-06-15 — Health → Wellness Programs admin (PR3/3).
// Renders the ProgramImpact shape returned by fn_health_program_impact.
// The RPC enforces a manager-only permission gate — a denial surfaces as an
// error here (expected), not a crash. Plain-English labels throughout.
// Display pattern follows the AI Pulse publication-metrics-card.

import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  GraduationCap,
  Settings2,
  ShieldAlert,
  Sparkles,
  ThumbsUp,
  Users,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProgramImpact } from '@/hooks/health/use-wellness-programs';
import type { ProgramImpact } from '@/types/health-programs';

interface ImpactDashboardProps {
  programId: string;
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-IN');
}

// ── Stat tile ────────────────────────────────────────────────────────────
function StatTile({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accent}`}>
      <div className="mb-2 flex items-center gap-2">
        {icon}
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

// ── Horizontal bar (for funnel / by-day) ─────────────────────────────────
function Bar({
  label,
  value,
  max,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
}) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="font-mono text-slate-500">
          {num(value)}
          {suffix}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function PolicyCard({ policy }: { policy: ProgramImpact['policy'] }) {
  const completionLabel =
    policy.completion_rule === 'watch_and_quiz'
      ? 'Watch the video and pass the quiz'
      : 'Watch the video';
  return (
    <Card className="border-slate-200 bg-slate-50/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm text-slate-700">
          <Settings2 className="h-4 w-4 text-slate-500" />
          How these numbers are counted
        </CardTitle>
        <CardDescription className="text-xs">
          The rules below are set by a super-admin and can change without a
          redeploy. They produced the figures on this page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-400">A day counts as done when</dt>
            <dd className="text-sm font-medium text-slate-700">
              {completionLabel}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Quiz pass mark</dt>
            <dd className="text-sm font-medium text-slate-700">
              {policy.quiz_pass_pct}%
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Adoption window</dt>
            <dd className="text-sm font-medium text-slate-700">
              {policy.adoption_window_days} days after the program
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export function ImpactDashboard({ programId }: ImpactDashboardProps) {
  const router = useRouter();
  const { data, isLoading, error } = useProgramImpact(programId);

  // ── loading ──
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  // ── error (incl. the manager-only RPC gate denying access) ──
  if (error) {
    const message = (error as Error).message || '';
    const looksLikePermission =
      /permission|denied|not authoriz|forbidden|access/i.test(message);
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>
          {looksLikePermission
            ? 'You don’t have access to this program’s impact'
            : 'Couldn’t load impact'}
        </AlertTitle>
        <AlertDescription>
          {looksLikePermission
            ? 'Impact figures are limited to program managers. Ask a super-admin to grant health.programs.manage on your role.'
            : message || 'Unknown error reading program impact.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert>
        <AlertTitle>No impact data yet</AlertTitle>
        <AlertDescription>
          Figures appear once participants start watching the daily videos.
        </AlertDescription>
      </Alert>
    );
  }

  const maxByDay = Math.max(
    1,
    ...data.reach.by_day.map((d) => d.unique_viewers ?? 0),
  );
  const maxFunnel = Math.max(1, ...data.engagement.funnel.map((f) => f.people));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/health/admin/programs/${programId}`)}
          className="-ml-2 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to program
        </Button>
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
          <BarChart3 className="h-4 w-4 text-teal-600" />
          {data.days_total} day program
        </span>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={<Users className="h-5 w-5 text-emerald-600" />}
          value={num(data.reach.unique_participants)}
          label="People reached"
          accent="border-emerald-100 bg-emerald-50/60"
        />
        <StatTile
          icon={<CheckCircle2 className="h-5 w-5 text-teal-600" />}
          value={num(data.engagement.completed_all)}
          label={`Completed all ${data.days_total} days`}
          accent="border-teal-100 bg-teal-50/60"
        />
        <StatTile
          icon={<GraduationCap className="h-5 w-5 text-blue-600" />}
          value={pct(data.learning.pass_rate_pct)}
          label="Quiz pass rate"
          accent="border-blue-100 bg-blue-50/60"
        />
        <StatTile
          icon={<ThumbsUp className="h-5 w-5 text-amber-600" />}
          value={
            data.usefulness.responses > 0
              ? data.usefulness.avg_rating.toFixed(1)
              : '—'
          }
          label="Avg usefulness (of 5)"
          accent="border-amber-100 bg-amber-50/60"
        />
      </div>

      {/* Reach by day */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-slate-800">
            Reach — who watched each day
          </CardTitle>
          <CardDescription>
            Unique viewers per day. A natural drop-off across days is normal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.reach.by_day.length === 0 ? (
            <p className="py-4 text-sm text-slate-400">No views recorded yet.</p>
          ) : (
            data.reach.by_day.map((d) => (
              <Bar
                key={d.day_number}
                label={`Day ${d.day_number}`}
                value={d.unique_viewers ?? 0}
                max={maxByDay}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Engagement funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-slate-800">
            Engagement — how far people got
          </CardTitle>
          <CardDescription>
            How many people completed each number of days. On average,
            participants finished{' '}
            <strong>{data.engagement.avg_days_completed.toFixed(1)}</strong> of{' '}
            {data.days_total} days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.engagement.funnel.length === 0 ? (
            <p className="py-4 text-sm text-slate-400">
              No completions recorded yet.
            </p>
          ) : (
            data.engagement.funnel.map((f) => (
              <Bar
                key={f.days_completed}
                label={`${f.days_completed} of ${data.days_total} days`}
                value={f.people}
                max={maxFunnel}
                suffix=" people"
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Learning + Usefulness + Adoption row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-800">
              <GraduationCap className="h-4 w-4 text-blue-600" />
              Learning
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Quiz attempts</span>
              <span className="font-medium text-slate-800">
                {num(data.learning.quiz_attempts)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Average score</span>
              <span className="font-medium text-slate-800">
                {pct(data.learning.avg_quiz_score)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Pass rate</span>
              <span className="font-medium text-slate-800">
                {pct(data.learning.pass_rate_pct)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-800">
              <ThumbsUp className="h-4 w-4 text-amber-600" />
              Usefulness
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Responses</span>
              <span className="font-medium text-slate-800">
                {num(data.usefulness.responses)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Average rating</span>
              <span className="font-medium text-slate-800">
                {data.usefulness.responses > 0
                  ? `${data.usefulness.avg_rating.toFixed(1)} / 5`
                  : '—'}
              </span>
            </div>
            {data.usefulness.responses === 0 && (
              <p className="pt-1 text-xs text-slate-400">
                No one has rated the program yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-800">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              Adoption lift
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">New health consents</span>
              <span className="font-medium text-slate-800">
                {num(data.adoption_lift.new_consents)}
              </span>
            </div>
            <p className="pt-1 text-xs text-slate-400">
              New consents within {data.adoption_lift.window_days} days of the
              program — a sign it nudged people to engage with health more
              broadly.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active policy */}
      <PolicyCard policy={data.policy} />
    </div>
  );
}
