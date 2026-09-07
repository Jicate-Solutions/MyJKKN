'use client';

// School of Influencer — the apply surface (spec §7 S4).
// Spec: specs/school-of-influence-batches-2026-07-30.md
//
// This component decides NOTHING. Eligibility, the intake window, capacity and
// the batch-choice mode are all resolved server-side by
// /api/school-of-influence/apply and arrive as an SoiApplyContext; the browser
// only renders them. Re-deriving any of it here would create a second answer
// that a determined caller could disagree with — and the server would still be
// the one that decides, so the client copy could only ever be wrong or
// redundant.
//
// The same rule governs the prefilled boxes added 2026-08-13: the SERVER reads
// the applicant's record and sends the answers it already holds in
// context.knownAnswers. This file only puts them in the boxes and lets the
// person edit them — it never looks a fact up for itself.
//
// The questions are the event's OWN registration form, rendered with the
// platform's existing DynamicFieldInput — the same component the tournament
// registration surfaces and the admin builder's preview use, so what a
// coordinator designs is exactly what an applicant sees.
//
// There is no field anywhere below for somebody else's name or email. An
// application is the signed-in person applying for themselves.

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2, Users } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DynamicFieldInput, isFieldVisible } from '@/components/events/dynamic-field-input';
import type {
  SoiApplyBatchView,
  SoiApplyContext,
  SoiApplyResult,
} from '@/lib/services/school-of-influence/apply-types';

interface Props {
  context: SoiApplyContext;
  /** Re-fetch the context after a successful submit, so the page tells the truth. */
  onApplied: () => void;
}

/** How long to wait for the submit before giving the applicant a way out. */
const SUBMIT_TIMEOUT_MS = 20_000;

const seatsLabel = (batch: SoiApplyBatchView) => {
  const free = Math.max(batch.capacity - batch.occupancy, 0);
  if (!batch.intakeOpen) return 'applications closed';
  if (batch.isFull) {
    return batch.fullBehaviour === 'waitlist' ? 'full — waiting list' : 'full';
  }
  return `${free} of ${batch.capacity} places left`;
};

/**
 * The boxes the platform can already fill in, as the state this form starts
 * from. Computed once, in a lazy initialiser, so that a refetch of the context
 * (staleTime is 0) can never overwrite something the applicant has since typed.
 */
const seedFromRecord = (context: SoiApplyContext): Record<string, unknown> => {
  const seeded: Record<string, unknown> = {};
  for (const [fieldKey, known] of Object.entries(context.knownAnswers ?? {})) {
    seeded[fieldKey] = known.value;
  }
  return seeded;
};

export function SoiApplyForm({ context, onApplied }: Props) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => seedFromRecord(context));
  const [batchCohortId, setBatchCohortId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SoiApplyResult | null>(null);

  const mustChooseBatch = context.policy.batchChoiceMode === 'participant_choose';
  const hasPrefilledBoxes = Object.keys(context.knownAnswers ?? {}).length > 0;
  /**
   * Offer exactly what the server will accept, and nothing else.
   *
   * The window is non-negotiable: a batch outside its own intake dates is
   * refused with `batch_not_open` no matter how full-behaviour is set, so a
   * closed waitlist batch must NOT appear here. Fullness is negotiable — a full
   * batch is still choosable when its rule is to hold people on a list.
   * Listing anything else would let somebody fill the whole form in and only
   * then be bounced.
   */
  const choosableBatches = useMemo(
    () =>
      context.batches.filter(
        (b) => b.intakeOpen && (!b.isFull || b.fullBehaviour === 'waitlist')
      ),
    [context.batches]
  );

  const setAnswer = useCallback((key: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    // Without this, a stalled connection leaves the promise unsettled: `finally`
    // never runs, the button spins forever, and there is no way to retry. A
    // spinner that never resolves is a silent failure wearing a progress
    // indicator.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
    try {
      const response = await fetch('/api/school-of-influence/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          eventId: context.eventId,
          answers,
          batchCohortId: mustChooseBatch ? batchCohortId || null : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        // The server's sentence, printed as written — it is the only place that
        // knows WHY, and a generic "failed" here would throw that away.
        setError(payload?.error ?? 'Your application could not be submitted.');
        return;
      }
      setResult(payload as SoiApplyResult);
      onApplied();
    } catch (err) {
      setError(
        (err as Error)?.name === 'AbortError'
          ? 'Submitting took too long, so nothing was sent. Check your connection and try again.'
          : 'Your application could not be submitted. Check your connection and try again.'
      );
    } finally {
      clearTimeout(timeout);
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            {result.status === 'waitlisted' ? 'You are on the waiting list' : 'Application received'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{result.message}</p>
          <p className="text-xs text-muted-foreground">
            Submitting the form does not give you access to the programme yet — a
            coordinator reviews every application and decides who joins which batch.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/events">Back to events</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Who is applying. Read from the signed-in account and not editable — an
          application is always about the person making it. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">You are applying as</CardTitle>
          <CardDescription>
            Applications are tied to the account you are signed in with. You cannot
            apply on behalf of anybody else. Whether you are a learner or a team
            member is read from your own record, so the form does not ask.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <p className="text-sm font-medium">
            {context.applicant?.fullName ?? context.applicant?.email ?? 'Your JKKN account'}
          </p>
          {context.applicant?.email && (
            <p className="text-xs text-muted-foreground">{context.applicant.email}</p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(context.applicant?.audiences ?? []).map((audience) => (
              <Badge key={audience} variant="secondary" className="text-[10px] font-normal">
                {audience === 'learner' ? 'Learner' : 'Team member'}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* D2 — the batch picker exists only when the programme is configured to
          let applicants choose. Under staff_assign no batch is collected at all. */}
      {mustChooseBatch ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-4 w-4 text-muted-foreground" />
              Choose your batch
            </CardTitle>
            <CardDescription>
              Batches run at the same time. Pick the one you want to join.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="soi-batch">Batch</Label>
            <Select value={batchCohortId} onValueChange={setBatchCohortId}>
              <SelectTrigger id="soi-batch">
                <SelectValue placeholder="Select a batch…" />
              </SelectTrigger>
              <SelectContent>
                {choosableBatches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {batch.name} — {seatsLabel(batch)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {choosableBatches.length === 0 && (
              <p className="text-xs text-destructive">
                No batch is accepting applications right now.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <Users className="h-4 w-4" />
          <AlertTitle>A coordinator will assign your batch</AlertTitle>
          <AlertDescription>
            This programme places people into batches itself, so there is nothing to
            choose here. You will be told which batch you are in when your
            application is accepted.
          </AlertDescription>
        </Alert>
      )}

      {/* The event's own registration form. No form built yet simply means no
          extra questions — never a blocked application.

          A question the server answers for itself is not in here: the server
          leaves it out of formSections entirely, so there is nothing to hide
          on this side. */}
      {context.formSections.length > 0 && (
        <div className="space-y-4">
          {hasPrefilledBoxes && (
            <p className="text-xs text-muted-foreground">
              Some boxes are already filled in from your JKKN record. Please read them,
              and change anything that is wrong — what you send is what the coordinator
              sees.
            </p>
          )}
          {context.formSections.map((section) => {
            const visible = (section.fields ?? []).filter((f) => isFieldVisible(f, answers));
            if (visible.length === 0) return null;
            return (
              <Card key={section.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{section.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {visible.map((field) => (
                    <DynamicFieldInput
                      key={field.id}
                      field={field}
                      value={answers[field.field_key]}
                      onChange={(value) => setAnswer(field.field_key, value)}
                    />
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Your application was not submitted</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={submitting || (mustChooseBatch && !batchCohortId)}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit application
        </Button>
        <p className="text-xs text-muted-foreground">
          {context.policy.requireApproval
            ? 'Submitting is an application. A coordinator reviews it before you get access.'
            : 'Submitting records your application for a coordinator to process.'}
        </p>
      </div>
    </div>
  );
}
