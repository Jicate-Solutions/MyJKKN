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
  /** Whether the caller may write this event's feedback forms. */
  canManage: (eventId: string) => ['event-feedback-can-manage', eventId] as const,
  /** Every feedback form on the event (the console's card grid). */
  list: (eventId: string) => ['event-feedback-forms', eventId] as const,
  /** One loaded form with its sections + questions. */
  form: (formId: string) => [DETAIL_PREFIX, formId] as const,
  /** Prefix match — invalidates every loaded form. */
  allForms: () => [DETAIL_PREFIX] as const,
  responses: (formId: string) => ['event-feedback-responses', formId] as const,
  summary: (formId: string) => ['event-feedback-summary', formId] as const,
  myRegistration: (eventId: string) => ['event-feedback-my-registration', eventId] as const,
  /** Whether the caller may join the event to answer, when they hold no registration. */
  canSelfRegister: (formId: string) => ['event-feedback-can-self-register', formId] as const,
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

// ─── Who is looking ───────────────────────────────────────────────

/**
 * Is the viewer a coordinator of this event's feedback, or an attendee of it?
 *
 * The answer comes from fn_can_manage_event_feedback — the same function behind
 * the event_feedback_*_manage policies — so the builder is offered to exactly
 * the people the database would let use it. A student is an attendee, and the
 * UI must give them the questionnaire to answer, not the one to write.
 *
 * `data === undefined` means UNDECIDED, and callers must render neither side
 * while it is: showing the manage buttons first and withdrawing them a moment
 * later is how a student sees "Edit questions" at all.
 *
 * On error it resolves to false rather than retrying: the surface it guards is
 * a write surface whose writes RLS refuses anyway, so the safe failure is to
 * show the attendee view.
 */
export function useCanManageEventFeedback(eventId: string) {
  return useQuery({
    queryKey: KEYS.canManage(eventId),
    queryFn: () => EventFeedbackService.canManage(eventId).catch(() => false),
    enabled: !!eventId,
    // Authority does not change while a page is open; refetching it on every
    // tab focus would flicker the buttons for no gain.
    staleTime: 5 * 60 * 1000,
  });
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

/**
 * May the caller join this event in order to answer? Asked only when they hold
 * no registration.
 *
 * An event run without collecting registrations has no participant rows, and a
 * response keys on one — so without this the questions would be hidden from
 * everybody the coordinator invited.
 */
export function useCanSelfRegisterForFeedback(formId: string, enabled: boolean) {
  return useQuery({
    queryKey: KEYS.canSelfRegister(formId),
    queryFn: () => EventFeedbackService.canSelfRegister(formId),
    enabled: !!formId && enabled,
  });
}

export function useSubmitFeedback(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      formId: string;
      /** null when the caller holds no registration and must join to answer. */
      registrationId: string | null;
      profileId: string | null;
      answers: Record<string, unknown>;
    }) => {
      // Join at submit rather than on page load, so the event's participant
      // list only gains people who actually answered. The RPC is idempotent, so
      // a retry cannot create a second participant.
      const registrationId =
        input.registrationId ?? (await EventFeedbackService.selfRegister(input.formId));
      if (!registrationId) {
        throw new Error(
          'You are not on the participant list for this event, and it is not open for you to join.'
        );
      }
      return EventFeedbackService.submitResponse({ ...input, registrationId, eventId });
    },
    onSuccess: (_response, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.myRegistration(eventId) });
      qc.invalidateQueries({ queryKey: KEYS.canSelfRegister(vars.formId) });
      qc.invalidateQueries({ queryKey: KEYS.myResponseAll(vars.formId) });
      qc.invalidateQueries({ queryKey: KEYS.responses(vars.formId) });
      qc.invalidateQueries({ queryKey: KEYS.summary(vars.formId) });
      qc.invalidateQueries({ queryKey: KEYS.list(eventId) });
      toast.success('Thanks — your feedback has been recorded');
    },
    onError: (e: Error) => toast.error(getErrorMessage(e) || 'Could not submit your feedback'),
  });
}
