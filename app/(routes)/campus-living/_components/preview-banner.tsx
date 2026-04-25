'use client';

/**
 * Inline banner to warn users that a page is showing SAMPLE DATA, not real
 * institution records. Used on analytics and report pages whose UI shipped
 * ahead of the matching query hook.
 *
 * This is a silent-failure remediation — the previous behavior was to display
 * fake numbers with no visual indicator, misleading wardens and auditors.
 *
 * When the hook is wired up, delete the banner from that page.
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

interface PreviewBannerProps {
  feature: string;
  note?: string;
}

export function PreviewBanner({ feature, note }: PreviewBannerProps) {
  return (
    <Alert className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
      <AlertTitle className="text-amber-900 dark:text-amber-200">
        Preview — sample data
      </AlertTitle>
      <AlertDescription className="text-amber-800 dark:text-amber-300">
        {note ??
          `This ${feature} page is in preview. The numbers and rows below are illustrative samples, not live data from your institution. Live data will appear once the corresponding query is wired up.`}
      </AlertDescription>
    </Alert>
  );
}
