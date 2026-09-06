// app/(routes)/audit/care/predict/[cycleId]/page.tsx
// The predict-then-see CALIBRATION MIRROR — a team member predicts the sealed
// participant medians for a CARRE cycle BEFORE seeing them, then watches their
// own calibration once the k≥3 actuals reveal.
//
// The mechanism (Director interview, 2026-07-25): the reward is CALIBRATION,
// not level. Predicting accurately that participants feel unheard beats
// claiming they feel heard — so coercing high sealed scores buys nothing.
// A prediction freezes the moment its actual is revealed (no post-hoc
// "predictions"), and hard data-gates block claims the caller's own measured
// stream contradicts (CARRE-A3 at 3+ with a waiting OD queue).
//
// Access: authenticated team members — enforced SERVER-SIDE by
// fn_carre_predict_context / fn_carre_predict_median / the mirror RPC. No
// MENU_PERMISSIONS entry (predictors may sit below audit leadership); unlisted
// by design, shared per cycle like the sealed voice door. Denials render
// EXPLICITLY (rule #27).

'use client';

import { use, useMemo } from 'react';
import toast from 'react-hot-toast';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Crosshair, ShieldAlert } from 'lucide-react';
import {
  useCarreCalibrationMirror,
  useCarrePredictContext,
  useCarrePredictMedian,
} from '@/hooks/audit';
import {
  PILLAR_LABELS,
  PILLAR_ORDER,
  pillarFromCode,
} from '@/lib/services/audit/carre-scoring-service';
import type {
  CarreLaneDenial,
  CarrePredictContext,
} from '@/lib/services/audit/carre-calibration-service';

const DENIAL_COPY: Record<string, { title: string; body: string }> = {
  not_authenticated: {
    title: 'Please sign in first',
    body: 'The calibration mirror needs your MyJKKN account. Sign in, then open this link again.',
  },
  team_members_only: {
    title: 'This mirror is for team members',
    body: 'Learners speak through the sealed participant lane instead — the mirror exists so team members can test their own read of it.',
  },
  cycle_closed: {
    title: 'This cycle is closed',
    body: 'Predictions only make sense while a cycle is live. Calibration from earlier cycles stays visible on your mirror.',
  },
  not_found: {
    title: 'This audit cycle does not exist',
    body: 'The link may be mistyped or the cycle was removed. Check with whoever shared it.',
  },
};

const PREDICT_REJECT_COPY: Record<string, string> = {
  already_revealed:
    'This item is already revealed (k≥3 sealed scores exist) — predictions are frozen the moment the answer is visible.',
  team_members_only: 'The mirror is for team members.',
  cycle_not_open: 'This cycle is closed to predictions.',
  bad_prediction: 'Predictions are whole numbers 0–4.',
};

export default function CarreCalibrationMirrorPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const { cycleId } = use(params);
  const contextQ = useCarrePredictContext(cycleId);
  const context =
    contextQ.data && (contextQ.data as CarrePredictContext).success
      ? (contextQ.data as CarrePredictContext)
      : null;
  const mirrorQ = useCarreCalibrationMirror(cycleId, !!context);
  const predict = useCarrePredictMedian();

  const mirrorByCode = useMemo(() => {
    const map: Record<
      string,
      { predicted: number; actual: number | null; scorers: number; absError: number | null }
    > = {};
    for (const r of mirrorQ.data ?? []) {
      map[r.parameter_code] = {
        predicted: r.predicted_median,
        actual: r.actual_median === null ? null : Number(r.actual_median),
        scorers: r.scorers,
        absError: r.abs_error === null ? null : Number(r.abs_error),
      };
    }
    return map;
  }, [mirrorQ.data]);

  const revealed = useMemo(
    () => Object.values(mirrorByCode).filter((m) => m.actual !== null),
    [mirrorByCode],
  );
  const meanAbsError =
    revealed.length > 0
      ? revealed.reduce((s, m) => s + (m.absError ?? 0), 0) / revealed.length
      : null;

  async function handlePredict(code: string, value: number) {
    const result = await predict.mutateAsync({
      cycleId,
      parameterCode: code,
      predicted: value,
    });
    if (!(result as { success: boolean }).success) {
      const denial = result as CarreLaneDenial & { od_waiting?: number };
      if (denial.reason === 'data_gate_a3') {
        toast.error(
          `Data gate: your own approval queue holds ${denial.od_waiting} waiting request(s) — the measured stream contradicts a ${value} on fast loops. Clear the queue or predict what the queue says.`,
          { duration: 8000 },
        );
        return;
      }
      toast.error(PREDICT_REJECT_COPY[denial.reason] ?? `Could not save (${denial.reason})`);
    }
  }

  if (contextQ.isLoading) {
    return (
      <ContentLayout title="Calibration Mirror">
        <div className="space-y-4 max-w-4xl">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (contextQ.error || !contextQ.data || !(contextQ.data as { success: boolean }).success) {
    const reason = contextQ.data ? (contextQ.data as CarreLaneDenial).reason : 'not_found';
    const copy = DENIAL_COPY[reason] ?? {
      title: 'Cannot open the calibration mirror',
      body: (contextQ.error as Error)?.message ?? `Something went wrong (${reason}).`,
    };
    return (
      <ContentLayout title="Calibration Mirror">
        <div className="max-w-xl">
          <Card className="border-destructive/40">
            <CardContent className="pt-6 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-destructive flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium">{copy.title}</p>
                <p className="text-xs text-muted-foreground">{copy.body}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const ctx = context!;
  const byPillar = PILLAR_ORDER.map((pillar) => ({
    pillar,
    items: ctx.parameters
      .filter((p) => pillarFromCode(p.code) === pillar)
      .sort((a, b) => a.code.localeCompare(b.code)),
  })).filter((g) => g.items.length > 0);

  return (
    <ContentLayout title="Calibration Mirror">
      <div className="space-y-6 max-w-4xl">
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <Crosshair className="h-4 w-4 text-emerald-600" />
              <h2 className="text-lg font-semibold">{ctx.cycle.name}</h2>
            </div>
            {ctx.cycle.audience && (
              <p className="text-sm text-muted-foreground">{ctx.cycle.audience}</p>
            )}
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs dark:border-emerald-900 dark:bg-emerald-950">
              <p>
                <strong>Predict, then see.</strong> For each item, predict what the{' '}
                <em>sealed participant median</em> will be — how participants will
                say they actually experience this, on the same 0–4 scale. Once 3 or
                more sealed scores exist for an item, the real median is revealed
                beside your prediction and your prediction freezes. The reward here
                is <strong>calibration, not level</strong>: an accurate hard read
                beats a flattering wrong one, every time. Nothing you predict is
                shown to anyone else.
              </p>
            </div>
          </CardContent>
        </Card>

        {revealed.length > 0 && (
          <Card>
            <CardContent className="pt-6 flex flex-wrap items-center gap-4 text-sm">
              <span className="font-medium">Your calibration so far:</span>
              <Badge variant="outline" className="tabular-nums">
                {revealed.length} item{revealed.length === 1 ? '' : 's'} revealed
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'tabular-nums',
                  (meanAbsError ?? 0) <= 0.5
                    ? 'border-emerald-300 text-emerald-700'
                    : (meanAbsError ?? 0) <= 1
                      ? 'border-amber-300 text-amber-700'
                      : 'border-red-300 text-red-700',
                )}
              >
                mean error {meanAbsError?.toFixed(2)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Lower is better-calibrated — direction of miss matters more than the number.
              </span>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Predict the sealed medians — {ctx.parameters.length} items, 0–4
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {byPillar.map(({ pillar, items }) => (
              <div key={pillar} className="space-y-2">
                <Badge variant="outline" className="text-xs font-semibold">
                  {pillar} — {(PILLAR_LABELS as Record<string, string>)[pillar]}
                </Badge>
                <div className="rounded-md border divide-y">
                  {items.map((item) => {
                    const m = mirrorByCode[item.code];
                    const frozen = m?.actual !== null && m?.actual !== undefined;
                    return (
                      <div key={item.code} className="p-3 space-y-2" data-predict-item={item.code}>
                        <div className="flex items-start gap-3">
                          <span className="font-mono text-[11px] text-muted-foreground w-14 flex-shrink-0 pt-0.5">
                            {item.code.replace(/^CARRE-/, '')}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{item.name}</div>
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pl-14">
                          {[0, 1, 2, 3, 4].map((v) => {
                            const active = m?.predicted === v;
                            return (
                              <button
                                key={v}
                                type="button"
                                disabled={frozen || predict.isPending}
                                onClick={() => void handlePredict(item.code, v)}
                                className={cn(
                                  'rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed tabular-nums',
                                  active
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-muted-foreground/30 text-muted-foreground hover:border-foreground/40 hover:text-foreground',
                                )}
                              >
                                {v}
                              </button>
                            );
                          })}
                          {frozen && (
                            <span className="ml-2 flex items-center gap-1.5 text-xs">
                              <Badge variant="outline" className="text-[10px] tabular-nums">
                                revealed: median {m!.actual} ({m!.scorers} scorers)
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] tabular-nums',
                                  (m!.absError ?? 0) <= 0.5
                                    ? 'border-emerald-300 text-emerald-700'
                                    : 'border-amber-300 text-amber-700',
                                )}
                              >
                                your miss: {m!.absError}
                              </Badge>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Predictions save instantly as you click. Items freeze one by one as the
          sealed lane reaches 3 scorers on them — whatever you predicted by then is
          your record.
        </p>
      </div>
    </ContentLayout>
  );
}
