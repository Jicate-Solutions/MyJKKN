// app/(routes)/admission/counselors/voice-memos/_components/monitor-view.tsx
// Client orchestrator for the Voice Memo Monitor page.
// Calls useVoiceMemoMonitor() once and slices the snapshot down to children.
//
// Created 2026-05-10 (voice-memo-monitor substrate, Phase 2).

'use client';

import Link from 'next/link';
import { AlertCircle, Activity, RefreshCw, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useVoiceMemoMonitor } from '@/hooks/admission/use-voice-memo-monitor';

import { CountersRow } from './counters-row';
import { CronHeartbeatBanner } from './cron-heartbeat-banner';
import { RecentFailuresTable } from './recent-failures-table';
import { RecentCompletionsTable } from './recent-completions-table';
import { CostRollupCard } from './cost-rollup-card';
import { DirectorDigestCard } from './director-digest-card';

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
    </div>
  );
}

export function VoiceMemoMonitorView() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useVoiceMemoMonitor();

  return (
    <div className="p-4 sm:p-6 space-y-4 mx-auto max-w-7xl">
      {/* Breadcrumb */}
      <Breadcrumb className="hidden sm:block">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admission/counselors">Counselors</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Voice Memo Monitor</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            Voice Memo Monitor
          </h1>
          <p className="text-xs text-muted-foreground">
            {data
              ? `Tracking last ${data.policy.window_hours}h of voice-memo uploads · auto-refreshing every ${data.policy.refresh_interval_seconds}s`
              : 'Live status of the voice-memo pipeline'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
            />
            <span className="ml-1 hidden sm:inline">Refresh</span>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/voice-memo-monitor">
              <Settings className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Config</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <Card>
          <CardContent className="p-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Failed to load monitor</AlertTitle>
              <AlertDescription>
                {(error as Error)?.message ||
                  'Could not fetch the voice-memo snapshot.'}
              </AlertDescription>
            </Alert>
            <Button className="mt-4" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && !data && <LoadingSkeleton />}

      {/* Success state */}
      {data && (
        <>
          <CronHeartbeatBanner
            cron={data.cron}
            stuckThresholdMinutes={data.policy.stuck_threshold_minutes}
          />

          <CountersRow
            counters={data.counters}
            windowHours={data.policy.window_hours}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DirectorDigestCard digest={data.digest} />
            <CostRollupCard
              cost={data.cost}
              alertThresholdInr={data.policy.cost_alert_daily_inr}
            />
          </div>

          <RecentFailuresTable rows={data.recent_failures} />

          <RecentCompletionsTable rows={data.recent_completions} />

          <p className="text-[10px] text-muted-foreground text-right">
            Last computed: {new Date(data.generated_at).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}
