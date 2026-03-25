'use client';

import { cn } from '@/lib/utils';
import { Award } from 'lucide-react';

interface PrivilegeBadgeProps {
  groupName: string;
  referenceCode: string;
  className?: string;
}

export function PrivilegeBadge({ groupName, referenceCode, className }: PrivilegeBadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-100 to-yellow-100 px-3 py-1 text-sm font-medium text-amber-800 border border-amber-200/60',
        className
      )}
    >
      <Award className="h-3.5 w-3.5 text-amber-600" />
      <span>{groupName}</span>
      <span className="text-amber-500">({referenceCode})</span>
    </div>
  );
}
