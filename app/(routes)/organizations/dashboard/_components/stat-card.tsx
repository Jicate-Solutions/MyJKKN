'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type StatCardVariant =
  | 'blue'
  | 'green'
  | 'orange'
  | 'purple'
  | 'red'
  | 'cyan'
  | 'pink'
  | 'indigo';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  link: string;
  variant?: StatCardVariant;
}

const variantStyles = {
  blue: {
    iconContainer: 'bg-blue-100 dark:bg-blue-800/50',
    icon: 'text-blue-600 dark:text-blue-400',
    border: 'hover:border-blue-200 dark:hover:border-blue-700'
  },
  green: {
    iconContainer: 'bg-green-100 dark:bg-green-800/50',
    icon: 'text-green-600 dark:text-green-400',
    border: 'hover:border-green-200 dark:hover:border-green-700'
  },
  orange: {
    iconContainer: 'bg-orange-100 dark:bg-orange-800/50',
    icon: 'text-orange-600 dark:text-orange-400',
    border: 'hover:border-orange-200 dark:hover:border-orange-700'
  },
  purple: {
    iconContainer: 'bg-purple-100 dark:bg-purple-800/50',
    icon: 'text-purple-600 dark:text-purple-400',
    border: 'hover:border-purple-200 dark:hover:border-purple-700'
  },
  red: {
    iconContainer: 'bg-red-100 dark:bg-red-800/50',
    icon: 'text-red-600 dark:text-red-400',
    border: 'hover:border-red-200 dark:hover:border-red-700'
  },
  cyan: {
    iconContainer: 'bg-cyan-100 dark:bg-cyan-800/50',
    icon: 'text-cyan-600 dark:text-cyan-400',
    border: 'hover:border-cyan-200 dark:hover:border-cyan-700'
  },
  pink: {
    iconContainer: 'bg-pink-100 dark:bg-pink-800/50',
    icon: 'text-pink-600 dark:text-pink-400',
    border: 'hover:border-pink-200 dark:hover:border-pink-700'
  },
  indigo: {
    iconContainer: 'bg-indigo-100 dark:bg-indigo-800/50',
    icon: 'text-indigo-600 dark:text-indigo-400',
    border: 'hover:border-indigo-200 dark:hover:border-indigo-700'
  }
};

export function StatCard({
  title,
  value,
  icon: Icon,
  link,
  variant = 'blue'
}: StatCardProps) {
  const styles = variantStyles[variant];

  return (
    <Link href={link}>
      <Card
        className={cn(
          'group transition-all duration-300 ease-in-out hover:shadow-lg hover:-translate-y-1',
          styles.border
        )}
      >
        <div className='p-4 flex items-center gap-4'>
          <div className={cn('p-3 rounded-full', styles.iconContainer)}>
            <Icon className={cn('h-6 w-6', styles.icon)} />
          </div>
          <div>
            <p className='text-sm text-muted-foreground'>{title}</p>
            <p className='text-2xl font-bold'>{value}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
