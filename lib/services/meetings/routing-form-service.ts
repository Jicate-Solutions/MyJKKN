// lib/services/meetings/routing-form-service.ts
//
// Routing Forms [M1] — authenticated CRUD for forms + rules + responses.
//
// All reads/writes go through the RLS-scoped browser/server client (NOT
// service-role): RLS guarantees a user only sees forms they host or that their
// meetings.routing.view permission + institution scope allows. The public
// surfaces never use this service — they go through the two SECURITY DEFINER
// RPCs (fn_get_active_routing_form / fn_submit_routing_form_response).
//
// NOTE: routing_forms / routing_form_rules / routing_form_responses are NOT in
// types/supabase.ts yet (the migration is unmerged). We therefore use an
// UNTYPED client for these tables to avoid the program-shape TS2589 blow-up
// that hits the typed client on not-yet-generated tables
// (feedback_ts2589_untyped_tables_and_strictnull_narrowing). Regenerate types
// after the migration is applied and this cast can be removed.

import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[routing-forms]';

// ── Domain types (mirror the migration; shared with the evaluator) ──────────

export type RoutingFieldType = 'text' | 'select' | 'multiselect';
export type RoutingOperator = 'is' | 'is_not' | 'contains';
export type RoutingDestinationType = 'event_link' | 'url' | 'message';

export interface RoutingField {
  key: string;
  label: string;
  type: RoutingFieldType;
  options?: string[];
  required?: boolean;
}

export interface RoutingCondition {
  field_key: string;
  operator: RoutingOperator;
  value: string;
}

export interface RoutingRuleRow {
  id: string;
  form_id: string;
  order_index: number;
  match_logic: 'all' | 'any';
  conditions: RoutingCondition[];
  destination_type: RoutingDestinationType;
  destination_value: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
}

export interface RoutingForm {
  id: string;
  host_profile_id: string;
  institution_id: string | null;
  slug: string;
  title: string;
  headline: string | null;
  description: string | null;
  fields: RoutingField[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoutingFormResponse {
  id: string;
  form_id: string;
  answers: Record<string, unknown>;
  matched_rule_id: string | null;
  resolved_destination: Record<string, unknown>;
  attendee_email: string | null;
  created_at: string;
}

export interface RoutingFormWithRules extends RoutingForm {
  rules: RoutingRuleRow[];
}

// Inputs for create/update.
export interface CreateRoutingFormInput {
  host_profile_id: string;
  institution_id?: string | null;
  slug: string;
  title: string;
  headline?: string | null;
  description?: string | null;
  fields?: RoutingField[];
  is_active?: boolean;
}

export interface UpdateRoutingFormInput {
  title?: string;
  headline?: string | null;
  description?: string | null;
  fields?: RoutingField[];
  is_active?: boolean;
  slug?: string;
}

export interface RuleInput {
  id?: string;
  order_index: number;
  match_logic: 'all' | 'any';
  conditions: RoutingCondition[];
  destination_type: RoutingDestinationType;
  destination_value: Record<string, unknown>;
  is_default?: boolean;
}

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// Untyped view of the client — see file header for why.
type AnyClient = SupabaseClient<any, any, any>;
const untyped = (c: SupabaseClient): AnyClient => c as unknown as AnyClient;

export class RoutingFormService {
  /** List forms visible to the current user (RLS-scoped). */
  static async listForms(supabase: SupabaseClient): Promise<ServiceResult<RoutingForm[]>> {
    const { data, error } = await untyped(supabase)
      .from('routing_forms')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`${LOG_PREFIX} listForms failed:`, error.message);
      return { success: false, error: error.message };
    }
    return { success: true, data: (data ?? []) as RoutingForm[] };
  }

  /** One form + its rules (ordered: default last). */
  static async getFormWithRules(
    supabase: SupabaseClient,
    id: string,
  ): Promise<ServiceResult<RoutingFormWithRules>> {
    const { data: form, error: fErr } = await untyped(supabase)
      .from('routing_forms')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fErr) {
      console.error(`${LOG_PREFIX} getForm failed:`, fErr.message);
      return { success: false, error: fErr.message };
    }
    if (!form) return { success: false, error: 'Routing form not found.' };

    const { data: rules, error: rErr } = await untyped(supabase)
      .from('routing_form_rules')
      .select('*')
      .eq('form_id', id)
      .order('is_default', { ascending: true })
      .order('order_index', { ascending: true });

    if (rErr) {
      console.error(`${LOG_PREFIX} getRules failed:`, rErr.message);
      return { success: false, error: rErr.message };
    }

    return {
      success: true,
      data: { ...(form as RoutingForm), rules: (rules ?? []) as RoutingRuleRow[] },
    };
  }

  /** Create a new form (no rules yet). */
  static async createForm(
    supabase: SupabaseClient,
    input: CreateRoutingFormInput,
  ): Promise<ServiceResult<RoutingForm>> {
    const { data, error } = await untyped(supabase)
      .from('routing_forms')
      .insert({
        host_profile_id: input.host_profile_id,
        institution_id: input.institution_id ?? null,
        slug: input.slug.trim().toLowerCase(),
        title: input.title.trim(),
        headline: input.headline ?? null,
        description: input.description ?? null,
        fields: input.fields ?? [],
        is_active: input.is_active ?? true,
      })
      .select('*')
      .single();

    if (error) {
      console.error(`${LOG_PREFIX} createForm failed:`, error.message);
      // Friendly message for the common unique-slug collision.
      if (error.code === '23505') {
        return { success: false, error: 'That URL slug is already taken. Choose another.' };
      }
      return { success: false, error: error.message };
    }
    return { success: true, data: data as RoutingForm };
  }

  /** Patch a form's editable fields. */
  static async updateForm(
    supabase: SupabaseClient,
    id: string,
    patch: UpdateRoutingFormInput,
  ): Promise<ServiceResult<RoutingForm>> {
    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload.title = patch.title.trim();
    if (patch.headline !== undefined) payload.headline = patch.headline;
    if (patch.description !== undefined) payload.description = patch.description;
    if (patch.fields !== undefined) payload.fields = patch.fields;
    if (patch.is_active !== undefined) payload.is_active = patch.is_active;
    if (patch.slug !== undefined) payload.slug = patch.slug.trim().toLowerCase();

    const { data, error } = await untyped(supabase)
      .from('routing_forms')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error(`${LOG_PREFIX} updateForm failed:`, error.message);
      if (error.code === '23505') {
        return { success: false, error: 'That URL slug is already taken. Choose another.' };
      }
      return { success: false, error: error.message };
    }
    return { success: true, data: data as RoutingForm };
  }

  static async deleteForm(supabase: SupabaseClient, id: string): Promise<ServiceResult<true>> {
    const { error } = await untyped(supabase).from('routing_forms').delete().eq('id', id);
    if (error) {
      console.error(`${LOG_PREFIX} deleteForm failed:`, error.message);
      return { success: false, error: error.message };
    }
    return { success: true, data: true };
  }

  /**
   * Replace ALL rules for a form atomically-ish: delete existing, insert new.
   * (Rule sets are small and edited as a whole in the builder; a full replace
   * is simpler and avoids order_index drift. RLS protects cross-form writes.)
   * Enforces at most ONE default rule before writing (DB also has a partial
   * unique index as the backstop).
   */
  static async replaceRules(
    supabase: SupabaseClient,
    formId: string,
    rules: RuleInput[],
  ): Promise<ServiceResult<RoutingRuleRow[]>> {
    const defaults = rules.filter((r) => r.is_default);
    if (defaults.length > 1) {
      return { success: false, error: 'Only one default ("in all other cases") rule is allowed.' };
    }

    const client = untyped(supabase);

    const { error: delErr } = await client
      .from('routing_form_rules')
      .delete()
      .eq('form_id', formId);
    if (delErr) {
      console.error(`${LOG_PREFIX} replaceRules delete failed:`, delErr.message);
      return { success: false, error: delErr.message };
    }

    if (rules.length === 0) {
      return { success: true, data: [] };
    }

    const rows = rules.map((r, i) => ({
      form_id: formId,
      order_index: r.is_default ? 9999 : r.order_index ?? i,
      match_logic: r.match_logic,
      conditions: r.is_default ? [] : r.conditions,
      destination_type: r.destination_type,
      destination_value: r.destination_value,
      is_default: r.is_default ?? false,
    }));

    const { data, error } = await client
      .from('routing_form_rules')
      .insert(rows)
      .select('*');

    if (error) {
      console.error(`${LOG_PREFIX} replaceRules insert failed:`, error.message);
      return { success: false, error: error.message };
    }
    return { success: true, data: (data ?? []) as RoutingRuleRow[] };
  }

  /** List submissions for a form (newest first). */
  static async listResponses(
    supabase: SupabaseClient,
    formId: string,
    limit = 200,
  ): Promise<ServiceResult<RoutingFormResponse[]>> {
    const { data, error } = await untyped(supabase)
      .from('routing_form_responses')
      .select('*')
      .eq('form_id', formId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error(`${LOG_PREFIX} listResponses failed:`, error.message);
      return { success: false, error: error.message };
    }
    return { success: true, data: (data ?? []) as RoutingFormResponse[] };
  }
}
