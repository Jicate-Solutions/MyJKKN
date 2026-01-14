/**
 * Grade Distribution Chart Component
 * Shows histogram of grade distribution by percentage ranges
 *
 * Displays:
 * - Grade ranges (0-49%, 50-59%, 60-69%, 70-79%, 80-89%, 90-100%)
 * - Count of students in each range
 * - Visual bar chart
 *
 * Created: 2026-01-12
 */

'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';

interface Grade {
  score_percentage: number;
}

interface GradeDistributionChartProps {
  grades: Grade[];
}

interface GradeRange {
  label: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
  color: string;
}

export function GradeDistributionChart({
  grades
}: GradeDistributionChartProps) {
  const distribution = useMemo(() => {
    if (grades.length === 0) return [];

    const ranges: GradeRange[] = [
      { label: '0-49%', min: 0, max: 49.99, count: 0, percentage: 0, color: 'bg-red-500' },
      { label: '50-59%', min: 50, max: 59.99, count: 0, percentage: 0, color: 'bg-orange-500' },
      { label: '60-69%', min: 60, max: 69.99, count: 0, percentage: 0, color: 'bg-yellow-500' },
      { label: '70-79%', min: 70, max: 79.99, count: 0, percentage: 0, color: 'bg-blue-500' },
      { label: '80-89%', min: 80, max: 89.99, count: 0, percentage: 0, color: 'bg-green-500' },
      { label: '90-100%', min: 90, max: 100, count: 0, percentage: 0, color: 'bg-emerald-500' }
    ];

    // Count grades in each range
    grades.forEach((grade) => {
      const percentage = grade.score_percentage;
      const range = ranges.find((r) => percentage >= r.min && percentage <= r.max);
      if (range) {
        range.count++;
      }
    });

    // Calculate percentages
    ranges.forEach((range) => {
      range.percentage = (range.count / grades.length) * 100;
    });

    return ranges;
  }, [grades]);

  if (grades.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No grades to display distribution
        </p>
      </div>
    );
  }

  const maxCount = Math.max(...distribution.map((r) => r.count), 1);

  return (
    <div className="space-y-6">
      {/* Statistics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Grades</div>
          <div className="text-2xl font-bold">{grades.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Average</div>
          <div className="text-2xl font-bold">
            {(
              grades.reduce((sum, g) => sum + g.score_percentage, 0) /
              grades.length
            ).toFixed(1)}
            %
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Passing (&gt;50%)</div>
          <div className="text-2xl font-bold text-green-600">
            {grades.filter((g) => g.score_percentage >= 50).length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Failing (&lt;50%)</div>
          <div className="text-2xl font-bold text-red-600">
            {grades.filter((g) => g.score_percentage < 50).length}
          </div>
        </Card>
      </div>

      {/* Distribution Chart */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Grade Distribution</h3>
        {distribution.map((range) => (
          <div key={range.label} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{range.label}</span>
              <span className="text-muted-foreground">
                {range.count} students ({range.percentage.toFixed(1)}%)
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-6 relative overflow-hidden">
              <div
                className={`${range.color} h-full rounded-full transition-all duration-500`}
                style={{
                  width: `${(range.count / maxCount) * 100}%`
                }}
              >
                {range.count > 0 && (
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-medium text-white">
                    {range.count}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 flex-wrap text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-500" />
          <span className="text-muted-foreground">Failing</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-orange-500" />
          <span className="text-muted-foreground">Poor</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-500" />
          <span className="text-muted-foreground">Fair</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-500" />
          <span className="text-muted-foreground">Good</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-500" />
          <span className="text-muted-foreground">Very Good</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-500" />
          <span className="text-muted-foreground">Excellent</span>
        </div>
      </div>
    </div>
  );
}
