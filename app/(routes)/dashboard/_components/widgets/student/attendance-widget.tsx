'use client';

import { WidgetContainer } from '../shared/widget-container';
import { Calendar, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface AttendanceWidgetProps {
  present: number;
  absent: number;
  total: number;
  isLoading?: boolean;
  error?: string | null;
}

export function AttendanceWidget({
  present,
  absent,
  total,
  isLoading = false,
  error = null,
}: AttendanceWidgetProps) {
  const router = useRouter();

  const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

  // Color coding based on percentage
  const getStatusColor = () => {
    if (percentage >= 75) return 'text-green-600 bg-green-50 dark:bg-green-950';
    if (percentage >= 65) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950';
    return 'text-red-600 bg-red-50 dark:bg-red-950';
  };

  const getChartColors = () => {
    if (percentage >= 75) return ['#16a34a', '#dc2626']; // green, red
    if (percentage >= 65) return ['#ca8a04', '#dc2626']; // yellow, red
    return ['#dc2626', '#94a3b8']; // red, gray
  };

  const data = [
    { name: 'Present', value: present },
    { name: 'Absent', value: absent },
  ];

  const [presentColor, absentColor] = getChartColors();

  const handleClick = () => {
    router.push('/learners/my-attendance');
  };

  return (
    <WidgetContainer
      title="My Attendance"
      icon={Calendar}
      isLoading={isLoading}
      error={error}
      onClick={handleClick}
    >
      <div className="space-y-4">
        {/* Pie Chart and Percentage */}
        <div className="flex items-center justify-between gap-4">
          {/* Chart */}
          <div className="flex-shrink-0">
            <ResponsiveContainer width={120} height={120}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={50}
                  paddingAngle={2}
                  dataKey="value"
                >
                  <Cell fill={presentColor} />
                  <Cell fill={absentColor} />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Percentage Badge */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <div
              className={cn(
                'px-4 py-2 rounded-lg font-bold text-2xl sm:text-3xl',
                getStatusColor()
              )}
            >
              {percentage}%
            </div>
            <p className="text-xs text-muted-foreground mt-2">Overall</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Present</p>
            <p className="text-base sm:text-lg font-semibold text-green-600">
              {present}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Absent</p>
            <p className="text-base sm:text-lg font-semibold text-red-600">
              {absent}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Total</p>
            <p className="text-base sm:text-lg font-semibold text-foreground">
              {total}
            </p>
          </div>
        </div>

        {/* Warning Message */}
        {percentage < 75 && (
          <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-900">
            <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200">
                Below 75% threshold
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                You need {Math.ceil((75 * total) / 100) - present} more classes to reach 75%
              </p>
            </div>
          </div>
        )}

        {/* Trend Indicator */}
        {percentage >= 75 ? (
          <div className="flex items-center justify-center gap-1 text-xs text-green-600">
            <TrendingUp className="h-3 w-3" />
            <span>Good standing</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1 text-xs text-red-600">
            <TrendingDown className="h-3 w-3" />
            <span>Needs improvement</span>
          </div>
        )}
      </div>
    </WidgetContainer>
  );
}
