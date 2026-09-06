// lib/services/events/shared/event-registrations-service.ts
// Shared REGISTRATION LIST service for ANY event type — backs the Event Logistics
// "Registrations" tab. Read-only: this service never writes.
//
// Joins three things in memory rather than in SQL, because they live in unrelated
// shapes and only one of them is always present:
//   1. events_registrations  — the core row every event type has.
//   2. the event's registration-form field definitions — needed only to turn the
//      SLUG keys stored in custom_fields ("age_category_-_is_it_18-24") back into
//      the labels the registrant actually saw ("Age Category - Is it 18-24?").
//   3. tournament_entries + tournament_divisions — division / entry type, which
//      exist only for sports_tournament events.
//
// IMPORTANT — the field definitions are read DIRECTLY here, not through
// EventRegistrationFormService.getFormWithFields(). That helper calls
// getOrCreateForm(), which INSERTS an event_registration_forms row when none
// exists. Reusing it would create rows as a side effect of merely viewing a
// table — on marathon events that have no registration form at all.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MOD = 'events/registrations';

// ============================================================================
// Return Types
// ============================================================================

export interface CustomAnswer {
  label: string;
  value: string;
}

export interface EventRegistrationRow {
  id: string;
  participant_name: string | null;
  participant_phone: string | null;
  participant_email: string | null;
  participant_type: string | null;
  institution_name: string | null;
  status: string | null;
  payment_status: string | null;
  payment_amount: number | null;
  payment_method: string | null;
  source: string | null;
  checked_in: boolean;
  created_at: string | null;
  /** sports_tournament only; null elsewhere or when no entry row exists. */
  division_label: string | null;
  entry_name: string | null;
  entry_type: string | null;
  /**
   * tournament_entries.id — the handle the organizer actions (withdraw, mark
   * paid, payment link) act on. Those mutations target the ENTRY, not the
   * registration, so the board cannot offer them without this.
   */
  entry_id: string | null;
  /** tournament_entries.status — 'withdrawn' entries cannot be withdrawn again. */
  entry_status: string | null;
  custom_answers: CustomAnswer[];
}

/**
 * A form field flattened with its SECTION's order alongside its own.
 * Both are required to sort: event_registration_form_fields.display_order
 * restarts at 0 in every section.
 */
export interface FormFieldDef {
  field_key: string;
  field_label: string;
  section_order: number;
  field_order: number;
}

// ============================================================================
// Pure helpers (exported for unit tests — no Supabase, no DOM)
// ============================================================================

/**
 * Human label for a division. Mirrors divLabel() in the public register form
 * (app/p/tournament/[id]/register/_components/register-form.tsx) so the organizer
 * and the registrant see the same wording. 'open' gender is implicit and omitted.
 */
export function buildDivisionLabel(d: {
  sport: string;
  age_band?: string | null;
  gender?: string | null;
}): string {
  return [d.sport, d.age_band, d.gender && d.gender !== 'open' ? d.gender : null]
    .filter(Boolean)
    .join(' · ');
}

/** Display string for one submitted answer. */
export function stringifyAnswer(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.length > 0 ? value.map(String).join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const text = String(value).trim();
  return text.length > 0 ? text : '—';
}

/**
 * Pairs each stored answer with the label the registrant saw, ordered the way the
 * form read: section order first, then field order within the section.
 *
 * A key with no matching definition keeps its RAW KEY as the label and sorts last
 * — never dropped. If an organizer deletes a custom field after someone answered
 * it, the answer survives in custom_fields with nothing left to name it, and
 * silently hiding it would lose submitted data from the only view of it.
 */
export function mapCustomAnswers(
  customFields: Record<string, unknown> | null | undefined,
  fieldDefs: FormFieldDef[]
): CustomAnswer[] {
  if (!customFields) return [];
  const byKey = new Map(fieldDefs.map((f) => [f.field_key, f]));

  return Object.entries(customFields)
    .map(([key, value]) => {
      const def = byKey.get(key);
      return {
        label: def?.field_label ?? key,
        value: stringifyAnswer(value),
        sectionOrder: def ? def.section_order : Number.MAX_SAFE_INTEGER,
        fieldOrder: def ? def.field_order : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.sectionOrder - b.sectionOrder || a.fieldOrder - b.fieldOrder)
    .map(({ label, value }) => ({ label, value }));
}

// ============================================================================
// Row shapes as they come back from PostgREST
// ============================================================================

interface RegistrationRaw {
  id: string;
  participant_name: string | null;
  participant_phone: string | null;
  participant_email: string | null;
  participant_type: string | null;
  institution_name: string | null;
  status: string | null;
  payment_status: string | null;
  payment_amount: number | string | null;
  payment_method: string | null;
  source: string | null;
  checked_in: boolean | null;
  created_at: string | null;
  custom_fields: Record<string, unknown> | null;
}

interface EntryRaw {
  id: string;
  registration_id: string | null;
  entry_name: string | null;
  entry_type: string | null;
  status: string | null;
  division_id: string | null;
}

/** What fetchEntryInfo resolves per registration id. */
interface EntryInfo {
  entry_id: string;
  entry_status: string | null;
  division_label: string | null;
  entry_name: string | null;
  entry_type: string | null;
}

interface DivisionRaw {
  id: string;
  sport: string;
  age_band: string | null;
  gender: string | null;
}

// ============================================================================
// Service
// ============================================================================

export class EventRegistrationsService {
  // Lazy getter, NOT `private static supabase = createClientSupabaseClient()`.
  // A static initializer runs at module import, so importing this file purely to
  // use buildDivisionLabel/mapCustomAnswers would construct a browser Supabase
  // client and require NEXT_PUBLIC_* env vars — which makes the pure helpers
  // untestable and drags a client into any server-side importer.
  // createClientSupabaseClient() memoizes internally, so per-call is free.
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /** Field definitions for an event, flattened with their section order. */
  private static async fetchFieldDefs(eventId: string): Promise<FormFieldDef[]> {
    const [{ data: fields, error: fieldsError }, { data: sections, error: sectionsError }] =
      await Promise.all([
        (this.supabase as any)
          .from('event_registration_form_fields')
          .select('field_key, field_label, display_order, section_id')
          .eq('event_id', eventId),
        (this.supabase as any)
          .from('event_registration_form_sections')
          .select('id, display_order')
          .eq('event_id', eventId),
      ]);

    // A missing form is normal (marathon events have none) — degrade to raw keys
    // rather than failing the whole registration list.
    if (fieldsError || sectionsError) {
      logger.warn(MOD, 'Could not load form field definitions; falling back to raw keys', {
        eventId,
        fieldsError,
        sectionsError,
      });
      return [];
    }

    const sectionOrder = new Map<string, number>(
      (sections ?? []).map((s: { id: string; display_order: number | null }) => [
        s.id,
        s.display_order ?? 0,
      ])
    );

    return (fields ?? []).map(
      (f: {
        field_key: string;
        field_label: string;
        display_order: number | null;
        section_id: string | null;
      }) => ({
        field_key: f.field_key,
        field_label: f.field_label,
        section_order: (f.section_id && sectionOrder.get(f.section_id)) ?? 0,
        field_order: f.display_order ?? 0,
      })
    );
  }

  /** Division + entry type per registration. Tournaments only. */
  private static async fetchEntryInfo(eventId: string): Promise<Map<string, EntryInfo>> {
    const out = new Map<string, EntryInfo>();

    const { data: entries, error: entriesError } = await (this.supabase as any)
      .from('tournament_entries')
      .select('id, registration_id, entry_name, entry_type, status, division_id')
      .eq('event_id', eventId);

    if (entriesError) {
      logger.warn(MOD, 'Could not load tournament entries; division column will be blank', {
        eventId,
        entriesError,
      });
      return out;
    }

    const { data: divisions } = await (this.supabase as any)
      .from('tournament_divisions')
      .select('id, sport, age_band, gender')
      .eq('event_id', eventId);

    const divisionLabel = new Map<string, string>(
      (divisions ?? []).map((d: DivisionRaw) => [d.id, buildDivisionLabel(d)])
    );

    for (const e of (entries ?? []) as EntryRaw[]) {
      if (!e.registration_id) continue;
      out.set(e.registration_id, {
        entry_id: e.id,
        entry_status: e.status,
        division_label: e.division_id ? divisionLabel.get(e.division_id) ?? null : null,
        entry_name: e.entry_name,
        entry_type: e.entry_type,
      });
    }
    return out;
  }

  /**
   * The event's registration list, newest first, excluding cancelled rows.
   * `eventType` decides only whether tournament entry data is fetched.
   */
  static async getRegistrations(
    eventId: string,
    eventType: string
  ): Promise<EventRegistrationRow[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('events_registrations')
        .select(
          `id, participant_name, participant_phone, participant_email, participant_type,
           institution_name, status, payment_status, payment_amount, payment_method,
           source, checked_in, created_at, custom_fields`
        )
        .eq('event_id', eventId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error(MOD, 'Failed to fetch registrations', error);
        throw error;
      }

      const rows = (data ?? []) as RegistrationRaw[];
      if (rows.length === 0) return [];

      const fieldDefs = await this.fetchFieldDefs(eventId);
      const entryInfo =
        eventType === 'sports_tournament'
          ? await this.fetchEntryInfo(eventId)
          : new Map<string, EntryInfo>();

      return rows.map((r) => {
        const entry = entryInfo.get(r.id);
        return {
          id: r.id,
          participant_name: r.participant_name,
          participant_phone: r.participant_phone,
          participant_email: r.participant_email,
          participant_type: r.participant_type,
          institution_name: r.institution_name,
          status: r.status,
          payment_status: r.payment_status,
          payment_amount: r.payment_amount === null ? null : Number(r.payment_amount),
          payment_method: r.payment_method,
          source: r.source,
          checked_in: !!r.checked_in,
          created_at: r.created_at,
          division_label: entry?.division_label ?? null,
          entry_name: entry?.entry_name ?? null,
          entry_type: entry?.entry_type ?? null,
          entry_id: entry?.entry_id ?? null,
          entry_status: entry?.entry_status ?? null,
          custom_answers: mapCustomAnswers(r.custom_fields, fieldDefs),
        };
      });
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getRegistrations', error);
      throw error;
    }
  }
}
