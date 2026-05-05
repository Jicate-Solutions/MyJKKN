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
  Globe,
  Home,
  Wrench,
  Bell,
  AppWindow,
  Files,
  ScrollText,
  ClipboardCheck,
  Award,
  Target,
  BookOpen,
  HeartPulse,
  Calendar,
  Lightbulb,
  BookOpenCheck,
  Activity,
  Vote,
  Sparkles,
  Trophy,
  Bug as BugIcon,
  UsersRound
} from 'lucide-react';

// Mirrors MODULES (lib/navigation/modules.ts). When a new module is added there,
// also add an entry here with a Lucide icon + Tailwind color pair.
// Drift between MODULES and this map is caught by
// scripts/check-bug-module-classifier.mjs (CI gate in build-check.yml).
type ModuleName =
  | 'academic'
  | 'admission'
  | 'admin'
  | 'ai-query'
  | 'application-hub'
  | 'applications'
  | 'audit-trail'
  | 'audit'
  | 'accreditation'
  | 'billing'
  | 'bug-leaderboard'
  | 'campus-living'
  | 'events'
  | 'faculty'
  | 'health'
  | 'hr'
  | 'learners-council'
  | 'learners'
  | 'learn'
  | 'my-bug-reports'
  | 'notifications'
  | 'okr'
  | 'organizations'
  | 'resource-management'
  | 'service-requests'
  | 'settings'
  | 'solutions'
  | 'staff'
  | 'startup-studio'
  | 'system'
  | 'users'
  | 'vac'
  | 'work-pulse'
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
  // ── Modules added 2026-05-05 to close TS-side drift (matches SQL CASE in
  //    supabase/setup/01_tables.sql; both derive from MODULES list at
  //    lib/navigation/modules.ts). Color choices reuse existing palette
  //    where the module's character matches an existing one's.
  'campus-living': {
    label: 'Campus Living',
    icon: Home,
    colorClass: 'bg-teal-100 text-teal-800 hover:bg-teal-200 hover:text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-700',
    subColorClass: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-800'
  },
  'service-requests': {
    label: 'Service Requests',
    icon: Wrench,
    colorClass: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 hover:text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700',
    subColorClass: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
  },
  notifications: {
    label: 'Notifications',
    icon: Bell,
    colorClass: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200 hover:text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700',
    subColorClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800'
  },
  'application-hub': {
    label: 'Application Hub',
    icon: AppWindow,
    colorClass: 'bg-sky-100 text-sky-800 hover:bg-sky-200 hover:text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-700',
    subColorClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800'
  },
  applications: {
    label: 'Applications',
    icon: Files,
    colorClass: 'bg-sky-100 text-sky-800 hover:bg-sky-200 hover:text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-700',
    subColorClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800'
  },
  'audit-trail': {
    label: 'Audit Trail',
    icon: ScrollText,
    colorClass: 'bg-stone-100 text-stone-800 hover:bg-stone-200 hover:text-stone-800 border-stone-200 dark:bg-stone-900/40 dark:text-stone-300 dark:border-stone-700',
    subColorClass: 'bg-stone-50 text-stone-700 border-stone-200 dark:bg-stone-900/20 dark:text-stone-400 dark:border-stone-800'
  },
  audit: {
    label: 'Audit Workflow',
    icon: ClipboardCheck,
    colorClass: 'bg-stone-100 text-stone-800 hover:bg-stone-200 hover:text-stone-800 border-stone-200 dark:bg-stone-900/40 dark:text-stone-300 dark:border-stone-700',
    subColorClass: 'bg-stone-50 text-stone-700 border-stone-200 dark:bg-stone-900/20 dark:text-stone-400 dark:border-stone-800'
  },
  accreditation: {
    label: 'Accreditation',
    icon: Award,
    colorClass: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 hover:text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700',
    subColorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
  },
  okr: {
    label: 'OKR & Performance',
    icon: Target,
    colorClass: 'bg-rose-100 text-rose-800 hover:bg-rose-200 hover:text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700',
    subColorClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800'
  },
  learn: {
    label: 'Learning',
    icon: BookOpen,
    colorClass: 'bg-purple-100 text-purple-800 hover:bg-purple-200 hover:text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700',
    subColorClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800'
  },
  vac: {
    label: 'Value Added Courses',
    icon: BookOpenCheck,
    colorClass: 'bg-purple-100 text-purple-800 hover:bg-purple-200 hover:text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700',
    subColorClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800'
  },
  health: {
    label: 'Health & Wellness',
    icon: HeartPulse,
    colorClass: 'bg-rose-100 text-rose-800 hover:bg-rose-200 hover:text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700',
    subColorClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800'
  },
  events: {
    label: 'Events',
    icon: Calendar,
    colorClass: 'bg-fuchsia-100 text-fuchsia-800 hover:bg-fuchsia-200 hover:text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-900/40 dark:text-fuchsia-300 dark:border-fuchsia-700',
    subColorClass: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/20 dark:text-fuchsia-400 dark:border-fuchsia-800'
  },
  solutions: {
    label: 'Solution Hub',
    icon: Lightbulb,
    colorClass: 'bg-amber-100 text-amber-800 hover:bg-amber-200 hover:text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700',
    subColorClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
  },
  'work-pulse': {
    label: 'Work Pulse',
    icon: Activity,
    colorClass: 'bg-lime-100 text-lime-800 hover:bg-lime-200 hover:text-lime-800 border-lime-200 dark:bg-lime-900/40 dark:text-lime-300 dark:border-lime-700',
    subColorClass: 'bg-lime-50 text-lime-700 border-lime-200 dark:bg-lime-900/20 dark:text-lime-400 dark:border-lime-800'
  },
  'learners-council': {
    label: 'Learners Council',
    icon: Vote,
    colorClass: 'bg-violet-100 text-violet-800 hover:bg-violet-200 hover:text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700',
    subColorClass: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800'
  },
  faculty: {
    label: 'Faculty',
    icon: UserCog,
    colorClass: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-200 hover:text-cyan-800 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-700',
    subColorClass: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800'
  },
  'ai-query': {
    label: 'AI Assistant',
    icon: Sparkles,
    colorClass: 'bg-blue-100 text-blue-800 hover:bg-blue-200 hover:text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700',
    subColorClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
  },
  'bug-leaderboard': {
    label: 'Bug Leaderboard',
    icon: Trophy,
    colorClass: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 hover:text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700',
    subColorClass: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
  },
  'my-bug-reports': {
    label: 'My Bug Reports',
    icon: BugIcon,
    colorClass: 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600',
    subColorClass: 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900/20 dark:text-gray-500 dark:border-gray-700'
  },
  system: {
    label: 'System',
    icon: Settings,
    colorClass: 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600',
    subColorClass: 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900/20 dark:text-gray-500 dark:border-gray-700'
  },
  users: {
    label: 'Users',
    icon: Users,
    colorClass: 'bg-slate-100 text-slate-800 hover:bg-slate-200 hover:text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
    subColorClass: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/20 dark:text-slate-400 dark:border-slate-700'
  },
  hr: {
    label: 'HR',
    icon: UsersRound,
    colorClass: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-200 hover:text-cyan-800 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-700',
    subColorClass: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800'
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
