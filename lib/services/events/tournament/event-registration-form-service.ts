// lib/services/events/tournament/event-registration-form-service.ts
// CRUD for a tournament's dynamic registration form (sections + fields).
// Modeled directly on lib/services/admission/form-builder-service.ts's shape —
// independent tables, not shared with Admission (design decision #6).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  EventRegistrationForm,
  EventRegistrationFormSummary,
  EventRegistrationFormSection,
  EventRegistrationFormField,
  CreateFormSectionDto,
  UpdateFormSectionDto,
  CreateFormFieldDto,
  UpdateFormFieldDto,
  FormFieldType,
  FormFieldOption,
  FormFieldCondition,
} from '@/types/tournament';
import { asFormUpload, isAnswerableField, UPLOAD_FIELD_TYPES } from '@/types/tournament';

/** One submitted response, answers already paired with their field labels. */
export interface FormResponseRow {
  id: string;
  participant_name: string | null;
  participant_email: string | null;
  participant_phone: string | null;
  status: string | null;
  created_at: string;
  answers: { label: string; value: string }[];
}

/** Render a jsonb answer for reading: arrays joined, objects stringified, null → em dash. */
function formatAnswer(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  // An upload answer is an object; JSON.stringify would print a storage path and
  // a MIME type at the reader. Show the filename — the path is not useful to a
  // human anyway, since the bucket is private and needs a signed URL.
  const upload = asFormUpload(value);
  if (upload) return upload.name;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Turn a form name into a URL-safe slug matching the DB's
 * event_registration_forms_slug_format_check: lowercase alphanumerics joined by
 * single hyphens. Returns 'form' for input with nothing usable in it, so a
 * name like "★★★" still produces a legal slug instead of a constraint violation.
 */
export function slugifyFormName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'form';
}

/**
 * PostgREST serialises Postgres `numeric` as a STRING ("200.00"), so a raw row's
 * fee_amount is not the `number` the type promises. Left unnormalised it reads
 * as truthy for "0.00" and concatenates instead of adding — the classic way a
 * free form starts demanding money. Normalise once, at every read boundary.
 */
function normalizeForm<T extends { fee_amount?: unknown }>(row: T): T {
  return { ...row, fee_amount: Number(row.fee_amount ?? 0) || 0 };
}

/** One field in a bulk-save payload. Carries no row id — the RPC reinserts fresh. */
export interface SaveFormFieldPayload {
  field_key: string;
  field_label: string;
  field_type: FormFieldType;
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
   * Public image URL for an 'image_display' field. MUST be carried here: the
   * save RPC deletes and reinserts every field, so a column missing from this
   * payload is wiped the next time anyone edits the form — the organizer's
   * image would vanish on an unrelated label change.
   */
  media_url: string | null;
}

/** One section in a bulk-save payload. */
export interface SaveFormSectionPayload {
  title: string;
  display_order: number;
  fields: SaveFormFieldPayload[];
}

export class EventRegistrationFormService {
  // ─── Form ───────────────────────────────────────────────────

  /** Every form on the event, in display order, with field + response counts. */
  static async listForms(eventId: string): Promise<EventRegistrationFormSummary[]> {
    const supabase = createClientSupabaseClient();

    const { data: forms, error } = await (supabase as any)
      .from('event_registration_forms')
      .select('*')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (!forms?.length) return [];

    const formIds = forms.map((f: EventRegistrationForm) => f.id);

    // Counts come from two cheap id-only reads rather than an embed: PostgREST
    // aggregate embeds need a declared FK in the exposed schema, and a plain
    // count here is a few hundred rows at most.
    const [{ data: fieldRows }, { data: responseRows }] = await Promise.all([
      (supabase as any)
        .from('event_registration_form_fields')
        .select('form_id')
        .in('form_id', formIds),
      (supabase as any)
        .from('events_registrations')
        .select('form_id')
        .in('form_id', formIds),
    ]);

    const tally = (rows: { form_id: string }[] | null) =>
      (rows ?? []).reduce<Record<string, number>>((acc, r) => {
        acc[r.form_id] = (acc[r.form_id] ?? 0) + 1;
        return acc;
      }, {});
    const fieldCounts = tally(fieldRows);
    const responseCounts = tally(responseRows);

    return forms.map((f: EventRegistrationForm) => ({
      ...normalizeForm(f),
      field_count: fieldCounts[f.id] ?? 0,
      response_count: responseCounts[f.id] ?? 0,
    }));
  }

  /**
   * The event's first form, creating one if the event has none. Lazy-create
   * means events that predate the form builder need no backfill — the first
   * read materializes the row. With multiple forms this returns the FIRST in
   * display order; callers that mean a specific form must pass its id.
   */
  static async getOrCreateForm(eventId: string): Promise<EventRegistrationForm> {
    const supabase = createClientSupabaseClient();

    const { data: existing, error: readError } = await (supabase as any)
      .from('event_registration_forms')
      .select('*')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (readError) throw readError;
    if (existing) return normalizeForm(existing as EventRegistrationForm);

    const { data: created, error: createError } = await (supabase as any)
      .from('event_registration_forms')
      .insert({
        event_id: eventId,
        name: 'Registration Form',
        slug: 'registration',
        is_enabled: true,
        display_order: 0,
      })
      .select()
      .single();
    if (createError) throw createError;
    return normalizeForm(created as EventRegistrationForm);
  }

  /** Create an additional named form on the event. */
  static async createForm(
    eventId: string,
    name: string,
    options: { description?: string | null; isEnabled?: boolean } = {}
  ): Promise<EventRegistrationForm> {
    const supabase = createClientSupabaseClient();
    const trimmed = name.trim() || 'Registration Form';

    // Slug must be unique per event. Retry with a numeric suffix on 23505 rather
    // than pre-checking — a pre-check races two coordinators adding a form at once.
    const base = slugifyFormName(trimmed);
    const { data: siblings } = await (supabase as any)
      .from('event_registration_forms')
      .select('display_order')
      .eq('event_id', eventId);
    const nextOrder =
      (siblings ?? []).reduce(
        (max: number, r: { display_order: number }) => Math.max(max, r.display_order ?? 0),
        -1
      ) + 1;

    for (let attempt = 0; attempt < 25; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const { data, error } = await (supabase as any)
        .from('event_registration_forms')
        .insert({
          event_id: eventId,
          name: trimmed,
          slug,
          description: options.description ?? null,
          // A new form starts CLOSED so creating it never opens an intake by surprise.
          is_enabled: options.isEnabled ?? false,
          display_order: nextOrder,
        })
        .select()
        .single();
      if (!error) return normalizeForm(data as EventRegistrationForm);
      if (error.code !== '23505') throw error;
    }
    throw new Error('Could not find a free slug for this form name — rename it and retry.');
  }

  /**
   * Copy a form (its sections and fields) into a new closed form on the same
   * event. One RPC = one transaction, so a half-copied form is impossible.
   * Returns the new form's id.
   */
  static async cloneForm(formId: string, newName?: string): Promise<string> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc('clone_event_registration_form', {
      p_form_id: formId,
      p_new_name: newName?.trim() || null,
      p_new_slug: null,
    });
    if (error) throw error;
    return data as string;
  }

  /**
   * Responses submitted through ONE form, newest first, with each answer paired
   * to the label that asked it. Scoped by form_id — the shared registrations
   * service reads field defs by event_id, which would mix every month's columns
   * into one table now that an event has many forms.
   */
  static async listFormResponses(formId: string): Promise<FormResponseRow[]> {
    const supabase = createClientSupabaseClient();

    const [{ data: fields }, { data: regs, error }] = await Promise.all([
      (supabase as any)
        .from('event_registration_form_fields')
        .select('field_key, field_label, display_order, field_type')
        .eq('form_id', formId)
        .order('display_order', { ascending: true }),
      (supabase as any)
        .from('events_registrations')
        .select(
          'id, participant_name, participant_email, participant_phone, status, created_at, custom_fields'
        )
        .eq('form_id', formId)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);
    if (error) throw error;

    // Display-only fields collect no answer, so including them would add a
    // column to the responses table that is empty for every single row.
    const defs = ((fields ?? []) as {
      field_key: string;
      field_label: string;
      field_type: FormFieldType;
    }[]).filter((d) => isAnswerableField(d.field_type));

    return (regs ?? []).map((r: Record<string, any>) => ({
      id: r.id,
      participant_name: r.participant_name ?? null,
      participant_email: r.participant_email ?? null,
      participant_phone: r.participant_phone ?? null,
      status: r.status ?? null,
      created_at: r.created_at,
      // Ordered by the form's own field order, so every response reads the same
      // way the form was filled in. A key the form no longer has is dropped
      // rather than shown as a bare slug.
      answers: defs.map((d) => ({
        label: d.field_label,
        value: formatAnswer((r.custom_fields ?? {})[d.field_key]),
      })),
    }));
  }

  static async deleteForm(formId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any)
      .from('event_registration_forms')
      .delete()
      .eq('id', formId);
    if (error) throw error;
  }

  /** Full form + sections + fields, ordered, for the builder UI. */
  static async getFormWithFields(formId: string): Promise<EventRegistrationForm> {
    const supabase = createClientSupabaseClient();

    const { data: form, error: formError } = await (supabase as any)
      .from('event_registration_forms')
      .select('*')
      .eq('id', formId)
      .single();
    if (formError) throw formError;

    const { data: sections, error: sectionsError } = await (supabase as any)
      .from('event_registration_form_sections')
      .select('*')
      .eq('form_id', formId)
      .order('display_order', { ascending: true });
    if (sectionsError) throw sectionsError;

    // Fields are fetched by form_id, NOT event_id. Filtering by event here is what
    // made every form on an event show every other form's fields.
    const { data: fields, error: fieldsError } = await (supabase as any)
      .from('event_registration_form_fields')
      .select('*')
      .eq('form_id', formId)
      .order('display_order', { ascending: true });
    if (fieldsError) throw fieldsError;

    const sectionsWithFields = (sections ?? []).map((section: EventRegistrationFormSection) => ({
      ...section,
      fields: (fields ?? []).filter((f: EventRegistrationFormField) => f.section_id === section.id),
    }));

    return { ...normalizeForm(form as EventRegistrationForm), sections: sectionsWithFields };
  }

  /** The event's first form, fully loaded. Back-compat entry point for callers that have only an event id. */
  static async getDefaultFormWithFields(eventId: string): Promise<EventRegistrationForm> {
    const form = await this.getOrCreateForm(eventId);
    return this.getFormWithFields(form.id);
  }

  /**
   * Form METADATA only (name / description / open-closed / fee). Deliberately a
   * plain UPDATE and not part of `save_event_registration_form`: that RPC would
   * have to be dropped and recreated to gain a parameter, and DROP FUNCTION
   * discards the function's ACL — which is exactly how the multi-form migration
   * silently handed EXECUTE back to PUBLIC. Sections and fields keep going
   * through the RPC; the fee never touches it.
   */
  static async updateForm(
    formId: string,
    updates: {
      is_enabled?: boolean;
      name?: string;
      description?: string | null;
      fee_enabled?: boolean;
      fee_amount?: number;
      fee_label?: string | null;
      starts_at?: string | null;
      ends_at?: string | null;
    }
  ): Promise<EventRegistrationForm> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('event_registration_forms')
      .update(updates)
      .eq('id', formId)
      .select()
      .single();
    if (error) throw error;
    return normalizeForm(data as EventRegistrationForm);
  }

  /**
   * Atomically replace the whole form (sections + fields) with the desired
   * state. One RPC = one transaction, so a partial failure rolls back.
   * Authorization is the tables' _manage RLS policies (the RPC is SECURITY
   * INVOKER) — the same gate the granular CRUD above already relies on.
   */
  static async saveForm(
    formId: string,
    isEnabled: boolean,
    sections: SaveFormSectionPayload[]
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any).rpc('save_event_registration_form', {
      p_form_id: formId,
      p_is_enabled: isEnabled,
      p_sections: sections,
    });
    if (error) throw error;
  }

  // ─── Sections ───────────────────────────────────────────────

  static async createSection(
    formId: string,
    eventId: string,
    section: CreateFormSectionDto
  ): Promise<EventRegistrationFormSection> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('event_registration_form_sections')
      .insert({ form_id: formId, event_id: eventId, ...section })
      .select()
      .single();
    if (error) throw error;
    return data as EventRegistrationFormSection;
  }

  static async updateSection(
    sectionId: string,
    updates: UpdateFormSectionDto
  ): Promise<EventRegistrationFormSection> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('event_registration_form_sections')
      .update(updates)
      .eq('id', sectionId)
      .select()
      .single();
    if (error) throw error;
    return data as EventRegistrationFormSection;
  }

  static async deleteSection(sectionId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any)
      .from('event_registration_form_sections')
      .delete()
      .eq('id', sectionId);
    if (error) throw error;
  }

  static async reorderSections(sectionOrders: { id: string; display_order: number }[]): Promise<void> {
    const supabase = createClientSupabaseClient();
    const results = await Promise.all(
      sectionOrders.map(({ id, display_order }) =>
        (supabase as any)
          .from('event_registration_form_sections')
          .update({ display_order })
          .eq('id', id)
      )
    );
    const failed = results.find((r: any) => r.error);
    if (failed?.error) throw failed.error;
  }

  // ─── Fields ─────────────────────────────────────────────────

  static async createField(
    eventId: string,
    field: CreateFormFieldDto,
    formId: string
  ): Promise<EventRegistrationFormField> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('event_registration_form_fields')
      .insert({ event_id: eventId, form_id: formId, ...field })
      .select()
      .single();
    if (error) throw error;
    return data as EventRegistrationFormField;
  }

  static async updateField(
    fieldId: string,
    updates: UpdateFormFieldDto
  ): Promise<EventRegistrationFormField> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('event_registration_form_fields')
      .update(updates)
      .eq('id', fieldId)
      .select()
      .single();
    if (error) throw error;
    return data as EventRegistrationFormField;
  }

  static async deleteField(fieldId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any)
      .from('event_registration_form_fields')
      .delete()
      .eq('id', fieldId);
    if (error) throw error;
  }

  static async reorderFields(
    fieldOrders: { id: string; display_order: number; section_id: string }[]
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const results = await Promise.all(
      fieldOrders.map(({ id, display_order, section_id }) =>
        (supabase as any)
          .from('event_registration_form_fields')
          .update({ display_order, section_id })
          .eq('id', id)
      )
    );
    const failed = results.find((r: any) => r.error);
    if (failed?.error) throw failed.error;
  }
}

/**
 * Validates submitted custom-field answers against a form's field definitions.
 * Returns an error message for the first missing required field, or null if
 * everything required is present and non-empty. Server-side only (routes call
 * this with a service-role-fetched field list) — never trust client validation
 * for a required-field gate.
 */
export function validateCustomFields(
  fields: EventRegistrationFormField[],
  submitted: Record<string, unknown> | null | undefined
): string | null {
  const answers = submitted ?? {};
  for (const field of fields) {
    // Display-only fields ask nothing. The DB forces is_required false for them
    // too, but a stale row from before that rule would otherwise make the form
    // permanently unsubmittable — there is no input that could satisfy it.
    if (!isAnswerableField(field.field_type)) continue;
    if (!field.is_required) continue;
    const value = answers[field.field_key];

    // Upload answers are OBJECTS, so the scalar emptiness test below would
    // accept `{}` — the shape a half-finished upload leaves behind — as a
    // completed answer. Require a real storage path instead.
    if (UPLOAD_FIELD_TYPES.has(field.field_type)) {
      if (!asFormUpload(value)) {
        return `"${field.field_label}" needs a file`;
      }
      continue;
    }

    const isEmpty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0);
    if (isEmpty) {
      return `"${field.field_label}" is required`;
    }
  }
  return null;
}
