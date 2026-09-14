'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, UserCheck, UserX, CalendarOff } from 'lucide-react';
import { formatInt, formatPct, pctTone, toneClass } from './format';
import type { AttendanceKpis } from '@/types/campus-living/attendance-analytics';

/**
 * Headline KPI row.
 *
 * Every card carries a muted line naming what it divided by. A headcount or a
 * rate without its denominator is how two screens end up disagreeing and both
 * being technically right — the attendance rate here is over MARKED learners,
 * and the card has to say so.
 *
 * There is deliberately no "Curfew Violations" card. is_curfew_violation is
 * true on zero of the 16,715 rows in production, so the card that used to sit
 * here was reporting missing data as good behaviour.
 */
export function KpiCards({ kpis, isLoading }: { kpis?: AttendanceKpis; isLoading: boolean }) {
  if (isLoading || !kpis) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: 'Attendance rate',
      icon: UserCheck,
      value: formatPct(kpis.attendance_pct),
      tone: toneClass(pctTone(kpis.attendance_pct)),
      note: `(${formatInt(kpis.present + kpis.late_entry)} present + late) ÷ ${formatInt(kpis.pct_denominator)} marked days, excluding leave and medical`,
    },
    {
      title: 'Learners marked',
      icon: Users,
      value: formatInt(kpis.learners_marked),
      tone: '',
      note: `${formatInt(kpis.marks)} marks across ${formatInt(kpis.days_covered)} days`,
    },
    {
      title: 'Absences',
      icon: UserX,
      value: formatInt(kpis.absent),
      tone: kpis.absent > 0 ? toneClass('warning') : '',
      note: 'Marked absent — counts against the rate',
    },
    {
      title: 'Approved absence',
      icon: CalendarOff,
      value: formatInt(kpis.on_leave + kpis.medical),
      tone: '',
      note: `${formatInt(kpis.on_leave)} on leave, ${formatInt(kpis.medical)} medical — excluded from the rate`,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
            <c.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-semibold tabular-nums ${c.tone}`}>{c.value}</div>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">{c.note}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
