'use client';

import { Users, UserCheck, UserX, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AttendanceReportDetails } from '@/lib/services/academic/attendance-analytics-service';

interface AttendanceReportSummaryProps {
  reports: AttendanceReportDetails[];
  isLoading: boolean;
}

export function AttendanceReportSummary({
  reports,
  isLoading
}: AttendanceReportSummaryProps) {
  if (isLoading || reports.length === 0) {
    return (
      <div className='grid gap-4 md:grid-cols-3'>
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <div className='flex items-center justify-between'>
                <Skeleton className='h-6 w-24' />
                <Skeleton className='h-8 w-8 rounded-full' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='space-y-2'>
                <Skeleton className='h-8 w-16' />
                <Skeleton className='h-2 w-full' />
                <Skeleton className='h-4 w-20' />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Aggregate data from all periods
  const totalStudents = reports.reduce(
    (sum, report) => sum + report.total_students,
    0
  );
  const totalPresent = reports.reduce(
    (sum, report) => sum + report.present_count,
    0
  );
  const totalAbsent = reports.reduce(
    (sum, report) => sum + report.absent_count,
    0
  );
  const avgAttendancePercentage =
    reports.length > 0
      ? reports.reduce((sum, report) => sum + report.attendance_percentage, 0) /
        reports.length
      : 0;

  const getAttendanceStatusColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-green-100 text-green-800';
    if (percentage >= 75) return 'bg-yellow-100 text-yellow-800';
    if (percentage >= 50) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  const getAttendanceStatusText = (percentage: number) => {
    if (percentage >= 90) return 'Excellent';
    if (percentage >= 75) return 'Good';
    if (percentage >= 50) return 'Average';
    return 'Poor';
  };

  return (
    <div className='grid gap-4 md:grid-cols-3'>
      {/* Total Students */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Total Students</CardTitle>
          <Users className='h-4 w-4 text-muted-foreground' />
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>{totalStudents}</div>
          <p className='text-xs text-muted-foreground'>
            {reports.length > 1
              ? `Across ${reports.length} periods`
              : 'Single period'}
          </p>
        </CardContent>
      </Card>

      {/* Present Students */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>
            Present Students
          </CardTitle>
          <UserCheck className='h-4 w-4 text-green-600' />
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold text-green-600'>
            {totalPresent}
          </div>
          <div className='mt-2 space-y-1'>
            <Progress
              value={
                totalStudents > 0 ? (totalPresent / totalStudents) * 100 : 0
              }
              className='h-2'
            />
            <p className='text-xs text-muted-foreground'>
              {totalStudents > 0
                ? ((totalPresent / totalStudents) * 100).toFixed(1)
                : 0}
              % of total students
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Absent Students */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Absent Students</CardTitle>
          <UserX className='h-4 w-4 text-red-600' />
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold text-red-600'>{totalAbsent}</div>
          <div className='mt-2 space-y-1'>
            <Progress
              value={
                totalStudents > 0 ? (totalAbsent / totalStudents) * 100 : 0
              }
              className='h-2'
            />
            <p className='text-xs text-muted-foreground'>
              {totalStudents > 0
                ? ((totalAbsent / totalStudents) * 100).toFixed(1)
                : 0}
              % of total students
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Overall Attendance Percentage - Full width card */}
      <Card className='md:col-span-3'>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <CardTitle className='text-lg font-medium flex items-center gap-2'>
              <TrendingUp className='h-5 w-5' />
              Overall Attendance Performance
            </CardTitle>
            <Badge
              className={getAttendanceStatusColor(avgAttendancePercentage)}
            >
              {getAttendanceStatusText(avgAttendancePercentage)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            <div className='flex items-center justify-between'>
              <span className='text-3xl font-bold'>
                {avgAttendancePercentage.toFixed(1)}%
              </span>
              <div className='text-right text-sm text-muted-foreground'>
                <div>Average attendance across all periods</div>
                <div>
                  {totalPresent} present, {totalAbsent} absent
                </div>
              </div>
            </div>
            <Progress value={avgAttendancePercentage} className='h-4' />

            {/* Period-wise breakdown if multiple periods */}
            {reports.length > 1 && (
              <div className='space-y-2'>
                <h4 className='font-medium'>Period-wise Breakdown:</h4>
                <div className='grid gap-2 md:grid-cols-2'>
                  {reports.map((report, index) => (
                    <div
                      key={index}
                      className='flex items-center justify-between p-3 bg-muted/30 rounded-lg'
                    >
                      <div>
                        <div className='font-medium'>{report.period_name}</div>
                        <div className='text-sm text-muted-foreground'>
                          {report.start_time} - {report.end_time}
                        </div>
                      </div>
                      <div className='text-right'>
                        <div className='font-medium'>
                          {report.attendance_percentage}%
                        </div>
                        <div className='text-sm text-muted-foreground'>
                          {report.present_count}/{report.total_students}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
