// ============================================
// PROFILE COMPLETION INDICATOR
// ============================================
// Created: 2025-01-27
// Purpose: Compact top bar showing profile completion status
// ============================================

'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCompletionVariant } from '@/lib/utils/profile-completion';

interface ProfileCompletionIndicatorProps {
  percentage: number;
  completed: number;
  total: number;
  onViewDetails?: () => void;
}

export function ProfileCompletionIndicator({
  percentage,
  completed,
  total,
  onViewDetails,
}: ProfileCompletionIndicatorProps) {
  const variant = getCompletionVariant(percentage);

  return (
    <div
      className={cn(
        'border rounded-lg p-4 mb-6',
        percentage >= 80 && 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900',
        percentage >= 51 && percentage < 80 && 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900',
        percentage < 51 && 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium">Profile Completion</div>
          <Badge
            variant={variant === 'success' ? 'default' : variant === 'destructive' ? 'destructive' : 'secondary'}
            className={cn(
              variant === 'success' && 'bg-green-600 hover:bg-green-700',
              variant === 'default' && 'bg-yellow-600 hover:bg-yellow-700'
            )}
          >
            {percentage}%
          </Badge>
        </div>
        {onViewDetails && (
          <Button variant="ghost" size="sm" onClick={onViewDetails} className="gap-1">
            View Details
            <ChevronDown className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <Progress
          value={percentage}
          className={cn(
            'h-2',
            percentage >= 80 && '[&>div]:bg-green-600',
            percentage >= 51 && percentage < 80 && '[&>div]:bg-yellow-600',
            percentage < 51 && '[&>div]:bg-red-600'
          )}
        />
        <p className="text-xs text-muted-foreground">
          {completed} of {total} required fields completed
        </p>
      </div>
    </div>
  );
}
