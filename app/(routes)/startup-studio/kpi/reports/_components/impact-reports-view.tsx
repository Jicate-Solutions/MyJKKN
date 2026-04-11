'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  FileText,
  PlusCircle,
  AlertCircle,
  Calendar,
  Users,
  ArrowLeft,
} from 'lucide-react';
import { useImpactReports, useCreateImpactReport } from '@/hooks/startup-studio/use-kpi';
import { toast } from 'sonner';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────

interface ImpactReportData {
  id: string;
  report_title: string;
  report_type: string;
  target_audience: string;
  period_start: string | null;
  period_end: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
}

// ── Constants ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  review: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  published: 'bg-emerald-100 text-emerald-700',
};

const TYPE_LABELS: Record<string, string> = {
  annual_report: 'Annual Report',
  quarterly_report: 'Quarterly Report',
  funder_specific: 'Funder Specific',
  nirf_submission: 'NIRF Submission',
  custom: 'Custom',
};

const AUDIENCE_LABELS: Record<string, string> = {
  funders: 'Funders',
  board: 'Board',
  startups: 'Startups',
  policymakers: 'Policymakers',
  public: 'Public',
  custom: 'Custom',
};

const STATUS_FILTERS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'published', label: 'Published' },
];

// ── Create Report Dialog ─────────────────────────────────────────────

function CreateReportDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [reportType, setReportType] = useState('');
  const [audience, setAudience] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const createMutation = useCreateImpactReport();

  const handleSubmit = () => {
    if (!title || !reportType || !audience) {
      toast.error('Please fill in all required fields');
      return;
    }

    createMutation.mutate(
      {
        report_title: title,
        report_type: reportType,
        target_audience: audience,
        period_start: periodStart || undefined,
        period_end: periodEnd || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Impact report created');
          setOpen(false);
          setTitle('');
          setReportType('');
          setAudience('');
          setPeriodStart('');
          setPeriodEnd('');
        },
        onError: (err: any) => {
          toast.error(err?.message || 'Failed to create report');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusCircle className="h-4 w-4 mr-2" />
          Create Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Impact Report</DialogTitle>
          <DialogDescription>
            Create a new impact report for stakeholders
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="report_title">Title *</Label>
            <Input
              id="report_title"
              placeholder="e.g. Q1 2026 Incubation Impact Report"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="report_type">Report Type *</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger id="report_type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target_audience">Audience *</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger id="target_audience">
                  <SelectValue placeholder="Select audience" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="report_period_start">Period Start</Label>
              <Input
                id="report_period_start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report_period_end">Period End</Label>
              <Input
                id="report_period_end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Loading Skeleton ─────────────────────────────────────────────────

function ReportsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Card>
        <CardContent className="pt-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b last:border-0">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main View ────────────────────────────────────────────────────────

export function ImpactReportsView() {
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, isLoading, error } = useImpactReports(
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  );

  if (isLoading) return <ReportsSkeleton />;

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Failed to load impact reports</p>
        </CardContent>
      </Card>
    );
  }

  const reports = (data || []) as ImpactReportData[];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/startup-studio/kpi">
              <ArrowLeft className="h-4 w-4 mr-1" />KPI Dashboard
            </Link>
          </Button>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CreateReportDialog />
      </div>

      {/* Reports Table */}
      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No impact reports found</p>
            <p className="text-xs text-muted-foreground mt-1">Create your first report to get started</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium max-w-[300px]">
                        <span className="truncate block">{report.report_title}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {TYPE_LABELS[report.report_type] || report.report_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">
                            {AUDIENCE_LABELS[report.target_audience] || report.target_audience}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {report.period_start && report.period_end ? (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(report.period_start).toLocaleDateString()} -{' '}
                            {new Date(report.period_end).toLocaleDateString()}
                          </div>
                        ) : (
                          '--'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs capitalize ${STATUS_COLORS[report.status] || ''}`}
                        >
                          {report.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(report.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
