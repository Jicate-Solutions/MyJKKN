// lib/services/events/tournament/event-registration-form-service.ts
// CRUD for a tournament's dynamic registration form (sections + fields).
// Modeled directly on lib/services/admission/form-builder-service.ts's shape —
// independent tables, not shared with Admission (design decision #6).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  EventRegistrationForm,
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
}

/** One section in a bulk-save payload. */
export interface SaveFormSectionPayload {
  title: string;
  display_order: number;
  fields: SaveFormFieldPayload[];
}

export class EventRegistrationFormService {
  // ─── Form ───────────────────────────────────────────────────

  /**
   * Fetch the event's registration form, creating an empty (enabled) one if
   * none exists yet. Lazy-create means tournaments created before this
   * feature shipped need no backfill migration — the first read materializes
   * the row.
   */
  static async getOrCreateForm(eventId: string): Promise<EventRegistrationForm> {
    const supabase = createClientSupabaseClient();

    const { data: existing, error: readError } = await (supabase as any)
      .from('event_registration_forms')
      .select('*')
      .eq('event_id', eventId)
      .maybeSingle();
    if (readError) throw readError;
    if (existing) return existing as EventRegistrationForm;

    const { data: created, error: createError } = await (supabase as any)
      .from('event_registration_forms')
      .insert({ event_id: eventId, is_enabled: true })
      .select()
      .single();
    if (createError) throw createError;
    return created as EventRegistrationForm;
  }

  /** Full form + sections + fields, ordered, for the builder UI and both registration surfaces. */
  static async getFormWithFields(eventId: string): Promise<EventRegistrationForm> {
    const form = await this.getOrCreateForm(eventId);
    const supabase = createClientSupabaseClient();

    const { data: sections, error: sectionsError } = await (supabase as any)
      .from('event_registration_form_sections')
      .select('*')
      .eq('form_id', form.id)
      .order('display_order', { ascending: true });
    if (sectionsError) throw sectionsError;

    const { data: fields, error: fieldsError } = await (supabase as any)
      .from('event_registration_form_fields')
      .select('*')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true });
    if (fieldsError) throw fieldsError;

    const sectionsWithFields = (sections ?? []).map((section: EventRegistrationFormSection) => ({
      ...section,
      fields: (fields ?? []).filter((f: EventRegistrationFormField) => f.section_id === section.id),
    }));

    return { ...form, sections: sectionsWithFields };
  }

  static async updateForm(
    formId: string,
    updates: { is_enabled?: boolean }
  ): Promise<EventRegistrationForm> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('event_registration_forms')
      .update(updates)
      .eq('id', formId)
      .select()
      .single();
    if (error) throw error;
    return data as EventRegistrationForm;
  }

  /**
   * Atomically replace the whole form (sections + fields) with the desired
   * state. One RPC = one transaction, so a partial failure rolls back.
   * Authorization is the tables' _manage RLS policies (the RPC is SECURITY
   * INVOKER) — the same gate the granular CRUD above already relies on.
   */
  static async saveForm(
    eventId: string,
    isEnabled: boolean,
    sections: SaveFormSectionPayload[]
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any).rpc('save_event_registration_form', {
      p_event_id: eventId,
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
    field: CreateFormFieldDto
  ): Promise<EventRegistrationFormField> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('event_registration_form_fields')
      .insert({ event_id: eventId, ...field })
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
    if (!field.is_required) continue;
    const value = answers[field.field_key];
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
