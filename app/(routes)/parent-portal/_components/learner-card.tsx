'use client';

import { GraduationCap, Calendar, CreditCard, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  formatAttendancePercentage,
  getAttendanceColor,
  getRelationshipLabel,
} from '@/types/parent-portal';
import type { LearnerDashboardData } from '@/types/parent-portal';

interface LearnerCardProps {
  data: LearnerDashboardData;
  onViewDetails: (learnerId: string) => void;
}

export function LearnerCard({ data, onViewDetails }: LearnerCardProps) {
  const { learner, link, attendance, fees } = data;

  const learnerFullName = `${learner.first_name || ''} ${learner.last_name || ''}`.trim() || 'Learner';
  const initials = learnerFullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border-2 border-white shadow">
              <AvatarImage src={learner.photo_url || undefined} />
              <AvatarFallback className="bg-blue-100 text-blue-700">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{learnerFullName}</CardTitle>
              <p className="text-sm text-gray-600">
                {learner.roll_number}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {link.is_primary && (
              <Badge variant="secondary" className="text-xs">
                Primary
              </Badge>
            )}
            <span className="text-xs text-gray-500">
              {getRelationshipLabel(link.relationship)}
            </span>
          </div>
        </div>
        {/* Program Info */}
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {learner.program && (
            <Badge variant="outline" className="bg-white">
              <GraduationCap className="mr-1 h-3 w-3" />
              {learner.program.name}
            </Badge>
          )}
          {learner.section && (
            <Badge variant="outline" className="bg-white">
              {learner.section.name}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Attendance */}
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4" />
              <span>Attendance</span>
            </div>
            <div className="mt-2">
              <div className="flex items-end justify-between">
                <span
                  className={`text-2xl font-bold ${getAttendanceColor(attendance?.attendance_percentage ?? 0)}`}
                >
                  {formatAttendancePercentage(attendance?.attendance_percentage ?? 0)}
                </span>
                <span className="text-xs text-gray-500">Last 30 days</span>
              </div>
              <Progress
                value={attendance?.attendance_percentage ?? 0}
                className="mt-2 h-2"
              />
              <div className="mt-2 flex justify-between text-xs text-gray-500">
                <span>Present: {attendance?.present_days ?? 0}</span>
                <span>Absent: {attendance?.absent_days ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Fees */}
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CreditCard className="h-4 w-4" />
              <span>Fee Status</span>
            </div>
            <div className="mt-2">
              {(fees?.total_pending ?? 0) > 0 ? (
                <>
                  <span className="text-2xl font-bold text-orange-600">
                    {formatCurrency(fees?.total_pending ?? 0)}
                  </span>
                  <p className="text-xs text-gray-500">Pending</p>
                  {(fees?.total_overdue ?? 0) > 0 && (
                    <Badge variant="destructive" className="mt-1 text-xs">
                      {formatCurrency(fees?.total_overdue ?? 0)} Overdue
                    </Badge>
                  )}
                </>
              ) : (
                <>
                  <span className="text-2xl font-bold text-green-600">
                    Paid
                  </span>
                  <p className="text-xs text-gray-500">All dues cleared</p>
                </>
              )}
            </div>
          </div>

          {/* Performance */}
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <TrendingUp className="h-4 w-4" />
              <span>Performance</span>
            </div>
            <div className="mt-2">
              {data.grades?.current_cgpa ? (
                <>
                  <span className="text-2xl font-bold text-purple-600">
                    {data.grades.current_cgpa.toFixed(2)}
                  </span>
                  <p className="text-xs text-gray-500">CGPA</p>
                </>
              ) : (
                <>
                  <span className="text-lg font-medium text-gray-400">--</span>
                  <p className="text-xs text-gray-500">No grades yet</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDetails(learner.id)}
          >
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
