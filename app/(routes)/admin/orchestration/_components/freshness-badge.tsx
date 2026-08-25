// Header freshness stamp — spec section 08 ("When the session is offline").
// The page is never blank and never lies about freshness: it always shows the
// newest tower-session heartbeat, stamped with how old it is, and flips to a
// "stale" look once that heartbeat is older than STALE_THRESHOLD_MS.

import { differenceInMilliseconds, formatDistanceToNowStrict } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// 5 minutes — matches the fleet's own 5-minute heartbeat/poller cadence
// (reference_obsidian_terminal_v5_tab_identity). No heartbeat inside this
// window means no tower session is actively observing the fleet right now.
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

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
  const isStale = ageMs > STALE_THRESHOLD_MS;
  const relative = formatDistanceToNowStrict(seenAt, { addSuffix: true });

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5',
        isStale ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', isStale ? 'bg-amber-500' : 'bg-emerald-500')} />
      {isStale ? `stale — last updated ${relative}` : `updated ${relative}`}
    </Badge>
  );
}
