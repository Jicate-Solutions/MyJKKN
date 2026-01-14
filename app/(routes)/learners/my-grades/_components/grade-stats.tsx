/**
 * Grade Statistics Component
 * Shows summary statistics of student grades
 *
 * Displays:
 * - Total assignments graded
 * - Average score percentage
 * - Highest and lowest scores
 * - Completion status
 *
 * Created: 2026-01-12
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Target, CheckCircle2 } from 'lucide-react';

interface Grade {
  id: string;
  score: number;
  score_maximum: number;
  score_percentage: number;
  activity_progress: string | null;
  grading_progress: string | null;
}

interface GradeStatsProps {
  grades: Grade[];
}

export function GradeStats({ grades }: GradeStatsProps) {
  if (grades.length === 0) {
    return null;
  }

  // Calculate statistics
  const totalGrades = grades.length;

  const averagePercentage =
    grades.reduce((sum, grade) => sum + grade.score_percentage, 0) /
    totalGrades;

  const highestGrade = Math.max(
    ...grades.map((g) => g.score_percentage)
  );

  const lowestGrade = Math.min(
    ...grades.map((g) => g.score_percentage)
  );

  const completedCount = grades.filter(
    (g) =>
      g.activity_progress === 'Completed' &&
      g.grading_progress === 'FullyGraded'
  ).length;

  const completionRate = (completedCount / totalGrades) * 100;

  // Color coding for average
  let avgColor = 'text-green-600 dark:text-green-400';
  let avgBgColor = 'bg-green-50 dark:bg-green-950';
  if (averagePercentage < 50) {
    avgColor = 'text-red-600 dark:text-red-400';
    avgBgColor = 'bg-red-50 dark:bg-red-950';
  } else if (averagePercentage < 75) {
    avgColor = 'text-yellow-600 dark:text-yellow-400';
    avgBgColor = 'bg-yellow-50 dark:bg-yellow-950';
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Total Assignments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Total Assignments
          </CardTitle>
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalGrades}</div>
          <p className="text-xs text-muted-foreground">
            {completedCount} fully graded
          </p>
        </CardContent>
      </Card>

      {/* Average Score */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Average Score</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${avgColor}`}>
            {averagePercentage.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground">
            Across all assignments
          </p>
        </CardContent>
      </Card>

      {/* Highest Score */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Highest Score</CardTitle>
          <TrendingUp className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {highestGrade.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground">Best performance</p>
        </CardContent>
      </Card>

      {/* Lowest Score */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Lowest Score</CardTitle>
          <TrendingDown className="h-4 w-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {lowestGrade.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground">Room for improvement</p>
        </CardContent>
      </Card>
    </div>
  );
}
