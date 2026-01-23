'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Download,
  FileText,
  Users,
  Calendar,
  TrendingUp,
  Loader2,
  AlertCircle,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useConsolidationReport } from '@/hooks/academic/use-attendance-consolidation';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function ConsolidationReportDetailPage({ params }: PageProps) {
  const router = useRouter();
  const resolvedParams = use(params);
  const reportId = resolvedParams.id;

  const { data: report, isLoading, error } = useConsolidationReport(reportId);

  if (isLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !report) {
    return (
      <ContentLayout title="Report Not Found">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/academic/attendance">Attendance</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/academic/attendance/consolidation">Consolidation</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Error</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="space-y-6 mt-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load report. The report may have been deleted or you don't have permission
              to view it.
            </AlertDescription>
          </Alert>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (report.status !== 'completed' || !report.reportData) {
    return (
      <ContentLayout title="Report Not Ready">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/academic/attendance">Attendance</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/academic/attendance/consolidation">Consolidation</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Processing</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="space-y-6 mt-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Report Not Ready</AlertTitle>
            <AlertDescription>
              This report is still being generated. Status: {report.status}
              {report.errorMessage && <div className="mt-2 text-red-600">Error: {report.errorMessage}</div>}
            </AlertDescription>
          </Alert>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const { summary, groups } = report.reportData;

  return (
    <ContentLayout title={report.reportName}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/academic/attendance">Attendance</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/academic/attendance/consolidation">Consolidation</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold py-1">{report.reportName}</h1>
                {report.reportDescription && (
                  <p className="text-sm sm:text-base text-muted-foreground">{report.reportDescription}</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {report.fileUrl && (
              <Button asChild>
                <a href={report.fileUrl} download target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Download {report.format.toUpperCase()}
                </a>
              </Button>
            )}
          </div>
        </div>

      {/* Report Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Report Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Date Range</p>
            <p className="font-medium">
              {summary.dateRange.from} to {summary.dateRange.to}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Group By</p>
            <Badge variant="outline" className="capitalize">
              {report.reportParams.groupBy}
            </Badge>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Format</p>
            <Badge variant="outline" className="uppercase">
              {report.format}
            </Badge>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Generated</p>
            <p className="text-sm">{format(new Date(report.createdAt), 'PPp')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Overall Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{summary.totalStudents}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Working Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{summary.totalWorkingDays}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <span className="text-2xl font-bold text-green-600">
                {summary.averageAttendance.toFixed(2)}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Present
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-green-600">{summary.totalPresent}</span>
              <span className="text-sm text-muted-foreground">
                {summary.totalAbsent} Absent
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Groups Data */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Report</CardTitle>
          <CardDescription>
            Attendance breakdown by {report.reportParams.groupBy}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {groups.map((group, index) => (
            <div key={group.groupId} className="space-y-3">
              {index > 0 && <div className="border-t my-6" />}

              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{group.groupName}</h3>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {group.totalStudents} Students
                  </span>
                  <Badge variant={group.averageAttendance >= 75 ? 'default' : 'destructive'}>
                    {group.averageAttendance.toFixed(2)}% Avg
                  </Badge>
                </div>
              </div>

              <Table>
                <TableCaption>
                  Attendance details for {group.groupName}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Roll Number</TableHead>
                    {report.reportParams.groupBy !== 'section' && (
                      <TableHead>Section</TableHead>
                    )}
                    <TableHead className="text-right">Working Days</TableHead>
                    <TableHead className="text-right">Present</TableHead>
                    <TableHead className="text-right">Absent</TableHead>
                    <TableHead className="text-right">Attendance %</TableHead>
                    {report.reportParams.includeAbsentDetails && (
                      <TableHead>Absent Dates</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.students.map((student) => (
                    <TableRow key={student.studentId}>
                      <TableCell className="font-medium">{student.studentName}</TableCell>
                      <TableCell>{student.rollNumber || '-'}</TableCell>
                      {report.reportParams.groupBy !== 'section' && (
                        <TableCell>{student.sectionName || '-'}</TableCell>
                      )}
                      <TableCell className="text-right">{student.totalWorkingDays}</TableCell>
                      <TableCell className="text-right text-green-600 font-medium">
                        {student.totalPresent}
                      </TableCell>
                      <TableCell className="text-right text-red-600 font-medium">
                        {student.totalAbsent}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={student.attendancePercentage >= 75 ? 'default' : 'destructive'}
                        >
                          {student.attendancePercentage.toFixed(2)}%
                        </Badge>
                      </TableCell>
                      {report.reportParams.includeAbsentDetails && (
                        <TableCell className="text-xs text-muted-foreground max-w-xs">
                          {student.absentDates && student.absentDates.length > 0
                            ? student.absentDates.join(', ')
                            : 'No absences'}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </CardContent>
      </Card>
      </div>
    </ContentLayout>
  );
}
