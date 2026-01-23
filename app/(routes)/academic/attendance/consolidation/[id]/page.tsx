'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Download,
  Users,
  Calendar,
  TrendingUp,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Building2,
  BookOpen,
  Layers,
  Users2,
  CheckCircle2,
  XCircle,
  Clock,
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useConsolidationReport } from '@/hooks/academic/use-attendance-consolidation';
import { cn } from '@/lib/utils';
import type { StudentAttendanceSummary, GroupAttendanceSummary } from '@/types/attendance';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

// Helper to get attendance color based on percentage
function getAttendanceColor(percentage: number) {
  if (percentage >= 90) return 'text-green-600 bg-green-50 border-green-200';
  if (percentage >= 75) return 'text-blue-600 bg-blue-50 border-blue-200';
  if (percentage >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

function getAttendanceBadgeVariant(percentage: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (percentage >= 75) return 'default';
  if (percentage >= 60) return 'secondary';
  return 'destructive';
}

// Component to display hierarchy info for a learner
function LearnerHierarchyInfo({ student }: { student: StudentAttendanceSummary }) {
  const hierarchyParts = [];

  if (student.degreeName) {
    hierarchyParts.push(student.degreeName);
  }
  if (student.departmentName || student.departmentCode) {
    hierarchyParts.push(student.departmentCode || student.departmentName);
  }
  if (student.programName) {
    hierarchyParts.push(student.programName);
  }
  if (student.semesterName) {
    hierarchyParts.push(student.semesterName);
  }
  if (student.sectionName) {
    hierarchyParts.push(`Section ${student.sectionName}`);
  }

  if (hierarchyParts.length === 0) return null;

  return (
    <span className="text-xs text-muted-foreground">
      {hierarchyParts.join(' • ')}
    </span>
  );
}

// Component to display group header with hierarchy
function GroupHeader({ group, isExpanded }: {
  group: GroupAttendanceSummary;
  isExpanded: boolean;
}) {
  // Get first student's hierarchy info if available
  const firstStudent = group.students[0];
  const hierarchyInfo = firstStudent ? {
    degree: firstStudent.degreeName || firstStudent.degreeCode,
    department: firstStudent.departmentName || firstStudent.departmentCode,
    program: firstStudent.programName || firstStudent.programCode,
    semester: firstStudent.semesterName,
  } : null;

  return (
    <div
      className={cn(
        "flex flex-col md:flex-row md:items-center justify-between p-4 cursor-pointer rounded-lg transition-colors",
        "hover:bg-muted/50",
        isExpanded && "bg-muted/30"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "p-2 rounded-lg",
          getAttendanceColor(group.averageAttendance)
        )}>
          <Users2 className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{group.groupName}</h3>
            <Badge variant="outline" className="text-xs capitalize">
              {group.groupType}
            </Badge>
          </div>

          {/* Hierarchy breadcrumb */}
          {hierarchyInfo && (
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {hierarchyInfo.degree && (
                <>
                  <GraduationCap className="h-3 w-3" />
                  <span>{hierarchyInfo.degree}</span>
                </>
              )}
              {hierarchyInfo.department && (
                <>
                  <span className="mx-1">›</span>
                  <Building2 className="h-3 w-3" />
                  <span>{hierarchyInfo.department}</span>
                </>
              )}
              {hierarchyInfo.program && (
                <>
                  <span className="mx-1">›</span>
                  <BookOpen className="h-3 w-3" />
                  <span>{hierarchyInfo.program}</span>
                </>
              )}
              {hierarchyInfo.semester && (
                <>
                  <span className="mx-1">›</span>
                  <Layers className="h-3 w-3" />
                  <span>{hierarchyInfo.semester}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 md:mt-0">
        <div className="flex items-center gap-6 text-sm">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{group.totalStudents}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Total Learners</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{group.totalWorkingDays}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Working Days</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Badge
            variant={getAttendanceBadgeVariant(group.averageAttendance)}
            className="text-sm px-3"
          >
            {group.averageAttendance.toFixed(1)}%
          </Badge>
        </div>

        <div className="ml-2 p-2 rounded-md hover:bg-muted">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </div>
    </div>
  );
}

// Learner row component with improved design
function LearnerRow({
  learner,
  index,
  showHierarchy,
  showAbsentDetails
}: {
  learner: StudentAttendanceSummary;
  index: number;
  showHierarchy: boolean;
  showAbsentDetails: boolean;
}) {
  return (
    <TableRow className={cn(index % 2 === 0 && "bg-muted/20")}>
      <TableCell className="font-medium">
        <div className="flex flex-col">
          <span className={cn(
            "font-medium",
            // Show as warning if name looks like a UUID
            learner.studentName?.includes('-') && learner.studentName.length > 30 && "text-yellow-600"
          )}>
            {learner.studentName}
          </span>
          {showHierarchy && <LearnerHierarchyInfo student={learner} />}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-mono text-xs">
          {learner.rollNumber || '-'}
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        {learner.totalWorkingDays}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="font-medium">{learner.totalPresent}</span>
          </div>
          <span className="text-muted-foreground">/</span>
          <div className="flex items-center gap-1 text-red-500">
            <XCircle className="h-3.5 w-3.5" />
            <span className="font-medium">{learner.totalAbsent}</span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress
            value={learner.attendancePercentage}
            className="h-2 flex-1"
          />
          <Badge variant={getAttendanceBadgeVariant(learner.attendancePercentage)} className="w-16 justify-center">
            {learner.attendancePercentage.toFixed(1)}%
          </Badge>
        </div>
      </TableCell>
      {showAbsentDetails && (
        <TableCell className="max-w-[200px]">
          {learner.absentDates && learner.absentDates.length > 0 ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-help">
                    <Clock className="h-3 w-3" />
                    <span className="truncate">
                      {learner.absentDates.length <= 3
                        ? learner.absentDates.join(', ')
                        : `${learner.absentDates.slice(0, 2).join(', ')} +${learner.absentDates.length - 2} more`
                      }
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <div className="space-y-1">
                    <p className="font-medium">Absent Dates:</p>
                    <p className="text-xs">{learner.absentDates.join(', ')}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Perfect
            </span>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

export default function ConsolidationReportDetailPage({ params }: PageProps) {
  const router = useRouter();
  const resolvedParams = use(params);
  const reportId = resolvedParams.id;
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { data: report, isLoading, error } = useConsolidationReport(reportId);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (report?.reportData?.groups) {
      setExpandedGroups(new Set(report.reportData.groups.map(g => g.groupId)));
    }
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  if (isLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading report data...</p>
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
              Failed to load report. The report may have been deleted or you don't have permission to view it.
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
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <div className="text-center">
                  <p className="font-medium">Report is being generated...</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Status: <Badge variant="outline" className="capitalize">{report.status}</Badge>
                  </p>
                  {report.errorMessage && (
                    <p className="mt-2 text-sm text-red-600">{report.errorMessage}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const { summary, groups } = report.reportData;
  const showHierarchy = report.reportParams.groupBy === 'section' || report.reportParams.groupBy === 'student';

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
            <BreadcrumbPage>Report Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{report.reportName}</h1>
              {report.reportDescription && (
                <p className="text-sm text-muted-foreground mt-1">{report.reportDescription}</p>
              )}
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

        {/* Report Info Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Report Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date Range</p>
                <p className="text-sm font-medium">
                  {format(new Date(summary.dateRange.from), 'MMM dd')} - {format(new Date(summary.dateRange.to), 'MMM dd, yyyy')}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Grouped By</p>
                <Badge variant="secondary" className="capitalize">
                  {report.reportParams.groupBy}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Format</p>
                <Badge variant="outline" className="uppercase">
                  {report.format}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Generated</p>
                <p className="text-sm">{format(new Date(report.createdAt), 'PPp')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Total Learners</p>
                  <p className="text-3xl font-bold text-blue-700 dark:text-blue-300 mt-1">{summary.totalStudents}</p>
                </div>
                <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-full">
                  <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/50 dark:to-purple-900/30 border-purple-200 dark:border-purple-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">Working Days</p>
                  <p className="text-3xl font-bold text-purple-700 dark:text-purple-300 mt-1">{summary.totalWorkingDays}</p>
                </div>
                <div className="p-3 bg-purple-100 dark:bg-purple-900/50 rounded-full">
                  <Calendar className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/50 dark:to-green-900/30 border-green-200 dark:border-green-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">Avg Attendance</p>
                  <p className="text-3xl font-bold text-green-700 dark:text-green-300 mt-1">{summary.averageAttendance.toFixed(1)}%</p>
                </div>
                <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-full">
                  <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/50 dark:to-orange-900/30 border-orange-200 dark:border-orange-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wide">Present / Absent</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.totalPresent}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-xl font-bold text-red-500">{summary.totalAbsent}</span>
                  </div>
                </div>
                <div className="p-3 bg-orange-100 dark:bg-orange-900/50 rounded-full">
                  <CheckCircle2 className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Groups Data */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Attendance Details</CardTitle>
                <CardDescription className="mt-1">
                  {groups.length} {groups.length === 1 ? 'group' : 'groups'} • Grouped by {report.reportParams.groupBy}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={expandAll}>
                  Expand All
                </Button>
                <Button variant="outline" size="sm" onClick={collapseAll}>
                  Collapse All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {groups.map((group) => {
              const isExpanded = expandedGroups.has(group.groupId);
              return (
                <div
                  key={group.groupId}
                  className={cn(
                    "border rounded-lg overflow-hidden",
                    isExpanded && "ring-1 ring-primary/20"
                  )}
                >
                  {/* Clickable header */}
                  <div
                    onClick={() => toggleGroup(group.groupId)}
                    className="cursor-pointer"
                  >
                    <GroupHeader
                      group={group}
                      isExpanded={isExpanded}
                    />
                  </div>

                  {/* Expandable content */}
                  {isExpanded && (
                    <>
                      <Separator />
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="min-w-[200px]">Learner</TableHead>
                              <TableHead className="min-w-[100px]">Roll No.</TableHead>
                              <TableHead className="text-center min-w-[80px]">Days</TableHead>
                              <TableHead className="min-w-[120px]">Present/Absent</TableHead>
                              <TableHead className="min-w-[180px]">Attendance</TableHead>
                              {report.reportParams.includeAbsentDetails && (
                                <TableHead className="min-w-[150px]">Absent Dates</TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.students.map((learner, learnerIndex) => (
                              <LearnerRow
                                key={learner.studentId}
                                learner={learner}
                                index={learnerIndex}
                                showHierarchy={showHierarchy}
                                showAbsentDetails={report.reportParams.includeAbsentDetails || false}
                              />
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
