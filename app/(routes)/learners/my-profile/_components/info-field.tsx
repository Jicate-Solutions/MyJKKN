'use client';

import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface InfoFieldProps {
  label: string;
  value: any;
  className?: string;
  isChanged?: boolean;
  icon?: LucideIcon;
}

export function InfoField({ label, value, className, isChanged, icon: Icon }: InfoFieldProps) {
  const displayValue = value ?? 'Not provided';
  const isProvided = !!value;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center gap-2">
        {Icon && (
          <div className="flex-shrink-0">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
        <label className="text-sm font-medium text-muted-foreground">{label}</label>
      </div>
      <p
        className={cn(
          'text-sm font-medium break-words',
          isProvided ? 'text-foreground' : 'text-muted-foreground italic',
          isChanged && 'text-green-600 dark:text-green-400 font-semibold',
          Icon && 'ml-6'
        )}
      >
        {displayValue}
      </p>
    </div>
  );
}
