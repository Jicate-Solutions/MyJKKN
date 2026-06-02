'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Info } from 'lucide-react';
import { useYoYTrajectory } from '@/hooks/admission/use-yoy-trajectory';

type Props = {
  /**
   * Single institution_id when the parent scope resolves to one institution
   * (e.g., counselor view). Pass undefined for group-wide.
   */
  institutionId?: string;
  /**
   * Whether the caller has access to a single institution (for showing the
   * "My institution only" toggle). When false, only group view is offered.
   */
  hasInstitutionScope?: boolean;
};

const YEAR_COLOURS: Record<string, string> = {
  '0': '#6b7280', // oldest year — gray
  '1': '#3b82f6', // middle year — blue
  '2': '#10b981', // current year — green
};

const X_AXIS_CLAMP = { min: -150, max: 400 };

export function YoYTrajectoryChart({ institutionId, hasInstitutionScope }: Props) {
  const [scopeMode, setScopeMode] = useState<'group' | 'mine'>('group');
  const [horizonMode, setHorizonMode] = useState<'fair-race' | 'full-horizon'>('fair-race');

  const effectiveInstitutionId = scopeMode === 'mine' ? institutionId : undefined;
  const { data, isLoading, error } = useYoYTrajectory(effectiveInstitutionId);

  const { chartData, years, currentMaxDayN } = useMemo(() => {
    if (!data?.trajectory.length) {
      return { chartData: [], years: [] as number[], currentMaxDayN: 0 };
    }
    // Pivot from rows of {year, dayN, cumulativeAdmitted} into columns keyed by year
    const yearsSet = new Set<number>();
    const byDayN = new Map<number, Record<string, number | undefined>>();
    for (const r of data.trajectory) {
      yearsSet.add(r.year);
      // Clip to display range to keep the X-axis readable
      if (r.dayN < X_AXIS_CLAMP.min || r.dayN > X_AXIS_CLAMP.max) continue;
      if (!byDayN.has(r.dayN)) byDayN.set(r.dayN, { dayN: r.dayN });
      byDayN.get(r.dayN)![`y${r.year}`] = r.cumulativeAdmitted;
    }
    // Forward-fill within each year so the line is continuous between sparse data points
    const sortedDays = Array.from(byDayN.keys()).sort((a, b) => a - b);
    const lastSeen: Record<string, number | undefined> = {};
    const sortedYears = Array.from(yearsSet).sort((a, b) => a - b);
    for (const day of sortedDays) {
      const point = byDayN.get(day)!;
      for (const y of sortedYears) {
        const key = `y${y}`;
        if (point[key] !== undefined) {
          lastSeen[key] = point[key] as number;
        } else if (lastSeen[key] !== undefined) {
          point[key] = lastSeen[key];
        }
      }
    }
    const points = sortedDays.map((d) => byDayN.get(d)!);
    const currentYear = Math.max(...sortedYears);
    const maxDayNForCurrent = data.trajectory
      .filter((r) => r.year === currentYear)
      .reduce((max, r) => Math.max(max, r.dayN), -Infinity);
    return {
      chartData: points,
      years: sortedYears,
      currentMaxDayN: Number.isFinite(maxDayNForCurrent) ? maxDayNForCurrent : 0,
    };
  }, [data]);

  // Apply fair-race truncation: clip all years' lines at currentMaxDayN
  const displayData = useMemo(() => {
    if (horizonMode === 'full-horizon') return chartData;
    return chartData.filter((p) => (p.dayN as number) <= currentMaxDayN);
  }, [chartData, horizonMode, currentMaxDayN]);

  const excludedByInstitution = useMemo(() => {
    if (!data?.excludedCourses.length) return [];
    const grouped = new Map<string, typeof data.excludedCourses>();
    for (const c of data.excludedCourses) {
      if (!grouped.has(c.institutionName)) grouped.set(c.institutionName, []);
      grouped.get(c.institutionName)!.push(c);
    }
    return Array.from(grouped.entries()).map(([name, courses]) => ({ name, courses }));
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Loading year-over-year trajectory…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Could not load YoY trajectory</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  if (!data?.trajectory.length) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>No common-courses data yet</AlertTitle>
        <AlertDescription>
          The YoY chart needs courses with admission data in all 3 cycles. Once 2026-27 has
          more programs that match historical years, the chart will populate.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header strip — title, scope toggle, horizon toggle, common-courses badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Year over Year</h3>
          <Badge variant="secondary" className="text-xs">
            Common courses only · {years.length} years overlaid
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {hasInstitutionScope && institutionId && (
            <div className="inline-flex rounded-md border bg-muted p-0.5">
              <Button
                variant={scopeMode === 'group' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setScopeMode('group')}
              >
                Group
              </Button>
              <Button
                variant={scopeMode === 'mine' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setScopeMode('mine')}
              >
                My institution
              </Button>
            </div>
          )}
          <div className="inline-flex rounded-md border bg-muted p-0.5">
            <Button
              variant={horizonMode === 'fair-race' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setHorizonMode('fair-race')}
            >
              Fair race
            </Button>
            <Button
              variant={horizonMode === 'full-horizon' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setHorizonMode('full-horizon')}
            >
              Full horizon
            </Button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground font-normal">
            Cumulative admitted vs. days since April 1 of each cohort&apos;s class-start year.
            Days before April 1 (e.g. Feb–March pre-cycle admissions) appear as negative on the X-axis.
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={displayData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="dayN"
                type="number"
                domain={[X_AXIS_CLAMP.min, X_AXIS_CLAMP.max]}
                tick={{ fontSize: 11 }}
                label={{ value: 'Day-N (anchored at April 1)', position: 'bottom', fontSize: 11 }}
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                formatter={(value: number, name: string) => [value, name.replace('y', '')]}
                labelFormatter={(day) => {
                  const dayNum = Number(day);
                  if (dayNum < 0) return `Day ${dayNum} (pre-cycle, ${Math.abs(dayNum)} days before Apr 1)`;
                  if (dayNum === 0) return 'Day 0 (April 1 — class start)';
                  return `Day +${dayNum} (post-class-start)`;
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value: string) => `${value.replace('y', '')}-${Number(value.replace('y', '')) + 1}`}
              />
              <ReferenceLine
                x={0}
                stroke="#9ca3af"
                strokeDasharray="3 3"
                label={{ value: 'Apr 1', position: 'top', fontSize: 10, fill: '#6b7280' }}
              />
              {years.map((y, idx) => (
                <Line
                  key={y}
                  type="monotone"
                  dataKey={`y${y}`}
                  name={`y${y}`}
                  stroke={YEAR_COLOURS[String(idx)] ?? '#6b7280'}
                  strokeWidth={idx === years.length - 1 ? 3 : 2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Excluded courses — BDS-style placeholder explainer */}
      {excludedByInstitution.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Programs not in trajectory</CardTitle>
            <p className="text-xs text-muted-foreground">
              These programs are filtered out of the YoY chart because they don&apos;t have
              admission data across all 3 cycles in MyJKKN. Some (like BDS) are tracked via
              external systems such as TN MCC state counselling and could be backfilled in a
              follow-up sprint.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {excludedByInstitution.map(({ name, courses }) => (
              <div key={name} className="text-xs">
                <div className="font-medium">{name}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {courses.map((c) => (
                    <Badge
                      key={c.programId}
                      variant="outline"
                      className="text-[10px] font-normal"
                      title={`Data only in: ${c.yearsWithData.join(', ')} (${c.exclusionReason.replace(/_/g, ' ')})`}
                    >
                      {c.programName} · {c.yearsWithData.join('/')}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
