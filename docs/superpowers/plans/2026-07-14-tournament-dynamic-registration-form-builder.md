# Tournament Dynamic Registration Form Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an organizer add custom fields (per-tournament, not per-division) to a tournament's registration form via a builder UI, and have those fields actually render, validate, and get stored wherever a registrant submits — the public guest form and the organizer's Add Entry dialog.

**Architecture:** Three new tables (`event_registration_forms` → `_sections` → `_fields`, event-scoped, denormalized `event_id` on every level for simple RLS) hold the schema; a new `EventRegistrationFormService` (modeled directly on the Admission module's `form-builder-service.ts`) provides CRUD + reorder; a new admin builder component embeds into the existing tournament management page (that page is a single stacked-`Card` layout, not tabs — the builder joins it the same way `InchargePanel` already does); a shared `DynamicFieldInput` component renders one field by type, reused by the builder's live preview, the public form, and the organizer's dialog; submitted answers land in a new `events_registrations.custom_fields` JSONB column, validated server-side against each field's `is_required` flag before insert.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), TanStack Query, Zod-free manual validation (matches this module's existing style — no Zod used anywhere in the tournament routes today).

## Global Constraints

- **Custom fields are per-tournament, not per-division** — identical fields shown regardless of which division the entrant picks (design spec decision #7).
- **No marathon changes.** This plan touches only `events/tournament` files; marathon's registration lives in an external app and its own tables are untouched.
- **Lazy-create, no backfill migration.** A tournament created before this plan ships has no `event_registration_forms` row. Every read path (`getOrCreateForm`) must create one on first access rather than requiring a bulk migration — this is how the user's already-existing tournament gets a form without recreating it.
- **Reorder via up/down buttons, not drag-and-drop.** No new dependency; matches this module's existing "keep it simple" bias (e.g. `add-entry-dialog.tsx`'s roster uses plain add/remove buttons, no DnD library anywhere in this app's admin forms).
- **RLS mirrors `tournament_divisions`' exact pattern** (`supabase/migrations/20260622110716_sports_tournament_pr1.sql` + `20260801001000_tournament_incharge_access.sql`): `is_super_admin() OR is_admin() OR (user_has_permission(...) AND role_has_institution_access(...))`, plus a `fn_is_event_incharge(event_id)` manage-all policy for per-event in-charges. No new permission keys — reuses `sports.tournaments.view`/`sports.tournaments.manage`.
- **No wired test runner in this repo.** Every verification step is: diagnostics/ESLint + a concrete manual re-read or browser check — never a claim of "tests pass."
- **Supabase writes**: always check `{ error }`, never fire-and-forget (repo-wide convention, reinforced by findings in the prior payment-foundations plan).

---

## File Structure

| File | Change |
|---|---|
| `supabase/migrations/20260714120000_event_registration_form_builder.sql` | **Create.** 3 tables + RLS + 1 column on `events_registrations`. |
| `supabase/setup/01_tables.sql` | **Modify.** Mirror the 3 new tables + new column. |
| `supabase/setup/03_policies.sql` | **Modify.** Mirror the new RLS policies. |
| `types/tournament.ts` | **Modify.** New field/section/form types + DTOs; widen `CreateEntryDto`. |
| `lib/services/events/tournament/event-registration-form-service.ts` | **Create.** CRUD + reorder + `getOrCreateForm` + `validateCustomFields`. |
| `hooks/events/use-tournament-registration-form.ts` | **Create.** React Query hooks wrapping the service. |
| `lib/services/events/tournament/tournament-event-service.ts` | **Modify.** Auto-create an empty form row on tournament creation (best-effort, mirrors division seeding). |
| `components/events/dynamic-field-input.tsx` | **Create.** Renders one field by `field_type`; used by builder preview + both registration surfaces. |
| `app/(routes)/events/tournament/[id]/_components/registration-form-builder.tsx` | **Create.** Admin builder: sections/fields CRUD, reorder, live preview. |
| `app/(routes)/events/tournament/[id]/page.tsx` | **Modify.** Embed the builder as a new Card section. |
| `app/p/tournament/[id]/register/page.tsx` | **Modify.** Fetch the tournament's form (service-role, alongside divisions) and pass to `RegisterForm`. |
| `app/p/tournament/[id]/register/_components/register-form.tsx` | **Modify.** Render custom fields via `DynamicFieldInput`, collect answers, submit them. |
| `app/api/events/tournament/[eventId]/public-register/route.ts` | **Modify.** Accept + validate + store `custom_fields`. |
| `app/(routes)/events/tournament/[id]/_components/add-entry-dialog.tsx` | **Modify.** Fetch the form, render custom fields, submit them. |
| `app/api/events/tournament/[eventId]/entries/route.ts` | **Modify.** Accept + validate + store `custom_fields`. |

---

### Task 1: Migration — registration form tables + RLS + `custom_fields` column

**Files:**
- Create: `supabase/migrations/20260714120000_event_registration_form_builder.sql`
- Modify: `supabase/setup/01_tables.sql`
- Modify: `supabase/setup/03_policies.sql`

**Interfaces:**
- Produces: `event_registration_forms(id, event_id, is_enabled, created_at, updated_at)`, `event_registration_form_sections(id, form_id, event_id, title, display_order, created_at, updated_at)`, `event_registration_form_fields(id, section_id, event_id, field_key, field_label, field_type, is_required, display_order, placeholder, help_text, min_length, max_length, min_value, max_value, pattern, options, condition, created_at, updated_at)`, `events_registrations.custom_fields jsonb`. Consumed by every later task.

- [ ] **Step 1: Write the migration**

```sql
-- Tournament dynamic registration form builder: per-tournament custom fields
-- layered on top of the fixed core registration fields. event_id is
-- denormalized onto every table (not just event_registration_forms) so RLS
-- policies stay single-join, mirroring tournament_divisions' pattern rather
-- than requiring a 3-way join through form_id/section_id on every check.

BEGIN;

CREATE TABLE IF NOT EXISTS event_registration_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_registration_form_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES event_registration_forms(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_registration_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES event_registration_form_sections(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN (
    'text','number','phone','email','select','multi_select','date','textarea','file','checkbox','radio'
  )),
  is_required boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  placeholder text,
  help_text text,
  min_length int,
  max_length int,
  min_value numeric,
  max_value numeric,
  pattern text,
  options jsonb,
  condition jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_event_registration_form_sections_form ON event_registration_form_sections(form_id);
CREATE INDEX IF NOT EXISTS idx_event_registration_form_fields_section ON event_registration_form_fields(section_id);

ALTER TABLE events_registrations ADD COLUMN IF NOT EXISTS custom_fields jsonb;
COMMENT ON COLUMN events_registrations.custom_fields IS
  'Submitted answers to a tournament''s custom registration fields, keyed by field_key. Validated server-side against event_registration_form_fields.is_required before insert.';

-- updated_at triggers (mirrors the existing trg_tournament_divisions_updated_at pattern)
CREATE OR REPLACE FUNCTION update_event_registration_form_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_registration_forms_updated_at ON event_registration_forms;
CREATE TRIGGER trg_event_registration_forms_updated_at
BEFORE UPDATE ON event_registration_forms
FOR EACH ROW EXECUTE FUNCTION update_event_registration_form_updated_at();

DROP TRIGGER IF EXISTS trg_event_registration_form_sections_updated_at ON event_registration_form_sections;
CREATE TRIGGER trg_event_registration_form_sections_updated_at
BEFORE UPDATE ON event_registration_form_sections
FOR EACH ROW EXECUTE FUNCTION update_event_registration_form_updated_at();

DROP TRIGGER IF EXISTS trg_event_registration_form_fields_updated_at ON event_registration_form_fields;
CREATE TRIGGER trg_event_registration_form_fields_updated_at
BEFORE UPDATE ON event_registration_form_fields
FOR EACH ROW EXECUTE FUNCTION update_event_registration_form_updated_at();

-- ============================================================
-- RLS — mirrors tournament_divisions_select/_insert/_update/_delete
-- (20260622110716_sports_tournament_pr1.sql) + the in-charge FOR ALL
-- policy (20260801001000_tournament_incharge_access.sql).
-- ============================================================

ALTER TABLE event_registration_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registration_form_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registration_form_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_registration_forms_select" ON event_registration_forms;
CREATE POLICY "event_registration_forms_select" ON event_registration_forms
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR (
      user_has_permission('sports.tournaments.view')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_forms.event_id
          AND (
            e.scope = 'all_jkkn'
            OR e.visibility IN ('all_jkkn', 'public')
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS "event_registration_forms_manage" ON event_registration_forms;
CREATE POLICY "event_registration_forms_manage" ON event_registration_forms
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_forms.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_forms.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

DROP POLICY IF EXISTS "event_registration_form_sections_select" ON event_registration_form_sections;
CREATE POLICY "event_registration_form_sections_select" ON event_registration_form_sections
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR (
      user_has_permission('sports.tournaments.view')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_sections.event_id
          AND (
            e.scope = 'all_jkkn'
            OR e.visibility IN ('all_jkkn', 'public')
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS "event_registration_form_sections_manage" ON event_registration_form_sections;
CREATE POLICY "event_registration_form_sections_manage" ON event_registration_form_sections
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_sections.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_sections.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

DROP POLICY IF EXISTS "event_registration_form_fields_select" ON event_registration_form_fields;
CREATE POLICY "event_registration_form_fields_select" ON event_registration_form_fields
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR (
      user_has_permission('sports.tournaments.view')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_fields.event_id
          AND (
            e.scope = 'all_jkkn'
            OR e.visibility IN ('all_jkkn', 'public')
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS "event_registration_form_fields_manage" ON event_registration_form_fields;
CREATE POLICY "event_registration_form_fields_manage" ON event_registration_form_fields
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_fields.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR fn_is_event_incharge(event_id)
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = event_registration_form_fields.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

COMMIT;
```

- [ ] **Step 2: Apply the migration**

Use `mcp__supabase__apply_migration` with `name: "event_registration_form_builder"` and the SQL above.

- [ ] **Step 3: Mirror into the reference schema files**

Add the three `CREATE TABLE` blocks to `supabase/setup/01_tables.sql` (near the existing `tournament_divisions`/`events_registrations` blocks, matching their formatting), and add `custom_fields jsonb,` to `events_registrations`'s column list there. Add the 8 policy blocks to `supabase/setup/03_policies.sql` near the existing `tournament_divisions_*` policies.

- [ ] **Step 4: Verify**

Query `information_schema.tables` for the 3 new table names, and `information_schema.columns` for `events_registrations.custom_fields`, via `mcp__supabase__execute_sql`. Run `mcp__supabase__get_advisors` (type: `security`) and confirm no new RLS warnings on these 3 tables.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260714120000_event_registration_form_builder.sql supabase/setup/01_tables.sql supabase/setup/03_policies.sql
git commit -m "feat(events): add dynamic registration form tables + RLS for tournaments"
```

---

### Task 2: Types — form/section/field types + widened `CreateEntryDto`

**Files:**
- Modify: `types/tournament.ts`

**Interfaces:**
- Produces: `FormFieldType`, `FormFieldOption`, `FormFieldCondition`, `EventRegistrationFormField`, `EventRegistrationFormSection`, `EventRegistrationForm`, `CreateFormFieldDto`, `UpdateFormFieldDto`, `CreateFormSectionDto`, `UpdateFormSectionDto`. Consumed by Task 3 (service), Task 4 (hooks), Task 7 (builder UI), Task 8 (dynamic field input).
- Consumes/widens: `CreateEntryDto` gains `custom_fields?: Record<string, unknown> | null`.

- [ ] **Step 1: Append the new types**

Add to `types/tournament.ts`, after the existing PR2 section (after `UpdateEntryDto`, before the "PR3 — Fixtures" comment block):

```typescript
// ============================================================================
// Dynamic Registration Form Builder
// ============================================================================

/** A registration form field's input type. Independent of Admission's own
 * FormFieldType union by design (decision #6: independent schema, not a
 * shared cross-module table) — kept as an identical value set for consistency. */
export type FormFieldType =
  | 'text'
  | 'number'
  | 'phone'
  | 'email'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'textarea'
  | 'file'
  | 'checkbox'
  | 'radio';

export const FORM_FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'select', label: 'Dropdown (single choice)' },
  { value: 'multi_select', label: 'Dropdown (multiple choice)' },
  { value: 'date', label: 'Date' },
  { value: 'textarea', label: 'Long text' },
  { value: 'file', label: 'File upload' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'radio', label: 'Radio (single choice)' },
];

export interface FormFieldOption {
  label: string;
  value: string;
}

/** Conditional visibility: show this field only when `field` (another field_key
 * on the same form) satisfies `op` against `value`. */
export interface FormFieldCondition {
  field: string;
  op: 'eq' | 'neq' | 'contains' | 'not_empty' | 'empty';
  value: string;
}

export interface EventRegistrationFormField {
  id: string;
  section_id: string;
  event_id: string;
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
  created_at: string;
  updated_at: string;
}

export interface EventRegistrationFormSection {
  id: string;
  form_id: string;
  event_id: string;
  title: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  fields?: EventRegistrationFormField[];
}

export interface EventRegistrationForm {
  id: string;
  event_id: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  sections?: EventRegistrationFormSection[];
}

export interface CreateFormSectionDto {
  title: string;
  display_order?: number;
}

export interface UpdateFormSectionDto {
  title?: string;
  display_order?: number;
}

export interface CreateFormFieldDto {
  section_id: string;
  field_key: string;
  field_label: string;
  field_type: FormFieldType;
  is_required?: boolean;
  display_order?: number;
  placeholder?: string | null;
  help_text?: string | null;
  min_length?: number | null;
  max_length?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  pattern?: string | null;
  options?: FormFieldOption[] | null;
  condition?: FormFieldCondition | null;
}

export interface UpdateFormFieldDto {
  field_key?: string;
  field_label?: string;
  field_type?: FormFieldType;
  is_required?: boolean;
  display_order?: number;
  placeholder?: string | null;
  help_text?: string | null;
  min_length?: number | null;
  max_length?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  pattern?: string | null;
  options?: FormFieldOption[] | null;
  condition?: FormFieldCondition | null;
}
```

- [ ] **Step 2: Widen `CreateEntryDto`**

Find the `CreateEntryDto` interface (has `division_id`, `entry_type`, ..., `payment_mode?`, `notes?`). Add one field at the end, before the closing `}`:

```typescript
  // Answers to this tournament's custom registration fields (Dynamic Form Builder).
  custom_fields?: Record<string, unknown> | null;
```

- [ ] **Step 3: Verify**

Re-read the file. Confirm no existing type/interface was altered besides the `CreateEntryDto` addition, and the new block is syntactically standalone (no missing braces/commas).

- [ ] **Step 4: Commit**

```bash
git add types/tournament.ts
git commit -m "feat(events): add dynamic registration form types"
```

---

### Task 3: `EventRegistrationFormService` — CRUD + reorder + `getOrCreateForm` + validation

**Files:**
- Create: `lib/services/events/tournament/event-registration-form-service.ts`

**Interfaces:**
- Consumes: the types from Task 2; Supabase tables from Task 1.
- Produces: `EventRegistrationFormService` with `getOrCreateForm(eventId)`, `getFormWithFields(eventId)`, `updateForm(formId, updates)`, `createSection`, `updateSection`, `deleteSection`, `reorderSections`, `createField`, `updateField`, `deleteField`, `reorderFields`, and a standalone exported `validateCustomFields(fields, submitted)`. Consumed by Task 4 (hooks), Task 7 (builder UI), Task 10 & 13 (server-side route validation).

- [ ] **Step 1: Create the service**

```typescript
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
} from '@/types/tournament';

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
```

- [ ] **Step 2: Verify**

Re-read the file. Confirm every write method destructures and checks `{ error }` (matches repo convention). If `mcp__ide__getDiagnostics` is available, run it; otherwise re-read against Task 2's types for signature correctness.

- [ ] **Step 3: Commit**

```bash
git add lib/services/events/tournament/event-registration-form-service.ts
git commit -m "feat(events): add EventRegistrationFormService with CRUD, reorder, and validation"
```

---

### Task 4: React Query hooks

**Files:**
- Create: `hooks/events/use-tournament-registration-form.ts`

**Interfaces:**
- Consumes: `EventRegistrationFormService` (Task 3).
- Produces: `useRegistrationForm(eventId)`, `useUpdateRegistrationForm()`, `useCreateFormSection()`, `useUpdateFormSection()`, `useDeleteFormSection()`, `useReorderFormSections()`, `useCreateFormField()`, `useUpdateFormField()`, `useDeleteFormField()`, `useReorderFormFields()`. Consumed by Task 7 (builder UI).

- [ ] **Step 1: Create the hooks file**

```typescript
// hooks/events/use-tournament-registration-form.ts
// React Query hooks for the tournament dynamic registration form builder.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventRegistrationFormService } from '@/lib/services/events/tournament/event-registration-form-service';
import type {
  CreateFormSectionDto,
  UpdateFormSectionDto,
  CreateFormFieldDto,
  UpdateFormFieldDto,
} from '@/types/tournament';

const KEYS = {
  form: (eventId: string) => ['tournament-registration-form', eventId] as const,
};

/** Full form + sections + fields for a tournament (lazy-creates the form row). */
export function useRegistrationForm(eventId: string) {
  return useQuery({
    queryKey: KEYS.form(eventId),
    queryFn: () => EventRegistrationFormService.getFormWithFields(eventId),
    enabled: !!eventId,
  });
}

export function useUpdateRegistrationForm(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ formId, updates }: { formId: string; updates: { is_enabled?: boolean } }) =>
      EventRegistrationFormService.updateForm(formId, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.form(eventId) }),
    onError: (e: Error) => toast.error(e.message || 'Failed to update form'),
  });
}

export function useCreateFormSection(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ formId, section }: { formId: string; section: CreateFormSectionDto }) =>
      EventRegistrationFormService.createSection(formId, eventId, section),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.form(eventId) });
      toast.success('Section added');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to add section'),
  });
}

export function useUpdateFormSection(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, updates }: { sectionId: string; updates: UpdateFormSectionDto }) =>
      EventRegistrationFormService.updateSection(sectionId, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.form(eventId) }),
    onError: (e: Error) => toast.error(e.message || 'Failed to update section'),
  });
}

export function useDeleteFormSection(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) => EventRegistrationFormService.deleteSection(sectionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.form(eventId) });
      toast.success('Section removed');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove section'),
  });
}

export function useReorderFormSections(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionOrders: { id: string; display_order: number }[]) =>
      EventRegistrationFormService.reorderSections(sectionOrders),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.form(eventId) }),
    onError: (e: Error) => toast.error(e.message || 'Failed to reorder sections'),
  });
}

export function useCreateFormField(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (field: CreateFormFieldDto) =>
      EventRegistrationFormService.createField(eventId, field),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.form(eventId) });
      toast.success('Field added');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to add field'),
  });
}

export function useUpdateFormField(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldId, updates }: { fieldId: string; updates: UpdateFormFieldDto }) =>
      EventRegistrationFormService.updateField(fieldId, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.form(eventId) }),
    onError: (e: Error) => toast.error(e.message || 'Failed to update field'),
  });
}

export function useDeleteFormField(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldId: string) => EventRegistrationFormService.deleteField(fieldId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.form(eventId) });
      toast.success('Field removed');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove field'),
  });
}

export function useReorderFormFields(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldOrders: { id: string; display_order: number; section_id: string }[]) =>
      EventRegistrationFormService.reorderFields(fieldOrders),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.form(eventId) }),
    onError: (e: Error) => toast.error(e.message || 'Failed to reorder fields'),
  });
}
```

- [ ] **Step 2: Verify**

Re-read the file. Confirm every hook's `mutationFn` signature matches the corresponding `EventRegistrationFormService` method from Task 3 exactly.

- [ ] **Step 3: Commit**

```bash
git add hooks/events/use-tournament-registration-form.ts
git commit -m "feat(events): add React Query hooks for the registration form builder"
```

---

### Task 5: Auto-create the form row when a tournament is created

**Files:**
- Modify: `lib/services/events/tournament/tournament-event-service.ts`

**Interfaces:**
- Consumes: `EventRegistrationFormService.getOrCreateForm` (Task 3).

- [ ] **Step 1: Add the auto-create call**

In `createTournament`, find the division-seeding block:

```typescript
      // Seed divisions (best-effort: a failed division does not roll back the event).
      if (divisions?.length) {
        for (const [i, div] of divisions.entries()) {
          try {
            await this.createDivision(event.id, { sort_order: i, ...div });
          } catch (divError) {
            logger.warn('events/tournament', 'Failed to seed division', {
              eventId: event.id,
              sport: div.sport,
              error: divError,
            });
          }
        }
      }
```

Add immediately after this block (still inside `createTournament`, before the `logger.info('events/tournament', 'Tournament created', ...)` call):

```typescript
      // Auto-create an empty registration form row (best-effort — the read
      // path lazy-creates one anyway if this fails, per getOrCreateForm).
      try {
        const { EventRegistrationFormService } = await import(
          '@/lib/services/events/tournament/event-registration-form-service'
        );
        await EventRegistrationFormService.getOrCreateForm(event.id);
      } catch (formError) {
        logger.warn('events/tournament', 'Failed to seed registration form', {
          eventId: event.id,
          error: formError,
        });
      }
```

(Dynamic `import()` avoids a static circular-import risk between the two service files — `TournamentEventService` and `EventRegistrationFormService` don't otherwise reference each other, so this is a one-directional, lazy-loaded call.)

- [ ] **Step 2: Verify**

Re-read `createTournament` end-to-end. Confirm the new block sits between division seeding and the final `logger.info`, and that nothing else in the method changed.

- [ ] **Step 3: Commit**

```bash
git add lib/services/events/tournament/tournament-event-service.ts
git commit -m "feat(events): auto-create registration form row on tournament creation"
```

---

### Task 6: `DynamicFieldInput` — shared field renderer

**Files:**
- Create: `components/events/dynamic-field-input.tsx`

**Interfaces:**
- Consumes: `EventRegistrationFormField`, `FormFieldCondition` (Task 2).
- Produces: `<DynamicFieldInput field value onChange allValues />` and `isFieldVisible(field, allValues)`. Consumed by Task 7 (builder live preview), Task 9 (guest form), Task 11 (organizer dialog).

- [ ] **Step 1: Create the component**

```tsx
'use client';

// Renders ONE custom registration field by its field_type. Shared by the
// admin builder's live preview and both actual registration surfaces (public
// guest form, organizer Add Entry dialog) — one rendering implementation, no
// drift between "what the organizer designed" and "what a registrant sees."

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EventRegistrationFormField, FormFieldCondition } from '@/types/tournament';

/** Whether `field` should be shown given the current answers to ALL fields on the form. */
export function isFieldVisible(
  field: EventRegistrationFormField,
  allValues: Record<string, unknown>
): boolean {
  const condition = field.condition as FormFieldCondition | null;
  if (!condition) return true;
  const dependentValue = allValues[condition.field];
  const asString = dependentValue == null ? '' : String(dependentValue);
  switch (condition.op) {
    case 'eq':
      return asString === condition.value;
    case 'neq':
      return asString !== condition.value;
    case 'contains':
      return asString.includes(condition.value);
    case 'not_empty':
      return asString.trim() !== '';
    case 'empty':
      return asString.trim() === '';
    default:
      return true;
  }
}

interface Props {
  field: EventRegistrationFormField;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function DynamicFieldInput({ field, value, onChange }: Props) {
  const label = (
    <Label htmlFor={field.id}>
      {field.field_label}
      {field.is_required && <span className="text-destructive"> *</span>}
    </Label>
  );

  switch (field.field_type) {
    case 'textarea':
      return (
        <div className="space-y-1.5">
          {label}
          <Textarea
            id={field.id}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
            maxLength={field.max_length ?? undefined}
          />
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'select':
    case 'radio':
      return (
        <div className="space-y-1.5">
          {label}
          <Select value={(value as string) ?? ''} onValueChange={onChange}>
            <SelectTrigger id={field.id}>
              <SelectValue placeholder={field.placeholder ?? 'Select…'} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'multi_select': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) =>
        onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
      return (
        <div className="space-y-1.5">
          {label}
          <div className="space-y-1.5 rounded-md border p-2.5">
            {(field.options ?? []).map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm">
                <Checkbox checked={selected.includes(opt.value)} onCheckedChange={() => toggle(opt.value)} />
                {opt.label}
              </label>
            ))}
          </div>
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );
    }

    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={field.id}
            checked={!!value}
            onCheckedChange={(checked) => onChange(!!checked)}
          />
          {label}
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'file':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={field.id}
            type="file"
            onChange={(e) => onChange(e.target.files?.[0]?.name ?? null)}
          />
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'date':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={field.id}
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'number':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={field.id}
            type="number"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
            min={field.min_value ?? undefined}
            max={field.max_value ?? undefined}
          />
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'phone':
    case 'email':
    case 'text':
    default:
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={field.id}
            type={field.field_type === 'email' ? 'email' : 'text'}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
            maxLength={field.max_length ?? undefined}
            pattern={field.pattern ?? undefined}
          />
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );
  }
}
```

- [ ] **Step 2: Verify**

Confirm `components/ui/checkbox.tsx` exists in this project (it's a standard shadcn primitive already used elsewhere, e.g. the multi-select field's sibling patterns in `add-entry-dialog.tsx`'s roster). Re-read the file for a `switch` over every `FormFieldType` value from Task 2 — all 11 must be handled (10 explicit cases + the `text`/`phone`/`email` fallthrough default covers 3 of them together).

- [ ] **Step 3: Commit**

```bash
git add components/events/dynamic-field-input.tsx
git commit -m "feat(events): add shared DynamicFieldInput component for custom registration fields"
```

---

### Task 7: Registration Form builder — admin UI

**Files:**
- Create: `app/(routes)/events/tournament/[id]/_components/registration-form-builder.tsx`

**Interfaces:**
- Consumes: hooks from Task 4; `DynamicFieldInput`/`isFieldVisible` from Task 6; types from Task 2.
- Produces: `<RegistrationFormBuilder eventId canManage />`. Consumed by Task 8 (embedded in the management page).

- [ ] **Step 1: Create the builder component**

```tsx
'use client';

// Registration Form builder — organizer-configurable custom fields for one
// tournament, layered on top of the fixed core fields (division, entry name,
// roster, contact info) every registration already collects. Sections hold
// fields; both reorder via up/down buttons (no drag-and-drop dependency).

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import {
  useRegistrationForm,
  useCreateFormSection,
  useUpdateFormSection,
  useDeleteFormSection,
  useReorderFormSections,
  useCreateFormField,
  useUpdateFormField,
  useDeleteFormField,
  useReorderFormFields,
} from '@/hooks/events/use-tournament-registration-form';
import { DynamicFieldInput } from '@/components/events/dynamic-field-input';
import { FORM_FIELD_TYPES } from '@/types/tournament';
import type { EventRegistrationFormField, EventRegistrationFormSection } from '@/types/tournament';

function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '_')
    .replace(/^_|_$/g, '') || 'field';
}

function FieldRow({
  field,
  isFirst,
  isLast,
  onMove,
  onUpdate,
  onDelete,
}: {
  field: EventRegistrationFormField;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: 'up' | 'down') => void;
  onUpdate: (updates: Partial<EventRegistrationFormField>) => void;
  onDelete: () => void;
}) {
  const needsOptions = field.field_type === 'select' || field.field_type === 'multi_select' || field.field_type === 'radio';
  const optionsText = (field.options ?? []).map((o) => o.label).join('\n');

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Field label</Label>
          <Input
            value={field.field_label}
            onChange={(e) => onUpdate({ field_label: e.target.value })}
            placeholder="e.g. T-shirt size"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Field type</Label>
          <Select value={field.field_type} onValueChange={(v) => onUpdate({ field_type: v as EventRegistrationFormField['field_type'] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORM_FIELD_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {needsOptions && (
        <div className="space-y-1.5">
          <Label>Options (one per line)</Label>
          <Textarea
            rows={3}
            value={optionsText}
            onChange={(e) =>
              onUpdate({
                options: e.target.value
                  .split('\n')
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l) => ({ label: l, value: slugifyKey(l) })),
              })
            }
            placeholder={'Small\nMedium\nLarge'}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Help text (optional)</Label>
        <Input
          value={field.help_text ?? ''}
          onChange={(e) => onUpdate({ help_text: e.target.value || null })}
          placeholder="Shown under the field"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={field.is_required} onCheckedChange={(v) => onUpdate({ is_required: v })} />
          <Label className="text-sm">Required</Label>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" disabled={isFirst} onClick={() => onMove('up')}>
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={isLast} onClick={() => onMove('down')}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RegistrationFormBuilder({ eventId, canManage }: { eventId: string; canManage: boolean }) {
  const { data: form, isLoading } = useRegistrationForm(eventId);
  const createSection = useCreateFormSection(eventId);
  const updateSection = useUpdateFormSection(eventId);
  const deleteSection = useDeleteFormSection(eventId);
  const reorderSections = useReorderFormSections(eventId);
  const createField = useCreateFormField(eventId);
  const updateField = useUpdateFormField(eventId);
  const deleteField = useDeleteFormField(eventId);
  const reorderFields = useReorderFormFields(eventId);

  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});

  const sections = form?.sections ?? [];

  function addSection() {
    if (!form) return;
    createSection.mutate({
      formId: form.id,
      section: { title: 'New section', display_order: sections.length },
    });
  }

  function moveSection(section: EventRegistrationFormSection, direction: 'up' | 'down') {
    const idx = sections.findIndex((s) => s.id === section.id);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= sections.length) return;
    reorderSections.mutate([
      { id: sections[idx].id, display_order: sections[swapWith].display_order },
      { id: sections[swapWith].id, display_order: sections[idx].display_order },
    ]);
  }

  function addField(section: EventRegistrationFormSection) {
    const fields = section.fields ?? [];
    createField.mutate({
      section_id: section.id,
      field_key: `field_${Date.now()}`,
      field_label: 'New field',
      field_type: 'text',
      display_order: fields.length,
    });
  }

  function moveField(section: EventRegistrationFormSection, field: EventRegistrationFormField, direction: 'up' | 'down') {
    const fields = section.fields ?? [];
    const idx = fields.findIndex((f) => f.id === field.id);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= fields.length) return;
    reorderFields.mutate([
      { id: fields[idx].id, display_order: fields[swapWith].display_order, section_id: section.id },
      { id: fields[swapWith].id, display_order: fields[idx].display_order, section_id: section.id },
    ]);
  }

  if (!canManage) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Registration Form</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Add custom fields registrants must fill in, on top of the standard division/name/roster/contact
              fields every tournament already collects. These apply to all divisions in this tournament.
            </p>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* ── Builder ── */}
              <div className="space-y-4">
                {sections.map((section, sIdx) => (
                  <div key={section.id} className="space-y-3 rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        className="flex-1"
                        value={section.title}
                        onChange={(e) => updateSection.mutate({ sectionId: section.id, updates: { title: e.target.value } })}
                      />
                      <Button type="button" variant="ghost" size="icon" disabled={sIdx === 0} onClick={() => moveSection(section, 'up')}>
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" disabled={sIdx === sections.length - 1} onClick={() => moveSection(section, 'down')}>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => deleteSection.mutate(section.id)}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {(section.fields ?? []).map((field, fIdx) => (
                        <FieldRow
                          key={field.id}
                          field={field}
                          isFirst={fIdx === 0}
                          isLast={fIdx === (section.fields?.length ?? 1) - 1}
                          onMove={(dir) => moveField(section, field, dir)}
                          onUpdate={(updates) => updateField.mutate({ fieldId: field.id, updates })}
                          onDelete={() => deleteField.mutate(field.id)}
                        />
                      ))}
                    </div>

                    <Button type="button" variant="outline" size="sm" onClick={() => addField(section)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add field
                    </Button>
                  </div>
                ))}

                <Button type="button" variant="outline" onClick={addSection} disabled={!form}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add section
                </Button>
              </div>

              {/* ── Live preview ── */}
              <div className="space-y-4 rounded-lg border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Preview — what registrants will see
                </p>
                {sections.length === 0 && (
                  <p className="text-sm text-muted-foreground">No custom fields yet — add a section to get started.</p>
                )}
                {sections.map((section) => (
                  <div key={section.id} className="space-y-3">
                    <p className="text-sm font-semibold">{section.title}</p>
                    {(section.fields ?? []).map((field) => (
                      <DynamicFieldInput
                        key={field.id}
                        field={field}
                        value={previewValues[field.field_key]}
                        onChange={(v) => setPreviewValues((prev) => ({ ...prev, [field.field_key]: v }))}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify**

Re-read the file. Confirm every hook imported in Step 1 matches a real export from Task 4's file, and `FORM_FIELD_TYPES`/`EventRegistrationFormField`/`EventRegistrationFormSection` match Task 2's exports.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/events/tournament/[id]/_components/registration-form-builder.tsx"
git commit -m "feat(events): add Registration Form builder UI"
```

---

### Task 8: Embed the builder in the tournament management page

**Files:**
- Modify: `app/(routes)/events/tournament/[id]/page.tsx`

**Interfaces:**
- Consumes: `<RegistrationFormBuilder>` (Task 7).

- [ ] **Step 1: Add the import**

```typescript
import { RegistrationFormBuilder } from './_components/registration-form-builder';
```

- [ ] **Step 2: Embed the component**

Immediately after the `<InchargePanel eventId={id} tournament={tournament} canAssign={access.canAssignIncharge} />` block (and its closing `/>`), add:

```tsx
      {/* ── Registration Form builder ────────────────────────────────────── */}
      <RegistrationFormBuilder eventId={id} canManage={canManage} />
```

(`canManage` is already computed earlier in this component as `access.canManage` — confirm the exact variable name by reading the surrounding code before inserting; this mirrors the same permission gate the Registration Form tab's RLS relies on server-side, so a non-manager sees nothing rather than a disabled builder.)

- [ ] **Step 3: Verify**

Re-read the file around the insertion point. Confirm the new block sits between `InchargePanel` and the "KPI row" comment, and nothing else changed.

- [ ] **Step 4: Verify in browser**

With the dev server running, open a tournament you can manage (`sports.tournaments.manage` or in-charge) at `/events/tournament/<id>` and confirm a "Registration Form" card appears with an empty state ("No custom fields yet"). Add a section, add a text field, confirm the live preview updates.

- [ ] **Step 5: Commit**

```bash
git add "app/(routes)/events/tournament/[id]/page.tsx"
git commit -m "feat(events): embed Registration Form builder in tournament management page"
```

---

### Task 9: Render custom fields on the public guest form

**Files:**
- Modify: `app/p/tournament/[id]/register/page.tsx`
- Modify: `app/p/tournament/[id]/register/_components/register-form.tsx`

**Interfaces:**
- Consumes: `EventRegistrationFormService.getFormWithFields` is client-only (uses `createClientSupabaseClient`) — the public page is a Server Component using a service-role client directly, so it queries the 3 tables directly rather than importing the client-side service (mirrors how `divisions` is already fetched in this same file). `DynamicFieldInput`/`isFieldVisible` (Task 6).

- [ ] **Step 1: `register/page.tsx`** — fetch the form alongside divisions

After the existing `divisions` fetch block (`const { data: divisions } = await svc.from('tournament_divisions')...`), add:

```typescript
  const { data: formRow } = await svc
    .from('event_registration_forms')
    .select('id')
    .eq('event_id', id)
    .maybeSingle();

  let sections: { id: string; title: string; display_order: number; fields: any[] }[] = [];
  if (formRow) {
    const { data: rawSections } = await svc
      .from('event_registration_form_sections')
      .select('*')
      .eq('form_id', formRow.id)
      .order('display_order', { ascending: true });
    const { data: rawFields } = await svc
      .from('event_registration_form_fields')
      .select('*')
      .eq('event_id', id)
      .order('display_order', { ascending: true });
    sections = (rawSections ?? []).map((s) => ({
      ...s,
      fields: (rawFields ?? []).filter((f) => f.section_id === s.id),
    }));
  }
```

(No `formRow` means the tournament predates this feature and hasn't been opened in the builder yet — `sections` stays empty, matching the "lazy-create, empty form shows no custom fields" rollout behavior; the FIRST time an organizer opens the builder tab, `getOrCreateForm` materializes the row for next time.)

Pass `sections` to `RegisterForm`:

```tsx
      <RegisterForm
        eventId={id}
        divisions={divisions as DivisionLite[]}
        signedInName={signedInName}
        isLearner={isLearner}
        sections={sections}
      />
```

- [ ] **Step 2: `register-form.tsx`** — render + collect + submit custom fields

Add imports:

```typescript
import { DynamicFieldInput, isFieldVisible } from '@/components/events/dynamic-field-input';
import type { EventRegistrationFormField } from '@/types/tournament';
```

Widen the props type and add a `customFields` state, right after the existing `useState` declarations (after `const [members, ...]`):

```typescript
interface SectionLite {
  id: string;
  title: string;
  fields: EventRegistrationFormField[];
}
```

Change the component signature from:

```typescript
export function RegisterForm({
  eventId,
  divisions,
  signedInName,
  isLearner,
}: {
  eventId: string;
  divisions: DivisionLite[];
  signedInName: string | null;
  isLearner: boolean;
}) {
```

to:

```typescript
export function RegisterForm({
  eventId,
  divisions,
  signedInName,
  isLearner,
  sections,
}: {
  eventId: string;
  divisions: DivisionLite[];
  signedInName: string | null;
  isLearner: boolean;
  sections: SectionLite[];
}) {
```

Add state after `const [members, setMembers] = useState...`:

```typescript
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
```

In `submit()`, add `custom_fields: customFields` to the JSON body (inside the existing `body: JSON.stringify({...})` object, alongside `members`):

```typescript
          members: isTeam ? members.filter((m) => m.member_name.trim()) : undefined,
          custom_fields: customFields,
```

Render the custom sections in the JSX, right before the closing `{error && ...}` / submit-button block (i.e., after the Phone/Email grid, before `{error && (`):

```tsx
      {sections.map((section) => (
        <div key={section.id} className="space-y-3 border-t pt-4">
          <p className="text-sm font-semibold">{section.title}</p>
          {section.fields
            .filter((f) => isFieldVisible(f, customFields))
            .map((f) => (
              <DynamicFieldInput
                key={f.id}
                field={f}
                value={customFields[f.field_key]}
                onChange={(v) => setCustomFields((prev) => ({ ...prev, [f.field_key]: v }))}
              />
            ))}
        </div>
      ))}
```

- [ ] **Step 3: Verify**

Re-read both files. Confirm `sections` flows from `page.tsx` to `RegisterForm` with a matching type, and nothing in the existing division/roster/contact rendering changed.

- [ ] **Step 4: Commit**

```bash
git add "app/p/tournament/[id]/register/page.tsx" "app/p/tournament/[id]/register/_components/register-form.tsx"
git commit -m "feat(events): render tournament custom registration fields on the guest form"
```

---

### Task 10: Validate + store `custom_fields` on the public register route

**Files:**
- Modify: `app/api/events/tournament/[eventId]/public-register/route.ts`

**Interfaces:**
- Consumes: `validateCustomFields` (Task 3).

- [ ] **Step 1: Add the import**

```typescript
import { validateCustomFields } from '@/lib/services/events/tournament/event-registration-form-service';
```

- [ ] **Step 2: Widen `PublicRegisterBody`**

```typescript
interface PublicRegisterBody {
  division_id: string;
  entry_name: string;
  entry_type: 'individual' | 'team';
  is_external?: boolean;
  institution_name?: string | null;
  participant_phone?: string | null;
  participant_email?: string | null;
  participant_gender?: string | null;
  participant_age?: number | null;
  members?: CreateTeamMemberDto[];
  custom_fields?: Record<string, unknown> | null;
}
```

- [ ] **Step 3: Validate required custom fields**

Immediately before the `// ---- fee + payment intent ----` comment, add:

```typescript
    // ---- custom registration fields (Dynamic Form Builder) ----
    const { data: customFieldDefs } = await (svc as any)
      .from('event_registration_form_fields')
      .select('*')
      .eq('event_id', eventId);
    const customFieldsError = validateCustomFields(customFieldDefs ?? [], dto.custom_fields);
    if (customFieldsError) {
      return NextResponse.json({ error: customFieldsError }, { status: 422 });
    }
```

- [ ] **Step 4: Store the answers**

In the `events_registrations` insert object, add one field after `source: 'tournament_self',`:

```typescript
        custom_fields: dto.custom_fields ?? null,
```

- [ ] **Step 5: Verify**

Re-read the file. Confirm the validation query runs before the `events_registrations` insert, and the insert now includes `custom_fields`.

- [ ] **Step 6: Verify in browser**

With the dev server running: on a tournament with a required custom field configured (via Task 8's builder), attempt to submit the public guest form without filling it in — confirm a 422 with the field's label in the error message. Fill it in and submit — confirm the registration succeeds and (via Supabase table editor or `execute_sql`) that `events_registrations.custom_fields` contains the submitted value.

- [ ] **Step 7: Commit**

```bash
git add "app/api/events/tournament/[eventId]/public-register/route.ts"
git commit -m "feat(events): validate and store custom fields on public tournament registration"
```

---

### Task 11: Render custom fields on the organizer's Add Entry dialog

**Files:**
- Modify: `app/(routes)/events/tournament/[id]/_components/add-entry-dialog.tsx`

**Interfaces:**
- Consumes: `useRegistrationForm` (Task 4); `DynamicFieldInput`/`isFieldVisible` (Task 6).

- [ ] **Step 1: Add imports**

```typescript
import { useRegistrationForm } from '@/hooks/events/use-tournament-registration-form';
import { DynamicFieldInput, isFieldVisible } from '@/components/events/dynamic-field-input';
```

- [ ] **Step 2: Fetch the form + add state**

Near the top of the `AddEntryDialog` component (alongside `const register = useRegisterEntry(eventId);`), add:

```typescript
  const { data: registrationForm } = useRegistrationForm(eventId);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
```

- [ ] **Step 3: Include in submit + reset on close**

In the `submit()` function, add `dto.custom_fields = customFields;` right before `const result = await register.mutateAsync(dto);`.

In the `reset()` function, add `setCustomFields({});` alongside the other `set...` calls.

- [ ] **Step 4: Render the fields**

In the dialog's JSX, right before the closing footer/submit-button section (find the existing Phone/Email or roster block's closing point — insert after the last core-field section, before `<DialogFooter>`), add:

```tsx
          {(registrationForm?.sections ?? []).map((section) => (
            <div key={section.id} className="space-y-3 border-t pt-4">
              <p className="text-sm font-semibold">{section.title}</p>
              {(section.fields ?? [])
                .filter((f) => isFieldVisible(f, customFields))
                .map((f) => (
                  <DynamicFieldInput
                    key={f.id}
                    field={f}
                    value={customFields[f.field_key]}
                    onChange={(v) => setCustomFields((prev) => ({ ...prev, [f.field_key]: v }))}
                  />
                ))}
            </div>
          ))}
```

- [ ] **Step 5: Verify**

Re-read the file. Confirm the insertion point is inside the dialog's scrollable content area (not outside `<DialogContent>`), and `dto.custom_fields` is set before every `register.mutateAsync(dto)` call site in this file (there should be exactly one).

- [ ] **Step 6: Commit**

```bash
git add "app/(routes)/events/tournament/[id]/_components/add-entry-dialog.tsx"
git commit -m "feat(events): render tournament custom registration fields in organizer Add Entry dialog"
```

---

### Task 12: Validate + store `custom_fields` on the organizer entries route

**Files:**
- Modify: `app/api/events/tournament/[eventId]/entries/route.ts`

**Interfaces:**
- Consumes: `validateCustomFields` (Task 3); widened `CreateEntryDto` (Task 2).

- [ ] **Step 1: Add the import**

```typescript
import { validateCustomFields } from '@/lib/services/events/tournament/event-registration-form-service';
```

- [ ] **Step 2: Validate required custom fields**

Immediately before the `// ---- entry fee + payment intent ----` comment (after the eligibility checks), add:

```typescript
    // ---- custom registration fields (Dynamic Form Builder) ----
    const { data: customFieldDefs } = await (svc as any)
      .from('event_registration_form_fields')
      .select('*')
      .eq('event_id', eventId);
    const customFieldsError = validateCustomFields(customFieldDefs ?? [], dto.custom_fields);
    if (customFieldsError) {
      return NextResponse.json({ error: customFieldsError }, { status: 422 });
    }
```

- [ ] **Step 3: Store the answers**

In the `events_registrations` insert object (POST handler), add one field after `registered_by: user.id,`:

```typescript
        custom_fields: dto.custom_fields ?? null,
```

- [ ] **Step 4: Verify**

Re-read the file. Confirm the validation sits after eligibility checks and before the fee/payment-intent block, and the insert includes `custom_fields`.

- [ ] **Step 5: Verify in browser**

With the dev server running: as an organizer, open Add Entry on a tournament with a required custom field, submit without filling it — confirm a 422/error toast referencing the field. Fill it in, submit, confirm the entry is created and `events_registrations.custom_fields` for that row contains the answer.

- [ ] **Step 6: Commit**

```bash
git add "app/api/events/tournament/[eventId]/entries/route.ts"
git commit -m "feat(events): validate and store custom fields on organizer tournament registration"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1-2 cover design spec §4.1-4.4 (data model). Task 3-5 cover §5.3's service + auto-create-on-creation. Task 6-8 cover §5.3's builder UI + live preview (adapted from "tab" to a Card section embedded the same way `InchargePanel` already is, since the actual page layout is stacked Cards, not tabs — a deliberate, justified deviation from the spec's literal wording, not from its intent). Task 9-12 cover rendering + validating + storing custom fields on both the public guest form and the organizer's Add Entry dialog — the spec's §5.4 describes this happening on the eventual gate/in-app pages (Plan 3 territory), but since Plan 3 hasn't been built yet, this plan wires it into the CURRENT registration surfaces (the same `register-form.tsx`/`add-entry-dialog.tsx` Plan 1 already touched) so the feature is usable today; Plan 3 will carry the custom-fields rendering forward into whatever new components it introduces.
- **Placeholder scan:** no TBD/TODO; every step shows complete code.
- **Type consistency:** `EventRegistrationFormField`/`FormFieldType`/`FormFieldCondition` (Task 2) are used identically across the service (Task 3), hooks (Task 4), `DynamicFieldInput` (Task 6), the builder (Task 7), and both registration surfaces (Task 9, 11) — no drift in field names between any of them.
- **Explicitly out of scope:** the MyJKKN-vs-guest audience split, the gate page, the in-app self-registration route, and the QR code remain Plan 3. The payments tab remains Plan 4. Neither depends on this plan beyond "custom fields exist and are queryable," which both will inherit for free.
