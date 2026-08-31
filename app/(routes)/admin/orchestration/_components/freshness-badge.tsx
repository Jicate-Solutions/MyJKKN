// Header freshness stamp — spec section 08 ("When the session is offline").
// The page is never blank and never lies about freshness: it always shows the
// newest tower-session heartbeat, stamped with how old it is, and moves
// through live → stale → very-stale bands as that heartbeat ages.
//
// The writer for this badge is the `orchestration-sync` Vercel cron
// (vercel.json: "22,52 * * * *" — every 30 minutes), NOT the fleet's own
// 5-minute heartbeat/poller. A threshold has to match the thing that writes
// the timestamp it's judging, or the badge cries wolf on every healthy cycle.

import { differenceInMilliseconds, formatDistanceToNowStrict } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Sync interval (30m, from vercel.json's "22,52 * * * *" cron) + grace
// (10m for cron jitter and build/deploy time before the next tick runs).
// A heartbeat can legitimately be up to ~30 minutes old and still be the
// product of a perfectly healthy cron — only past interval + grace has a
// cycle actually been missed.
const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const GRACE_MS = 10 * 60 * 1000;
const STALE_THRESHOLD_MS = SYNC_INTERVAL_MS + GRACE_MS; // 40 minutes

// Past this point it isn't "a cycle ran late" anymore — the cron has missed
// several ticks in a row, which means it's broken rather than merely
// jittery. ~4 sync cycles (2 hours) gives a clearly worse, distinct band.
const VERY_STALE_THRESHOLD_MS = SYNC_INTERVAL_MS * 4; // 2 hours

interface FreshnessBadgeProps {
  lastSeenAt: string | null;
}

export function FreshnessBadge({ lastSeenAt }: FreshnessBadgeProps) {
  if (!lastSeenAt) {
    return (
      <Badge variant="outline" className="gap-1.5 text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        no session has ever reported in
      </Badge>
    );
  }

  const seenAt = new Date(lastSeenAt);
  const ageMs = differenceInMilliseconds(new Date(), seenAt);
  const isVeryStale = ageMs > VERY_STALE_THRESHOLD_MS;
  const isStale = ageMs > STALE_THRESHOLD_MS;
  const relative = formatDistanceToNowStrict(seenAt, { addSuffix: true });

  const badgeClass = isVeryStale
    ? 'border-red-300 bg-red-50 text-red-800'
    : isStale
      ? 'border-amber-300 bg-amber-50 text-amber-800'
      : 'border-emerald-300 bg-emerald-50 text-emerald-800';
  const dotClass = isVeryStale ? 'bg-red-500' : isStale ? 'bg-amber-500' : 'bg-emerald-500';
  const label = isVeryStale
    ? `sync looks broken — last updated ${relative}`
    : isStale
      ? `stale — last updated ${relative}`
      : `updated ${relative}`;

  return (
    <Badge variant="outline" className={cn('gap-1.5', badgeClass)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
      {label}
    </Badge>
  );
}
