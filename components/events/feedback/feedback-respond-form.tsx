'use client';

// The attendee's side: answer one event feedback form.
//
// Every gate this renders is a MIRROR of a database rule, never the rule
// itself — RLS decides who may write (fn_my_event_registration), the window is
// derived from the form row, and the unique constraint decides whether this is
// a first submission or a correction. The states below exist so a blocked
// attendee is told WHY rather than watching a save fail.

import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Lock, PencilLine, SendHorizonal, ShieldOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  FeedbackQuestionInput,
  isQuestionVisible,
} from '@/components/events/feedback/feedback-question-input';
import {
  useEventFeedbackForm,
  useMyEventRegistration,
  useMyFeedbackResponse,
  useSubmitFeedback,
} from '@/hooks/events/use-event-feedback';
import { validateFeedbackAnswers } from '@/lib/services/events/feedback/event-feedback-service';
import {
  feedbackFormState,
  FEEDBACK_STATE_REASONS,
  isAnswerableQuestion,
} from '@/types/event-feedback';
import { useAuth } from '@/hooks/use-auth';

export function FeedbackRespondForm({
  eventId,
  formId,
}: {
  eventId: string;
  formId: string;
}) {
  const { profile } = useAuth();
  const { data: form, isLoading: formLoading } = useEventFeedbackForm(formId);
  const { data: registrationId, isLoading: regLoading } = useMyEventRegistration(eventId);
  // Gated on registrationId: the responses SELECT policy has a manager branch,
  // so this must ask for THIS registration's row rather than "any row on the
  // form" — otherwise a coordinator who is also registered opens the page
  // pre-filled with a stranger's answers.
  const { data: existing, isLoading: existingLoading } = useMyFeedbackResponse(
    formId,
    registrationId
  );
  const submit = useSubmitFeedback(eventId);

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [editing, setEditing] = useState(false);

  // Seed from a previous submission ONCE per (form, registration), so returning
  // to change one answer shows what was said rather than a blank form.
  // Re-seeding on every refetch would wipe in-progress edits the moment the tab
  // regained focus — which is the whole reason this is latched.
  //
  // Adjusted DURING RENDER rather than in an effect: React re-runs this render
  // before committing, so the first paint already carries the previous answers
  // instead of flashing an empty form and then filling it in.
  const seedKey = existingLoading || !registrationId ? null : `${formId}:${registrationId}`;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (seedKey && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setValues((existing?.answers as Record<string, unknown> | undefined) ?? {});
  }

  const questions = useMemo(
    () => (form?.sections ?? []).flatMap((s) => s.questions ?? []),
    [form]
  );

  const loading = formLoading || regLoading || existingLoading;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!form) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          This feedback form could not be found.
        </CardContent>
      </Card>
    );
  }

  // Not a participant. `registrationId === null` is a real answer from
  // fn_my_event_registration, not a loading state — so this is a definite "you
  // are not on the list", not a race with a query that has not resolved.
  if (!registrationId) {
    return (
      <Card>
        <CardContent className="space-y-2 py-12 text-center">
          <ShieldOff className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="text-sm font-medium">This feedback form is for registered attendees</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            We could not find a registration for you on this event. If you attended but
            registered under a different email, ask the event coordinator to add you.
          </p>
        </CardContent>
      </Card>
    );
  }

  const state = feedbackFormState(form);
  if (state !== 'active') {
    return (
      <Card>
        <CardContent className="space-y-2 py-12 text-center">
          <Lock className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="text-sm font-medium">{FEEDBACK_STATE_REASONS[state]}</p>
          {existing && (
            <p className="text-sm text-muted-foreground">
              Your response was recorded, so nothing is lost.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Already answered, and not currently correcting it.
  if ((existing || justSubmitted) && !editing) {
    return (
      <Card>
        <CardContent className="space-y-3 py-12 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="text-sm font-medium">Thanks — your feedback has been recorded.</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            You can change your answers while this form is open.
          </p>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PencilLine className="mr-1.5 h-4 w-4" /> Change my answers
          </Button>
        </CardContent>
      </Card>
    );
  }

  async function onSubmit() {
    // Answers to questions hidden by a condition must not be submitted: a
    // conditional branch the attendee backed out of would otherwise be stored
    // as though they had answered it, and the summary would count it.
    const visibleKeys = new Set(
      questions
        .filter((q) => isAnswerableQuestion(q.question_type) && isQuestionVisible(q, values))
        .map((q) => q.question_key)
    );
    const payload = Object.fromEntries(
      Object.entries(values).filter(([key]) => visibleKeys.has(key))
    );

    const problem = validateFeedbackAnswers(
      questions.filter((q) => isQuestionVisible(q, values)),
      payload
    );
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);

    // Return on failure rather than letting the rejection escape: a
    // PostgrestError is a plain object, so it would reach Next's overlay as
    // "[object Object]" and bury the toast. The attendee's answers stay on
    // screen — marking this submitted would tell them their feedback was
    // recorded when it was not.
    try {
      await submit.mutateAsync({
        formId,
        registrationId: registrationId!,
        profileId: profile?.id ?? null,
        answers: payload,
      });
    } catch {
      return;
    }
    setJustSubmitted(true);
    setEditing(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{form.name}</CardTitle>
          {form.description && (
            <p className="text-sm text-muted-foreground">{form.description}</p>
          )}
          {form.is_anonymous && (
            <p className="text-xs text-muted-foreground">
              Your name is not shown to the organisers with these answers.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {(form.sections ?? []).map((section) => {
            const visible = (section.questions ?? []).filter((q) =>
              isQuestionVisible(q, values)
            );
            if (!visible.length) return null;
            return (
              <div key={section.id} className="space-y-4">
                <p className="text-sm font-semibold">{section.title}</p>
                {visible.map((q) => (
                  <FeedbackQuestionInput
                    key={q.id}
                    question={q}
                    value={values[q.question_key]}
                    onChange={(v) =>
                      setValues((prev) => ({ ...prev, [q.question_key]: v }))
                    }
                  />
                ))}
              </div>
            );
          })}

          {questions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              The coordinator has not added any questions to this form yet.
            </p>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            {editing && (
              <Button variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
            <Button
              onClick={onSubmit}
              disabled={submit.isPending || questions.length === 0}
            >
              {submit.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <SendHorizonal className="mr-2 h-4 w-4" />
              )}
              {existing ? 'Update my feedback' : 'Submit feedback'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
