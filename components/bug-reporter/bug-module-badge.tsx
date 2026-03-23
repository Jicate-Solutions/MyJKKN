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
  size?: 'sm' | 'md' | 'lg';
}

const moduleConfig: Record<
  ModuleName,
  { label: string; icon: React.ElementType; colorClass: string }
> = {
  academic: {
    label: 'Academic',
    icon: GraduationCap,
    colorClass:
      'bg-blue-100 text-blue-800 hover:bg-blue-200 hover:text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700'
  },
  billing: {
    label: 'Billing',
    icon: CreditCard,
    colorClass:
      'bg-green-100 text-green-800 hover:bg-green-200 hover:text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700'
  },
  learners: {
    label: 'Learners',
    icon: Users,
    colorClass:
      'bg-violet-100 text-violet-800 hover:bg-violet-200 hover:text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700'
  },
  staff: {
    label: 'Staff',
    icon: UserCog,
    colorClass:
      'bg-cyan-100 text-cyan-800 hover:bg-cyan-200 hover:text-cyan-800 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-700'
  },
  admission: {
    label: 'Admission',
    icon: ClipboardList,
    colorClass:
      'bg-amber-100 text-amber-800 hover:bg-amber-200 hover:text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700'
  },
  organizations: {
    label: 'Organizations',
    icon: Building2,
    colorClass:
      'bg-slate-100 text-slate-800 hover:bg-slate-200 hover:text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600'
  },
  'resource-management': {
    label: 'Resources',
    icon: Package,
    colorClass:
      'bg-orange-100 text-orange-800 hover:bg-orange-200 hover:text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700'
  },
  'startup-studio': {
    label: 'Startup Studio',
    icon: Rocket,
    colorClass:
      'bg-pink-100 text-pink-800 hover:bg-pink-200 hover:text-pink-800 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-700'
  },
  settings: {
    label: 'Settings',
    icon: Settings,
    colorClass:
      'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600'
  },
  admin: {
    label: 'Admin',
    icon: ShieldCheck,
    colorClass:
      'bg-red-100 text-red-800 hover:bg-red-200 hover:text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700'
  },
  other: {
    label: 'Other',
    icon: Globe,
    colorClass:
      'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600'
  }
};

export function BugModuleBadge({ module, size = 'md' }: BugModuleBadgeProps) {
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

  return (
    <Badge className={`${config.colorClass} ${sizeClasses[size]} gap-1`}>
      <Icon className={iconSizes[size]} />
      {config.label}
    </Badge>
  );
}
