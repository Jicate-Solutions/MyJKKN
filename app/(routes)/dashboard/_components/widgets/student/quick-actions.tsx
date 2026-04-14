'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  FileText,
  BookOpen,
  User,
  CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickActionsProps {
  isVisible: boolean;
  hasOutstandingBills?: boolean;
}

const ACTIONS = [
  {
    label: 'Timetable',
    icon: Calendar,
    href: '/learners/my-timetable',
    color:
      'bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
  },
  {
    label: 'Apply Leave',
    icon: FileText,
    href: '/learners/leave-onduty/apply',
    color:
      'bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400',
  },
  {
    label: 'My Courses',
    icon: BookOpen,
    href: '/vac/my-courses',
    color:
      'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
  },
  {
    label: 'Profile',
    icon: User,
    href: '/learners/my-profile',
    color:
      'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
  },
] as const;

const BILLS_ACTION = {
  label: 'My Bills',
  icon: CreditCard,
  href: '/billing/student-bills',
  color:
    'bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400',
};

export function QuickActions({
  isVisible,
  hasOutstandingBills = false,
}: QuickActionsProps) {
  const router = useRouter();

  if (!isVisible) return null;

  const actions = hasOutstandingBills
    ? [...ACTIONS, BILLS_ACTION]
    : [...ACTIONS];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.href}
              onClick={() => router.push(action.href)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap',
                'transition-all duration-200 hover:scale-105 active:scale-95',
                'border border-border/50',
                action.color
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {action.label}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
