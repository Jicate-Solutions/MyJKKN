'use client';

import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Dimension, GroupRow } from '@/lib/campus-living/attendance-cube';
import { AXIS, formatInt, formatPct, GRID, pctTone, SURFACE, toneClass, TOOLTIP_STYLE, useVizPalette } from './palette';

type D = Exclude<Dimension, 'date'>;

interface Props {
  title: string;
  description: string;
  dim: D;
  rows: GroupRow[];
  total: GroupRow | null;
  /** The active cross-filter value for this dimension, if any. */
  activeKey: string | null;
  isLoading: boolean;
  onSelect: (key: string) => void;
  /** Extra per-row control (the block panel's Mark / Update link). */
  rowAction?: (row: GroupRow) => ReactNode;
}

// Sticky first column needs an opaque surface so scrolled cells don't show through.
const STICKY = 'sticky left-0 z-10 bg-card';

/**
 * Counts for one dimension: a stacked horizontal bar per row (click = cross-filter)
 * and a table of the same numbers with an Overall line. Chart and table sit side by
 * side from xl, stacked below it; the table drops its least-important columns on
 * narrow screens rather than squeezing all ten.
 *
 * Stack order is leave · present · late · absent — the order that kept every
 * adjacent pair distinguishable in dark mode (see palette.ts).
 */
export function BreakdownPanel({
  title,
  description,
  dim,
  rows,
  total,
  activeKey,
  isLoading,
  onSelect,
  rowAction,
}: Props) {
  const viz = useVizPalette();
  const showResidents = total?.residents !== null && total?.residents !== undefined;

  const series = [
    { key: 'onLeave', name: 'On leave', color: viz.status.leave },
    { key: 'present', name: 'Present', color: viz.status.present },
    { key: 'late', name: 'Late entry', color: viz.status.late },
    { key: 'absent', name: 'Absent', color: viz.status.absent },
  ] as const;

  const chartData = rows.map((r) => ({
    key: r.key,
    label: r.label,
    onLeave: r.onLeave + r.medical,
    present: r.present,
    late: r.late,
    absent: r.absent,
    pct: r.pct,
    denom: r.denom,
    // zero-width series that only carries the rate label at the end of the bar
    rate: 0,
    rateText: r.pct === null ? '—' : formatPct(r.pct),
  }));

  const longest = rows.reduce((m, r) => Math.max(m, r.label.length), 0);
  const yWidth = Math.min(150, Math.max(72, Math.round(longest * 6.2)));
  const height = Math.max(150, rows.length * 38 + 56);
  const cap = Math.floor(yWidth / 6.2);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nothing marked for this selection.</p>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(340px,2fr)_3fr] xl:items-start">
            <div style={{ height }} className="w-full min-w-0" role="img" aria-label={`${title} chart`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 0 }} barCategoryGap="22%">
                  <CartesianGrid horizontal={false} {...GRID} />
                  <XAxis type="number" allowDecimals={false} {...AXIS} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={yWidth}
                    {...AXIS}
                    tickFormatter={(v: string) => (v.length > cap ? `${v.slice(0, Math.max(3, cap - 1))}…` : v)}
                  />
                  <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: '12px' }} iconType="square" />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof chartData)[number];
                      return (
                        <div style={TOOLTIP_STYLE} className="min-w-[170px] space-y-0.5 px-3 py-2">
                          <p className="font-medium">{d.label}</p>
                          {series.map((s) => (
                            <p key={s.key} className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5">
                                <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: s.color }} />
                                {s.name}
                              </span>
                              <span className="tabular-nums">{formatInt(d[s.key])}</span>
                            </p>
                          ))}
                          <p className="flex justify-between gap-4 border-t pt-0.5 font-medium">
                            <span>Rate</span>
                            <span className="tabular-nums">{formatPct(d.pct)}</span>
                          </p>
                          <p className="text-[11px] opacity-70">Click to filter</p>
                        </div>
                      );
                    }}
                  />
                  {series.map((s, i) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.name}
                      stackId="a"
                      fill={s.color}
                      stroke={SURFACE}
                      strokeWidth={2}
                      radius={i === series.length - 1 ? [0, 4, 4, 0] : 0}
                      cursor="pointer"
                      isAnimationActive={false}
                      onClick={(e: { key?: string; payload?: { key?: string } }) => {
                        const k = e?.payload?.key ?? e?.key;
                        if (k) onSelect(k);
                      }}
                    >
                      {chartData.map((d) => (
                        <Cell key={d.key} fillOpacity={activeKey && activeKey !== d.key ? 0.3 : 1} />
                      ))}
                    </Bar>
                  ))}
                  <Bar dataKey="rate" stackId="a" fill="transparent" legendType="none" isAnimationActive={false}>
                    <LabelList
                      dataKey="rateText"
                      position="right"
                      offset={6}
                      style={{ fontSize: 11, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="min-w-0 overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={`${STICKY} min-w-[140px]`}>
                      {dim === 'institution' ? 'Institution' : dim === 'department' ? 'Department' : 'Block'}
                    </TableHead>
                    {showResidents && <TableHead className="hidden text-right sm:table-cell">Residents</TableHead>}
                    {showResidents && <TableHead className="hidden text-right lg:table-cell">Not marked</TableHead>}
                    <TableHead className="text-right">Present</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Late</TableHead>
                    <TableHead className="text-right">Absent</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Leave</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="hidden text-right md:table-cell">At risk</TableHead>
                    {rowAction && <TableHead className="w-[1%]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key} data-state={activeKey === r.key ? 'selected' : undefined} className="group">
                      <TableCell className={`${STICKY} font-medium group-data-[state=selected]:bg-muted`}>
                        <button
                          type="button"
                          onClick={() => onSelect(r.key)}
                          aria-pressed={activeKey === r.key}
                          className="block max-w-[220px] truncate text-left hover:underline"
                          title={r.label}
                        >
                          {r.label}
                        </button>
                        {dim === 'department' && r.parentLabel && (
                          <span className="block max-w-[220px] truncate text-[11px] font-normal text-muted-foreground">
                            {r.parentLabel}
                          </span>
                        )}
                        {r.denom === 0 && (
                          <Badge variant="outline" className="mt-0.5 text-[10px]">
                            No marks
                          </Badge>
                        )}
                      </TableCell>
                      {showResidents && (
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatInt(r.residents)}</TableCell>
                      )}
                      {showResidents && (
                        <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatInt(r.notMarked)}</TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">{formatInt(r.present)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{formatInt(r.late)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatInt(r.absent)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {formatInt(r.onLeave + r.medical)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${toneClass(pctTone(r.pct))}`}>
                        {formatPct(r.pct)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{formatInt(r.atRisk)}</TableCell>
                      {rowAction && <TableCell>{rowAction(r)}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
                {total && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className={`${STICKY} font-semibold`}>Overall</TableCell>
                      {showResidents && (
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatInt(total.residents)}</TableCell>
                      )}
                      {showResidents && (
                        <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatInt(total.notMarked)}</TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">{formatInt(total.present)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{formatInt(total.late)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatInt(total.absent)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {formatInt(total.onLeave + total.medical)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${toneClass(pctTone(total.pct))}`}>
                        {formatPct(total.pct)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{formatInt(total.atRisk)}</TableCell>
                      {rowAction && <TableCell />}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
