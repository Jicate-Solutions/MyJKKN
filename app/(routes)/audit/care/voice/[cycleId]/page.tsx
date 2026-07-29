// app/(routes)/audit/care/voice/[cycleId]/page.tsx
// The SEALED participant scoring door — how a learner actually reaches
// fn_carre_participant_score for a CARRE cycle whose participant lane is open.
//
// Access: authenticated learners only — enforced SERVER-SIDE by
// fn_carre_participant_context / fn_carre_participant_score (both mirror the
// same learner + cycle-open gates). No page guard, no MENU_PERMISSIONS entry:
// like /audit/care/score/[token], the RPCs are the gate, which is exactly what
// lets a learner account through the audit module's staff RLS. Unlisted by
// design (NAV_EXCLUDE): the Director opens a cycle's lane deliberately and
// shares this link with its participants — a sealed lane is not advertised
// platform-wide. Denials render EXPLICITLY (rule #27), never a silent redirect.
//
// THE SEAL (Director safety decisions, 2026-07-25): scorer identity is visible
// to no app surface (super_admin-only RLS); leadership sees k≥3 aggregates
// only. Both lanes: 'own' (an experience you live) and 'observer' (a unit you
// don't belong to).

'use client';

import { use, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Check, HeartHandshake, Lock, ShieldAlert } from 'lucide-react';
import {
  useCarreParticipantContext,
  useSubmitCarreParticipantScore,
} from '@/hooks/audit';
import { CareScoreSheet, type SheetValue } from '../../_components/care-score-sheet';
import type {
  CarreLaneDenial,
  CarreParticipantContext,
} from '@/lib/services/audit/carre-evidence-service';

const DENIAL_COPY: Record<string, { title: string; body: string }> = {
  not_authenticated: {
    title: 'Please sign in first',
    body: 'Sealed scoring needs your MyJKKN learner account. Sign in, then open this link again.',
  },
  learners_only: {
    title: 'This lane is for learners',
    body: 'The sealed participant lane records learner experience. Team members and Senior Learners score through the audit pages instead.',
  },
  cycle_not_open: {
    title: 'This cycle is not open for participant scoring',
    body: 'The sealed lane is opened deliberately, cycle by cycle. If you were asked to score, the window may have closed — check with whoever shared this link.',
  },
  not_found: {
    title: 'This audit cycle does not exist',
    body: 'The link may be mistyped or the cycle was removed. Check with whoever shared it.',
  },
};

export default function SealedParticipantVoicePage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const { cycleId } = use(params);
  const { data, isLoading, error } = useCarreParticipantContext(cycleId);
  const submitScore = useSubmitCarreParticipantScore();

  const context =
    data && (data as CarreParticipantContext).success
      ? (data as CarreParticipantContext)
      : null;

  const [lane, setLane] = useState<'own' | 'observer'>('own');
  const [values, setValues] = useState<Record<string, SheetValue>>({});
  const [savedCodes, setSavedCodes] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Prefill from previous submissions (resume / revise — your own rows only).
  useEffect(() => {
    if (!context || context.my_scores.length === 0) return;
    setValues((prev) => {
      if (Object.keys(prev).length > 0) return prev; // never clobber edits
      const next: Record<string, SheetValue> = {};
      for (const s of context.my_scores) {
        next[s.parameter_code] = {
          score: s.score,
          evidence_note: s.evidence_note ?? undefined,
        };
      }
      return next;
    });
    setSavedCodes(new Set(context.my_scores.map((s) => s.parameter_code)));
    const firstLane = context.my_scores[0]?.lane;
    if (firstLane === 'own' || firstLane === 'observer') setLane(firstLane);
  }, [context]);

  const scoredCount = useMemo(
    () => Object.values(values).filter((v) => v.score !== undefined).length,
    [values],
  );
  const totalItems = context?.parameters?.length ?? 25;

  async function handleSubmit() {
    if (!context) return;
    const payload = Object.entries(values)
      .filter(([, v]) => v.score !== undefined)
      .map(([parameter_code, v]) => ({
        parameter_code,
        score: v.score!,
        note: v.evidence_note ?? null,
      }));
    if (payload.length === 0) {
      toast.error('Score at least one item before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      let failed: string | null = null;
      const saved = new Set(savedCodes);
      for (const item of payload) {
        const result = await submitScore.mutateAsync({
          cycleId,
          parameterCode: item.parameter_code,
          score: item.score,
          note: item.note,
          lane,
        });
        if ((result as { success: boolean }).success) {
          saved.add(item.parameter_code);
        } else {
          failed = (result as CarreLaneDenial).reason;
          break;
        }
      }
      setSavedCodes(saved);
      if (failed) {
        toast.error(
          DENIAL_COPY[failed]?.title ?? `Could not submit every item (${failed})`,
        );
      } else {
        toast.success('Sealed scores recorded — your identity stays sealed.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <ContentLayout title="Sealed Participant Voice">
        <div className="space-y-4 max-w-4xl">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </ContentLayout>
    );
  }

  // ----------------------------------------------------------------------
  // Explicit denial page (rule #27) — names the reason, offers a next step.
  // ----------------------------------------------------------------------
  if (error || !data || !(data as { success: boolean }).success) {
    const reason = data ? (data as CarreLaneDenial).reason : 'not_found';
    const copy = DENIAL_COPY[reason] ?? {
      title: 'Cannot open the sealed scoring lane',
      body: (error as Error)?.message ?? `Something went wrong (${reason}).`,
    };
    return (
      <ContentLayout title="Sealed Participant Voice">
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
  const submittedBefore = savedCodes.size > 0;

  return (
    <ContentLayout title="Sealed Participant Voice">
      <div className="space-y-6 max-w-4xl">
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <HeartHandshake className="h-4 w-4 text-emerald-600" />
              <h2 className="text-lg font-semibold">{ctx.cycle.name}</h2>
            </div>
            {ctx.cycle.audience && (
              <p className="text-sm text-muted-foreground">{ctx.cycle.audience}</p>
            )}
            <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-xs dark:border-violet-900 dark:bg-violet-950">
              <p className="flex items-start gap-2">
                <Lock className="h-4 w-4 flex-shrink-0 text-violet-600" />
                <span>
                  <strong>Your identity is sealed.</strong> No Senior Learner, HOD,
                  Principal, or platform screen can see who scored what — the seal
                  sits at the Director level, in the database itself. Leadership
                  only ever sees combined numbers from <strong>3 or more
                  scorers</strong>, so a single voice can never be singled out.
                  Score what you <em>actually experience</em>, including the
                  Respect items — that is exactly what this lane exists for.
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Lane choice — Director decision: BOTH lanes exist. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Which seat are you scoring from?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setLane('own')}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-medium transition',
                  lane === 'own'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/30 text-muted-foreground hover:text-foreground',
                )}
              >
                My lived experience
              </button>
              <button
                type="button"
                onClick={() => setLane('observer')}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-medium transition',
                  lane === 'observer'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/30 text-muted-foreground hover:text-foreground',
                )}
              >
                Observer (a unit I don&apos;t belong to)
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {lane === 'own'
                ? 'You are scoring an experience you live yourself.'
                : 'You are scoring something you observe from outside.'}{' '}
              The lane applies to everything you submit below.
            </p>
          </CardContent>
        </Card>

        {submittedBefore && (
          <Card className="border-emerald-300">
            <CardContent className="pt-6 flex items-start gap-3">
              <Check className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  Your sealed scores are recorded ({savedCodes.size} items)
                </p>
                <p className="text-xs text-muted-foreground">
                  You can revise any item and re-submit while the lane stays open.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Scoring sheet — {totalItems} items, 0–4</span>
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {scoredCount}/{totalItems} scored
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CareScoreSheet
              parameters={ctx.parameters}
              values={values}
              settingCode={ctx.setting_code ?? undefined}
              onScore={(code, score) =>
                setValues((prev) => ({
                  ...prev,
                  [code]: { ...prev[code], score },
                }))
              }
              onNote={(code, note) =>
                setValues((prev) => ({
                  ...prev,
                  [code]: { ...prev[code], evidence_note: note },
                }))
              }
            />
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {scoredCount < totalItems
              ? 'Score the items you have real experience of — partial submissions count. Skip anything you have not lived or observed.'
              : 'All items scored.'}
          </p>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? 'Submitting…'
              : submittedBefore
                ? 'Re-submit sealed scores'
                : 'Submit sealed scores'}
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
