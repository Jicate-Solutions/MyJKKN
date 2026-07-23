'use client';

import { useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Download,
  Printer,
  Shield,
  AlertTriangle,
  Loader2,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useExportReport,
  useSafetyAuditReport,
} from '@/hooks/campus-living/use-campus-living-reports';
import { PreviewBanner } from '../../_components/preview-banner';

// Shape of generateSafetyAuditReport — bucketed counts only (no row IDs leaked).
type SafetyAuditReport = {
  report_type: 'safety_audit';
  generated_at: string;
  period: { from: string; to: string };
  incidents: {
    total: number;
    by_type: Record<string, number>;
    by_severity: { critical: number; major: number; moderate: number; minor: number };
    resolved: number;
    open: number;
  };
  inspections: {
    total: number;
    by_type: Record<string, number>;
    average_score: number;
    pending_follow_ups: number;
  };
  safety_maintenance: { total: number; resolved: number; pending: number };
};

const todayIso = () => new Date().toISOString().split('T')[0];
const daysAgoIso = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

export default function SafetyAuditReportPage() {
  const [dateFrom, setDateFrom] = useState(daysAgoIso(365));
  const [dateTo, setDateTo] = useState(todayIso());
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  const exportReport = useExportReport();
  const { data: report, isLoading, error } = useSafetyAuditReport(
    institutionId,
    dateFrom,
    dateTo,
  );

  const r = report as SafetyAuditReport | undefined;

  const incidentRows = useMemo(() => {
    if (!r?.incidents?.by_type) return [];
    return Object.entries(r.incidents.by_type).map(([type, count]) => ({
      type,
      count,
    }));
  }, [r]);

  const inspectionRows = useMemo(() => {
    if (!r?.inspections?.by_type) return [];
    return Object.entries(r.inspections.by_type).map(([type, count]) => ({
      type,
      count,
    }));
  }, [r]);

  const incidentResolutionPct =
    r?.incidents.total && r.incidents.total > 0
      ? Math.round((r.incidents.resolved / r.incidents.total) * 100)
      : 0;

  if (isLoading) {
    return (
      <ContentLayout title="Safety Audit Report">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Safety Audit Report">
      <div className="space-y-6">
        <PreviewBanner
          feature="safety audit report"
          note="The on-screen counts and resolution rates now read live from hostel_incidents, hostel_inspections, and safety-category maintenance requests. Print is a placeholder."
        />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Safety Audit Report</h1>
            <p className="text-muted-foreground">
              Incidents, inspections, and safety maintenance over the selected period
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />Print
            </Button>
            <Button
              variant="outline"
              disabled={exportReport.isPending}
              onClick={() =>
                exportReport.mutate({
                  institutionId,
                  reportType: 'safety',
                  format: 'json',
                  filters: { dateFrom, dateTo },
                })
              }
            >
              {exportReport.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export
            </Button>
          </div>
        </div>

        {error ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">
              Failed to load safety audit data:{' '}
              {error instanceof Error ? error.message : 'unknown error'}
            </CardContent>
          </Card>
        ) : null}

        {/* Date range filter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">From</p>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[180px]"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">To</p>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[180px]"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Inspection Avg Score</p>
              <p
                className={`text-3xl font-bold ${
                  (r?.inspections.average_score ?? 0) >= 90
                    ? 'text-green-600'
                    : 'text-yellow-600'
                }`}
              >
                {r?.inspections.average_score ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Inspections Completed</p>
              <p className="text-3xl font-bold">{r?.inspections.total ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Total Incidents</p>
              <p className="text-3xl font-bold">{r?.incidents.total ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Incident Resolution</p>
              <p className="text-3xl font-bold text-green-600">{incidentResolutionPct}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Severity Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Incident Severity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Critical</p>
                <p className="text-2xl font-bold text-red-600">
                  {r?.incidents.by_severity.critical ?? 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Major</p>
                <p className="text-2xl font-bold text-orange-600">
                  {r?.incidents.by_severity.major ?? 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Moderate</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {r?.incidents.by_severity.moderate ?? 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Minor</p>
                <p className="text-2xl font-bold text-blue-600">
                  {r?.incidents.by_severity.minor ?? 0}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2 text-sm">
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                Resolved: {r?.incidents.resolved ?? 0}
              </Badge>
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                Open: {r?.incidents.open ?? 0}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Inspections by type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />Inspections by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {inspectionRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Shield className="h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 font-medium">No inspections in this range</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No hostel inspections were logged between {dateFrom} and {dateTo}.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Inspection Type</TableHead>
                    <TableHead className="text-center">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspectionRows.map((row) => (
                    <TableRow key={row.type}>
                      <TableCell className="font-medium capitalize">{row.type}</TableCell>
                      <TableCell className="text-center">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="mt-3 text-sm text-muted-foreground">
              Pending follow-ups:{' '}
              <span className="font-medium text-foreground">
                {r?.inspections.pending_follow_ups ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Incidents by type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />Incidents by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {incidentRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertTriangle className="h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 font-medium">No incidents in this range</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No hostel incidents were recorded between {dateFrom} and {dateTo}.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Incident Type</TableHead>
                    <TableHead className="text-center">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidentRows.map((row) => (
                    <TableRow key={row.type}>
                      <TableCell className="font-medium capitalize">{row.type}</TableCell>
                      <TableCell className="text-center">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Safety-category maintenance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />Safety Maintenance Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{r?.safety_maintenance.total ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Resolved</p>
                <p className="text-2xl font-bold text-green-600">
                  {r?.safety_maintenance.resolved ?? 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-amber-600">
                  {r?.safety_maintenance.pending ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
