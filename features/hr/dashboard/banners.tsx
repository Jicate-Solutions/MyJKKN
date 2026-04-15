'use client';

/**
 * Dashboard banners — today's holiday (decision #26) + FY-end prompt (decision #27).
 *
 * Banners are tiny context-setters above the quadrant grid, computed server-side
 * in `HRDashboardService.getBanners()` so we keep the UI thin.
 */

import { CalendarHeart, Hourglass } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { DashboardBanner } from '@/types/hr-dashboard';

const BANNER_ICONS = {
  today_holiday: CalendarHeart,
  fy_end_prompt: Hourglass,
} as const;

export function DashboardBanners({ banners }: { banners: DashboardBanner[] }) {
  if (!banners || banners.length === 0) return null;

  return (
    <div className="space-y-2">
      {banners.map((b, i) => {
        const Icon = BANNER_ICONS[b.kind];
        return (
          <Alert
            key={`${b.kind}-${i}`}
            className={cn(
              b.severity === 'warning' &&
                'bg-amber-50 border-amber-300 text-amber-900 [&>svg]:text-amber-700',
              b.severity === 'info' &&
                'bg-sky-50 border-sky-300 text-sky-900 [&>svg]:text-sky-700'
            )}
          >
            <Icon className="h-4 w-4" />
            <AlertTitle className="text-sm font-semibold">{b.title}</AlertTitle>
            <AlertDescription className="text-xs">{b.message}</AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
