'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Download, Printer, Shield, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useSafetyAuditReport, useExportReport } from '@/hooks/campus-living/use-campus-living-reports';

export default function SafetyAuditReportPage() {
  const today = new Date().toISOString().split('T')[0];
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(oneYearAgo);
  const [dateTo, setDateTo] = useState(today);
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  const { data: report, isLoading, isError } = useSafetyAuditReport(institutionId, dateFrom, dateTo);
  const exportReport = useExportReport();

  const incidents = report?.incidents;
  const inspections = report?.inspections;
  const safetyMaintenance = report?.safety_maintenance;

  return (
    <ContentLayout title="Safety Audit Report">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Safety Audit Report</h1>
            <p className="text-muted-foreground">Incidents, inspections, and safety maintenance summary</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />Print
            </Button>
            <Button
              variant="outline"
              disabled={exportReport.isPending}
              onClick={() => exportReport.mutate({
                institutionId,
                reportType: 'safety',
                format: 'json',
                filters: { dateFrom, dateTo },
              })}
            >
              {exportReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export
            </Button>
          </div>
        </div>

        {/* Date Range Filter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[180px]" />
              <span className="text-muted-foreground">to</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[180px]" />
            </div>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">Failed to load safety audit data.</p>
          </div>
        )}

        {!isLoading && !isError && report && (
          <>
            {/* Overall Summary */}
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Avg Inspection Score</p>
                  <p className={`text-3xl font-bold ${(inspections?.average_score ?? 0) >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>
                    {inspections?.average_score ?? 0}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Inspections</p>
                  <p className="text-3xl font-bold">{inspections?.total ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Total Incidents</p>
                  <p className="text-3xl font-bold">{incidents?.total ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Incident Resolution</p>
                  <p className="text-3xl font-bold text-green-600">
                    {(incidents?.total ?? 0) > 0
                      ? Math.round(((incidents?.resolved ?? 0) / incidents!.total) * 100)
                      : 0}%
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Incidents by Severity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Incidents by Severity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Critical</p>
                    <p className="text-xl font-bold text-red-600">{incidents?.by_severity?.critical ?? 0}</p>
                  </div>
                  <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Major</p>
                    <p className="text-xl font-bold text-orange-600">{incidents?.by_severity?.major ?? 0}</p>
                  </div>
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Moderate</p>
                    <p className="text-xl font-bold text-yellow-600">{incidents?.by_severity?.moderate ?? 0}</p>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Minor</p>
                    <p className="text-xl font-bold text-blue-600">{incidents?.by_severity?.minor ?? 0}</p>
                  </div>
                </div>

                {/* By Type */}
                {incidents?.by_type && Object.keys(incidents.by_type).length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">By Type</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(incidents.by_type).map(([type, count]) => (
                        <Badge key={type} variant="outline" className="capitalize">
                          {type.replace(/_/g, ' ')}: {count as number}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex gap-4">
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Resolved: {incidents?.resolved ?? 0}
                  </Badge>
                  <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                    Open: {incidents?.open ?? 0}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Inspections Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Inspections Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Total Inspections</p>
                    <p className="text-xl font-bold">{inspections?.total ?? 0}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Avg Score</p>
                    <p className="text-xl font-bold">{inspections?.average_score ?? 0}%</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Pending Follow-ups</p>
                    <p className="text-xl font-bold text-yellow-600">{inspections?.pending_follow_ups ?? 0}</p>
                  </div>
                </div>

                {inspections?.by_type && Object.keys(inspections.by_type).length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">By Inspection Type</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(inspections.by_type).map(([type, count]) => (
                        <Badge key={type} variant="outline" className="capitalize">
                          {type.replace(/_/g, ' ')}: {count as number}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Safety Maintenance */}
            {safetyMaintenance && (safetyMaintenance.total > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>Safety-Related Maintenance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground">Total Requests</p>
                      <p className="text-xl font-bold">{safetyMaintenance.total}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground">Resolved</p>
                      <p className="text-xl font-bold text-green-600">{safetyMaintenance.resolved}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground">Pending</p>
                      <p className="text-xl font-bold text-yellow-600">{safetyMaintenance.pending}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}
