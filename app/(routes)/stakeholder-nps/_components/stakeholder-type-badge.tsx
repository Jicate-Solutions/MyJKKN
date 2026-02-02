'use client';

import { cn } from '@/lib/utils';
import type { StakeholderType } from '@/types/stakeholder-nps';
import { Users, GraduationCap, Award, Briefcase, Building2, UserCheck, Globe } from 'lucide-react';

interface StakeholderTypeBadgeProps {
  type: StakeholderType;
  className?: string;
  showIcon?: boolean;
}

const typeConfig: Record<StakeholderType, {
  label: string;
  bg: string;
  text: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  student: {
    label: 'Students',
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    icon: GraduationCap
  },
  learner: {
    label: 'Learners',
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    icon: GraduationCap
  },
  parent: {
    label: 'Parents',
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    icon: Users
  },
  alumni: {
    label: 'Alumni',
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    icon: Award
  },
  staff: {
    label: 'Staff',
    bg: 'bg-rose-100',
    text: 'text-rose-800',
    icon: Briefcase
  },
  industry: {
    label: 'Industry Partners',
    bg: 'bg-teal-100',
    text: 'text-teal-800',
    icon: Building2
  },
  employer: {
    label: 'Employers',
    bg: 'bg-cyan-100',
    text: 'text-cyan-800',
    icon: UserCheck
  },
  community: {
    label: 'Community',
    bg: 'bg-green-100',
    text: 'text-green-800',
    icon: Globe
  }
};

export function StakeholderTypeBadge({
  type,
  className,
  showIcon = true
}: StakeholderTypeBadgeProps) {
  const config = typeConfig[type];
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
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </span>
  );
}

export function getStakeholderIcon(type: StakeholderType) {
  return typeConfig[type].icon;
}

export function getStakeholderLabel(type: StakeholderType) {
  return typeConfig[type].label;
}
