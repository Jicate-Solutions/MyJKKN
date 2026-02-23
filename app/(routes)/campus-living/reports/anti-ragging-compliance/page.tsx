'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, ArrowLeft, Shield, FileText, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAntiRaggingComplianceReport, useExportReport } from '@/hooks/campus-living/use-campus-living-reports';

export default function AntiRaggingComplianceReportPage() {
  const [academicYear, setAcademicYear] = useState('2025-26');
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  const { data: report, isLoading, isError } = useAntiRaggingComplianceReport(institutionId, academicYear);
  const exportReport = useExportReport();

  const status = report?.status_breakdown;

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
              <p className="text-muted-foreground">UGC/AICTE regulatory compliance — affidavit submission tracking</p>
            </div>
          </div>
          <Button
            disabled={exportReport.isPending}
            onClick={() => exportReport.mutate({
              institutionId,
              reportType: 'anti-ragging',
              format: 'json',
              filters: { academicYearId: academicYear },
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
              <Select value={academicYear} onValueChange={setAcademicYear}>
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

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">Failed to load compliance data.</p>
          </div>
        )}

        {!isLoading && !isError && report && (
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Students</p>
                    <p className="text-2xl font-bold">{report.total_students}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Compliance Rate</p>
                    <p className="text-2xl font-bold">{report.compliance_percentage}%</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Non-Compliant</p>
                    <p className="text-2xl font-bold">{report.non_compliant?.length ?? 0}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Shield className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Both Submitted</p>
                    <p className="text-2xl font-bold">{report.both_submitted}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Affidavit Status Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Affidavit Status Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Verified</p>
                    <p className="text-xl font-bold text-green-600">{status?.verified ?? 0}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Complete</p>
                    <p className="text-xl font-bold text-blue-600">{status?.complete ?? 0}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Partial</p>
                    <p className="text-xl font-bold text-yellow-600">{status?.partial ?? 0}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className="text-xl font-bold text-red-600">{status?.pending ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Submission Details */}
            <Card>
              <CardHeader>
                <CardTitle>Affidavit Submission Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">Student Affidavit Submitted</p>
                    <p className="text-3xl font-bold mt-1">{report.student_affidavit_submitted}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      of {report.total_students} ({report.total_students > 0 ? Math.round((report.student_affidavit_submitted / report.total_students) * 100) : 0}%)
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">Parent Affidavit Submitted</p>
                    <p className="text-3xl font-bold mt-1">{report.parent_affidavit_submitted}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      of {report.total_students} ({report.total_students > 0 ? Math.round((report.parent_affidavit_submitted / report.total_students) * 100) : 0}%)
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">Both Submitted</p>
                    <p className="text-3xl font-bold mt-1 text-green-600">{report.both_submitted}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      of {report.total_students} ({report.total_students > 0 ? Math.round((report.both_submitted / report.total_students) * 100) : 0}%)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* UGC Compliance Checklist */}
            <Card>
              <CardHeader>
                <CardTitle>UGC Compliance Checklist</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { item: 'Anti-Ragging Committee constituted', done: true },
                    { item: 'Anti-Ragging Squad formed', done: true },
                    { item: 'Undertaking from students collected', done: (report.student_affidavit_submitted ?? 0) > 0 },
                    { item: 'Undertaking from parents collected', done: (report.parent_affidavit_submitted ?? 0) > 0 },
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
          </>
        )}
      </div>
    </ContentLayout>
  );
}
