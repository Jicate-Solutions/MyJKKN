'use client';

// app/(routes)/moments/campaigns/page.tsx
//
// Family Moments — campaign dashboard (read-only, launch-day view).
// Per campaign: how many cards exist, how many have real child content,
// how many fathers opened, tapped install, allowed notifications.
// Refreshes on demand — built to be watched on Father's Day morning.
//
// Gate: moments.campaigns.view (principal/admin). Campaign creation stays
// script-seeded in Phase 1; the create UI is Phase 2.

import { useCallback, useEffect, useState } from 'react';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  MomentsService,
  type CampaignStats,
  type MomentsCampaign,
} from '@/lib/services/moments/moments-service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2, RefreshCw, Heart } from 'lucide-react';

interface CampaignWithStats extends MomentsCampaign {
  stats: CampaignStats | null;
}

const STATUS_VARIANT: Record<string, string> = {
  draft: 'bg-stone-500',
  collecting: 'bg-blue-600',
  ready: 'bg-emerald-600',
  sent: 'bg-violet-600',
  archived: 'bg-stone-400',
};

function StatBlock({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-center">
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">
        {label} · {pct}%
      </p>
    </div>
  );
}

function MomentsCampaignsInner() {
  const [rows, setRows] = useState<CampaignWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const campaigns = await MomentsService.getCampaigns();
      const withStats = await Promise.all(
        campaigns.map(async (c) => ({
          ...c,
          stats: await MomentsService.getCampaignStats(c.id).catch(() => null),
        })),
      );
      setRows(withStats);
    } catch (error) {
      console.error('[moments] Failed to load campaigns:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Heart className="h-6 w-6 text-rose-500 shrink-0" />
            Family Moments — Campaigns
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live engagement per campaign. Opens and installs update as parents
            tap their links.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing}
          className="shrink-0"
          onClick={() => {
            setRefreshing(true);
            load();
          }}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1.5" />
          )}
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading campaigns…
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No campaigns yet. Campaigns are seeded by the office before each
            occasion.
          </CardContent>
        </Card>
      ) : (
        rows.map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg min-w-0 truncate">{c.title}</CardTitle>
                <Badge
                  className={`${STATUS_VARIANT[c.status] ?? 'bg-stone-500'} hover:${STATUS_VARIANT[c.status] ?? 'bg-stone-500'} capitalize shrink-0`}
                >
                  {c.status}
                </Badge>
              </div>
              <CardDescription>
                {c.occasion.replace(/_/g, ' ')} · recipient: {c.recipient_type}
                {c.send_at
                  ? ` · sends ${new Date(c.send_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
                  : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {c.stats ? (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <StatBlock label="Cards" value={c.stats.total} total={c.stats.total} />
                  <StatBlock label="Child content" value={c.stats.withContent} total={c.stats.total} />
                  <StatBlock label="Opened" value={c.stats.opened} total={c.stats.total} />
                  <StatBlock label="Install taps" value={c.stats.installClicked} total={c.stats.total} />
                  <StatBlock label="Push opt-ins" value={c.stats.pushSubscribed} total={c.stats.total} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Stats unavailable.</p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

export default function MomentsCampaignsPage() {
  return (
    <PermissionGuard
      module="moments.campaigns"
      action="view"
      // Rule #27: explicit denial, never a blank page.
      fallback={
        <div className="container mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-xl font-semibold">
            You don&rsquo;t have access to campaign dashboards
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            If you should see this page, ask the office to add the
            &ldquo;Moments — Campaigns&rdquo; permission to your role.
          </p>
        </div>
      }
    >
      <MomentsCampaignsInner />
    </PermissionGuard>
  );
}
