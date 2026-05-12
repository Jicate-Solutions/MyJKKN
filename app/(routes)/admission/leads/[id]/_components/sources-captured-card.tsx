'use client';

// ════════════════════════════════════════════════════════════════════════════
// Sources Captured Card
// Shows the full timeline of source-channel captures for a lead — one row per
// time the same person was captured by a different (or same) source. Backed
// by admission_lead_source_captures, populated by the capture_admission_lead
// RPC on every capture event.
// ════════════════════════════════════════════════════════════════════════════

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Layers, Clock, Megaphone, Globe2 } from 'lucide-react';
import { useSourceCaptures } from '@/hooks/admission/use-source-captures';
import { SourceBadge } from '../../_components/source-badge';

interface SourcesCapturedCardProps {
  leadId: string;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function formatAbsolute(iso: string): string {
  // BUG-003922: pin to en-GB so day-first ordering ("12 Apr 2026, 14:30") is
  // stable regardless of the runtime locale.
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function SourcesCapturedCard({ leadId }: SourcesCapturedCardProps) {
  const { data: captures = [], isLoading, isError } = useSourceCaptures(leadId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            Sources Captured
          </CardTitle>
          {!isLoading && captures.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {captures.length} {captures.length === 1 ? 'touch' : 'touches'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {isError && !isLoading && (
          <p className="text-sm text-muted-foreground italic">
            Unable to load source captures.
          </p>
        )}

        {!isLoading && !isError && captures.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No source captures recorded for this lead yet.
          </p>
        )}

        {!isLoading && !isError && captures.length > 0 && (
          <ol className="relative border-l border-muted-foreground/20 pl-5 space-y-4">
            {captures.map((cap, idx) => {
              const isFirst = idx === captures.length - 1; // oldest = first capture
              return (
                <li key={cap.id} className="relative">
                  {/* timeline dot */}
                  <span
                    className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 ${
                      isFirst
                        ? 'bg-primary border-primary'
                        : 'bg-background border-muted-foreground/40'
                    }`}
                    aria-hidden
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <SourceBadge source={cap.source} />
                    {isFirst && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4 font-normal bg-primary/5 text-primary border-primary/20"
                      >
                        First touch
                      </Badge>
                    )}
                    {/* Campaign attribution badge — surfaces when the
                        capture was made through a /c/{token} share link */}
                    {cap.campaign_link?.campaign && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4 font-normal bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900"
                      >
                        <Megaphone className="mr-1 h-2.5 w-2.5" />
                        Campaign
                      </Badge>
                    )}
                    {cap.campaign_link?.campaign?.scope === 'global' && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4 font-normal"
                        title="Cross-institution campaign"
                      >
                        <Globe2 className="mr-1 h-2.5 w-2.5" />
                        Global
                      </Badge>
                    )}
                    {cap.utm_source && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4 font-normal"
                        title={`utm_medium: ${cap.utm_medium ?? '—'} · utm_campaign: ${cap.utm_campaign ?? '—'}`}
                      >
                        utm: {cap.utm_source}
                      </Badge>
                    )}
                  </div>

                  {/* Campaign details block — only renders for campaign-attributed captures */}
                  {cap.campaign_link?.campaign && (
                    <div className="mt-1.5 rounded-md border border-violet-200/60 bg-violet-50/40 px-3 py-2 text-xs dark:border-violet-900/60 dark:bg-violet-950/20">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-muted-foreground">Campaign:</span>
                        <Link
                          href={`/admission/marketing/campaigns/${cap.campaign_link.campaign.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {cap.campaign_link.campaign.name}
                        </Link>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">Link:</span>
                        <span className="font-medium text-foreground">
                          {cap.campaign_link.name}
                        </span>
                        <code className="text-muted-foreground/80">
                          /c/{cap.campaign_link.token}
                        </code>
                      </div>
                    </div>
                  )}

                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span title={formatAbsolute(cap.captured_at)}>
                      {formatRelative(cap.captured_at)}
                    </span>
                    <span className="text-muted-foreground/60">·</span>
                    <span>{formatAbsolute(cap.captured_at)}</span>
                  </div>

                  {cap.source_detail && !cap.campaign_link?.campaign && (
                    <p className="mt-1 text-sm text-foreground/80">
                      {cap.source_detail}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
