'use client';

import Link from 'next/link';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, ArrowLeft, Shield, FileText, AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useExportReport } from '@/hooks/campus-living/use-campus-living-reports';

export default function AntiRaggingComplianceReportPage() {
  const { profile } = useAuth();
  const exportReport = useExportReport();
  const summaryStats = [
    { label: 'Total Complaints', value: '3', icon: AlertTriangle, color: 'text-orange-600' },
    { label: 'Resolved', value: '2', icon: CheckCircle2, color: 'text-green-600' },
    { label: 'Pending', value: '1', icon: Clock, color: 'text-yellow-600' },
    { label: 'Committee Meetings', value: '6', icon: Shield, color: 'text-blue-600' },
  ];

  const incidentData = [
    { id: 'AR-2026-001', date: '2026-01-15', type: 'Verbal Harassment', reportedBy: 'Anonymous', block: 'Block A', status: 'Resolved', actionTaken: 'Warning issued to accused. Counseling completed.', resolvedOn: '2026-01-20' },
    { id: 'AR-2026-002', date: '2026-02-03', type: 'Ragging Complaint', reportedBy: 'Student (Confidential)', block: 'Block B', status: 'Resolved', actionTaken: 'Disciplinary committee hearing. 2 students suspended for 1 week.', resolvedOn: '2026-02-10' },
    { id: 'AR-2026-003', date: '2026-02-18', type: 'Intimidation', reportedBy: 'Warden Report', block: 'Block A', status: 'Under Investigation', actionTaken: 'Committee inquiry initiated. Preliminary statements collected.', resolvedOn: '--' },
  ];

  const committeeMeetings = [
    { date: '2026-01-05', type: 'Quarterly Review', attendees: 8, minutes: 'Reviewed zero-tolerance policy. Updated helpline numbers.' },
    { date: '2026-01-20', type: 'Incident Review', attendees: 6, minutes: 'Reviewed AR-2026-001. Warning issued. Sensitivity training scheduled.' },
    { date: '2026-02-01', type: 'Monthly Review', attendees: 7, minutes: 'Awareness campaign planned. Mentor-mentee pairings updated.' },
    { date: '2026-02-10', type: 'Incident Review', attendees: 8, minutes: 'Reviewed AR-2026-002. Suspension recommended. Parents notified.' },
    { date: '2026-02-15', type: 'Awareness Drive', attendees: 5, minutes: 'Anti-ragging week planned. Poster campaign approved.' },
    { date: '2026-02-20', type: 'Incident Review', attendees: 7, minutes: 'AR-2026-003 investigation progress review. Witness interviews ongoing.' },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Resolved':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Resolved</Badge>;
      case 'Under Investigation':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Under Investigation</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <ContentLayout title="Anti-Ragging Compliance Report">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Link href="/campus-living/reports">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Anti-Ragging Compliance Report</h1>
              <p className="text-muted-foreground">UGC/AICTE regulatory compliance report for anti-ragging measures</p>
            </div>
          </div>
          <Button
            disabled={exportReport.isPending}
            onClick={() => exportReport.mutate({
              institutionId: profile?.institution_id ?? '',
              reportType: 'anti-ragging',
              format: 'json',
              filters: { academicYearId: '2025-26' },
            })}
          >
            {exportReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Generate Report
          </Button>
        </div>

        {/* Academic Year Selector */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <Select defaultValue="2025-26">
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Academic Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025-26">2025-26</SelectItem>
                  <SelectItem value="2024-25">2024-25</SelectItem>
                  <SelectItem value="2023-24">2023-24</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline" className="text-xs">
                <FileText className="mr-1 h-3 w-3" />
                UGC Regulation 2009 Compliant Format
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryStats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="rounded-lg bg-primary/10 p-2">
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Incident Log */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Incident Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Incident ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reported By</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resolved On</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidentData.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">{row.id}</TableCell>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="font-medium">{row.type}</TableCell>
                    <TableCell>{row.reportedBy}</TableCell>
                    <TableCell>{row.block}</TableCell>
                    <TableCell>{getStatusBadge(row.status)}</TableCell>
                    <TableCell>{row.resolvedOn}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Committee Meetings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Anti-Ragging Committee Meetings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Meeting Type</TableHead>
                  <TableHead className="text-center">Attendees</TableHead>
                  <TableHead>Key Minutes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {committeeMeetings.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.type}</Badge>
                    </TableCell>
                    <TableCell className="text-center">{row.attendees}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-md">{row.minutes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Compliance Checklist */}
        <Card>
          <CardHeader>
            <CardTitle>UGC Compliance Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { item: 'Anti-Ragging Committee constituted', done: true },
                { item: 'Anti-Ragging Squad formed', done: true },
                { item: 'Undertaking from students collected', done: true },
                { item: 'Undertaking from parents collected', done: true },
                { item: 'Helpline numbers displayed prominently', done: true },
                { item: 'Annual report submitted to UGC', done: false },
                { item: 'Awareness programs conducted (min 2/semester)', done: true },
                { item: 'Mentor-mentee program active', done: true },
              ].map((check, idx) => (
                <div key={idx} className="flex items-center gap-3 py-1">
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center text-xs ${check.done ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {check.done ? '\u2713' : '!'}
                  </div>
                  <span className={`text-sm ${check.done ? '' : 'text-yellow-700 font-medium'}`}>{check.item}</span>
                  {!check.done && <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-xs">Pending</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
