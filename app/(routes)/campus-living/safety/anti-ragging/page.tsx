'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Shield,
  Search,
  Download,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useAntiRaggingAffidavits } from '@/hooks/campus-living/use-anti-ragging';

// Row shape mirrors the public.anti_ragging_affidavits table.
// We keep this local to the page to avoid touching shared types from inside /safety scope.
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

type StatusFilter = 'all' | 'verified' | 'complete' | 'partial' | 'pending';

export default function AntiRaggingPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: result, isLoading, error } = useAntiRaggingAffidavits(institutionId);
  const rows = (result?.data ?? []) as AffidavitRow[];

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchesSearch =
        searchQuery === '' ||
        r.learner_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, searchQuery, statusFilter]);

  const total = rows.length;
  const fullySubmitted = rows.filter(
    (r) => r.student_affidavit_submitted && r.parent_affidavit_submitted
  ).length;
  const partial = rows.filter(
    (r) =>
      Boolean(r.student_affidavit_submitted) !== Boolean(r.parent_affidavit_submitted)
  ).length;
  const notSubmitted = total - fullySubmitted - partial;
  const verifiedCount = rows.filter((r) => r.status === 'verified').length;
  const compliancePct =
    total > 0
      ? Math.round(
          (rows.filter((r) => r.status === 'verified' || r.status === 'complete').length /
            total) *
            100
        )
      : 0;

  if (isLoading) {
    return (
      <ContentLayout title="Anti-Ragging Compliance">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Anti-Ragging Compliance">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Anti-Ragging Affidavit Tracker</h1>
            <p className="text-muted-foreground">
              UGC Regulations 2009 — student & parent affidavit submission and verification
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                toast.info('Reminder sender ships next.', {
                  description:
                    'Will send affidavit-pending reminders to students/parents once notification engine is wired.',
                })
              }
            >
              <Send className="mr-2 h-4 w-4" />
              Send Reminders
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast.info('Report export ships next.', {
                  description:
                    'CSV / PDF export of affidavit status will be available once the report endpoint is live.',
                })
              }
            >
              <Download className="mr-2 h-4 w-4" />
              Export Report
            </Button>
          </div>
        </div>

        {error ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">
              Failed to load affidavits: {error instanceof Error ? error.message : 'unknown error'}
            </CardContent>
          </Card>
        ) : null}

        {/* Summary */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Affidavits</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{total}</div>
              <p className="text-xs text-muted-foreground">
                {compliancePct}% compliant
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Verified</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{verifiedCount}</div>
              <p className="text-xs text-muted-foreground">committee-verified</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Partial</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{partial}</div>
              <p className="text-xs text-muted-foreground">one of two missing</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Not Submitted</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{notSubmitted}</div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by learner ID or affidavit ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="complete">Complete (awaiting verify)</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ShieldAlert className="h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 font-medium">No affidavit records found</p>
                <p className="mt-1 text-sm text-muted-foreground max-w-md">
                  {total === 0
                    ? 'No anti-ragging affidavits have been recorded for this institution yet. Records will appear here once student and parent affidavits are submitted.'
                    : 'No records match the current filters. Adjust the search or status filter.'}
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
                  {filtered.map((row) => (
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
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
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

function StatusBadge({ status }: { status: AffidavitRow['status'] }) {
  switch (status) {
    case 'verified':
      return (
        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Verified</Badge>
      );
    case 'complete':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Complete</Badge>;
    case 'partial':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Partial</Badge>;
    case 'pending':
    default:
      return <Badge variant="secondary">Pending</Badge>;
  }
}
