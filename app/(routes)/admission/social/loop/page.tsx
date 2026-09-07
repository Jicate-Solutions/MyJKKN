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
 *
 * Account selection (2026-09-07): the loop shipped as a single-handle pilot on
 * jkknpharmacy (PR #1615) because that was the ONLY graph-readable handle at
 * the time — its own PR body names the other 46 as "blocked on
 * business_discovery pending the token fix". That block cleared on 2026-09-04
 * (50 of 59 department handles now read graph), so the handle is now chosen by
 * a `?account=` search param with a picker, and jkknpharmacy remains the
 * fallback so every existing link keeps working. The API already accepted
 * `?accountId=` (uuid OR username) from day one — only this page never asked.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
const LOOP_PATH = '/admission/social/loop';

/** One handle in the picker. Shape is the subset of /api/social/instagram/accounts
 *  this page needs — that route is already the list source for the sibling
 *  Instagram admin page, so no new endpoint is introduced. */
interface LoopAccountOption {
  id: string;
  username: string;
  department_name: string | null;
  institution_name: string;
  last_post_at: string | null;
}

/** Whole days since the handle last posted, or null if it has never posted.
 *  Shown in the picker so a silent department reads as silent BEFORE its empty
 *  loop is mistaken for a broken page. */
function daysSincePost(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isNaN(ms) ? null : Math.max(0, Math.floor(ms / 86_400_000));
}

/** Picker label: "@handle · Department — silence marker". */
function accountLabel(a: LoopAccountOption): string {
  const who = a.department_name ?? a.institution_name ?? '';
  const days = daysSincePost(a.last_post_at);
  const silence =
    days === null ? ' · never posted' : days >= 30 ? ` · silent ${days}d` : '';
  return `@${a.username}${who ? ` · ${who}` : ''}${silence}`;
}

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
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the single source of truth for which handle is shown, so a loop
  // is linkable — the departments page links straight to a department's own
  // cycle. No `?account=` falls back to the pilot handle, unchanged.
  const rawParam = searchParams.get('account');
  const account = rawParam && rawParam.trim().length > 0 ? rawParam.trim() : DEFAULT_ACCOUNT;

  const [accounts, setAccounts] = useState<LoopAccountOption[]>([]);
  const [data, setData] = useState<LoopResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await getLoop(account);
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
  }, [account]);

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

  // Handle list for the picker. Fails soft and silently: if this request fails
  // the picker simply does not render and the loop still works on its handle.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/social/instagram/accounts', { cache: 'no-store' });
        const json = (await res.json().catch(() => null)) as
          | { accounts?: LoopAccountOption[] }
          | null;
        if (!cancelled && json && Array.isArray(json.accounts)) {
          setAccounts(
            [...json.accounts].sort((a, b) => a.username.localeCompare(b.username))
          );
        }
      } catch {
        // Intentionally ignored — see comment above.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAccountChange = useCallback(
    (next: string) => {
      router.replace(
        next === DEFAULT_ACCOUNT ? LOOP_PATH : `${LOOP_PATH}?account=${encodeURIComponent(next)}`,
        { scroll: false }
      );
    },
    [router]
  );

  // Rendered above every state (loading, error, empty) so a handle whose loop
  // fails to load can still be switched away from.
  const picker = useMemo(() => {
    if (accounts.length < 2) return null;
    const known = accounts.some((a) => a.username === account);
    return (
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="loop-account" className="text-sm text-muted-foreground">
          Loop for
        </label>
        <select
          id="loop-account"
          value={known ? account : ''}
          onChange={(e) => handleAccountChange(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm min-w-64"
        >
          {!known && <option value="">@{account}</option>}
          {accounts.map((a) => (
            <option key={a.id} value={a.username}>
              {accountLabel(a)}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {accounts.length} handles
        </span>
      </div>
    );
  }, [accounts, account, handleAccountChange]);

  // After closing a cycle, refetch quietly (the playbook grows by one).
  const handleCycleClosed = useCallback(() => {
    void load(false);
  }, [load]);

  if (loading) {
    return (
      <div className="mt-6 space-y-6">
        {picker}
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
      <div className="mt-6 space-y-6">
        {picker}
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error ?? 'No loop data available.'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Past the data guard, but read/decide remain optional on the response type
  // (absent on the failure shape). Narrow them so children get non-null blocks.
  if (!data.read || !data.decide) {
    return (
      <div className="mt-6 space-y-6">
        {picker}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            @{account} has nothing to read yet — the loop needs posts before it
            can score what the audience rewarded. Silence is the finding here,
            not an error.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const cycleNo = data.playbook?.length ?? 0;

  return (
    <div className="mt-6 space-y-6">
      {picker}
      <CycleHeader
        username={data.account?.username ?? account}
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
        accountUsername={data.account?.username ?? account}
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
        {/* useSearchParams() must sit inside a Suspense boundary or the page
            build fails on prerender (Next.js app-router requirement). */}
        <Suspense
          fallback={
            <div className="mt-6 space-y-6">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          }
        >
          <LoopBody />
        </Suspense>
      </ContentLayout>
    </PermissionGuard>
  );
}
