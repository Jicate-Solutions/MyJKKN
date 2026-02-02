'use client';

import { Calendar, CheckCircle, XCircle, Clock, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { LearnerAttendanceSummary } from '@/types/parent-portal';
import {
  formatAttendancePercentage,
  getAttendanceColor,
} from '@/types/parent-portal';

interface AttendanceSummaryProps {
  learnerName: string;
  attendance: LearnerAttendanceSummary;
}

export function AttendanceSummary({ learnerName, attendance }: AttendanceSummaryProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'present':
        return <CheckCircle className="h-3 w-3 text-green-600" />;
      case 'absent':
        return <XCircle className="h-3 w-3 text-red-600" />;
      case 'late':
        return <Clock className="h-3 w-3 text-orange-600" />;
      case 'leave':
        return <FileText className="h-3 w-3 text-blue-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-100 text-green-700';
      case 'absent':
        return 'bg-red-100 text-red-700';
      case 'late':
        return 'bg-orange-100 text-orange-700';
      case 'leave':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Attendance Summary - {learnerName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Percentage */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-gray-600">Overall Attendance</span>
            <span className={`text-2xl font-bold ${getAttendanceColor(attendance.attendance_percentage)}`}>
              {formatAttendancePercentage(attendance.attendance_percentage)}
            </span>
          </div>
          <Progress
            value={attendance.attendance_percentage}
            className="h-3"
          />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Present */}
          <div className="rounded-lg bg-green-50 p-3 text-center">
            <CheckCircle className="mx-auto h-5 w-5 text-green-600" />
            <p className="mt-1 text-2xl font-bold text-green-700">
              {attendance.present_days}
            </p>
            <p className="text-xs text-green-600">Present</p>
          </div>

          {/* Absent */}
          <div className="rounded-lg bg-red-50 p-3 text-center">
            <XCircle className="mx-auto h-5 w-5 text-red-600" />
            <p className="mt-1 text-2xl font-bold text-red-700">
              {attendance.absent_days}
            </p>
            <p className="text-xs text-red-600">Absent</p>
          </div>

          {/* Late */}
          <div className="rounded-lg bg-orange-50 p-3 text-center">
            <Clock className="mx-auto h-5 w-5 text-orange-600" />
            <p className="mt-1 text-2xl font-bold text-orange-700">
              {attendance.late_days}
            </p>
            <p className="text-xs text-orange-600">Late</p>
          </div>

          {/* Leave */}
          <div className="rounded-lg bg-blue-50 p-3 text-center">
            <FileText className="mx-auto h-5 w-5 text-blue-600" />
            <p className="mt-1 text-2xl font-bold text-blue-700">
              {attendance.leave_days}
            </p>
            <p className="text-xs text-blue-600">Leave</p>
          </div>
        </div>

        {/* Total Days */}
        <div className="flex justify-between rounded-lg border bg-gray-50 p-3">
          <span className="text-sm font-medium text-gray-700">Total Working Days</span>
          <span className="text-sm font-bold text-gray-900">{attendance.total_days}</span>
        </div>

        {/* Last 30 Days Calendar View */}
        {attendance.last_30_days && attendance.last_30_days.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-900">
              Last 30 Days
            </h4>
            <div className="grid grid-cols-7 gap-1">
              {attendance.last_30_days.map((day, index) => (
                <div
                  key={index}
                  className={`flex aspect-square items-center justify-center rounded ${getStatusColor(day.status)}`}
                  title={`${day.date}: ${day.status}`}
                >
                  {getStatusIcon(day.status)}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="bg-green-100 text-green-700">
                <CheckCircle className="mr-1 h-3 w-3" />
                Present
              </Badge>
              <Badge variant="outline" className="bg-red-100 text-red-700">
                <XCircle className="mr-1 h-3 w-3" />
                Absent
              </Badge>
              <Badge variant="outline" className="bg-orange-100 text-orange-700">
                <Clock className="mr-1 h-3 w-3" />
                Late
              </Badge>
              <Badge variant="outline" className="bg-blue-100 text-blue-700">
                <FileText className="mr-1 h-3 w-3" />
                Leave
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
