'use client';

/**
 * Admission / Social Media / Loop — the Social Loop Engine.
 *
 * A weekly improvement loop for an Instagram handle. The page is the visible
 * surface of one cycle:
 *
 *   READ   → which posts the audience actually rewarded (real signal, not likes)
 *   DECIDE → the one format move + the bar to beat + the next action
 *   MEMORY → the playbook of past cycles, and the "close this cycle" panel
 *
 * Data comes from the loop-service (getLoop / closeCycle) — built by the data
 * agent. This page only consumes those contracts; it computes nothing itself.
 * Data flow matches the sibling governance page: a 'use client' page with
 * useState + useEffect + getLoop() (no react-query).
 *
 * Gate: social.view — same broad key as the other social read pages.
 * Default account: jkknpharmacy.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import type { LoopResponse, LoopLastCycleGrade } from '@/lib/types/social-loop';
import { getLoop } from '@/lib/services/social/loop-service';
import { CycleHeader } from './_components/cycle-header';
import { ReadTable } from './_components/read-table';
import { DecideCard } from './_components/decide-card';
import { PlaybookLog } from './_components/playbook-log';
import { VoiceCard } from './_components/voice-card';
import { CadenceCard } from './_components/cadence-card';

const DEFAULT_ACCOUNT = 'jkknpharmacy';

/** One-line banner showing whether the last cycle's advice moved the needle. */
function LastCycleGradeBanner({ grade }: { grade: LoopLastCycleGrade }) {
  const Icon =
    grade.improved === true
      ? TrendingUp
      : grade.improved === false
        ? TrendingDown
        : Minus;
  const colorClass =
    grade.improved === true
      ? 'border-green-200 bg-green-50/60 text-green-900 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200'
      : grade.improved === false
        ? 'border-amber-200 bg-amber-50/60 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
        : 'border-border bg-muted/40 text-muted-foreground';

  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${colorClass}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{grade.message}</span>
    </div>
  );
}

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Admission', href: '/admission' },
  { label: 'Social Media', href: '/admission/social' },
  { label: 'Loop' },
];

function LoopBody() {
  const [data, setData] = useState<LoopResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await getLoop(DEFAULT_ACCOUNT);
      if (!res || !res.success) {
        setError(
          (res && 'error' in res && (res as { error?: string }).error) ||
            'Failed to load the loop.'
        );
        setData(null);
      } else {
        setData(res);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await load(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // After closing a cycle, refetch quietly (the playbook grows by one).
  const handleCycleClosed = useCallback(() => {
    void load(false);
  }, [load]);

  if (loading) {
    return (
      <div className="mt-6 space-y-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-56 w-full" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error ?? 'No loop data available.'}</AlertDescription>
      </Alert>
    );
  }

  // Past the data guard, but read/decide remain optional on the response type
  // (absent on the failure shape). Narrow them so children get non-null blocks.
  if (!data.read || !data.decide) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          The loop returned no data for this account yet — it may have no posts.
        </AlertDescription>
      </Alert>
    );
  }

  const cycleNo = data.playbook?.length ?? 0;

  return (
    <div className="mt-6 space-y-6">
      <CycleHeader
        username={data.account?.username ?? DEFAULT_ACCOUNT}
        cycleNo={cycleNo}
        cycleLengthDays={data.config?.cycleLengthDays}
        readable={data.readable ?? false}
        notReadableMessage={data.notReadableMessage}
      />

      {/* Self-grade banner — shown when there is at least one closed cycle to grade */}
      {data.lastCycleGrade && (
        <LastCycleGradeBanner grade={data.lastCycleGrade} />
      )}

      {/* READ — what the audience rewarded */}
      <ReadTable read={data.read} />

      {/* DECIDE (the output) + MEMORY (the playbook) side by side on wide screens */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DecideCard decide={data.decide} barToBeat={data.read.barToBeat} />
        <PlaybookLog playbook={data.playbook ?? []} onClose={handleCycleClosed} />
      </div>

      {/* Voice of Audience — AI-classified comments from the feedback spine */}
      {data.voice && <VoiceCard voice={data.voice} />}

      {/* Monthly Cadence — the per-department calendar-month reach loop.
          Reuses this cycle's Voice-of-Audience as the feedback snapshot. */}
      <CadenceCard
        accountUsername={data.account?.username ?? DEFAULT_ACCOUNT}
        voice={data.voice}
      />
    </div>
  );
}

export default function SocialLoopPage() {
  return (
    <PermissionGuard
      module="social"
      action="view"
      fallback={
        <ContentLayout title="Social Loop">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You do not have permission to view this page. Ask an administrator
            to grant the Social Media permissions to your role.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Social Loop">
        <PageBreadcrumb items={breadcrumbItems} />
        <LoopBody />
      </ContentLayout>
    </PermissionGuard>
  );
}
