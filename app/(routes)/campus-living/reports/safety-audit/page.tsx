'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, Printer, Shield, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useExportReport } from '@/hooks/campus-living/use-campus-living-reports';

export default function SafetyAuditReportPage() {
  const { profile } = useAuth();
  const exportReport = useExportReport();
  const inspections = [
    { name: 'Fire Safety Audit', date: '2026-01-10', agency: 'District Fire Dept', score: 95, findings: 2, critical: 0, resolved: 2 },
    { name: 'Electrical Safety', date: '2025-11-20', agency: 'Internal Audit', score: 88, findings: 4, critical: 1, resolved: 4 },
    { name: 'Kitchen / FSSAI', date: '2025-12-15', agency: 'FSSAI Inspector', score: 91, findings: 3, critical: 0, resolved: 3 },
    { name: 'Water Quality', date: '2025-10-05', agency: 'External Lab', score: 96, findings: 1, critical: 0, resolved: 1 },
    { name: 'Structural Safety', date: '2025-08-10', agency: 'Structural Engineer', score: 93, findings: 2, critical: 0, resolved: 2 },
  ];

  const incidents = [
    { type: 'Fire / Fire Alarm', count: 2, critical: 0, resolved: 2 },
    { type: 'Medical', count: 5, critical: 1, resolved: 5 },
    { type: 'Theft', count: 3, critical: 0, resolved: 2 },
    { type: 'Ragging', count: 1, critical: 1, resolved: 1 },
    { type: 'Security Breach', count: 2, critical: 0, resolved: 1 },
  ];

  const overallScore = Math.round(inspections.reduce((sum, i) => sum + i.score, 0) / inspections.length);

  return (
    <ContentLayout title="Safety Audit Report">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Annual Safety Audit Report</h1>
            <p className="text-muted-foreground">Comprehensive safety audit for academic year 2025-26</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline"><Printer className="mr-2 h-4 w-4" />Print</Button>
            <Button
              variant="outline"
              disabled={exportReport.isPending}
              onClick={() => exportReport.mutate({
                institutionId: profile?.institution_id ?? '',
                reportType: 'safety',
                format: 'json',
              })}
            >
              {exportReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export
            </Button>
          </div>
        </div>

        {/* Overall Score */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Overall Safety Score</p>
              <p className={`text-3xl font-bold ${overallScore >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>{overallScore}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Inspections Completed</p>
              <p className="text-3xl font-bold">{inspections.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Total Incidents</p>
              <p className="text-3xl font-bold">{incidents.reduce((sum, i) => sum + i.count, 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Incident Resolution</p>
              <p className="text-3xl font-bold text-green-600">
                {Math.round((incidents.reduce((sum, i) => sum + i.resolved, 0) / incidents.reduce((sum, i) => sum + i.count, 0)) * 100)}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Inspections */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Inspection Results</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inspection</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Findings</TableHead>
                  <TableHead>Critical</TableHead>
                  <TableHead>Resolved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.map((insp) => (
                  <TableRow key={insp.name}>
                    <TableCell className="font-medium">{insp.name}</TableCell>
                    <TableCell>{insp.date}</TableCell>
                    <TableCell className="text-sm">{insp.agency}</TableCell>
                    <TableCell>
                      <Badge className={insp.score >= 90 ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'}>
                        {insp.score}%
                      </Badge>
                    </TableCell>
                    <TableCell>{insp.findings}</TableCell>
                    <TableCell>{insp.critical > 0 ? <span className="text-red-600 font-medium">{insp.critical}</span> : '0'}</TableCell>
                    <TableCell><CheckCircle2 className="h-4 w-4 text-green-600 inline" /> {insp.resolved}/{insp.findings}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Incident Summary */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Incident Summary</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Incident Type</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Critical</TableHead>
                  <TableHead>Resolved</TableHead>
                  <TableHead>Resolution Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((inc) => (
                  <TableRow key={inc.type}>
                    <TableCell className="font-medium">{inc.type}</TableCell>
                    <TableCell>{inc.count}</TableCell>
                    <TableCell>{inc.critical > 0 ? <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{inc.critical}</Badge> : '0'}</TableCell>
                    <TableCell>{inc.resolved}</TableCell>
                    <TableCell>
                      <Badge className={Math.round((inc.resolved / inc.count) * 100) === 100 ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'}>
                        {Math.round((inc.resolved / inc.count) * 100)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
