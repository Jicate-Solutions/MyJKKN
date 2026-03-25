/**
 * Attendance Statistics Cards Component
 * Created: 2025-12-29
 * Description: Display key attendance metrics with color coding
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, CheckCircle, XCircle, TrendingUp, AlertTriangle } from 'lucide-react';
import type { AttendanceStatistics } from '@/types/student-attendance';
import { cn } from '@/lib/utils';

interface AttendanceStatisticsCardsProps {
  stats: AttendanceStatistics;
}

export function AttendanceStatisticsCards({ stats }: AttendanceStatisticsCardsProps) {
  const {
    totalClasses,
    presentCount,
    absentCount,
    percentage,
    threshold,
    isAboveThreshold
  } = stats;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Total Classes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Classes</CardTitle>
          <BookOpen className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalClasses}</div>
          <p className="text-xs text-muted-foreground">
            Classes conducted this semester
          </p>
        </CardContent>
      </Card>

      {/* Present */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Present</CardTitle>
          <CheckCircle className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{presentCount}</div>
          <p className="text-xs text-muted-foreground">
            Classes attended
          </p>
        </CardContent>
      </Card>

      {/* Absent */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Absent</CardTitle>
          <XCircle className="h-4 w-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">{absentCount}</div>
          <p className="text-xs text-muted-foreground">
            Classes missed
          </p>
        </CardContent>
      </Card>

      {/* Percentage */}
      <Card className={cn(
        isAboveThreshold ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'
      )}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Attendance %</CardTitle>
          {isAboveThreshold ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={cn(
            "text-2xl font-bold",
            isAboveThreshold ? "text-green-600" : "text-red-600"
          )}>
            {percentage}%
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-muted-foreground">
              Required: {threshold}%
            </p>
            <Badge variant={isAboveThreshold ? "default" : "destructive"}>
              {isAboveThreshold ? 'On Track' : 'Below Threshold'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
