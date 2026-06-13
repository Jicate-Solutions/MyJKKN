'use client';

// ============================================================================
// My Hostel — public "Hostel wins" feed (CARE Recognition keystone)
// ----------------------------------------------------------------------------
// The attributable half of recognition: recent public wins across ALL
// campus-living modules, with the resident's first name on each — input
// publicly credited back to the person who gave it (the CARE audit's R
// column, previously 0/16). Reads fn_campus_living_recognition_feed
// (controlled columns: first name + event only). Hidden entirely while the
// stream is empty AND while the feed kill-switch is off — so it adds nothing
// to the page until recognition events actually exist.
// ============================================================================

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy } from 'lucide-react';
import {
  usePublicWins,
  useRecognitionFeedEnabled,
} from '@/hooks/campus-living/use-recognition';

const MODULE_LABEL: Record<string, string> = {
  mess: 'Mess',
  housekeeping: 'Housekeeping',
  community: 'Community',
  maintenance: 'Maintenance',
  events: 'Events',
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString();
}

export function WinsFeedCard() {
  const { data: feedEnabled } = useRecognitionFeedEnabled();
  const { data: wins, isLoading } = usePublicWins(undefined, feedEnabled !== false);

  // Nothing to celebrate yet (or feed switched off) → render nothing.
  // An empty "wins" card would be anti-recognition.
  if (feedEnabled === false || isLoading || !wins || wins.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          Hostel wins
        </CardTitle>
        <CardDescription>
          Residents whose input made it — votes that landed on the menu,
          proposals that got approved, and more.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {wins.slice(0, 8).map((w) => (
            <li
              key={w.id}
              className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-semibold">{w.first_name}</span>{' '}
                  <span className="text-muted-foreground">
                    — {w.title.charAt(0).toLowerCase() + w.title.slice(1)}
                  </span>
                </p>
                {w.detail && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{w.detail}</p>
                )}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <Badge variant="outline" className="text-[10px]">
                  {MODULE_LABEL[w.module] ?? w.module}
                </Badge>
                <span className="text-[11px] text-muted-foreground">{timeAgo(w.fired_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
