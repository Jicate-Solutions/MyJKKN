// hooks/events/use-event-feedback.ts
// React Query hooks for coordinator-editable event feedback forms.
//
// Keying mirrors use-tournament-registration-form.ts: the LIST is keyed by
// event, a LOADED form by form id. Structural mutations invalidate the whole
// detail prefix rather than threading a form id through every hook — the
// builder shows one form at a time, so the over-invalidation is free, and the
// list has to refresh anyway because its question/response counts moved.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  EventFeedbackService,
  type SaveFeedbackSectionPayload,
} from '@/lib/services/events/feedback/event-feedback-service';
import { getErrorMessage } from '@/lib/utils';

const DETAIL_PREFIX = 'event-feedback-form';

const KEYS = {
  /** Every feedback form on the event (the console's card grid). */
  list: (eventId: string) => ['event-feedback-forms', eventId] as const,
  /** One loaded form with its sections + questions. */
  form: (formId: string) => [DETAIL_PREFIX, formId] as const,
  /** Prefix match — invalidates every loaded form. */
  allForms: () => [DETAIL_PREFIX] as const,
  responses: (formId: string) => ['event-feedback-responses', formId] as const,
  summary: (formId: string) => ['event-feedback-summary', formId] as const,
  myRegistration: (eventId: string) => ['event-feedback-my-registration', eventId] as const,
  /** Keyed by registration too — the same browser can hold one cached response
   *  per registration, and a manager's view of a form is not their own answer. */
  myResponse: (formId: string, registrationId: string | null) =>
    ['event-feedback-my-response', formId, registrationId] as const,
  /** Prefix match over every registration's cached response to one form. */
  myResponseAll: (formId: string) => ['event-feedback-my-response', formId] as const,
};

function invalidateForms(qc: ReturnType<typeof useQueryClient>, eventId: string) {
  qc.invalidateQueries({ queryKey: KEYS.allForms() });
  qc.invalidateQueries({ queryKey: KEYS.list(eventId) });
}

// ─── Coordinator: forms ───────────────────────────────────────────

/** Every feedback form on the event, with question and response counts. */
export function useEventFeedbackForms(eventId: string) {
  return useQuery({
    queryKey: KEYS.list(eventId),
    queryFn: () => EventFeedbackService.listForms(eventId),
    enabled: !!eventId,
  });
}

/** Full form + sections + questions, by FORM id (not event id). */
export function useEventFeedbackForm(formId: string) {
  return useQuery({
    queryKey: KEYS.form(formId),
    queryFn: () => EventFeedbackService.getFormWithQuestions(formId),
    enabled: !!formId,
  });
}

export function useCreateFeedbackForm(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      description,
      isAnonymous,
    }: {
      name: string;
      description?: string | null;
      isAnonymous?: boolean;
    }) => EventFeedbackService.createForm(eventId, name, { description, isAnonymous }),
    onSuccess: (form) => {
      invalidateForms(qc, eventId);
      toast.success(`"${form.name}" created — it starts closed`);
    },
    onError: (e: Error) => toast.error(getErrorMessage(e) || 'Failed to create the feedback form'),
  });
}

export function useUpdateFeedbackForm(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      formId,
      updates,
    }: {
      formId: string;
      updates: {
        name?: string;
        description?: string | null;
        is_enabled?: boolean;
        is_anonymous?: boolean;
        starts_at?: string | null;
        ends_at?: string | null;
      };
    }) => EventFeedbackService.updateForm(formId, updates),
    onSuccess: () => invalidateForms(qc, eventId),
    onError: (e: Error) => toast.error(getErrorMessage(e) || 'Failed to update the feedback form'),
  });
}

export function useDeleteFeedbackForm(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formId: string) => EventFeedbackService.deleteForm(formId),
    onSuccess: () => {
      invalidateForms(qc, eventId);
      toast.success('Feedback form deleted');
    },
    onError: (e: Error) => toast.error(getErrorMessage(e) || 'Failed to delete the feedback form'),
  });
}

/** Save the entire questionnaire in one atomic RPC (the builder's only write). */
export function useSaveFeedbackForm(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      formId,
      isEnabled,
      sections,
    }: {
      formId: string;
      isEnabled: boolean;
      sections: SaveFeedbackSectionPayload[];
    }) => EventFeedbackService.saveForm(formId, isEnabled, sections),
    onSuccess: () => {
      invalidateForms(qc, eventId);
      toast.success('Feedback questions saved');
    },
    onError: (e: Error) => toast.error(getErrorMessage(e) || 'Failed to save the questions'),
  });
}

// ─── Coordinator: responses ───────────────────────────────────────

export function useFeedbackResponses(formId: string, enabled = true) {
  return useQuery({
    queryKey: KEYS.responses(formId),
    queryFn: () => EventFeedbackService.listResponses(formId),
    enabled: !!formId && enabled,
  });
}

export function useFeedbackSummary(formId: string, enabled = true) {
  return useQuery({
    queryKey: KEYS.summary(formId),
    queryFn: () => EventFeedbackService.summarize(formId),
    enabled: !!formId && enabled,
  });
}

// ─── Participant ──────────────────────────────────────────────────

/**
 * The caller's own registration id on this event, or null.
 *
 * `null` is a legitimate ANSWER ("you are not registered"), not a missing one —
 * so the respond page can say exactly that instead of spinning forever. React
 * Query treats null data as loaded, which is what makes that distinction work.
 */
export function useMyEventRegistration(eventId: string) {
  return useQuery({
    queryKey: KEYS.myRegistration(eventId),
    queryFn: () => EventFeedbackService.myRegistrationId(eventId),
    enabled: !!eventId,
  });
}

/**
 * The caller's existing answers to a form, or null if they have not answered yet.
 *
 * Needs the registration id, not just the form: the responses SELECT policy has
 * a manager branch, so filtering by form alone would hand a coordinator who is
 * also registered somebody else's answers.
 */
export function useMyFeedbackResponse(formId: string, registrationId: string | null | undefined) {
  return useQuery({
    queryKey: KEYS.myResponse(formId, registrationId ?? null),
    queryFn: () => EventFeedbackService.myResponse(formId, registrationId!),
    enabled: !!formId && !!registrationId,
  });
}

export function useSubmitFeedback(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      formId: string;
      registrationId: string;
      profileId: string | null;
      answers: Record<string, unknown>;
    }) => EventFeedbackService.submitResponse({ ...input, eventId }),
    onSuccess: (_response, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.myResponseAll(vars.formId) });
      qc.invalidateQueries({ queryKey: KEYS.responses(vars.formId) });
      qc.invalidateQueries({ queryKey: KEYS.summary(vars.formId) });
      qc.invalidateQueries({ queryKey: KEYS.list(eventId) });
      toast.success('Thanks — your feedback has been recorded');
    },
    onError: (e: Error) => toast.error(getErrorMessage(e) || 'Could not submit your feedback'),
  });
}
