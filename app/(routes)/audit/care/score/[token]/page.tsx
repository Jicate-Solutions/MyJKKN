// app/(routes)/audit/care/score/[token]/page.tsx
// Participant (second-scorer) BLIND scoring sheet.
// Spec: specs/care-audit-module-spec-2026-06-12.md §5 + §6.
//
// Access: authenticated + token — NOT the audit module's staff gating, so a
// LEARNER account can score (fn_care_get_invite_context validates the token
// server-side). Owner scores are never present in this page's data (blind).
// Invalid / expired / claimed tokens render an EXPLICIT denial page (rule #27)
// — never a silent redirect.

'use client';

import { use, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, EyeOff, HeartHandshake, ShieldAlert } from 'lucide-react';
import {
  useCareInviteContext,
  useSubmitParticipantScores,
} from '@/hooks/audit';
import { CareScoreSheet, type SheetValue } from '../../_components/care-score-sheet';
import type {
  CareInviteContext,
  CareRpcDenial,
} from '@/lib/services/audit/care-audit-service';

const DENIAL_COPY: Record<string, { title: string; body: string }> = {
  invite_not_found: {
    title: 'This scoring link is not valid',
    body: 'The link may have been mistyped or replaced. Ask the initiative owner to copy the link again from their CARE audit page.',
  },
  invite_expired: {
    title: 'This scoring link has expired',
    body: 'Invite links are valid for 14 days. Ask the initiative owner to generate a fresh link from their CARE audit page.',
  },
  invite_claimed: {
    title: 'This link was already used by someone else',
    body: 'Each CARE audit has ONE second scorer, and another account has already opened this link. If that should have been you, ask the initiative owner to generate a fresh link.',
  },
  audit_not_found: {
    title: 'The audit behind this link no longer exists',
    body: 'The CARE audit may have been deleted. Contact the initiative owner.',
  },
  cycle_closed: {
    title: 'This audit is closed',
    body: 'Scores are frozen once an audit closes. Contact the initiative owner if you believe this is a mistake.',
  },
  not_authenticated: {
    title: 'Please sign in first',
    body: 'Scoring needs a MyJKKN account (student or staff). Sign in, then open this link again.',
  },
};

export default function CareParticipantScoringPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { data, isLoading, error } = useCareInviteContext(token);
  const submitScores = useSubmitParticipantScores();

  const context =
    data && (data as CareInviteContext).success ? (data as CareInviteContext) : null;

  // Local draft — persisted only on submit (single-call RPC).
  const [values, setValues] = useState<Record<string, SheetValue>>({});
  const [submitted, setSubmitted] = useState(false);

  // Prefill from previously-submitted scores (resume / edit-before-expiry).
  useEffect(() => {
    if (!context) return;
    if (context.my_scores.length === 0) return;
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
    setSubmitted(true);
  }, [context]);

  const scoredCount = useMemo(
    () => Object.values(values).filter((v) => v.score !== undefined).length,
    [values],
  );
  const totalItems = context?.snapshot?.parameters?.length ?? 20;

  async function handleSubmit() {
    const payload = Object.entries(values)
      .filter(([, v]) => v.score !== undefined)
      .map(([parameter_code, v]) => ({
        parameter_code,
        score: v.score!,
        evidence_note: v.evidence_note ?? null,
      }));
    if (payload.length === 0) {
      toast.error('Score at least one item before submitting.');
      return;
    }
    const result = await submitScores.mutateAsync({ token, scores: payload });
    if (!(result as { success: boolean }).success) {
      const denial = result as CareRpcDenial;
      toast.error(
        DENIAL_COPY[denial.reason]?.title ?? `Could not submit (${denial.reason})`,
      );
      return;
    }
    setSubmitted(true);
    toast.success('Scores submitted — thank you for the second read.');
  }

  if (isLoading) {
    return (
      <ContentLayout title="CARE Audit — Second Scorer">
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
    const reason = data ? (data as CareRpcDenial).reason : 'invite_not_found';
    const copy = DENIAL_COPY[reason] ?? {
      title: 'Cannot open this scoring link',
      body: (error as Error)?.message ?? `Something went wrong (${reason}).`,
    };
    return (
      <ContentLayout title="CARE Audit — Second Scorer">
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

  return (
    <ContentLayout title="CARE Audit — Second Scorer">
      <div className="space-y-6 max-w-4xl">
        <Card>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center gap-2">
              <HeartHandshake className="h-4 w-4 text-rose-600" />
              <h2 className="text-lg font-semibold">{ctx.cycle.name}</h2>
            </div>
            {ctx.cycle.audience && (
              <p className="text-sm text-muted-foreground">{ctx.cycle.audience}</p>
            )}
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-900 dark:bg-blue-950">
              <p className="flex items-start gap-2">
                <EyeOff className="h-4 w-4 flex-shrink-0 text-blue-600" />
                <span>
                  <strong>You are the second scorer — scoring is blind.</strong>{' '}
                  You will not see the owner&apos;s scores, and they will not see
                  yours until you submit. Score what <em>you actually experience</em>{' '}
                  as a participant, not what is intended. There are no wrong answers
                  — disagreement is itself a finding.
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        {submitted && (
          <Card className="border-emerald-300">
            <CardContent className="pt-6 flex items-start gap-3">
              <Check className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Your scores are recorded</p>
                <p className="text-xs text-muted-foreground">
                  You can adjust them below and re-submit until the link expires.
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
              parameters={ctx.snapshot?.parameters ?? []}
              values={values}
              settingCode={(ctx.snapshot as { setting_code?: string })?.setting_code}
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

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {scoredCount < totalItems
              ? `Score all ${totalItems} items for a complete second read — partial submissions only compare on items you scored.`
              : 'All items scored.'}
          </p>
          <Button onClick={handleSubmit} disabled={submitScores.isPending}>
            {submitScores.isPending
              ? 'Submitting…'
              : submitted
                ? 'Re-submit scores'
                : 'Submit scores'}
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
