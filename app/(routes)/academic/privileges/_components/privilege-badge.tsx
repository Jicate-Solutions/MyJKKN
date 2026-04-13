'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Award, Clock, BookOpen, GraduationCap, Wallet } from 'lucide-react';

const PRIVILEGE_TYPE_ICONS: Record<string, typeof Clock> = {
  full_od: Clock,
  full_marks: BookOpen,
  scholarship: GraduationCap,
  funding: Wallet,
};

interface PrivilegeBadgeProps {
  groupName: string;
  referenceCode: string;
  privilegeTypes?: { key: string; name: string }[];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showLink?: boolean;
}

export function PrivilegeBadge({
  groupName,
  referenceCode,
  privilegeTypes = [],
  size = 'md',
  className,
  showLink = false,
}: PrivilegeBadgeProps) {
  const content = (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-100 to-yellow-100 font-medium text-amber-800 border border-amber-200/60',
        size === 'sm' && 'px-2.5 py-0.5 text-xs gap-1',
        size === 'md' && 'px-3 py-1 text-sm gap-1.5',
        size === 'lg' && 'px-4 py-2 text-base gap-2',
        showLink && 'hover:from-amber-200 hover:to-yellow-200 transition-colors cursor-pointer',
        className
      )}
    >
      <Award
        className={cn(
          'text-amber-600 shrink-0',
          size === 'sm' && 'h-3 w-3',
          size === 'md' && 'h-3.5 w-3.5',
          size === 'lg' && 'h-5 w-5'
        )}
      />

      {size === 'sm' ? (
        <span className="truncate max-w-[120px]">{groupName}</span>
      ) : (
        <>
          <span>{groupName}</span>
          <span className="text-amber-500">({referenceCode})</span>
        </>
      )}

      {/* Type icons -- shown in md and lg */}
      {size !== 'sm' && privilegeTypes.length > 0 && (
        <span className="flex items-center gap-0.5 ml-1 border-l border-amber-300/50 pl-1.5">
          {privilegeTypes.map((pt) => {
            const Icon = PRIVILEGE_TYPE_ICONS[pt.key] || Award;
            return (
              <Icon
                key={pt.key}
                className={cn(
                  'text-amber-600',
                  size === 'md' && 'h-3 w-3',
                  size === 'lg' && 'h-4 w-4'
                )}
              />
            );
          })}
        </span>
      )}
    </div>
  );

  if (showLink) {
    return <Link href="/academic/privileges/my">{content}</Link>;
  }

  return content;
}
