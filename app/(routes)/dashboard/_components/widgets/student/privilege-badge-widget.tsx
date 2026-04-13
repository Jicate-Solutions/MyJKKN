'use client';

import { useLearnerPrivileges } from '@/hooks/academic/use-privileges';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award, ChevronRight, Pause } from 'lucide-react';
import Link from 'next/link';
import type { RenewalStatus } from '@/types/privileges';

interface PrivilegeBadgeWidgetProps {
  studentId: string;
  isVisible?: boolean;
}

// Card appearance based on renewal status
const WIDGET_STYLES: Record<
  RenewalStatus,
  {
    card: string;
    icon: string;
    title: string;
    subtitle: string;
    badge: string;
    statusLabel: string | null;
  }
> = {
  active: {
    card: 'bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200 dark:border-amber-800',
    icon: 'bg-amber-500',
    title: 'text-amber-900 dark:text-amber-100',
    subtitle: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-200/60 dark:bg-amber-800/40 text-amber-800 dark:text-amber-200 border-0',
    statusLabel: null,
  },
  pending_report: {
    card: 'bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-950/30 dark:to-orange-900/20 border-amber-300 dark:border-amber-700 animate-pulse',
    icon: 'bg-amber-600',
    title: 'text-amber-900 dark:text-amber-100',
    subtitle: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-200/60 dark:bg-amber-800/40 text-amber-800 dark:text-amber-200 border-0',
    statusLabel: 'Report Due',
  },
  pending_review: {
    card: 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200 dark:border-blue-800',
    icon: 'bg-blue-500',
    title: 'text-blue-900 dark:text-blue-100',
    subtitle: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-200/60 dark:bg-blue-800/40 text-blue-800 dark:text-blue-200 border-0',
    statusLabel: 'Under Review',
  },
  paused: {
    card: 'bg-gradient-to-br from-red-50 to-gray-100 dark:from-red-950/30 dark:to-gray-900/20 border-red-200 dark:border-red-800',
    icon: 'bg-red-400',
    title: 'text-red-900 dark:text-red-100',
    subtitle: 'text-red-700 dark:text-red-300',
    badge: 'bg-red-200/60 dark:bg-red-800/40 text-red-800 dark:text-red-200 border-0',
    statusLabel: 'Paused',
  },
};

export function PrivilegeBadgeWidget({ studentId, isVisible = true }: PrivilegeBadgeWidgetProps) {
  const { data: privileges, isLoading } = useLearnerPrivileges(studentId);

  // Don't render anything if no privileges or hidden
  if (!isVisible || isLoading || !privileges || privileges.length === 0) {
    return null;
  }

  // Get the first privilege group (most learners will have one)
  const primary = privileges[0];
  const typeNames = primary.privilege_types.map(t => t.name);
  const renewalStatus: RenewalStatus = primary.renewal_status ?? 'active';
  const styles = WIDGET_STYLES[renewalStatus] ?? WIDGET_STYLES.active;

  return (
    <Link href="/academic/privileges/my" className="block">
      <Card className={`${styles.card} hover:shadow-md transition-shadow cursor-pointer`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 ${styles.icon} rounded-lg shrink-0`}>
              {renewalStatus === 'paused' ? (
                <Pause className="h-5 w-5 text-white" />
              ) : (
                <Award className="h-5 w-5 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`font-semibold text-sm truncate ${styles.title}`}>
                  {primary.group_name}
                </h3>
                {styles.statusLabel && (
                  <Badge
                    variant="secondary"
                    className={`text-[10px] shrink-0 ${styles.badge}`}
                  >
                    {styles.statusLabel}
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 ml-auto" />
              </div>
              <p className={`text-xs mb-2 ${styles.subtitle}`}>
                Director Order #{primary.reference_code}
              </p>
              <div className="flex flex-wrap gap-1">
                {typeNames.map((name) => (
                  <Badge
                    key={name}
                    variant="secondary"
                    className={`text-[10px] ${styles.badge}`}
                  >
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
