'use client';

import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import type { CaseRiskCalculation, CaseRiskLevel } from '@/types/case';

const RISK_ORDER: Record<CaseRiskLevel, number> = {
  overdue: 0,
  critical: 1,
  at_risk: 2,
  on_track: 3,
  completed: 4
};

const RISK_BADGE: Record<CaseRiskLevel, { label: string; className: string }> = {
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-800 border-red-200' },
  critical: { label: 'Critical', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  at_risk: { label: 'At Risk', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  on_track: { label: 'On Track', className: 'bg-green-100 text-green-800 border-green-200' },
  completed: { label: 'Completed', className: 'bg-blue-100 text-blue-800 border-blue-200' }
};

type SortKey = 'risk_level' | 'tracks_completed' | 'days_to_exam' | 'semesters_remaining' | 'tracks_per_semester_needed';
type SortDir = 'asc' | 'desc';

interface AtRiskTableProps {
  learners: CaseRiskCalculation[];
  isLoading: boolean;
}

function SortButton({
  label,
  sortKey,
  current,
  dir,
  onSort
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-7 font-medium"
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active ? (
        dir === 'asc' ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />
      ) : (
        <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />
      )}
    </Button>
  );
}

export function AtRiskTable({ learners, isLoading }: AtRiskTableProps) {
  const [institutionFilter, setInstitutionFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('risk_level');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const institutions = useMemo(() => {
    const set = new Set(learners.map((l) => l.institution_id));
    return Array.from(set).sort();
  }, [learners]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    let list = institutionFilter === 'all'
      ? learners
      : learners.filter((l) => l.institution_id === institutionFilter);

    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'risk_level':
          cmp = RISK_ORDER[a.calculated_risk_level] - RISK_ORDER[b.calculated_risk_level];
          break;
        case 'tracks_completed':
          cmp = a.tracks_completed - b.tracks_completed;
          break;
        case 'days_to_exam':
          cmp = (a.days_to_exam ?? 9999) - (b.days_to_exam ?? 9999);
          break;
        case 'semesters_remaining':
          cmp = a.semesters_remaining - b.semesters_remaining;
          break;
        case 'tracks_per_semester_needed':
          cmp = a.tracks_per_semester_needed - b.tracks_per_semester_needed;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [learners, institutionFilter, sortKey, sortDir]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-48" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (learners.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="text-lg font-medium">No at-risk learners</h3>
        <p className="text-sm text-muted-foreground mt-1">
          All learners are on track or no data is available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter row */}
      <div className="flex items-center gap-3">
        <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All Institutions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Institutions</SelectItem>
            {institutions.map((inst) => (
              <SelectItem key={inst} value={inst}>{inst}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {filtered.length} learner{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User ID</TableHead>
              <TableHead>Programme ID</TableHead>
              <TableHead>Institution ID</TableHead>
              <TableHead className="text-center">Semester</TableHead>
              <TableHead>
                <SortButton label="Tracks Done" sortKey="tracks_completed" current={sortKey} dir={sortDir} onSort={handleSort} />
              </TableHead>
              <TableHead className="text-center">Tracks Left</TableHead>
              <TableHead>
                <SortButton label="Pace Needed" sortKey="tracks_per_semester_needed" current={sortKey} dir={sortDir} onSort={handleSort} />
              </TableHead>
              <TableHead>
                <SortButton label="Risk Level" sortKey="risk_level" current={sortKey} dir={sortDir} onSort={handleSort} />
              </TableHead>
              <TableHead>
                <SortButton label="Days to Exam" sortKey="days_to_exam" current={sortKey} dir={sortDir} onSort={handleSort} />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((learner) => {
              const badge = RISK_BADGE[learner.calculated_risk_level];
              return (
                <TableRow key={learner.user_id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="font-medium text-sm font-mono text-xs">{learner.user_id.slice(0, 8)}...</div>
                  </TableCell>
                  <TableCell className="text-sm font-mono text-xs">{learner.programme_id.slice(0, 8)}...</TableCell>
                  <TableCell className="text-sm font-mono text-xs">{learner.institution_id.slice(0, 8)}...</TableCell>
                  <TableCell className="text-center text-sm">
                    Sem {learner.semesters_remaining} left
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-20 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#0b6d41]"
                          style={{ width: `${(learner.tracks_completed / 6) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm tabular-nums">{learner.tracks_completed}/6</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm tabular-nums">
                    {learner.tracks_remaining}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {learner.tracks_per_semester_needed.toFixed(1)} / sem
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs border ${badge.className}`} variant="outline">
                      {badge.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {learner.days_to_exam != null ? `${learner.days_to_exam}d` : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
