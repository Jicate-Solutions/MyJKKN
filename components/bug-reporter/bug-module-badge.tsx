import { Badge } from '@/components/ui/badge';
import {
  GraduationCap,
  CreditCard,
  Users,
  UserCog,
  ClipboardList,
  Building2,
  Package,
  Rocket,
  Settings,
  ShieldCheck,
  Globe
} from 'lucide-react';

type ModuleName =
  | 'academic'
  | 'billing'
  | 'learners'
  | 'staff'
  | 'admission'
  | 'organizations'
  | 'resource-management'
  | 'startup-studio'
  | 'settings'
  | 'admin'
  | 'other';

interface BugModuleBadgeProps {
  module?: string | null;
  subModule?: string | null;
  size?: 'sm' | 'md' | 'lg';
  /** When true, renders module + sub-module as two stacked badges */
  stacked?: boolean;
}

export const moduleConfig: Record<
  ModuleName,
  { label: string; icon: React.ElementType; colorClass: string; subColorClass: string }
> = {
  academic: {
    label: 'Academic',
    icon: GraduationCap,
    colorClass:
      'bg-blue-100 text-blue-800 hover:bg-blue-200 hover:text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700',
    subColorClass:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
  },
  billing: {
    label: 'Billing',
    icon: CreditCard,
    colorClass:
      'bg-green-100 text-green-800 hover:bg-green-200 hover:text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700',
    subColorClass:
      'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
  },
  learners: {
    label: 'Learners',
    icon: Users,
    colorClass:
      'bg-violet-100 text-violet-800 hover:bg-violet-200 hover:text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700',
    subColorClass:
      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800'
  },
  staff: {
    label: 'Staff',
    icon: UserCog,
    colorClass:
      'bg-cyan-100 text-cyan-800 hover:bg-cyan-200 hover:text-cyan-800 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-700',
    subColorClass:
      'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800'
  },
  admission: {
    label: 'Admission',
    icon: ClipboardList,
    colorClass:
      'bg-amber-100 text-amber-800 hover:bg-amber-200 hover:text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700',
    subColorClass:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
  },
  organizations: {
    label: 'Organizations',
    icon: Building2,
    colorClass:
      'bg-slate-100 text-slate-800 hover:bg-slate-200 hover:text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
    subColorClass:
      'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/20 dark:text-slate-400 dark:border-slate-700'
  },
  'resource-management': {
    label: 'Resources',
    icon: Package,
    colorClass:
      'bg-orange-100 text-orange-800 hover:bg-orange-200 hover:text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700',
    subColorClass:
      'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800'
  },
  'startup-studio': {
    label: 'Startup Studio',
    icon: Rocket,
    colorClass:
      'bg-pink-100 text-pink-800 hover:bg-pink-200 hover:text-pink-800 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-700',
    subColorClass:
      'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-400 dark:border-pink-800'
  },
  settings: {
    label: 'Settings',
    icon: Settings,
    colorClass:
      'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600',
    subColorClass:
      'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900/20 dark:text-gray-500 dark:border-gray-700'
  },
  admin: {
    label: 'Admin',
    icon: ShieldCheck,
    colorClass:
      'bg-red-100 text-red-800 hover:bg-red-200 hover:text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700',
    subColorClass:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
  },
  other: {
    label: 'Other',
    icon: Globe,
    colorClass:
      'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600',
    subColorClass:
      'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900/20 dark:text-gray-500 dark:border-gray-700'
  }
};

/** Convert a URL slug like "leave-calendar" → "Leave Calendar" */
export function formatSubModuleLabel(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function BugModuleBadge({ module, subModule, size = 'md', stacked = false }: BugModuleBadgeProps) {
  const key = (module as ModuleName) in moduleConfig ? (module as ModuleName) : 'other';
  const config = moduleConfig[key];
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs py-0 px-1.5',
    md: 'text-sm py-0.5 px-2',
    lg: 'text-base py-1 px-3'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4'
  };

  if (stacked && subModule) {
    return (
      <div className='flex flex-col gap-0.5 items-start'>
        <Badge className={`${config.colorClass} ${sizeClasses[size]} gap-1`}>
          <Icon className={iconSizes[size]} />
          {config.label}
        </Badge>
        <Badge className={`${config.subColorClass} ${sizeClasses[size]} ml-1`}>
          {formatSubModuleLabel(subModule)}
        </Badge>
      </div>
    );
  }

  return (
    <Badge className={`${config.colorClass} ${sizeClasses[size]} gap-1`}>
      <Icon className={iconSizes[size]} />
      {config.label}
    </Badge>
  );
}
