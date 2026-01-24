'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
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
  BarChart3,
  PieChart,
  Eye,
  FileText,
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
import { exportConsolidationReportToPDF } from '@/lib/utils/pdf-export/consolidation-report-pdf';
import type { StudentAttendanceSummary, GroupAttendanceSummary } from '@/types/attendance';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

// Helper to get attendance color based on percentage
function getAttendanceColor(percentage: number) {
  if (percentage >= 90) return 'text-green-600 bg-green-50 border-green-200 dark:bg-green-950/50 dark:border-green-800';
  if (percentage >= 75) return 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/50 dark:border-blue-800';
  if (percentage >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:bg-yellow-950/50 dark:border-yellow-800';
  return 'text-red-600 bg-red-50 border-red-200 dark:bg-red-950/50 dark:border-red-800';
}

function getAttendanceBadgeVariant(percentage: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (percentage >= 75) return 'default';
  if (percentage >= 60) return 'secondary';
  return 'destructive';
}

// Group Statistics Card Component
function GroupStatisticsCard({
  group,
  onViewDetails,
  isExpanded
}: {
  group: GroupAttendanceSummary;
  onViewDetails: () => void;
  isExpanded: boolean;
}) {
  const firstStudent = group.students[0];
  const presentPercentage = group.averageAttendance;
  const absentPercentage = 100 - presentPercentage;

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-300 border shadow-md hover:shadow-lg",
      isExpanded && "ring-1 ring-primary/20 shadow-xl"
    )}>
      <div className={cn(
        "h-1.5 w-full",
        group.averageAttendance >= 90 ? "bg-green-500" :
        group.averageAttendance >= 75 ? "bg-blue-500" :
        group.averageAttendance >= 60 ? "bg-yellow-500" :
        "bg-red-500"
      )} />
      
      <CardHeader className="pb-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-xl md:text-2xl font-bold tracking-tight">
                {group.groupName}
              </CardTitle>
              <Badge variant="outline" className="text-xs uppercase tracking-wider font-semibold">
                {group.groupType}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Attendance Report &bull; {group.totalStudents} Learners &bull; {group.totalWorkingDays} Working Days
            </p>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="text-right hidden md:block">
                <p className="text-sm text-muted-foreground font-medium">Overall Attendance</p>
                <div className="flex items-baseline justify-end gap-1">
                   <span className={cn(
                      "text-2xl font-bold",
                      presentPercentage >= 75 ? "text-green-600" : 
                      presentPercentage >= 60 ? "text-yellow-600" : "text-red-600"
                   )}>
                      {presentPercentage.toFixed(1)}%
                   </span>
                </div>
             </div>
             
             <div className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center shadow-sm ring-4 ring-background",
                presentPercentage >= 90 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" :
                presentPercentage >= 75 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" :
                presentPercentage >= 60 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400" :
                "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
             )}>
                <Users2 className="h-6 w-6" />
             </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pb-6">
        {/* Hierarchy Information - Pill Design */}
        <div className="flex flex-wrap gap-2 text-sm">
          {firstStudent?.degreeName && (
            <Badge variant="secondary" className="px-3 py-1.5 font-normal text-muted-foreground bg-muted/50 border hover:bg-muted/80">
              <GraduationCap className="h-3.5 w-3.5 mr-2 text-primary" />
              <span className="font-medium text-foreground">{firstStudent.degreeName}</span>
            </Badge>
          )}

          {(firstStudent?.departmentName || firstStudent?.departmentCode) && (
            <Badge variant="secondary" className="px-3 py-1.5 font-normal text-muted-foreground bg-muted/50 border hover:bg-muted/80">
              <Building2 className="h-3.5 w-3.5 mr-2 text-primary" />
              <span className="font-medium text-foreground">{firstStudent.departmentName || firstStudent.departmentCode}</span>
            </Badge>
          )}

{(firstStudent?.programName || firstStudent?.programCode) && (
            <Badge variant="secondary" className="px-3 py-1.5 font-normal text-muted-foreground bg-muted/50 border hover:bg-muted/80">
              <BookOpen className="h-3.5 w-3.5 mr-2 text-primary" />
              <span className="font-medium text-foreground">{firstStudent.programName || firstStudent.programCode}</span>
            </Badge>
          )}

          {firstStudent?.semesterName && (
            <Badge variant="secondary" className="px-3 py-1.5 font-normal text-muted-foreground bg-muted/50 border hover:bg-muted/80">
              <Layers className="h-3.5 w-3.5 mr-2 text-primary" />
              <span className="font-medium text-foreground">{firstStudent.semesterName}</span>
            </Badge>
          )}

          {firstStudent?.sectionName && (
            <Badge variant="secondary" className="px-3 py-1.5 font-normal text-muted-foreground bg-muted/50 border hover:bg-muted/80">
              <BookOpen className="h-3.5 w-3.5 mr-2 text-primary" />
              <span className="font-medium text-foreground">Section {firstStudent.sectionName}</span>
            </Badge>
          )}
        </div>

        <Separator />

        {/* Statistics Grid - Clean Modern Look */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex flex-col p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Total Learners</span>
            <div className="flex items-center justify-between mt-auto">
               <span className="text-3xl font-bold text-slate-700 dark:text-slate-200">{group.totalStudents}</span>
               <Users className="h-5 w-5 text-slate-400" />
            </div>
          </div>

          <div className="flex flex-col p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 hover:border-indigo-300 dark:hover:border-indigo-800 transition-colors">
            <span className="text-xs font-semibold text-indigo-600/80 dark:text-indigo-400/80 uppercase tracking-wider mb-2">Working Days</span>
            <div className="flex items-center justify-between mt-auto">
               <span className="text-3xl font-bold text-indigo-700 dark:text-indigo-300">{group.totalWorkingDays}</span>
               <Calendar className="h-5 w-5 text-indigo-400" />
            </div>
          </div>

          <div className="flex flex-col p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900/50 hover:border-green-300 dark:hover:border-green-800 transition-colors">
            <span className="text-xs font-semibold text-green-600/80 dark:text-green-400/80 uppercase tracking-wider mb-2">Present %</span>
            <div className="flex items-center justify-between mt-auto">
               <span className="text-3xl font-bold text-green-700 dark:text-green-300">{presentPercentage.toFixed(1)}%</span>
               <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          </div>

          <div className="flex flex-col p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 hover:border-red-300 dark:hover:border-red-800 transition-colors">
            <span className="text-xs font-semibold text-red-600/80 dark:text-red-400/80 uppercase tracking-wider mb-2">Absent %</span>
            <div className="flex items-center justify-between mt-auto">
               <span className="text-3xl font-bold text-red-700 dark:text-red-300">{absentPercentage.toFixed(1)}%</span>
               <XCircle className="h-5 w-5 text-red-500" />
            </div>
          </div>
        </div>

        {/* Progress Bar with markers */}
        <div className="space-y-2">
           <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>0%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
           </div>
           <div className="relative h-3 w-full bg-secondary rounded-full overflow-hidden">
              <div 
                 className={cn(
                    "absolute top-0 left-0 h-full transition-all duration-500 rounded-full",
                    presentPercentage >= 90 ? "bg-green-500" :
                    presentPercentage >= 75 ? "bg-blue-500" :
                    presentPercentage >= 60 ? "bg-yellow-500" : "bg-red-500"
                 )}
                 style={{ width: `${presentPercentage}%` }}
              />
           </div>
        </div>

        <Button
          onClick={onViewDetails}
          variant="ghost"
          className="w-full group hover:bg-secondary/50 h-auto py-3 border-t border-dashed"
        >
          <span className="font-medium mr-2 group-hover:underline">
            {isExpanded ? 'Hide Detailed Report' : 'View Detailed Report'}
          </span>
          {isExpanded ? (
             <ChevronUp className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
          ) : (
             <ChevronDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// Learner row component
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
  const totalPeriods = learner.totalPresent + learner.totalAbsent;

  return (
    <TableRow className={cn(
      "transition-colors hover:bg-muted/30",
      index % 2 === 0 ? "bg-background" : "bg-muted/10"
    )}>
      <TableCell className="font-medium py-3">
        <div className="flex flex-col">
          <span className={cn(
            "font-semibold text-sm",
            learner.studentName?.includes('-') && learner.studentName.length > 30 && "text-yellow-600"
          )}>
            {learner.studentName}
          </span>
          
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-mono text-[10px] text-black bg-lime-500/10">
          {learner.rollNumber || '-'}
        </Badge>
      </TableCell>
      <TableCell className="text-center font-medium text-muted-foreground">
        {learner.totalWorkingDays}
      </TableCell>
      <TableCell className="text-center">
        <div className="flex flex-col items-center">
          <span className="text-base font-bold text-foreground">{totalPeriods}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Periods</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center min-w-[45px] p-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
             <span className="text-base font-bold text-green-700 dark:text-green-400">{learner.totalPresent}</span>
             <span className="text-[10px] text-green-600/80 dark:text-green-400/80 uppercase tracking-wide font-medium">Present</span>
          </div>
          <div className="h-10 w-px bg-border" />
          <div className="flex flex-col items-center min-w-[45px] p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
             <span className="text-base font-bold text-red-700 dark:text-red-400">{learner.totalAbsent}</span>
             <span className="text-[10px] text-red-600/80 dark:text-red-400/80 uppercase tracking-wide font-medium">Absent</span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3 min-w-[150px]">
          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
             <div
                className={cn(
                   "h-full rounded-full",
                   learner.attendancePercentage >= 90 ? "bg-green-500" :
                   learner.attendancePercentage >= 75 ? "bg-blue-500" :
                   learner.attendancePercentage >= 60 ? "bg-yellow-500" : "bg-red-500"
                )}
                style={{ width: `${learner.attendancePercentage}%` }}
             />
          </div>
          <span className={cn(
             "text-sm font-bold w-12 text-right",
             learner.attendancePercentage >= 90 ? "text-green-600" :
             learner.attendancePercentage >= 75 ? "text-blue-600" :
             learner.attendancePercentage >= 60 ? "text-yellow-600" : "text-red-600"
          )}>
            {learner.attendancePercentage.toFixed(1)}%
          </span>
        </div>
      </TableCell>
      {showAbsentDetails && (
        <TableCell className="max-w-[200px]">
          {learner.absentDates && learner.absentDates.length > 0 ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-help py-1 px-2 rounded-md hover:bg-muted/50 w-fit transition-colors">
                    <Clock className="h-3 w-3 text-red-400" />
                    <span className="font-medium">
                      {learner.absentDates.length} days
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs p-3">
                  <div className="space-y-2">
                    <p className="font-semibold text-xs border-b pb-1">Absent Dates ({learner.absentDates.length})</p>
                    <div className="flex flex-wrap gap-1">
                       {learner.absentDates.map((date, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px] px-1 py-0 h-5">
                             {date}
                          </Badge>
                       ))}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400 text-[10px] px-2 py-0.5">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Perfect
            </Badge>
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
  const [isExportingPDF, setIsExportingPDF] = useState(false);

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

  const handleExportPDF = async () => {
    if (!report) return;

    try {
      setIsExportingPDF(true);
      toast.loading('Generating PDF...', { id: 'pdf-export' });

      await exportConsolidationReportToPDF(report, {
        includeAbsentDetails: report.reportParams.includeAbsentDetails,
        includePeriodBreakdown: report.reportParams.includePeriodBreakdown,
      });

      toast.success('PDF exported successfully!', { id: 'pdf-export' });
    } catch (error) {
      console.error('Failed to export PDF:', error);
      toast.error('Failed to export PDF. Please try again.', { id: 'pdf-export' });
    } finally {
      setIsExportingPDF(false);
    }
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
            <Button
              onClick={handleExportPDF}
              disabled={isExportingPDF}
              variant="outline"
            >
              {isExportingPDF ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  Export as PDF
                </>
              )}
            </Button>
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
        <Card className="border-2">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Report Configuration</CardTitle>
            </div>
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

        {/* Overall Summary Stats */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <PieChart className="h-5 w-5 text-primary" />
            Overall Summary
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30 border-2 border-blue-200 dark:border-blue-800">
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

            <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/50 dark:to-purple-900/30 border-2 border-purple-200 dark:border-purple-800">
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

            <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/50 dark:to-green-900/30 border-2 border-green-200 dark:border-green-800">
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

            <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/50 dark:to-orange-900/30 border-2 border-orange-200 dark:border-orange-800">
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
        </div>

        {/* Group Statistics Cards */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users2 className="h-5 w-5 text-primary" />
            Group Statistics & Detailed Attendance
            <Badge variant="outline" className="ml-auto">
              {groups.length} {groups.length === 1 ? 'Group' : 'Groups'}
            </Badge>
          </h2>
          <div className="space-y-6">
            {groups.map((group) => {
              const isExpanded = expandedGroups.has(group.groupId);
              return (
                <div key={group.groupId} className="space-y-4">
                  <GroupStatisticsCard
                    group={group}
                    onViewDetails={() => toggleGroup(group.groupId)}
                    isExpanded={isExpanded}
                  />

                  {/* Expandable Learner Details */}
                  {isExpanded && (
                    <div className="animate-in slide-in-from-top-4 duration-300 fade-in">
                      <Card className="border-t-0 rounded-t-none -mt-1 shadow-md border-x border-b">
                        <CardHeader className="py-4 bg-muted/10 border-b">
                          <div className="flex items-center justify-between">
                             <div className="space-y-1">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                  <Users className="h-4 w-4 text-primary" />
                                  Learner Details
                                </CardTitle>
                                <CardDescription className="text-xs">
                                  Showing records for {group.totalStudents} learners
                                </CardDescription>
                             </div>
                             {/* Potential Filter/Search could go here */}
                          </div>
                        </CardHeader>
                        <CardContent className="p-4">
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/5 hover:bg-muted/5 border-b">
                                  <TableHead className="min-w-[200px] text-xs uppercase tracking-wider font-semibold text-muted-foreground">Learner</TableHead>
                                  <TableHead className="min-w-[100px] text-xs uppercase tracking-wider font-semibold text-muted-foreground">Roll No.</TableHead>
                                  <TableHead className="text-center min-w-[80px] text-xs uppercase tracking-wider font-semibold text-muted-foreground">Working Days</TableHead>
                                  <TableHead className="text-center min-w-[100px] text-xs uppercase tracking-wider font-semibold text-muted-foreground">Total Periods</TableHead>
                                  <TableHead className="min-w-[160px] text-xs uppercase tracking-wider font-semibold text-muted-foreground">Period Status</TableHead>
                                  <TableHead className="min-w-[200px] text-xs uppercase tracking-wider font-semibold text-muted-foreground">Attendance %</TableHead>
                                  {report.reportParams.includeAbsentDetails && (
                                    <TableHead className="min-w-[150px] text-xs uppercase tracking-wider font-semibold text-muted-foreground">Absent Info</TableHead>
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
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </ContentLayout>
  );
}
