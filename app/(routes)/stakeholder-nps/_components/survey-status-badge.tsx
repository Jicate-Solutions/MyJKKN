'use client';

import { cn } from '@/lib/utils';
import type { SurveyStatus } from '@/types/stakeholder-nps';
import { Circle, Play, Square, Archive } from 'lucide-react';

interface SurveyStatusBadgeProps {
  status: SurveyStatus;
  className?: string;
}

const statusConfig: Record<SurveyStatus, {
  label: string;
  bg: string;
  text: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  draft: {
    label: 'Draft',
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    icon: Circle
  },
  active: {
    label: 'Active',
    bg: 'bg-green-100',
    text: 'text-green-800',
    icon: Play
  },
  closed: {
    label: 'Closed',
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    icon: Square
  },
  archived: {
    label: 'Archived',
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    icon: Archive
  }
};

export function SurveyStatusBadge({ status, className }: SurveyStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
        config.bg,
        config.text,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}
