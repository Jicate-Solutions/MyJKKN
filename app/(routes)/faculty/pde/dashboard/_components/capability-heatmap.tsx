'use client';

import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { CapabilityStatus } from '@/types/pde';

// ---------- Types ----------

interface LearnerCapabilityRow {
  learner_id: string;
  learner_name: string;
  risk_level?: string;
  capabilities: Record<
    string,
    { status: CapabilityStatus; capability_name: string }
  >;
}

interface CapabilityHeatmapProps {
  learners: LearnerCapabilityRow[];
  capabilityNames: { id: string; name: string }[];
  isLoading?: boolean;
}

// ---------- Status colour mapping ----------

const STATUS_COLORS: Record<CapabilityStatus, { bg: string; label: string }> = {
  locked: { bg: 'bg-gray-200 dark:bg-gray-700', label: 'Locked' },
  available: { bg: 'bg-white dark:bg-gray-800 border border-gray-300', label: 'Available' },
  in_progress: { bg: 'bg-yellow-300 dark:bg-yellow-700', label: 'In Progress' },
  demonstrated: { bg: 'bg-green-400 dark:bg-green-700', label: 'Demonstrated' },
  mastered: { bg: 'bg-amber-400 dark:bg-amber-600', label: 'Mastered' },
};

type SortKey = 'name' | 'progress' | 'risk';

// ---------- Component ----------

export function CapabilityHeatmap({
  learners,
  capabilityNames,
  isLoading,
}: CapabilityHeatmapProps) {
  const [sortBy, setSortBy] = useState<SortKey>('name');

  const sorted = useMemo(() => {
    const copy = [...learners];
    if (sortBy === 'name') {
      copy.sort((a, b) => a.learner_name.localeCompare(b.learner_name));
    } else if (sortBy === 'progress') {
      const score = (l: LearnerCapabilityRow) =>
        Object.values(l.capabilities).reduce((s, c) => {
          if (c.status === 'mastered') return s + 3;
          if (c.status === 'demonstrated') return s + 2;
          if (c.status === 'in_progress') return s + 1;
          return s;
        }, 0);
      copy.sort((a, b) => score(b) - score(a));
    } else {
      const riskOrder: Record<string, number> = {
        critical: 0, warning: 1, struggling: 2, on_track: 3,
      };
      copy.sort(
        (a, b) =>
          (riskOrder[a.risk_level || 'on_track'] ?? 4) -
          (riskOrder[b.risk_level || 'on_track'] ?? 4)
      );
    }
    return copy;
  }, [learners, sortBy]);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 bg-gray-100 dark:bg-gray-800 rounded" />
        ))}
      </div>
    );
  }

  if (learners.length === 0 || capabilityNames.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>No capability data available yet.</p>
        <p className="text-sm mt-1">
          Data will appear once Learners begin working on capabilities.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Sort by:</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="progress">Progress</SelectItem>
              <SelectItem value="risk">Risk Level</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(STATUS_COLORS).map(([status, { bg, label }]) => (
            <div key={status} className="flex items-center gap-1">
              <div className={`w-4 h-4 rounded-sm ${bg}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-background min-w-[160px]">
                Learner
              </TableHead>
              {capabilityNames.map((cap) => (
                <TableHead
                  key={cap.id}
                  className="text-center text-xs px-1 min-w-[60px] max-w-[80px]"
                  title={cap.name}
                >
                  <span className="truncate block">{cap.name}</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((learner) => (
              <TableRow key={learner.learner_id}>
                <TableCell className="sticky left-0 z-10 bg-background font-medium text-sm whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span>{learner.learner_name}</span>
                    {learner.risk_level && learner.risk_level !== 'on_track' && (
                      <Badge
                        variant="outline"
                        className={
                          learner.risk_level === 'critical'
                            ? 'bg-red-100 text-red-800 border-red-200 text-[10px] px-1'
                            : learner.risk_level === 'warning'
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-200 text-[10px] px-1'
                            : 'bg-orange-100 text-orange-800 border-orange-200 text-[10px] px-1'
                        }
                      >
                        {learner.risk_level}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                {capabilityNames.map((cap) => {
                  const entry = learner.capabilities[cap.id];
                  const status: CapabilityStatus = entry?.status || 'locked';
                  const { bg, label } = STATUS_COLORS[status];
                  return (
                    <TableCell key={cap.id} className="p-1 text-center">
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={`w-full h-6 rounded-sm cursor-default ${bg}`} />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-medium">{cap.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {learner.learner_name}: {label}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
