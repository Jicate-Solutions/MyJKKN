'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  FileText,
  Download,
  Trash2,
  Eye,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useConsolidationReports,
  useDeleteConsolidationReport,
  useRegenerateConsolidationReport,
} from '@/hooks/academic/use-attendance-consolidation';
import type { AttendanceConsolidationReport } from '@/types/attendance';
import Link from 'next/link';

interface ReportsListProps {
  institutionId: string;
}

export function ReportsList({ institutionId }: ReportsListProps) {
  const [deleteReportId, setDeleteReportId] = useState<string | null>(null);
  const { data: reportsResponse, isLoading } = useConsolidationReports({
    institutionId,
    limit: 50,
  });

  const deleteReport = useDeleteConsolidationReport();
  const regenerateReport = useRegenerateConsolidationReport();

  const handleDelete = async () => {
    if (deleteReportId) {
      await deleteReport.mutateAsync(deleteReportId);
      setDeleteReportId(null);
    }
  };

  const handleRegenerate = async (report: AttendanceConsolidationReport) => {
    await regenerateReport.mutateAsync(report);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      processing: 'secondary',
      pending: 'outline',
      failed: 'destructive',
    };

    return (
      <Badge variant={variants[status] || 'outline'} className="capitalize">
        {status}
      </Badge>
    );
  };

  const getFormatIcon = (format: string) => {
    return <FileText className="h-4 w-4" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const reports = reportsResponse?.data || [];

  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Reports Generated Yet</h3>
          <p className="text-sm text-muted-foreground">
            Create your first consolidation report to see it here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report) => (
          <Card key={report.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base truncate">
                    {report.reportName}
                  </CardTitle>
                  {report.reportDescription && (
                    <CardDescription className="mt-1.5 line-clamp-2">
                      {report.reportDescription}
                    </CardDescription>
                  )}
                </div>
                {getStatusIcon(report.status)}
              </div>
            </CardHeader>

            <CardContent className="flex-1 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status:</span>
                {getStatusBadge(report.status)}
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Format:</span>
                <div className="flex items-center gap-1.5">
                  {getFormatIcon(report.format)}
                  <span className="uppercase">{report.format}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Date Range:</span>
                <span className="text-xs">
                  {report.reportParams.dateFrom} to {report.reportParams.dateTo}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Group By:</span>
                <Badge variant="outline" className="capitalize">
                  {report.reportParams.groupBy}
                </Badge>
              </div>

              <div className="text-xs text-muted-foreground pt-2 border-t">
                Generated {format(new Date(report.createdAt), 'PPp')}
              </div>

              {report.status === 'completed' && report.reportData && (
                <div className="text-xs bg-muted p-2 rounded">
                  <div className="font-medium mb-1">Summary:</div>
                  <div className="space-y-0.5">
                    <div>Students: {report.reportData.summary.totalStudents}</div>
                    <div>
                      Avg Attendance: {report.reportData.summary.averageAttendance.toFixed(2)}%
                    </div>
                    <div>Groups: {report.reportData.groups.length}</div>
                  </div>
                </div>
              )}

              {report.status === 'failed' && report.errorMessage && (
                <div className="text-xs bg-red-50 text-red-700 p-2 rounded">
                  Error: {report.errorMessage}
                </div>
              )}
            </CardContent>

            <CardFooter className="flex gap-2 pt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                asChild
                disabled={report.status !== 'completed'}
              >
                <Link href={`/academic/attendance/consolidation/${report.id}`}>
                  <Eye className="h-4 w-4 mr-1.5" />
                  View
                </Link>
              </Button>

              {report.status === 'completed' && report.fileUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  asChild
                >
                  <a href={report.fileUrl} download target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4 mr-1.5" />
                    Download
                  </a>
                </Button>
              )}

              {(report.status === 'failed' || report.status === 'completed') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRegenerate(report)}
                  disabled={regenerateReport.isPending}
                >
                  <RefreshCw className={`h-4 w-4 ${regenerateReport.isPending ? 'animate-spin' : ''}`} />
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteReportId(report.id)}
                disabled={deleteReport.isPending}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteReportId} onOpenChange={() => setDeleteReportId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this report? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
