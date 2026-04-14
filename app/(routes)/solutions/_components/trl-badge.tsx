'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TRL_LEVELS = {
  1: { name: 'Basic Principles', description: 'Basic principles observed and reported', color: 'bg-red-100 text-red-800 border-red-300' },
  2: { name: 'Concept Formulated', description: 'Technology concept and/or application formulated', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  3: { name: 'Proof of Concept', description: 'Analytical and experimental proof of concept', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  4: { name: 'Lab Validated', description: 'Component validated in laboratory environment', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  5: { name: 'Relevant Environment', description: 'Component validated in relevant environment', color: 'bg-lime-100 text-lime-800 border-lime-300' },
  6: { name: 'Demonstrated', description: 'System demonstrated in relevant environment', color: 'bg-green-100 text-green-800 border-green-300' },
  7: { name: 'Operational Prototype', description: 'System prototype in operational environment', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  8: { name: 'System Complete', description: 'Actual system completed and qualified', color: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  9: { name: 'Proven', description: 'Actual system proven in operational environment', color: 'bg-blue-100 text-blue-800 border-blue-300' },
} as const;

interface TRLBadgeProps {
  level: number;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  className?: string;
}

export function TRLBadge({ level, size = 'md', showName = false, className }: TRLBadgeProps) {
  const trlLevel = TRL_LEVELS[level as keyof typeof TRL_LEVELS];

  if (!trlLevel) {
    return (
      <Badge variant="outline" className={className}>
        TRL ?
      </Badge>
    );
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        trlLevel.color,
        sizeClasses[size],
        'font-semibold border',
        className
      )}
      title={trlLevel.name}
    >
      TRL {level}
      {showName && ` - ${trlLevel.name}`}
    </Badge>
  );
}

export { TRL_LEVELS };
