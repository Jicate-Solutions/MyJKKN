'use client';

/**
 * DataAlertBanner — generic data-driven alert primitive.
 *
 * Usage examples:
 *   // Unassigned leads
 *   <DataAlertBanner
 *     count={12726} total={14300} severity="warning"
 *     title="{count} leads unassigned ({pct}%)"
 *     description="{count} of {total} total leads have no counselor assigned."
 *     cta={{ href: '/admission/leads?filter=unassigned', label: 'Bulk-assign →' }}
 *   />
 *
 *   // Overdue follow-ups
 *   <DataAlertBanner
 *     count={5} severity="warning" dismissible
 *     title="{count} follow-up{plural} overdue"
 *     description="Review and reassign these prospects."
 *     topItems={[{ id: '1', label: 'Acme Corp', sublabel: '3 days overdue' }]}
 *     cta={{ href: '/solutions/pipeline/list?overdue=true', label: 'View All Overdue' }}
 *   />
 */

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Info, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export interface DataAlertBannerProps {
  /** Primary count to surface (e.g. 12,726 leads). 0 → component returns null. */
  count: number;
  /** Optional total for percentage display via {pct} placeholder. */
  total?: number;
  /** Severity tone — colors + icon vary. Default 'warning'. */
  severity?: 'warning' | 'info' | 'critical';
  /**
   * Headline text.
   * Placeholders: {count} → toLocaleString, {pct} → computed %, {plural} → '' or 's', {total} → toLocaleString
   */
  title: string;
  /**
   * Body text. Same placeholder support as title.
   */
  description: string;
  /** Optional CTA button. Rendered as Button asChild Link. */
  cta?: { href: string; label: string };
  /** When true, shows ✕ dismiss button + tracks dismissed in component state. Default false. */
  dismissible?: boolean;
  /**
   * Optional list of preview items — renders top-3 as bullet list + "...and N more" if >3.
   */
  topItems?: Array<{ id: string; label: string; sublabel?: string }>;
  /** Loading state — returns null. */
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Severity config
// ---------------------------------------------------------------------------

const SEVERITY_STYLES = {
  warning: {
    alert: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 [&>svg]:text-amber-600',
    dismiss: 'text-amber-600 hover:text-amber-800 hover:bg-amber-100',
    subtext: 'text-amber-700 dark:text-amber-400',
    cta: 'border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-200',
    icon: AlertTriangle,
  },
  critical: {
    alert: 'border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200 [&>svg]:text-red-600',
    dismiss: 'text-red-600 hover:text-red-800 hover:bg-red-100',
    subtext: 'text-red-700 dark:text-red-400',
    cta: 'border-red-400 text-red-800 hover:bg-red-100 dark:border-red-600 dark:text-red-200',
    icon: AlertTriangle,
  },
  info: {
    alert: 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200 [&>svg]:text-blue-600',
    dismiss: 'text-blue-600 hover:text-blue-800 hover:bg-blue-100',
    subtext: 'text-blue-700 dark:text-blue-400',
    cta: 'border-blue-400 text-blue-800 hover:bg-blue-100 dark:border-blue-600 dark:text-blue-200',
    icon: Info,
  },
} as const;

// ---------------------------------------------------------------------------
// Placeholder substitution
// ---------------------------------------------------------------------------

function substitutePlaceholders(
  template: string,
  count: number,
  total: number | undefined,
): string {
  const pct = total && total > 0 ? Math.round((count / total) * 100) : 0;
  return template
    .replace(/\{count\}/g, count.toLocaleString())
    .replace(/\{total\}/g, total != null ? total.toLocaleString() : '')
    .replace(/\{pct\}/g, String(pct))
    .replace(/\{plural\}/g, count !== 1 ? 's' : '');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataAlertBanner({
  count,
  total,
  severity = 'warning',
  title,
  description,
  cta,
  dismissible = false,
  topItems,
  loading = false,
}: DataAlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (loading || count === 0 || (dismissible && dismissed)) return null;

  const styles = SEVERITY_STYLES[severity];
  const Icon = styles.icon;
  const resolvedTitle = substitutePlaceholders(title, count, total);
  const resolvedDescription = substitutePlaceholders(description, count, total);
  const previewItems = topItems?.slice(0, 3) ?? [];
  const overflow = (topItems?.length ?? 0) - 3;

  return (
    <Alert className={styles.alert}>
      <Icon className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>{resolvedTitle}</span>
        {dismissible && (
          <Button
            variant="ghost"
            size="icon"
            className={`h-6 w-6 -mr-2 -mt-1 ${styles.dismiss}`}
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        )}
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p className="text-sm">{resolvedDescription}</p>
        {previewItems.length > 0 && (
          <ul className="text-sm space-y-1">
            {previewItems.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <span className="font-medium">{item.label}</span>
                {item.sublabel && (
                  <span className={styles.subtext}>({item.sublabel})</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {overflow > 0 && (
          <p className={`text-xs ${styles.subtext}`}>...and {overflow} more</p>
        )}
        {cta && (
          <Button
            variant="outline"
            size="sm"
            asChild
            className={styles.cta}
          >
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
