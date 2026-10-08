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
  gray: 'border-border text-muted-foreground',
  blue: 'border-primary text-primary',
  indigo: 'border-primary text-primary',
  purple: 'border-primary text-primary',
  // Filled, so finished states (received, completed) read apart from in-flight ones.
  green: 'border-primary bg-primary/10 text-primary',
  amber: 'border-secondary bg-secondary/20 text-foreground',
  orange: 'border-secondary bg-secondary/20 text-foreground',
  red: 'border-destructive text-destructive',
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
