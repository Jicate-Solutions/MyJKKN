'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ChevronDown,
  CalendarClock,
  ArrowUpDown,
  User,
} from 'lucide-react';
import { FacilitatorTrendChart } from './facilitator-trend-chart';
import type { FacilitatorAttendanceStat, FacilitatorTimetableAssignment } from '@/types/attendance';

interface Props {
  facilitators: FacilitatorAttendanceStat[];
  globalFilter: string;
}

type SortKey = 'name' | 'periodsMarked' | 'periodsAssigned' | 'markingRate' | 'periodsPending';

function getRateBadge(rate: number) {
  if (rate >= 80)
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-[10px] px-1.5 py-0">Excellent</Badge>;
  if (rate >= 60)
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-[10px] px-1.5 py-0">Good</Badge>;
  if (rate >= 40)
    return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 text-[10px] px-1.5 py-0">Fair</Badge>;
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-[10px] px-1.5 py-0">Low</Badge>;
}

function getRateColor(rate: number) {
  if (rate >= 80) return 'text-green-700 dark:text-green-400';
  if (rate >= 60) return 'text-blue-700 dark:text-blue-400';
  if (rate >= 40) return 'text-yellow-700 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function TimetableBreakdown({ assignments }: { assignments: FacilitatorTimetableAssignment[] }) {
  if (assignments.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-2">No timetable assignments found.</p>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
        <CalendarClock className="h-3 w-3" />
        Timetable Breakdown
      </h4>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Timetable</th>
              <th className="text-center py-2 px-3 font-medium text-muted-foreground">Assigned</th>
              <th className="text-center py-2 px-3 font-medium text-muted-foreground">Marked</th>
              <th className="text-center py-2 px-3 font-medium text-muted-foreground">Pending</th>
              <th className="text-center py-2 px-3 font-medium text-muted-foreground">Rate</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((ta) => {
              const rate = ta.assignedCount > 0
                ? Math.round((ta.markedCount / ta.assignedCount) * 100)
                : 0;
              return (
                <tr key={ta.timetableId} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-3 font-medium">{ta.timetableName}</td>
                  <td className="py-2 px-3 text-center text-indigo-700 dark:text-indigo-400 font-semibold">
                    {ta.assignedCount}
                  </td>
                  <td className="py-2 px-3 text-center text-green-700 dark:text-green-400 font-semibold">
                    {ta.markedCount}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className={`font-semibold ${ta.pendingCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                      {ta.pendingCount}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className={`font-semibold ${getRateColor(rate)}`}>{rate}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FacilitatorCard({ facilitator, index }: { facilitator: FacilitatorAttendanceStat; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const rate = Number(facilitator.markingRate ?? 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="group rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer">
          {/* Collapsed header — always visible */}
          <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
            {/* Index + avatar area */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-muted-foreground w-5 text-right">{index}.</span>
              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
              </div>
            </div>

            {/* Name + department */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate leading-tight">
                {facilitator.firstName} {facilitator.lastName}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate leading-tight">
                {facilitator.designation && <>{facilitator.designation} · </>}
                {facilitator.departmentName}
              </p>
            </div>

            {/* Stats row — visible on sm+ as pills */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <div className="flex items-center gap-1 rounded-md bg-indigo-50 dark:bg-indigo-950 px-2 py-1">
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400">Assigned</span>
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{facilitator.periodsAssigned}</span>
              </div>
              <div className="flex items-center gap-1 rounded-md bg-green-50 dark:bg-green-950 px-2 py-1">
                <span className="text-[10px] text-green-600 dark:text-green-400">Marked</span>
                <span className="text-xs font-bold text-green-700 dark:text-green-300">{facilitator.periodsMarked}</span>
              </div>
              {facilitator.periodsPending > 0 && (
                <div className="flex items-center gap-1 rounded-md bg-red-50 dark:bg-red-950 px-2 py-1">
                  <span className="text-[10px] text-red-500">Pending</span>
                  <span className="text-xs font-bold text-red-600 dark:text-red-400">{facilitator.periodsPending}</span>
                </div>
              )}
            </div>

            {/* Rate + badge */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`text-sm sm:text-base font-bold ${getRateColor(rate)}`}>
                {rate.toFixed(0)}%
              </span>
              <span className="hidden md:inline">
                {getRateBadge(rate)}
              </span>
            </div>

            {/* Chevron */}
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
          </div>

          {/* Mobile stats row — visible on xs only */}
          <div className="flex sm:hidden items-center gap-2 px-3 pb-2.5 -mt-1">
            <div className="flex items-center gap-3 text-[11px]">
              <span>
                <span className="text-muted-foreground">Assigned: </span>
                <span className="font-semibold text-indigo-700 dark:text-indigo-400">{facilitator.periodsAssigned}</span>
              </span>
              <span>
                <span className="text-muted-foreground">Marked: </span>
                <span className="font-semibold text-green-700 dark:text-green-400">{facilitator.periodsMarked}</span>
              </span>
              {facilitator.periodsPending > 0 && (
                <span>
                  <span className="text-muted-foreground">Pending: </span>
                  <span className="font-semibold text-red-600 dark:text-red-400">{facilitator.periodsPending}</span>
                </span>
              )}
            </div>
            <span className="ml-auto">{getRateBadge(rate)}</span>
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border border-t-0 rounded-b-lg bg-muted/20 p-3 sm:p-4 -mt-[1px] space-y-4">
          {/* Meta info */}
          {facilitator.lastMarkedAt && (
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Last marked: {format(new Date(facilitator.lastMarkedAt), 'MMM d, yyyy \'at\' h:mm a')}
            </p>
          )}

          {/* Timetable breakdown + Trend chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TimetableBreakdown assignments={facilitator.timetableAssignments ?? []} />
            <div className="min-w-0">
              <FacilitatorTrendChart facilitators={[facilitator]} />
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function FacilitatorDataTable({ facilitators, globalFilter }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('periodsMarked');
  const [sortDesc, setSortDesc] = useState(true);

  const filtered = useMemo(() => {
    if (!globalFilter) return facilitators;
    const term = globalFilter.toLowerCase();
    return facilitators.filter(
      (f) =>
        f.firstName?.toLowerCase().includes(term) ||
        f.lastName?.toLowerCase().includes(term) ||
        `${f.firstName} ${f.lastName}`.toLowerCase().includes(term) ||
        f.designation?.toLowerCase().includes(term) ||
        f.departmentName?.toLowerCase().includes(term)
    );
  }, [facilitators, globalFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
          break;
        case 'periodsMarked':
          cmp = a.periodsMarked - b.periodsMarked;
          break;
        case 'periodsAssigned':
          cmp = a.periodsAssigned - b.periodsAssigned;
          break;
        case 'markingRate':
          cmp = a.markingRate - b.markingRate;
          break;
        case 'periodsPending':
          cmp = a.periodsPending - b.periodsPending;
          break;
      }
      return sortDesc ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const SortButton = ({ label, field }: { label: string; field: SortKey }) => (
    <Button
      variant={sortKey === field ? 'secondary' : 'ghost'}
      size="sm"
      className="h-7 text-[10px] sm:text-xs px-2"
      onClick={() => toggleSort(field)}
    >
      {label}
      <ArrowUpDown className={`ml-1 h-3 w-3 ${sortKey === field ? 'opacity-100' : 'opacity-40'}`} />
    </Button>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-sm sm:text-base">
            Facilitator Details ({sorted.length} records)
          </CardTitle>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-muted-foreground mr-1">Sort by:</span>
            <SortButton label="Name" field="name" />
            <SortButton label="Marked" field="periodsMarked" />
            <SortButton label="Assigned" field="periodsAssigned" />
            <SortButton label="Rate" field="markingRate" />
            <SortButton label="Pending" field="periodsPending" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-3 sm:px-6">
        {sorted.map((f, i) => (
          <FacilitatorCard
            key={f.staffId}
            facilitator={f}
            index={i + 1}
          />
        ))}
        {sorted.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No facilitators found
          </div>
        )}
      </CardContent>
    </Card>
  );
}
