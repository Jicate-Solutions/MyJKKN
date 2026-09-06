// lib/services/events/feedback/event-feedback-service.ts
//
// CRUD for an event's coordinator-editable feedback forms (sections +
// questions), plus the participant-side read/submit path and the coordinator's
// response rollups.
//
// Modeled on event-registration-form-service.ts's shape, against independent
// event_feedback_* tables — see the header of
// supabase/migrations/event_feedback_forms.sql for why they are not shared.
//
// Authorization lives entirely in RLS (fn_can_manage_event_feedback for the
// coordinator side, fn_my_event_registration for the participant side). Nothing
// in this file re-encodes a permission rule, so the UI and the database can
// never disagree about who may edit a form.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  EventFeedbackForm,
  EventFeedbackFormSummary,
  EventFeedbackSection,
  EventFeedbackQuestion,
  EventFeedbackResponse,
  FeedbackQuestionSummary,
  FeedbackQuestionType,
  FormFieldCondition,
  FormFieldOption,
} from '@/types/event-feedback';
import {
  CHOICE_QUESTION_TYPES,
  isAnswerableQuestion,
  isFeedbackFormOpen,
} from '@/types/event-feedback';

/** One question in a bulk-save payload. Carries no row id — the RPC reinserts fresh. */
export interface SaveFeedbackQuestionPayload {
  question_key: string;
  question_label: string;
  question_type: FeedbackQuestionType;
  is_required: boolean;
  display_order: number;
  placeholder: string | null;
  help_text: string | null;
  min_length: number | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  pattern: string | null;
  options: FormFieldOption[] | null;
  condition: FormFieldCondition | null;
  /**
   * MUST be carried here even though only 'rating' uses it: the save RPC deletes
   * and reinserts every question, so a column missing from this payload is wiped
   * the next time anyone edits the form — the coordinator's 10-point scale would
   * silently collapse to a default on an unrelated label change.
   */
  rating_scale: number | null;
}

export interface SaveFeedbackSectionPayload {
  title: string;
  display_order: number;
  questions: SaveFeedbackQuestionPayload[];
}

/** One submitted response, answers already paired with the question that asked them. */
export interface FeedbackResponseRow {
  id: string;
  /** NULL when the form is anonymous, or when the registration row is gone. */
  participant_name: string | null;
  participant_email: string | null;
  institution_name: string | null;
  submitted_at: string;
  answers: { label: string; value: string }[];
}

/**
 * Turn a form name into a URL-safe slug matching the DB's
 * event_feedback_forms_slug_format_check. Returns 'feedback' for input with
 * nothing usable in it, so a name like "★★★" still produces a legal slug
 * instead of a constraint violation.
 */
export function slugifyFeedbackName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'feedback';
}

/** Stable answer key from a question label. Assigned once, then frozen. */
export function slugifyQuestionKey(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '_')
      .replace(/^_|_$/g, '') || 'question'
  );
}

/** Render a jsonb answer for reading: arrays joined, booleans humanised, empty → em dash. */
function formatAnswer(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export class EventFeedbackService {
  // ─── Forms ──────────────────────────────────────────────────

  /** Every feedback form on the event, in display order, with question + response counts. */
  static async listForms(eventId: string): Promise<EventFeedbackFormSummary[]> {
    const supabase = createClientSupabaseClient();

    const { data: forms, error } = await (supabase as any)
      .from('event_feedback_forms')
      .select('*')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (!forms?.length) return [];

    const formIds = forms.map((f: EventFeedbackForm) => f.id);

    // Two cheap id-only reads rather than an aggregate embed: PostgREST needs a
    // declared FK in the exposed schema for those, and these are a few hundred
    // rows at most.
    const [{ data: questionRows }, { data: responseRows }] = await Promise.all([
      (supabase as any).from('event_feedback_questions').select('form_id').in('form_id', formIds),
      (supabase as any).from('event_feedback_responses').select('form_id').in('form_id', formIds),
    ]);

    const tally = (rows: { form_id: string }[] | null) =>
      (rows ?? []).reduce<Record<string, number>>((acc, r) => {
        acc[r.form_id] = (acc[r.form_id] ?? 0) + 1;
        return acc;
      }, {});
    const questionCounts = tally(questionRows);
    const responseCounts = tally(responseRows);

    return forms.map((f: EventFeedbackForm) => ({
      ...f,
      question_count: questionCounts[f.id] ?? 0,
      response_count: responseCounts[f.id] ?? 0,
    }));
  }

  /**
   * Create a feedback form on the event.
   *
   * Starts CLOSED (is_enabled false) so creating one never begins collecting by
   * surprise — the coordinator writes the questions first, then opens it.
   */
  static async createForm(
    eventId: string,
    name: string,
    options: { description?: string | null; isAnonymous?: boolean } = {}
  ): Promise<EventFeedbackForm> {
    const supabase = createClientSupabaseClient();
    const trimmed = name.trim() || 'Event Feedback';

    const { data: siblings } = await (supabase as any)
      .from('event_feedback_forms')
      .select('display_order')
      .eq('event_id', eventId);
    const nextOrder =
      (siblings ?? []).reduce(
        (max: number, r: { display_order: number }) => Math.max(max, r.display_order ?? 0),
        -1
      ) + 1;

    // Slug is unique per event. Retry with a numeric suffix on 23505 rather than
    // pre-checking — a pre-check races two coordinators adding a form at once.
    const base = slugifyFeedbackName(trimmed);
    for (let attempt = 0; attempt < 25; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const { data, error } = await (supabase as any)
        .from('event_feedback_forms')
        .insert({
          event_id: eventId,
          name: trimmed,
          slug,
          description: options.description ?? null,
          is_anonymous: options.isAnonymous ?? false,
          is_enabled: false,
          display_order: nextOrder,
        })
        .select()
        .single();
      if (!error) return data as EventFeedbackForm;
      if (error.code !== '23505') throw error;
    }
    throw new Error('Could not find a free slug for this form name — rename it and retry.');
  }

  /** Full form + sections + questions, ordered, for the builder and the respond page. */
  static async getFormWithQuestions(formId: string): Promise<EventFeedbackForm> {
    const supabase = createClientSupabaseClient();

    const { data: form, error: formError } = await (supabase as any)
      .from('event_feedback_forms')
      .select('*')
      .eq('id', formId)
      .single();
    if (formError) throw formError;

    // Both reads filter by form_id, NOT event_id. Filtering by event is what
    // made every registration form on an event show every other form's fields.
    const [{ data: sections, error: sectionsError }, { data: questions, error: questionsError }] =
      await Promise.all([
        (supabase as any)
          .from('event_feedback_sections')
          .select('*')
          .eq('form_id', formId)
          .order('display_order', { ascending: true }),
        (supabase as any)
          .from('event_feedback_questions')
          .select('*')
          .eq('form_id', formId)
          .order('display_order', { ascending: true }),
      ]);
    if (sectionsError) throw sectionsError;
    if (questionsError) throw questionsError;

    const sectionsWithQuestions = (sections ?? []).map((section: EventFeedbackSection) => ({
      ...section,
      questions: (questions ?? []).filter(
        (q: EventFeedbackQuestion) => q.section_id === section.id
      ),
    }));

    return { ...(form as EventFeedbackForm), sections: sectionsWithQuestions };
  }

  /**
   * Form METADATA only (name / description / window / anonymity / open switch).
   * Deliberately a plain UPDATE and not part of save_event_feedback_form: that
   * RPC would have to be dropped and recreated to gain a parameter, and DROP
   * FUNCTION discards the function's ACL.
   */
  static async updateForm(
    formId: string,
    updates: {
      name?: string;
      description?: string | null;
      is_enabled?: boolean;
      is_anonymous?: boolean;
      starts_at?: string | null;
      ends_at?: string | null;
      display_order?: number;
    }
  ): Promise<EventFeedbackForm> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('event_feedback_forms')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', formId)
      .select()
      .single();
    if (error) throw error;
    return data as EventFeedbackForm;
  }

  /**
   * Atomically replace the whole form (sections + questions) with the desired
   * state. One RPC = one transaction, so a partial failure rolls back and the
   * coordinator never lands on a half-saved questionnaire.
   */
  static async saveForm(
    formId: string,
    isEnabled: boolean,
    sections: SaveFeedbackSectionPayload[]
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any).rpc('save_event_feedback_form', {
      p_form_id: formId,
      p_is_enabled: isEnabled,
      p_sections: sections,
    });
    if (error) throw error;
  }

  static async deleteForm(formId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any)
      .from('event_feedback_forms')
      .delete()
      .eq('id', formId);
    if (error) throw error;
  }

  // ─── Coordinator: responses ─────────────────────────────────

  /**
   * Responses to ONE form, newest first, each answer paired with the question
   * that asked it.
   *
   * Identity is resolved through a second read of events_registrations and is
   * SUPPRESSED ENTIRELY when the form is anonymous — the join is skipped rather
   * than fetched-and-hidden, so an anonymous form's names never reach the
   * browser at all. (Hiding them client-side would leave them in the network
   * response for anyone who opened devtools.)
   */
  static async listResponses(formId: string): Promise<FeedbackResponseRow[]> {
    const supabase = createClientSupabaseClient();

    const { data: form, error: formError } = await (supabase as any)
      .from('event_feedback_forms')
      .select('id, is_anonymous')
      .eq('id', formId)
      .single();
    if (formError) throw formError;

    const [{ data: questions }, { data: responses, error }] = await Promise.all([
      (supabase as any)
        .from('event_feedback_questions')
        .select('question_key, question_label, question_type, display_order')
        .eq('form_id', formId)
        .order('display_order', { ascending: true }),
      (supabase as any)
        .from('event_feedback_responses')
        .select('id, registration_id, answers, submitted_at')
        .eq('form_id', formId)
        .order('submitted_at', { ascending: false })
        .limit(1000),
    ]);
    if (error) throw error;

    // Display-only questions collect nothing, so including them would add a
    // column that is empty for every single row.
    const defs = ((questions ?? []) as {
      question_key: string;
      question_label: string;
      question_type: FeedbackQuestionType;
    }[]).filter((q) => isAnswerableQuestion(q.question_type));

    let identities: Record<
      string,
      { name: string | null; email: string | null; institution: string | null }
    > = {};

    if (!form.is_anonymous && responses?.length) {
      const regIds = Array.from(
        new Set(responses.map((r: { registration_id: string }) => r.registration_id))
      );
      const { data: regs } = await (supabase as any)
        .from('events_registrations')
        .select('id, participant_name, participant_email, institution_name')
        .in('id', regIds);
      identities = (regs ?? []).reduce(
        (acc: typeof identities, r: Record<string, any>) => {
          acc[r.id] = {
            name: r.participant_name ?? null,
            email: r.participant_email ?? null,
            institution: r.institution_name ?? null,
          };
          return acc;
        },
        {} as typeof identities
      );
    }

    return (responses ?? []).map((r: Record<string, any>) => {
      const who = identities[r.registration_id];
      return {
        id: r.id,
        participant_name: who?.name ?? null,
        participant_email: who?.email ?? null,
        institution_name: who?.institution ?? null,
        submitted_at: r.submitted_at,
        // Ordered by the form's own question order, so every response reads the
        // way the form was filled in. A key the form no longer has is dropped
        // rather than shown as a bare slug.
        answers: defs.map((d) => ({
          label: d.question_label,
          value: formatAnswer((r.answers ?? {})[d.question_key]),
        })),
      };
    });
  }

  /**
   * Per-question rollups for the summary tab: mean score for ratings, option
   * counts for choices, the raw text for comments.
   *
   * Computed client-side from the same rows listResponses() reads. A SQL
   * aggregate would be faster but would need one more SECURITY DEFINER RPC per
   * shape of question, and a feedback form's response count is bounded by the
   * event's registration count — hundreds, not millions.
   */
  static async summarize(formId: string): Promise<FeedbackQuestionSummary[]> {
    const supabase = createClientSupabaseClient();

    const [{ data: questions, error: qError }, { data: responses, error: rError }] =
      await Promise.all([
        (supabase as any)
          .from('event_feedback_questions')
          .select('question_key, question_label, question_type, options, rating_scale, display_order')
          .eq('form_id', formId)
          .order('display_order', { ascending: true }),
        (supabase as any)
          .from('event_feedback_responses')
          .select('answers, submitted_at')
          .eq('form_id', formId)
          .order('submitted_at', { ascending: false })
          .limit(1000),
      ]);
    if (qError) throw qError;
    if (rError) throw rError;

    const rows = (responses ?? []) as { answers: Record<string, unknown> }[];

    return ((questions ?? []) as (EventFeedbackQuestion & { options: FormFieldOption[] | null })[])
      .filter((q) => isAnswerableQuestion(q.question_type))
      .map((q) => {
        const values = rows
          .map((r) => (r.answers ?? {})[q.question_key])
          // An unanswered optional question must not count as a response to it,
          // or every optional question's average is dragged toward whatever
          // empty coerces to.
          .filter((v) => v !== undefined && v !== null && v !== '');

        let average: number | null = null;
        if (q.question_type === 'rating' || q.question_type === 'number') {
          const nums = values.map(Number).filter((n) => !Number.isNaN(n));
          average = nums.length
            ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
            : null;
        }

        const distribution: { label: string; count: number }[] = [];
        if (CHOICE_QUESTION_TYPES.has(q.question_type)) {
          const counts = new Map<string, number>();
          // A multi_select answer is an array; every chosen option counts once,
          // so the distribution sums to picks rather than to respondents.
          for (const v of values) {
            for (const one of Array.isArray(v) ? v : [v]) {
              const key = String(one);
              counts.set(key, (counts.get(key) ?? 0) + 1);
            }
          }
          // Label from the question's own option list where possible, so the
          // chart reads the way the form did rather than showing stored values.
          const labelFor = (value: string) =>
            (q.options ?? []).find((o) => o.value === value)?.label ?? value;
          for (const [value, count] of counts) {
            distribution.push({ label: labelFor(value), count });
          }
          distribution.sort((a, b) => b.count - a.count);
        } else if (q.question_type === 'checkbox') {
          const yes = values.filter((v) => v === true || v === 'true').length;
          distribution.push({ label: 'Yes', count: yes });
          distribution.push({ label: 'No', count: values.length - yes });
        }

        const comments =
          q.question_type === 'text' || q.question_type === 'textarea'
            ? values.map(String).filter((s) => s.trim() !== '')
            : [];

        return {
          question_key: q.question_key,
          question_label: q.question_label,
          question_type: q.question_type,
          answered: values.length,
          average,
          rating_scale: q.rating_scale ?? null,
          distribution,
          comments,
        };
      });
  }

  // ─── Participant side ───────────────────────────────────────

  /**
   * The signed-in user's own registration id on this event, or null when they
   * hold none. Delegates to the SECURITY DEFINER fn_my_event_registration so
   * the "who counts as a participant" rule lives in exactly one place — the
   * same function the RLS policies call.
   */
  static async myRegistrationId(eventId: string): Promise<string | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc('fn_my_event_registration', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as string | null) ?? null;
  }

  /**
   * Forms on this event that the caller may answer RIGHT NOW: enabled and
   * inside their window. RLS has already limited the rows to events the caller
   * is registered for, so this adds no auth of its own — only the window, which
   * is derived rather than stored.
   */
  static async listOpenForms(eventId: string): Promise<EventFeedbackFormSummary[]> {
    const forms = await this.listForms(eventId);
    return forms.filter((f) => isFeedbackFormOpen(f));
  }

  /**
   * The caller's existing response to a form, or null if they have not answered.
   *
   * Filters on registration_id EXPLICITLY rather than leaning on RLS. The SELECT
   * policy has a manager branch, so a coordinator who is also registered for
   * their own event reads every response through it — without this filter they
   * would open the respond page pre-filled with a stranger's answers and be
   * told they had already submitted.
   */
  static async myResponse(
    formId: string,
    registrationId: string
  ): Promise<EventFeedbackResponse | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('event_feedback_responses')
      .select('*')
      .eq('form_id', formId)
      .eq('registration_id', registrationId)
      .maybeSingle();
    if (error) throw error;
    return (data as EventFeedbackResponse | null) ?? null;
  }

  /**
   * Submit (or correct) the caller's feedback.
   *
   * Upsert on the (form_id, registration_id) unique constraint rather than
   * read-then-branch: two taps on a slow connection would otherwise race into
   * two inserts, and the second would surface as a raw 23505 to the
   * participant. The registration_id is supplied by the caller but re-checked
   * by the RLS WITH CHECK against fn_my_event_registration(), so passing
   * someone else's is rejected by the database, not merely by this function.
   */
  static async submitResponse(input: {
    formId: string;
    eventId: string;
    registrationId: string;
    profileId: string | null;
    answers: Record<string, unknown>;
  }): Promise<EventFeedbackResponse> {
    const supabase = createClientSupabaseClient();
    const now = new Date().toISOString();
    const { data, error } = await (supabase as any)
      .from('event_feedback_responses')
      .upsert(
        {
          form_id: input.formId,
          event_id: input.eventId,
          registration_id: input.registrationId,
          profile_id: input.profileId,
          answers: input.answers,
          submitted_at: now,
          updated_at: now,
        },
        { onConflict: 'form_id,registration_id' }
      )
      .select()
      .single();
    if (error) throw error;
    return data as EventFeedbackResponse;
  }
}

/**
 * Validates submitted answers against a form's question definitions. Returns an
 * error message for the first unsatisfied required question, or null when
 * everything required is present.
 *
 * Shared by the respond page (for immediate feedback) and any server route that
 * writes a response — client validation is a convenience, never the gate.
 */
export function validateFeedbackAnswers(
  questions: EventFeedbackQuestion[],
  submitted: Record<string, unknown> | null | undefined
): string | null {
  const answers = submitted ?? {};
  for (const question of questions) {
    // A display-only question asks nothing, so a required one could never be
    // satisfied — the DB forbids that combination, but a stale row from before
    // that constraint would otherwise make the form permanently unsubmittable.
    if (!isAnswerableQuestion(question.question_type)) continue;
    if (!question.is_required) continue;

    const value = answers[question.question_key];
    const isEmpty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0) ||
      // A rating is stored as a number; 0 means "not rated", since every scale
      // starts at 1. Without this an untouched star row passes the required check.
      (question.question_type === 'rating' && Number(value) === 0);

    if (isEmpty) return `"${question.question_label}" is required`;
  }
  return null;
}
