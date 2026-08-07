'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Single source of truth for the accent applied to a procurement status badge.
 *
 * The `color` token comes from the *_STATUS_CONFIG maps in `types/procurement/*`
 * (PR / RFQ / QUOTATION / PO / GRN / GRN_MATCH). Those maps already carry the
 * intended colour; before this component existed only the GRN match badge
 * consumed it, via a `MATCH_COLOR` map duplicated across two pages.
 *
 * Every tone carries a dark-mode variant — `darkMode: ['class']` is active, and
 * a bare `text-*-700` is unreadable on a dark surface.
 */
export const STATUS_TONE: Record<string, string> = {
  gray: 'border-gray-400 text-gray-700 dark:border-gray-500 dark:text-gray-300',
  blue: 'border-blue-400 text-blue-700 dark:border-blue-500 dark:text-blue-300',
  indigo: 'border-indigo-400 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300',
  purple: 'border-purple-400 text-purple-700 dark:border-purple-400 dark:text-purple-300',
  green: 'border-green-500 text-green-700 dark:border-green-500 dark:text-green-300',
  amber: 'border-amber-500 text-amber-700 dark:border-amber-500 dark:text-amber-300',
  orange: 'border-orange-500 text-orange-700 dark:border-orange-500 dark:text-orange-300',
  red: 'border-red-500 text-red-700 dark:border-red-500 dark:text-red-300',
};

export type StatusConfigEntry = { label: string; color: string };

/** `partially_received` -> `Partially received`. Fallback for a status the map doesn't know. */
function humanise(value: string): string {
  const s = value.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface StatusBadgeProps {
  /** Raw status value as stored in the database. */
  status: string | null | undefined;
  /** One of the *_STATUS_CONFIG maps from `types/procurement`. */
  config: Record<string, StatusConfigEntry>;
  className?: string;
}

/**
 * Renders a status as a colour-accented badge.
 *
 * Deliberately takes `status` as a plain string rather than the union type: the
 * value arrives from the database, and migrations have added statuses that the
 * compiled union does not yet know about. Indexing the config directly and
 * reading `.label` off the result throws on those; this degrades to a readable
 * grey badge instead.
 */
export function StatusBadge({ status, config, className }: StatusBadgeProps) {
  if (!status) {
    return (
      <Badge variant="outline" className={cn(STATUS_TONE.gray, className)}>
        &mdash;
      </Badge>
    );
  }

  const entry = config[status];
  const tone = STATUS_TONE[entry?.color ?? 'gray'] ?? STATUS_TONE.gray;

  return (
    <Badge variant="outline" className={cn(tone, className)}>
      {entry?.label ?? humanise(status)}
    </Badge>
  );
}
