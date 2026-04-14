'use client';

import { motion } from 'framer-motion';
import { Trophy, ChevronRight, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLearnerBadges } from '@/hooks/pde/use-pde';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import type { PDELearnerBadge } from '@/types/pde';

interface BadgeStripProps {
  studentId: string;
  isVisible: boolean;
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export function BadgeStrip({ studentId, isVisible }: BadgeStripProps) {
  const router = useRouter();
  const {
    data: badges,
    isLoading,
    error: badgeError,
  } = useLearnerBadges(studentId);

  if (!isVisible) return null;

  if (badgeError && !isLoading) return null;

  const recentBadges: PDELearnerBadge[] = badges
    ? [...badges]
        .sort(
          (a, b) =>
            new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime()
        )
        .slice(0, 5)
    : [];

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass-card rounded-xl p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Recent Badges</span>
        </div>
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-28 flex-shrink-0 rounded-lg" />
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="glass-card rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Trophy className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-semibold">Recent Badges</span>
          {badges && badges.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({badges.length})
            </span>
          )}
        </div>
        {badges && badges.length > 0 && (
          <button
            onClick={() => router.push(`/portfolio/${studentId}`)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View All
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {recentBadges.length === 0 ? (
        <div className="flex items-center gap-4 py-4 px-2">
          <Award className="h-8 w-8 text-muted-foreground/40 flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            No badges earned yet
          </p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          {recentBadges.map((lb) => (
            <div
              key={lb.id}
              className={cn(
                'flex-shrink-0 flex flex-col items-center gap-1.5 p-3 rounded-lg',
                'bg-muted/50 border border-border/50 min-w-[100px] max-w-[120px]',
                'hover:bg-muted/80 transition-colors'
              )}
            >
              {lb.badge?.icon_url ? (
                <img
                  src={lb.badge.icon_url}
                  alt={lb.badge?.name || 'Badge'}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Award className="h-4 w-4 text-primary" />
                </div>
              )}
              <p className="text-xs font-medium text-center leading-tight line-clamp-2">
                {lb.badge?.name || 'Badge'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {formatRelativeTime(lb.earned_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
