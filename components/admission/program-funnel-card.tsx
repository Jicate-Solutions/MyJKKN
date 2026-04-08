'use client';

// components/admission/program-funnel-card.tsx
// Card showing college/program funnel: inquiries → contacted → applied → enrolled.
// Sorted by total inquiry volume descending. Mobile-first compact layout.

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, RefreshCw, BarChart3, GraduationCap, Building2 } from 'lucide-react';
import { useProgramFunnel } from '@/hooks/admission/use-program-funnel';
import type { ProgramFunnelRow } from '@/hooks/admission/use-program-funnel';

// ── Single row ────────────────────────────────────────────────────────────────

function ProgramFunnelRowItem({ row, max }: { row: ProgramFunnelRow; max: number }) {
  const barWidth = max > 0 ? Math.max((row.total / max) * 100, 4) : 4;
  const conversionColor =
    row.conversion_rate >= 20
      ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
      : row.conversion_rate >= 10
      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';

  return (
    <div className="space-y-1.5 py-3 border-b last:border-0">
      {/* Name row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm leading-tight truncate">{row.name}</p>
          <p className="text-xs text-muted-foreground truncate">{row.institution}</p>
        </div>
        <Badge className={`shrink-0 text-xs font-semibold ${conversionColor}`}>
          {row.conversion_rate}% conv
        </Badge>
      </div>

      {/* Volume bar */}
      <div className="h-6 bg-muted rounded overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded transition-all duration-500 flex items-center justify-end pr-2"
          style={{ width: `${barWidth}%` }}
        >
          {barWidth > 25 && (
            <span className="text-white text-xs font-medium">{row.total}</span>
          )}
        </div>
      </div>

      {/* Stage counts — flex-wrap for mobile */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
          {row.total} inquiries
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" />
          {row.contacted} contacted
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-orange-500" />
          {row.applied} applied
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          {row.enrolled} enrolled
        </span>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface ProgramFunnelCardProps {
  institutionId?: string;
}

export function ProgramFunnelCard({ institutionId }: ProgramFunnelCardProps) {
  const { programs, groupBy, isLoading, error, refetch } = useProgramFunnel(institutionId);

  const maxTotal = programs.length > 0 ? Math.max(...programs.map((p) => p.total)) : 1;
  const Icon = groupBy === 'program' ? GraduationCap : Building2;
  const title = groupBy === 'program' ? 'Program Funnel' : 'College Funnel';
  const description =
    groupBy === 'program'
      ? 'Inquiries vs conversion by program — sorted by volume'
      : 'Inquiries vs conversion by college';

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
            <p className="text-sm">Failed to load program data</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (programs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No program data available yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Icon className="h-5 w-5" />
              {title}
            </CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh" aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div>
          {programs.map((row) => (
            <ProgramFunnelRowItem
              key={`${row.name}::${row.institution}`}
              row={row}
              max={maxTotal}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
