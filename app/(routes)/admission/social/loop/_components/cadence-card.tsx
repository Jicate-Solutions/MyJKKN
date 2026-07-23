'use client';

/**
 * CadenceCard — the MONTHLY department cadence section of the Social Loop.
 *
 * This is the visible surface of the chair's per-department monthly loop:
 *   OPEN    → fix ONE objective for this dept-month; the baseline reach is
 *             snapshotted from ig_monthly_audit (never re-summed from posts).
 *   ACTION  → record what was done; the current feedback (LoopVoice, passed in
 *             from the weekly loop's Voice-of-Audience) is snapshotted alongside.
 *   CLOSE   → one calendar month later the owner writes a one-line learning; the
 *             re-measure reach + reach-delta are computed server-side.
 *
 * Reach numbers come ONLY from ig_monthly_audit (via the cadence API). The card
 * computes nothing itself — every value comes from the service contract.
 *
 * Gate: rendering requires social.departments.view (page-level PermissionGuard
 * on social.view already fronts the loop page; writes are gated server-side by
 * social.departments.manage, surfaced as an inline error on denial).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Lock,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import type { LoopVoice } from '@/lib/types/social-loop';
import type { CadenceListResponse, CadenceStatus, MonthlyCadence } from '@/lib/types/social-cadence';
import {
  getCadences,
  openCadence,
  recordCadenceAction,
  closeCadence,
} from '@/lib/services/social/cadence-service';

/** First-of-current-month DATE string (UTC), matching the DB's cadence_month. */
function firstOfCurrentMonthUTC(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/** Format a first-of-month DATE string to e.g. "Jul 2026". */
function monthLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function fmtReach(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US');
}

const STATUS_STYLE: Record<CadenceStatus, string> = {
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  awaiting_close: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  closed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  unmeasurable: 'bg-muted text-muted-foreground',
};

const STATUS_LABEL: Record<CadenceStatus, string> = {
  open: 'Open',
  awaiting_close: 'Awaiting close',
  closed: 'Closed',
  unmeasurable: 'Not measurable',
};

/** Reach-delta chip with an up/down/flat arrow. */
function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null || delta === undefined) {
    return <span className="text-xs text-muted-foreground">reach not measurable</span>;
  }
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const cls =
    delta > 0
      ? 'text-green-600 dark:text-green-400'
      : delta < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {delta > 0 ? '+' : ''}
      {delta.toLocaleString('en-US')} reach
    </span>
  );
}

/** One cycle row + inline action/close controls for open/awaiting_close cycles. */
function CadenceRow({
  cadence,
  voice,
  onChanged,
}: {
  cadence: MonthlyCadence;
  voice?: LoopVoice;
  onChanged: () => void;
}) {
  const [action, setAction] = useState('');
  const [learning, setLearning] = useState('');
  const [busy, setBusy] = useState<null | 'action' | 'close'>(null);
  const [err, setErr] = useState<string | null>(null);

  const isLive = cadence.status === 'open' || cadence.status === 'awaiting_close';

  const submitAction = useCallback(async () => {
    if (!action.trim()) return;
    setBusy('action');
    setErr(null);
    const res = await recordCadenceAction({
      cadenceId: cadence.id,
      action: action.trim(),
      feedbackSummary: voice ?? null,
    });
    setBusy(null);
    if (!res.success) {
      setErr(res.error ?? 'Failed to record the action.');
      return;
    }
    setAction('');
    onChanged();
  }, [action, cadence.id, voice, onChanged]);

  const submitClose = useCallback(async () => {
    if (!learning.trim()) return;
    setBusy('close');
    setErr(null);
    const res = await closeCadence({ cadenceId: cadence.id, learning: learning.trim() });
    setBusy(null);
    if (!res.success) {
      setErr(res.error ?? 'Failed to close the cycle.');
      return;
    }
    setLearning('');
    onChanged();
  }, [learning, cadence.id, onChanged]);

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{monthLabel(cadence.cadence_month)}</span>
            <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[cadence.status]}`}>
              {STATUS_LABEL[cadence.status]}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-foreground">{cadence.objective}</p>
        </div>
        <DeltaChip delta={cadence.reach_delta} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
        <span>Baseline: <span className="font-medium text-foreground">{fmtReach(cadence.baseline_reach)}</span></span>
        <span>Re-measure: <span className="font-medium text-foreground">{fmtReach(cadence.remeasure_reach)}</span></span>
        {cadence.action_taken && (
          <span className="col-span-2 sm:col-span-3">Action: <span className="text-foreground">{cadence.action_taken}</span></span>
        )}
        {cadence.learning && (
          <span className="col-span-2 sm:col-span-3">Learning: <span className="text-foreground italic">{cadence.learning}</span></span>
        )}
      </div>

      {isLive && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {!cadence.action_taken && (
            <div className="flex flex-col gap-1.5 sm:flex-row">
              <Input
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="What did you do this month? (the action)"
                className="text-sm"
              />
              <Button size="sm" onClick={submitAction} disabled={busy !== null || !action.trim()}>
                {busy === 'action' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Record action'}
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-1.5 sm:flex-row">
            <Textarea
              value={learning}
              onChange={(e) => setLearning(e.target.value)}
              placeholder="One-line learning to close this cycle…"
              rows={1}
              className="min-h-[38px] text-sm"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={submitClose}
              disabled={busy !== null || !learning.trim()}
            >
              {busy === 'close' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Close cycle'}
            </Button>
          </div>
        </div>
      )}

      {err && (
        <Alert variant="destructive" className="mt-2 py-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          <AlertDescription className="text-xs">{err}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function CadenceCard({
  accountUsername,
  voice,
}: {
  accountUsername: string;
  voice?: LoopVoice;
}) {
  const [data, setData] = useState<CadenceListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [objective, setObjective] = useState('');
  const [opening, setOpening] = useState(false);
  const [openErr, setOpenErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getCadences({ accountId: accountUsername });
    setData(res);
    setLoading(false);
  }, [accountUsername]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpen = useCallback(async () => {
    if (!objective.trim()) return;
    setOpening(true);
    setOpenErr(null);
    const res = await openCadence({ accountId: accountUsername, objective: objective.trim() });
    setOpening(false);
    if (!res.success) {
      setOpenErr(res.error ?? 'Failed to open the cadence.');
      return;
    }
    setObjective('');
    void load();
  }, [objective, accountUsername, load]);

  if (loading) {
    return <Skeleton className="h-56 w-full" />;
  }

  if (!data || !data.success) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{data?.error ?? 'Failed to load the monthly cadence.'}</AlertDescription>
      </Alert>
    );
  }

  const cadences = data.cadences ?? [];
  // Scope the "open this month" gate to the CURRENT calendar month only. Prior
  // months left open/awaiting_close must not block opening this month's cycle;
  // UNIQUE(account, cadence_month) already prevents a duplicate for this month.
  const currentMonthIso = firstOfCurrentMonthUTC();
  const currentMonthOpen = cadences.some((c) => c.cadence_month === currentMonthIso);
  const enabled = data.enabled === true;
  const readable = data.readable === true;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          Monthly Cadence
          {data.currentReach && (
            <span className="ml-auto text-sm font-normal text-muted-foreground tabular-nums">
              {monthLabel(data.currentReach.audit_month)} reach:{' '}
              <span className="font-medium text-foreground">{fmtReach(data.currentReach.total_reach)}</span>
            </span>
          )}
        </CardTitle>
        <CardDescription>
          The department&apos;s monthly loop: fix an objective → measure reach → read feedback →
          act → wait one month → re-measure. Reach is read from the monthly audit, never re-counted.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!enabled && (
          <Alert className="py-2">
            <Lock className="h-3.5 w-3.5" />
            <AlertDescription className="text-xs">
              The monthly cadence engine is currently <strong>off</strong> (dark). A super-admin
              enables it in Policies (<code>social.cadence.enabled</code>) before cycles can be opened.
            </AlertDescription>
          </Alert>
        )}

        {!readable && (
          <Alert className="py-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            <AlertDescription className="text-xs">
              This handle&apos;s reach is <strong>not measurable yet</strong> — it reads via the public
              window (business_discovery). The objective → feedback → action legs still run; reach shows
              once the handle moves to a graph-API source.
            </AlertDescription>
          </Alert>
        )}

        {/* Open a new cadence for this month (only when enabled + none live) */}
        {enabled && !currentMonthOpen && (
          <div className="space-y-1.5 rounded-md border border-dashed border-border p-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
              Open this month&apos;s cadence
            </div>
            <div className="flex flex-col gap-1.5 sm:flex-row">
              <Input
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="This month's one objective for the handle…"
                className="text-sm"
              />
              <Button size="sm" onClick={handleOpen} disabled={opening || !objective.trim()}>
                {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Open cadence'}
              </Button>
            </div>
            {openErr && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                <AlertDescription className="text-xs">{openErr}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Cycle ledger */}
        {cadences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cadence cycles yet. {enabled ? 'Open one above to start the monthly loop.' : ''}
          </p>
        ) : (
          <div className="space-y-2">
            {cadences.map((c) => (
              <CadenceRow key={c.id} cadence={c} voice={voice} onChanged={load} />
            ))}
          </div>
        )}

        <Separator />
        <p className="text-[11px] text-muted-foreground">
          Each cadence opens a real project (an OKR objective owned by the HOD) with the reach target
          as its key result — visible to leadership under Projects. A missed month flags the project
          at-risk so the accountability engine can prompt the HOD to explain.
        </p>
      </CardContent>
    </Card>
  );
}
