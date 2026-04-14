'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PROGRESSION_LEVELS } from '@/lib/constants/startup-studio/progression';
import type { ProgressionLevelNumber } from '@/types/startup-studio';

interface LevelBadgeProps {
  level: ProgressionLevelNumber | number | null | undefined;
  showName?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Color map for progression levels (Tailwind classes for light + dark).
 * Mirrors PROGRESSION_LEVELS color tokens (blue, green, yellow, orange, purple).
 */
const COLOR_CLASSES: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  green: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  yellow: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  orange: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
  purple: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
};

const NEUTRAL = 'bg-muted text-muted-foreground border-border';

export function LevelBadge({ level, showName = true, size = 'md', className }: LevelBadgeProps) {
  if (level === null || level === undefined) {
    return (
      <Badge
        variant="outline"
        className={cn(
          'gap-1 font-medium border',
          NEUTRAL,
          size === 'sm' ? 'text-[10px] py-0 px-1.5' : 'text-xs',
          className,
        )}
      >
        —
      </Badge>
    );
  }

  const config = PROGRESSION_LEVELS.find(p => p.level === (level as ProgressionLevelNumber));
  const color = config ? COLOR_CLASSES[config.color] : NEUTRAL;

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 font-medium border',
        color,
        size === 'sm' ? 'text-[10px] py-0 px-1.5' : 'text-xs',
        className,
      )}
    >
      <span className="font-bold">L{level}</span>
      {showName && config && (
        <span className="hidden sm:inline">· {config.name}</span>
      )}
    </Badge>
  );
}
