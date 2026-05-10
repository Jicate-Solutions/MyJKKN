'use client';

// Source Coverage analytics — per-source breakdown of total / assigned /
// unassigned / conversion. Used in the admission analytics page so admins
// can see at a glance which sources have backlogs and which are healthy.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Inbox,
  UserCheck,
  UserX,
  TrendingUp,
} from 'lucide-react';
import { SourceMasterService } from '@/lib/services/admission/source-master-service';

interface SourceCoverageDashboardProps {
  institutionId?: string;
}

export function SourceCoverageDashboard({
  institutionId,
}: SourceCoverageDashboardProps) {
  const { data: sources, isLoading } = useQuery({
    queryKey: ['admission-source-coverage', institutionId ?? 'all'],
    queryFn: () =>
      SourceMasterService.list({
        institution_id: institutionId ?? undefined,
        is_active: true,
      }),
  });

  // Sort by total leads desc — biggest sources first.
  const rows = useMemo(() => {
    const list = (sources ?? []).slice();
    list.sort((a, b) => (b.lead_count ?? 0) - (a.lead_count ?? 0));
    return list;
  }, [sources]);

  const aggregate = useMemo(() => {
    let total = 0,
      assigned = 0,
      unassigned = 0,
      sourcesWithBacklog = 0;
    for (const s of rows) {
      total += s.lead_count ?? 0;
      assigned += s.assigned_count ?? 0;
      unassigned += s.unassigned_count ?? 0;
      if ((s.unassigned_count ?? 0) > 0) sourcesWithBacklog += 1;
    }
    const assignedPct = total > 0 ? Math.round((assigned / total) * 100) : 0;
    const unassignedPct = total > 0 ? Math.round((unassigned / total) * 100) : 0;
    return {
      total,
      assigned,
      unassigned,
      sourcesWithBacklog,
      assignedPct,
      unassignedPct,
    };
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Source Coverage
        </CardTitle>
        <CardDescription>
          Per-source breakdown of total / assigned / unassigned leads (lifetime).
          Sorted by lead volume.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Aggregate KPI strip */}
        {!isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile
              icon={<Inbox className="h-4 w-4" />}
              label="Total leads"
              value={aggregate.total}
              tone="info"
            />
            <KpiTile
              icon={<UserCheck className="h-4 w-4" />}
              label="Assigned"
              value={aggregate.assigned}
              sublabel={
                aggregate.total > 0 ? `${aggregate.assignedPct}% of total` : undefined
              }
              tone="success"
            />
            <KpiTile
              icon={<UserX className="h-4 w-4" />}
              label="Unassigned"
              value={aggregate.unassigned}
              sublabel={
                aggregate.total > 0
                  ? `${aggregate.unassignedPct}% of total`
                  : undefined
              }
              tone={aggregate.unassigned > 0 ? 'danger' : 'muted'}
            />
            <KpiTile
              icon={<AlertCircle className="h-4 w-4" />}
              label="Sources with backlog"
              value={aggregate.sourcesWithBacklog}
              sublabel={`of ${rows.length} active`}
              tone={aggregate.sourcesWithBacklog > 0 ? 'danger' : 'success'}
            />
          </div>
        )}

        {/* Per-source table */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            No active sources found.
          </div>
        )}

        {!isLoading && rows.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="hidden md:table-cell">Routes To</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Unassigned</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">
                    Coverage
                  </TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const total = s.lead_count ?? 0;
                  const assigned = s.assigned_count ?? 0;
                  const unassigned = s.unassigned_count ?? 0;
                  const coverage = total > 0 ? Math.round((assigned / total) * 100) : 0;
                  const isBacklog = unassigned > 0 && (unassigned / Math.max(total, 1)) >= 0.25;

                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{s.label}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {s.key}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="font-mono text-xs">
                          {s.enum_value}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {total.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-green-700">
                        {assigned.toLocaleString()}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${unassigned > 0 ? 'text-orange-700 font-medium' : 'text-muted-foreground'}`}
                      >
                        {unassigned.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums hidden lg:table-cell">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-sm">{coverage}%</span>
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${
                                coverage >= 90
                                  ? 'bg-green-500'
                                  : coverage >= 50
                                    ? 'bg-blue-500'
                                    : 'bg-orange-500'
                              }`}
                              style={{ width: `${coverage}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {total === 0 ? (
                          <Badge variant="outline" className="text-muted-foreground gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                            Idle
                          </Badge>
                        ) : isBacklog ? (
                          <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200 gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Backlog
                          </Badge>
                        ) : unassigned === 0 ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            All clear
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-blue-700 border-blue-200 gap-1">
                            <TrendingUp className="h-3 w-3" />
                            Active
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// KpiTile — small aggregate KPI tile for the strip above the table.
// ----------------------------------------------------------------------------
type Tone = 'info' | 'success' | 'danger' | 'muted';

const TONE: Record<Tone, { card: string; iconBg: string; iconColor: string; valueColor: string }> = {
  info:    { card: 'border-blue-200/60',  iconBg: 'bg-blue-100',  iconColor: 'text-blue-600',  valueColor: 'text-blue-900' },
  success: { card: 'border-green-200/60', iconBg: 'bg-green-100', iconColor: 'text-green-600', valueColor: 'text-green-900' },
  danger:  { card: 'border-red-300 bg-red-50/40', iconBg: 'bg-red-100', iconColor: 'text-red-600', valueColor: 'text-red-900' },
  muted:   { card: 'border-muted', iconBg: 'bg-muted', iconColor: 'text-muted-foreground', valueColor: 'text-foreground/80' },
};

function KpiTile({
  icon,
  label,
  value,
  sublabel,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sublabel?: string;
  tone: Tone;
}) {
  const tw = TONE[tone];
  return (
    <Card className={tw.card}>
      <CardContent className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tw.iconBg} ${tw.iconColor}`}
          >
            {icon}
          </span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className={`mt-1 text-xl font-semibold tabular-nums ${tw.valueColor}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {sublabel && (
          <div className="text-[11px] text-muted-foreground tabular-nums">{sublabel}</div>
        )}
      </CardContent>
    </Card>
  );
}
