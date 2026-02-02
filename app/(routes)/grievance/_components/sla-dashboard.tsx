'use client';

/**
 * SLA Dashboard Component
 * F004: Grievance Ticketing System
 *
 * Visual dashboard for SLA metrics and compliance monitoring
 */

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, CheckCircle2, TrendingUp, Clock, AlertTriangle } from 'lucide-react';
import { SLABadge } from '@/components/grievance/sla-badge';
import { PriorityBadge } from '@/components/grievance/priority-badge';
import type { GrievanceSLAReport } from '@/types/grievance';
import { useGrievanceTickets } from '@/hooks/grievance/use-grievance-tickets';
import { formatDistanceToNow } from 'date-fns';

interface SLADashboardProps {
  report: GrievanceSLAReport;
  institutionId: string;
}

export function SLADashboard({ report, institutionId }: SLADashboardProps) {
  // Fetch breached tickets
  const { data: breachedTickets } = useGrievanceTickets({
    institution_id: institutionId,
    sla_status: 'breached',
    limit: 10
  });

  // Calculate SLA compliance rate
  const complianceRate = report.sla_compliance_rate;
  const breachedCount = report.breached;
  const resolvedWithinSLA = report.resolved_within_sla;

  // Traffic light colors
  const getComplianceColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600';
    if (rate >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Traffic Light Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              On Track
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <div className="text-3xl font-bold">
                  {Object.values(report.by_status).reduce((a, b) => a + b, 0) -
                    (report.by_status.resolved || 0) -
                    (report.by_status.closed || 0)}
                </div>
                <p className="text-xs text-muted-foreground">Active tickets on track</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              At Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
              <div>
                <div className="text-3xl font-bold">
                  {/* At risk count would need separate query */}
                  -
                </div>
                <p className="text-xs text-muted-foreground">Approaching deadline</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Breached
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-8 w-8 text-red-600" />
              <div>
                <div className="text-3xl font-bold">{breachedCount}</div>
                <p className="text-xs text-muted-foreground">SLA deadline missed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SLA Compliance Rate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            SLA Compliance Rate
          </CardTitle>
          <CardDescription>Overall service level agreement performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Compliance</span>
                <span className={`text-2xl font-bold ${getComplianceColor(complianceRate)}`}>
                  {complianceRate.toFixed(1)}%
                </span>
              </div>
              <Progress value={complianceRate} className="h-3" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Resolved Within SLA</div>
                <div className="text-2xl font-bold text-green-600">{resolvedWithinSLA}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Average Resolution Time</div>
                <div className="text-2xl font-bold">{report.avg_resolution_hours.toFixed(1)}h</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SLA by Priority */}
      <Card>
        <CardHeader>
          <CardTitle>SLA Compliance by Priority</CardTitle>
          <CardDescription>Breakdown of SLA performance across priority levels</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priority</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Within SLA</TableHead>
                <TableHead>Breached</TableHead>
                <TableHead>Compliance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(report.by_priority).map(([priority, stats]) => {
                const compliance =
                  stats.total > 0 ? ((stats.within_sla / stats.total) * 100).toFixed(1) : '0.0';
                return (
                  <TableRow key={priority}>
                    <TableCell>
                      <PriorityBadge priority={priority as any} />
                    </TableCell>
                    <TableCell className="font-medium">{stats.total}</TableCell>
                    <TableCell className="text-green-600">{stats.within_sla}</TableCell>
                    <TableCell className="text-red-600">{stats.breached}</TableCell>
                    <TableCell>
                      <span className={getComplianceColor(parseFloat(compliance))}>
                        {compliance}%
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Breached Tickets List */}
      {breachedTickets && breachedTickets.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Breached Tickets (Urgent Action Required)
            </CardTitle>
            <CardDescription>Tickets that have exceeded their SLA deadline</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket #</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Overdue</TableHead>
                  <TableHead>Assigned To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breachedTickets.data.map((ticket) => {
                  const overdueDuration = formatDistanceToNow(new Date(ticket.sla_deadline), {
                    addSuffix: false
                  });
                  return (
                    <TableRow key={ticket.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono text-sm">{ticket.ticket_number}</TableCell>
                      <TableCell className="font-medium">{ticket.subject}</TableCell>
                      <TableCell>
                        <PriorityBadge priority={ticket.priority} />
                      </TableCell>
                      <TableCell className="text-red-600 font-medium">
                        {overdueDuration}
                      </TableCell>
                      <TableCell>
                        {ticket.assignee ? (
                          <span className="text-sm">{ticket.assignee.full_name}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">Unassigned</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
