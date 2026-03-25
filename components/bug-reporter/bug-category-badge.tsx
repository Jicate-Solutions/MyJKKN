import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  Lightbulb,
  Palette,
  Gauge,
  Shield,
  Bug
} from 'lucide-react';
import { BugReportCategory } from '@/types/bugs';

interface BugCategoryBadgeProps {
  category?: BugReportCategory | null;
  size?: 'sm' | 'md' | 'lg';
}

const categoryConfig: Record<
  BugReportCategory,
  {
    label: string;
    icon: React.ElementType;
    colorClass: string;
  }
> = {
  bug: {
    label: 'Bug',
    icon: AlertCircle,
    colorClass:
      'bg-red-100 text-red-800 hover:bg-red-200 hover:text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200'
  },
  feature_request: {
    label: 'Feature Request',
    icon: Lightbulb,
    colorClass:
      'bg-blue-100 text-blue-800 hover:bg-blue-200 hover:text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200'
  },
  ui_design: {
    label: 'UI/Design',
    icon: Palette,
    colorClass:
      'bg-purple-100 text-purple-800 hover:bg-purple-200 hover:text-purple-800 border-purple-200 dark:bg-purple-900 dark:text-purple-200'
  },
  performance: {
    label: 'Performance',
    icon: Gauge,
    colorClass:
      'bg-orange-100 text-orange-800 hover:bg-orange-200 hover:text-orange-800 border-orange-200 dark:bg-orange-900 dark:text-orange-200'
  },
  security: {
    label: 'Security',
    icon: Shield,
    colorClass:
      'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 hover:text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200'
  },
  other: {
    label: 'Other',
    icon: Bug,
    colorClass:
      'bg-gray-100 text-gray-800 hover:bg-gray-200 hover:text-gray-800 border-gray-200 dark:bg-gray-700 dark:text-gray-200'
  }
};

export function BugCategoryBadge({
  category = 'bug',
  size = 'md'
}: BugCategoryBadgeProps) {
  const config = categoryConfig[category || 'bug'];
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
