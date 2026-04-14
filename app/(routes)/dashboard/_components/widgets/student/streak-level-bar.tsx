'use client';

import { motion } from 'framer-motion';
import { Flame, Star, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReputation } from '@/hooks/pde/use-pde';
import { useStudentEngagement } from '@/hooks/analytics/use-student-engagement';
import { Skeleton } from '@/components/ui/skeleton';
import type { ReputationLevel } from '@/types/pde';

interface StreakLevelBarProps {
  studentId: string;
  isVisible: boolean;
}

const LEVEL_THRESHOLDS: Record<ReputationLevel, number> = {
  apprentice: 0,
  practitioner: 100,
  expert: 500,
  principal: 1500,
  mentor: 5000,
};

const LEVEL_ORDER: ReputationLevel[] = [
  'apprentice',
  'practitioner',
  'expert',
  'principal',
  'mentor',
];

function getNextLevel(current: ReputationLevel): ReputationLevel | null {
  const idx = LEVEL_ORDER.indexOf(current);
  return idx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[idx + 1] : null;
}

function getLevelProgress(points: number, currentLevel: ReputationLevel): number {
  const next = getNextLevel(currentLevel);
  if (!next) return 100;
  const currentThreshold = LEVEL_THRESHOLDS[currentLevel];
  const nextThreshold = LEVEL_THRESHOLDS[next];
  const range = nextThreshold - currentThreshold;
  const progress = points - currentThreshold;
  return Math.min(Math.round((progress / range) * 100), 100);
}

function getStreakMilestone(streak: number): number | null {
  const milestones = [7, 14, 30, 60, 100];
  return milestones.find((m) => m > streak) ?? null;
}

function getStreakMotivation(streak: number): string {
  if (streak === 0) return 'Start a new streak today!';
  const next = getStreakMilestone(streak);
  if (!next) return 'Incredible streak!';
  return `${next - streak} days to ${next}-day milestone`;
}

const ENGAGEMENT_COLORS: Record<string, string> = {
  high: 'text-green-600 bg-green-50 dark:bg-green-950/50',
  medium: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/50',
  low: 'text-orange-600 bg-orange-50 dark:bg-orange-950/50',
  at_risk: 'text-red-600 bg-red-50 dark:bg-red-950/50',
};

export function StreakLevelBar({ studentId, isVisible }: StreakLevelBarProps) {
  const {
    data: reputation,
    isLoading: repLoading,
    error: repError,
  } = useReputation(studentId);
  const { data: engagement } = useStudentEngagement({
    studentId,
    enabled: !!studentId,
  });

  if (!isVisible) return null;

  const streak = reputation?.current_streak ?? 0;
  const level = reputation?.level ?? 'apprentice';
  const points = reputation?.total_points ?? 0;
  const progress = getLevelProgress(points, level);

  const percentileRank = engagement?.currentScore?.percentile_rank;
  const engagementLevel = engagement?.currentScore?.engagement_level;

  if (repLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-xl p-4 sm:p-5"
      >
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
          <Skeleton className="h-24 w-full sm:w-1/2 rounded-lg" />
          <Skeleton className="h-24 w-full sm:w-1/2 rounded-lg" />
        </div>
      </motion.div>
    );
  }

  if (repError && !repLoading) return null;

  if (!reputation && !repLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-xl p-4 sm:p-5"
      >
        <div className="flex items-center gap-4 py-2">
          <Flame className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Your journey starts here
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass-card rounded-xl p-4 sm:p-5"
    >
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
        <div className="flex items-center gap-4 flex-1">
          <div
            className={cn(
              'flex-shrink-0 p-3 rounded-xl',
              streak > 0
                ? 'bg-orange-100 dark:bg-orange-950/50'
                : 'bg-muted'
            )}
          >
            <Flame
              className={cn(
                'h-6 w-6',
                streak > 0
                  ? 'text-orange-500'
                  : 'text-muted-foreground/40'
              )}
            />
          </div>
          <div>
            <p className="text-4xl sm:text-5xl font-bold tracking-tight leading-none">
              {streak}
            </p>
            <p className="text-xs text-muted-foreground mt-1">day streak</p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
              {streak > 0 ? 'Keep it going!' : 'Start today!'}
            </p>
          </div>
        </div>

        <div className="hidden sm:block w-px bg-border self-stretch" />
        <div className="sm:hidden h-px bg-border" />

        <div className="flex-1 flex flex-col justify-center gap-3">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 p-2 rounded-lg bg-primary/10">
              <Star className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold capitalize">{level}</p>
                <span className="text-xs text-muted-foreground">
                  {points} pts
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {getStreakMotivation(streak)}
              </p>
            </div>
          </div>

          {percentileRank != null && (
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex-shrink-0 p-2 rounded-lg',
                  ENGAGEMENT_COLORS[engagementLevel || 'medium']
                )}
              >
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  Top {Math.round(100 - percentileRank)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  in your section
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
