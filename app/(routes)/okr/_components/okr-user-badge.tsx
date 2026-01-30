'use client';

import { UserBadge } from '@/types/okr';
import { CheckCircle2, AlertCircle, AlertTriangle, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OKRUserBadgeProps {
  badge: UserBadge;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showDescription?: boolean;
  className?: string;
}

const badgeConfig: Record<UserBadge, {
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}> = {
  green: {
    color: 'text-white',
    bgColor: 'bg-emerald-500',
    icon: <CheckCircle2 />,
    label: 'On Track',
    description: 'Everything is going well'
  },
  yellow: {
    color: 'text-white',
    bgColor: 'bg-amber-500',
    icon: <AlertCircle />,
    label: 'Needs Attention',
    description: 'Progress is slower than expected'
  },
  red: {
    color: 'text-white',
    bgColor: 'bg-red-500',
    icon: <AlertTriangle />,
    label: 'Behind Schedule',
    description: 'Significantly behind targets'
  },
  blocked: {
    color: 'text-white',
    bgColor: 'bg-slate-700',
    icon: <Ban />,
    label: 'Blocked',
    description: 'Weekly check-in overdue'
  }
};

const sizeConfig = {
  sm: {
    container: 'gap-2',
    iconWrapper: 'p-1.5',
    icon: 'h-3 w-3',
    label: 'text-sm font-medium',
    description: 'text-xs'
  },
  md: {
    container: 'gap-3',
    iconWrapper: 'p-2',
    icon: 'h-4 w-4',
    label: 'text-base font-semibold',
    description: 'text-xs'
  },
  lg: {
    container: 'gap-4',
    iconWrapper: 'p-3',
    icon: 'h-5 w-5',
    label: 'text-lg font-semibold',
    description: 'text-sm'
  }
};

export function OKRUserBadge({
  badge,
  size = 'md',
  showLabel = true,
  showDescription = true,
  className
}: OKRUserBadgeProps) {
  const config = badgeConfig[badge];
  const sizes = sizeConfig[size];

  // Clone icon with correct size
  const sizedIcon = (
    <span className={cn(sizes.icon, config.color)}>
      {config.icon}
    </span>
  );

  return (
    <div className={cn('flex items-center', sizes.container, className)}>
      <div className={cn(config.bgColor, sizes.iconWrapper, 'rounded-full flex items-center justify-center')}>
        {sizedIcon}
      </div>
      {(showLabel || showDescription) && (
        <div>
          {showLabel && (
            <p className={sizes.label}>{config.label}</p>
          )}
          {showDescription && (
            <p className={cn(sizes.description, 'text-muted-foreground')}>{config.description}</p>
          )}
        </div>
      )}
    </div>
  );
}

// Export for icon-only usage
export function OKRUserBadgeIcon({ badge, size = 'md' }: { badge: UserBadge; size?: 'sm' | 'md' | 'lg' }) {
  const config = badgeConfig[badge];
  const sizes = sizeConfig[size];

  return (
    <div className={cn(config.bgColor, sizes.iconWrapper, 'rounded-full flex items-center justify-center')}>
      <span className={cn(sizes.icon, config.color)}>
        {config.icon}
      </span>
    </div>
  );
}

// Export config for external use
export { badgeConfig };
