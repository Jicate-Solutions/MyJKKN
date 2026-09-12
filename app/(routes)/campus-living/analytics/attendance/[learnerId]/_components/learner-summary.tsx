'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CalendarDays, Percent, TrendingDown } from 'lucide-react';
import {
  formatDate,
  formatInt,
  formatPct,
  pctTone,
  toneClass,
} from '../../_components/format';
import type {
  AttendanceLearnerProfile,
  AttendanceLearnerSummary,
} from '@/types/campus-living/attendance-analytics';

/** Identity strip: who this is and where they live. */
export function LearnerHeader({
  profile,
  summary,
  isLoading,
}: {
  profile: AttendanceLearnerProfile | null;
  summary: Partial<AttendanceLearnerSummary>;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }
  if (!profile) return null;

  const tone = pctTone(summary.attendance_pct ?? null);
  const atRisk = tone === 'critical' || tone === 'warning';

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-xl font-semibold">{profile.full_name ?? 'Unknown learner'}</h2>
          {atRisk && (
            <Badge variant={tone === 'critical' ? 'destructive' : 'outline'} className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {tone === 'critical' ? 'Critically low' : 'Below 75%'}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {[
            profile.roll_number,
            profile.program_name,
            profile.institution_name,
            profile.block_name && profile.room_number
              ? `${profile.block_name} · Room ${profile.room_number}`
              : profile.block_name,
          ]
            .filter(Boolean)
            .join(' · ') || '—'}
        </p>
      </div>
      <div className="shrink-0 text-left sm:text-right">
        <div className={`text-3xl font-semibold tabular-nums ${toneClass(tone)}`}>
          {formatPct(summary.attendance_pct ?? null)}
        </div>
        <div className="text-xs text-muted-foreground">
          over {formatInt(summary.pct_denominator)} counted days
        </div>
      </div>
    </div>
  );
}

/**
 * Summary tiles including the absence streaks.
 *
 * Both streak tiles say "marked days" explicitly. The runs come from a
 * gaps-and-islands window over rows that exist, so a fortnight where nobody
 * marked anything does not interrupt a run — calling it "28 days" without that
 * qualifier would overstate the case against the learner.
 */
export function StreakCards({
  summary,
  isLoading,
}: {
  summary: Partial<AttendanceLearnerSummary>;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const current = summary.current_absent_run ?? 0;
  const longest = summary.longest_absent_run ?? 0;

  const tiles = [
    {
      title: 'Present',
      icon: Percent,
      value: formatInt((summary.present ?? 0) + (summary.late_entry ?? 0)),
      note: `${formatInt(summary.present)} present, ${formatInt(summary.late_entry)} late entry`,
      tone: '',
    },
    {
      title: 'Absent',
      icon: TrendingDown,
      value: formatInt(summary.absent),
      note: `${formatInt(summary.on_leave)} on leave, ${formatInt(summary.medical)} medical (excluded)`,
      tone: (summary.absent ?? 0) > 0 ? toneClass('warning') : '',
    },
    {
      title: 'Current absence run',
      icon: AlertTriangle,
      value: formatInt(current),
      note: current > 0 ? 'consecutive marked days, still open' : 'present on the last marked day',
      tone: current > 0 ? toneClass('critical') : toneClass('ok'),
    },
    {
      title: 'Longest absence run',
      icon: CalendarDays,
      value: formatInt(longest),
      note: 'consecutive marked days — gaps in marking do not break a run',
      tone: '',
    },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t.title}</CardTitle>
              <t.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-semibold tabular-nums ${t.tone}`}>{t.value}</div>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">{t.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Marked between {formatDate(summary.first_marked)} and {formatDate(summary.last_marked)}
        {summary.last_present_date ? ` · last present ${formatDate(summary.last_present_date)}` : ''}
      </p>
    </>
  );
}
