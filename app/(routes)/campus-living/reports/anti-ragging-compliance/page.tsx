'use client';

import Link from 'next/link';
import { useState, useMemo } from 'react';
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
import {
  Download,
  ArrowLeft,
  Shield,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useExportReport } from '@/hooks/campus-living/use-campus-living-reports';
import { useAntiRaggingAffidavits } from '@/hooks/campus-living/use-anti-ragging';

// Row shape mirrors the public.anti_ragging_affidavits table.
// Kept local to avoid touching shared types from inside /reports scope (parallel type-debt PR running).
type AffidavitRow = {
  id: string;
  learner_id: string;
  academic_year_id: string;
  institution_id: string;
  student_affidavit_submitted: boolean | null;
  student_affidavit_date: string | null;
  student_affidavit_url: string | null;
  parent_affidavit_submitted: boolean | null;
  parent_affidavit_date: string | null;
  parent_affidavit_url: string | null;
  status: 'pending' | 'partial' | 'complete' | 'verified';
  verified_by: string | null;
  verified_at: string | null;
  created_at: string | null;
};

export default function AntiRaggingComplianceReportPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  const exportReport = useExportReport();
  const [academicYear, setAcademicYear] = useState('2025-26');

  const { data: result, isLoading, error } = useAntiRaggingAffidavits(institutionId, {
    academic_year_id: academicYear,
  });
  const rows = (result?.data ?? []) as AffidavitRow[];

  // Derived compliance metrics — same pattern the sister /safety/anti-ragging page uses.
  const total = rows.length;
  const verifiedCount = rows.filter((r) => r.status === 'verified').length;
  const completeCount = rows.filter((r) => r.status === 'complete').length;
  const partialCount = rows.filter((r) => r.status === 'partial').length;
  const pendingCount = rows.filter((r) => r.status === 'pending').length;
  const studentSubmitted = rows.filter((r) => r.student_affidavit_submitted).length;
  const parentSubmitted = rows.filter((r) => r.parent_affidavit_submitted).length;
  const compliancePct =
    total > 0
      ? Math.round(((verifiedCount + completeCount) / total) * 100)
      : 0;

  const summaryStats = [
    {
      label: 'Total Affidavits',
      value: String(total),
      icon: FileText,
      color: 'text-blue-600',
    },
    {
      label: 'Verified',
      value: String(verifiedCount),
      icon: CheckCircle2,
      color: 'text-green-600',
    },
    {
      label: 'Pending Submission',
      value: String(pendingCount + partialCount),
      icon: Clock,
      color: 'text-yellow-600',
    },
    {
      label: 'Compliance Rate',
      value: `${compliancePct}%`,
      icon: Shield,
      color: 'text-emerald-600',
    },
  ];

  const recentAffidavits = useMemo(() => rows.slice(0, 25), [rows]);

  const getAffidavitStatusBadge = (status: AffidavitRow['status']) => {
    switch (status) {
      case 'verified':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            Verified
          </Badge>
        );
      case 'complete':
        return (
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
            Complete
          </Badge>
        );
      case 'partial':
        return (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            Partial
          </Badge>
        );
      case 'pending':
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title="Anti-Ragging Compliance Report">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Anti-Ragging Compliance Report">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Link href="/campus-living/reports">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Anti-Ragging Compliance Report</h1>
              <p className="text-muted-foreground">
                UGC/AICTE regulatory compliance report — live affidavit submission status
              </p>
            </div>
          </div>
          <Button
            disabled={exportReport.isPending}
            onClick={() =>
              exportReport.mutate({
                institutionId,
                reportType: 'anti-ragging',
                format: 'json',
                filters: { academicYearId: academicYear },
              })
            }
          >
            {exportReport.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Generate Report
          </Button>
        </div>

        {error ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">
              Failed to load affidavits:{' '}
              {error instanceof Error ? error.message : 'unknown error'}
            </CardContent>
          </Card>
        ) : null}

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

        {/* Submission Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Submission Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Student affidavit submitted</p>
                <p className="text-xl font-semibold">
                  {studentSubmitted} <span className="text-sm text-muted-foreground">/ {total}</span>
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Parent affidavit submitted</p>
                <p className="text-xl font-semibold">
                  {parentSubmitted} <span className="text-sm text-muted-foreground">/ {total}</span>
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Awaiting committee verification</p>
                <p className="text-xl font-semibold text-blue-600">{completeCount}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Partial / one of two missing</p>
                <p className="text-xl font-semibold text-amber-600">{partialCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent affidavit records */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Affidavit Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentAffidavits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ShieldAlert className="h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 font-medium">No affidavit records found</p>
                <p className="mt-1 text-sm text-muted-foreground max-w-md">
                  No anti-ragging affidavits have been recorded for academic year{' '}
                  {academicYear}. Records will appear here once student and parent
                  affidavits are submitted.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Affidavit ID</TableHead>
                    <TableHead>Learner</TableHead>
                    <TableHead>Student Affidavit</TableHead>
                    <TableHead>Parent Affidavit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Verified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentAffidavits.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        {row.id.slice(0, 8)}…
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.learner_id.slice(0, 8)}…
                      </TableCell>
                      <TableCell>
                        {row.student_affidavit_submitted ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            {row.student_affidavit_date ?? 'submitted'}
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                            <XCircle className="mr-1 h-3 w-3" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.parent_affidavit_submitted ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            {row.parent_affidavit_date ?? 'submitted'}
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                            <XCircle className="mr-1 h-3 w-3" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{getAffidavitStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.verified_at
                          ? new Date(row.verified_at).toLocaleDateString()
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
