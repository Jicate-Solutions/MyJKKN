# Admission Dynamic Form Builder — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a drag-and-drop form builder inside the Admission CRM module that lets admins create public admission forms with dynamic fields, conditional logic, and multi-institution program selection — with submissions flowing directly into the leads pipeline.

**Architecture:** Integrated module under `/admission/settings/forms` (admin) and `/apply/[slug]` (public). Reuses existing `LeadService.createLead()` for lead insertion, existing `@dnd-kit` for drag-and-drop, and follows the dynamic form pattern from `service-requests/_components/dynamic-request-form.tsx`. New Supabase tables store form schemas, submissions, and analytics events.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + RLS), @dnd-kit/core ^6.3.1 + @dnd-kit/sortable ^10.0.0, react-hook-form ^7.61.0, zod ^3.25.76, @tanstack/react-query ^5.72.1, shadcn/ui components, Tailwind CSS.

---

## Phase 1: Database Schema & Types (Foundation)

### Task 1.1: Add Form Builder Tables to Supabase

**Files:**
- Modify: `supabase/setup/01_tables.sql` (append at end)
- Modify: `supabase/SQL_FILE_INDEX.md` (update index)

**Step 1: Add tables to `01_tables.sql`**

Append the following at the end of the file, before the closing comments:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- ADMISSION FORM BUILDER TABLES
-- Added: 2026-04-08 — Dynamic public admission forms
-- ═══════════════════════════════════════════════════════════════════════════

-- Pre-built form templates (system + user-created)
CREATE TABLE IF NOT EXISTS admission_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  form_type text NOT NULL DEFAULT 'admission',
  template_data jsonb NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Main form configuration
CREATE TABLE IF NOT EXISTS admission_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  form_type text NOT NULL DEFAULT 'admission',
  -- Multi-institution support
  institution_ids uuid[] DEFAULT '{}',
  program_ids uuid[] DEFAULT '{}',
  -- Branding
  logo_url text,
  banner_url text,
  primary_color text DEFAULT '#1a73e8',
  thank_you_title text DEFAULT 'Application Received!',
  thank_you_message text DEFAULT 'Thank you for your interest. Our team will contact you shortly.',
  -- Settings
  is_active boolean NOT NULL DEFAULT true,
  allow_duplicate boolean NOT NULL DEFAULT false,
  auto_whatsapp boolean NOT NULL DEFAULT true,
  wa_template_id uuid,
  max_submissions integer,
  starts_at timestamptz,
  expires_at timestamptz,
  -- Metadata
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Form sections (group fields visually)
CREATE TABLE IF NOT EXISTS admission_form_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES admission_forms(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_collapsible boolean NOT NULL DEFAULT false,
  condition jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Individual form fields
CREATE TABLE IF NOT EXISTS admission_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES admission_forms(id) ON DELETE CASCADE,
  section_id uuid REFERENCES admission_form_sections(id) ON DELETE SET NULL,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN (
    'text', 'number', 'phone', 'email', 'select', 'multi_select',
    'date', 'textarea', 'file', 'checkbox', 'radio',
    'institution_program_selector'
  )),
  placeholder text,
  help_text text,
  is_required boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  -- Validation
  min_length integer,
  max_length integer,
  min_value numeric,
  max_value numeric,
  pattern text,
  -- Options (for select/radio/checkbox/multi_select)
  options jsonb DEFAULT '[]',
  -- Conditional logic
  condition jsonb,
  -- Lead field mapping
  lead_field_map text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Raw form submissions
CREATE TABLE IF NOT EXISTS admission_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES admission_forms(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES admission_leads(id) ON DELETE SET NULL,
  institution_id uuid REFERENCES institutions(id),
  submission_data jsonb NOT NULL DEFAULT '{}',
  ip_address text,
  user_agent text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer_url text,
  device_type text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

-- Analytics events (form views, field interactions, abandonment)
CREATE TABLE IF NOT EXISTS admission_form_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES admission_forms(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'form_viewed', 'form_started', 'field_focused', 'field_completed',
    'form_submitted', 'form_abandoned'
  )),
  field_key text,
  session_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_admission_forms_institution ON admission_forms(institution_id);
CREATE INDEX IF NOT EXISTS idx_admission_forms_slug ON admission_forms(slug);
CREATE INDEX IF NOT EXISTS idx_admission_forms_status ON admission_forms(status);
CREATE INDEX IF NOT EXISTS idx_admission_form_fields_form ON admission_form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_admission_form_fields_section ON admission_form_fields(section_id);
CREATE INDEX IF NOT EXISTS idx_admission_form_sections_form ON admission_form_sections(form_id);
CREATE INDEX IF NOT EXISTS idx_admission_form_submissions_form ON admission_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_admission_form_submissions_lead ON admission_form_submissions(lead_id);
CREATE INDEX IF NOT EXISTS idx_admission_form_events_form ON admission_form_events(form_id);
CREATE INDEX IF NOT EXISTS idx_admission_form_events_session ON admission_form_events(session_id);
CREATE INDEX IF NOT EXISTS idx_admission_form_events_type ON admission_form_events(event_type);
CREATE INDEX IF NOT EXISTS idx_admission_form_events_created ON admission_form_events(created_at);
```

**Step 2: Run the migration via Supabase MCP or dashboard SQL editor**

Run: Copy SQL above into Supabase Dashboard → SQL Editor and execute.
Expected: All 6 tables and 12 indexes created successfully.

**Step 3: Update `supabase/SQL_FILE_INDEX.md`**

Add entry under Admission section:
```markdown
### Admission Form Builder (2026-04-08)
- Tables: `admission_form_templates`, `admission_forms`, `admission_form_sections`, `admission_form_fields`, `admission_form_submissions`, `admission_form_events`
- Location: `supabase/setup/01_tables.sql` (appended)
```

**Step 4: Commit**
```bash
git add supabase/setup/01_tables.sql supabase/SQL_FILE_INDEX.md
git commit -m "feat(admission): add form builder database tables and indexes"
```

---

### Task 1.2: Add RLS Policies & Triggers

**Files:**
- Modify: `supabase/setup/03_policies.sql` (append)
- Modify: `supabase/setup/04_triggers.sql` (append)

**Step 1: Add RLS policies to `03_policies.sql`**

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- ADMISSION FORM BUILDER POLICIES
-- Added: 2026-04-08
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE admission_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_templates ENABLE ROW LEVEL SECURITY;

-- Templates: anyone authenticated can read system templates
CREATE POLICY "admission_form_templates_select" ON admission_form_templates
  FOR SELECT USING (is_system = true OR auth.uid() IS NOT NULL);

-- Forms: institution-scoped CRUD
CREATE POLICY "admission_forms_select" ON admission_forms
  FOR SELECT USING (
    institution_id IN (
      SELECT institution_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "admission_forms_insert" ON admission_forms
  FOR INSERT WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "admission_forms_update" ON admission_forms
  FOR UPDATE USING (
    institution_id IN (
      SELECT institution_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "admission_forms_delete" ON admission_forms
  FOR DELETE USING (
    institution_id IN (
      SELECT institution_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Sections & Fields: cascade from form access
CREATE POLICY "admission_form_sections_all" ON admission_form_sections
  FOR ALL USING (
    form_id IN (SELECT id FROM admission_forms)
  );

CREATE POLICY "admission_form_fields_all" ON admission_form_fields
  FOR ALL USING (
    form_id IN (SELECT id FROM admission_forms)
  );

-- Submissions: institution-scoped read, public insert (via service role)
CREATE POLICY "admission_form_submissions_select" ON admission_form_submissions
  FOR SELECT USING (
    institution_id IN (
      SELECT institution_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Events: public insert allowed (analytics from public forms), read for admins
CREATE POLICY "admission_form_events_select" ON admission_form_events
  FOR SELECT USING (
    form_id IN (SELECT id FROM admission_forms)
  );

CREATE POLICY "admission_form_events_insert" ON admission_form_events
  FOR INSERT WITH CHECK (true);
```

**Step 2: Add triggers to `04_triggers.sql`**

```sql
-- Admission Forms: auto-update updated_at
CREATE TRIGGER trg_admission_forms_updated
  BEFORE UPDATE ON admission_forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Step 3: Run via Supabase Dashboard SQL Editor**

**Step 4: Commit**
```bash
git add supabase/setup/03_policies.sql supabase/setup/04_triggers.sql
git commit -m "feat(admission): add RLS policies and triggers for form builder"
```

---

### Task 1.3: Add TypeScript Types for Form Builder

**Files:**
- Modify: `types/admission.ts`

**Step 1: Add `admission_form` to LeadSource union type**

At `types/admission.ts:9-20`, update the LeadSource type:

```typescript
export type LeadSource =
  | 'website'
  | 'admission_form'   // ← NEW: public form submissions
  | 'walk_in'
  | 'referral'
  | 'social_media'
  | 'newspaper'
  | 'education_fair'
  | 'agent'
  | 'publisher'
  | 'google_ads'
  | 'facebook_ads'
  | 'other';
```

**Step 2: Add form builder types at end of file**

Append to `types/admission.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// FORM BUILDER TYPES
// ═══════════════════════════════════════════════════════════════════════════

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
  | 'radio'
  | 'institution_program_selector';

export type FormStatus = 'draft' | 'published' | 'archived';

export type FormEventType =
  | 'form_viewed'
  | 'form_started'
  | 'field_focused'
  | 'field_completed'
  | 'form_submitted'
  | 'form_abandoned';

export interface FormFieldCondition {
  field: string;      // field_key of the dependent field
  op: 'eq' | 'neq' | 'contains' | 'not_empty' | 'empty' | 'program_category';
  value: string;
}

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface AdmissionFormField {
  id: string;
  form_id: string;
  section_id: string | null;
  field_key: string;
  field_label: string;
  field_type: FormFieldType;
  placeholder: string | null;
  help_text: string | null;
  is_required: boolean;
  display_order: number;
  min_length: number | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  pattern: string | null;
  options: FormFieldOption[] | null;
  condition: FormFieldCondition | null;
  lead_field_map: string | null;
  created_at: string;
}

export interface AdmissionFormSection {
  id: string;
  form_id: string;
  title: string;
  description: string | null;
  display_order: number;
  is_collapsible: boolean;
  condition: FormFieldCondition | null;
  created_at: string;
  // Populated relationship
  fields?: AdmissionFormField[];
}

export interface AdmissionForm {
  id: string;
  institution_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: FormStatus;
  form_type: string;
  institution_ids: string[];
  program_ids: string[];
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string;
  thank_you_title: string;
  thank_you_message: string;
  is_active: boolean;
  allow_duplicate: boolean;
  auto_whatsapp: boolean;
  wa_template_id: string | null;
  max_submissions: number | null;
  starts_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Populated relationships
  sections?: AdmissionFormSection[];
}

export interface CreateAdmissionFormInput {
  institution_id: string;
  name: string;
  slug: string;
  description?: string | null;
  form_type?: string;
  institution_ids?: string[];
  program_ids?: string[];
  logo_url?: string | null;
  banner_url?: string | null;
  primary_color?: string;
  thank_you_title?: string;
  thank_you_message?: string;
  allow_duplicate?: boolean;
  auto_whatsapp?: boolean;
  wa_template_id?: string | null;
  max_submissions?: number | null;
  starts_at?: string | null;
  expires_at?: string | null;
}

export interface AdmissionFormSubmission {
  id: string;
  form_id: string;
  lead_id: string | null;
  institution_id: string | null;
  submission_data: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer_url: string | null;
  device_type: string | null;
  submitted_at: string;
}

export interface AdmissionFormEvent {
  id: string;
  form_id: string;
  event_type: FormEventType;
  field_key: string | null;
  session_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdmissionFormTemplate {
  id: string;
  name: string;
  description: string | null;
  form_type: string;
  template_data: {
    sections: Array<{
      title: string;
      description?: string;
      fields: Array<Omit<AdmissionFormField, 'id' | 'form_id' | 'section_id' | 'created_at'>>;
    }>;
  };
  is_system: boolean;
  created_at: string;
}

// Analytics aggregation types
export interface FormAnalyticsSummary {
  form_id: string;
  total_views: number;
  total_starts: number;
  total_submissions: number;
  view_to_start_rate: number;
  start_to_submit_rate: number;
  overall_conversion_rate: number;
  avg_completion_time_seconds: number | null;
  submissions_today: number;
  submissions_this_week: number;
}

export interface FieldDropOff {
  field_key: string;
  field_label: string;
  started: number;
  completed: number;
  drop_off_rate: number;
}

export interface FormTrafficSource {
  source: string;
  count: number;
  percentage: number;
}

export interface FormDeviceBreakdown {
  device_type: string;
  count: number;
  percentage: number;
}
```

**Step 3: Update VALID_SOURCES in webhook**

In `app/api/admission/leads/route.ts:17-20`, add `'admission_form'` to the array:

```typescript
const VALID_SOURCES: LeadSource[] = [
  'website', 'admission_form', 'walk_in', 'referral', 'social_media', 'newspaper',
  'education_fair', 'agent', 'publisher', 'google_ads', 'facebook_ads', 'other',
];
```

**Step 4: Commit**
```bash
git add types/admission.ts app/api/admission/leads/route.ts
git commit -m "feat(admission): add form builder TypeScript types and admission_form source"
```

---

## Phase 2: Service Layer

### Task 2.1: Form Builder Service (CRUD)

**Files:**
- Create: `lib/services/admission/form-builder-service.ts`

**Step 1: Create the service**

```typescript
// lib/services/admission/form-builder-service.ts
// CRUD operations for admission forms, sections, and fields

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AdmissionForm,
  AdmissionFormSection,
  AdmissionFormField,
  AdmissionFormTemplate,
  CreateAdmissionFormInput,
  FormFieldOption,
  FormFieldCondition,
} from '@/types/admission';

export class FormBuilderService {
  // ─── Forms CRUD ─────────────────────────────────────────────

  static async getForms(institutionId?: string): Promise<AdmissionForm[]> {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('admission_forms')
      .select('*')
      .order('created_at', { ascending: false });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as AdmissionForm[];
  }

  static async getFormById(formId: string): Promise<AdmissionForm & { sections: (AdmissionFormSection & { fields: AdmissionFormField[] })[] }> {
    const supabase = createClientSupabaseClient();

    // Fetch form
    const { data: form, error: formError } = await supabase
      .from('admission_forms')
      .select('*')
      .eq('id', formId)
      .single();
    if (formError) throw formError;

    // Fetch sections with fields
    const { data: sections, error: sectionsError } = await supabase
      .from('admission_form_sections')
      .select('*')
      .eq('form_id', formId)
      .order('display_order', { ascending: true });
    if (sectionsError) throw sectionsError;

    // Fetch all fields for this form
    const { data: fields, error: fieldsError } = await supabase
      .from('admission_form_fields')
      .select('*')
      .eq('form_id', formId)
      .order('display_order', { ascending: true });
    if (fieldsError) throw fieldsError;

    // Group fields by section
    const sectionsWithFields = (sections ?? []).map((section: AdmissionFormSection) => ({
      ...section,
      fields: (fields ?? []).filter((f: AdmissionFormField) => f.section_id === section.id),
    }));

    // Also include orphan fields (no section)
    const orphanFields = (fields ?? []).filter((f: AdmissionFormField) => !f.section_id);
    if (orphanFields.length > 0) {
      sectionsWithFields.unshift({
        id: 'unsectioned',
        form_id: formId,
        title: 'General',
        description: null,
        display_order: -1,
        is_collapsible: false,
        condition: null,
        created_at: form.created_at,
        fields: orphanFields,
      } as any);
    }

    return { ...form, sections: sectionsWithFields } as any;
  }

  static async createForm(input: CreateAdmissionFormInput, userId: string): Promise<AdmissionForm> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_forms')
      .insert({
        ...input,
        created_by: userId,
        status: 'draft',
      })
      .select()
      .single();
    if (error) throw error;
    return data as AdmissionForm;
  }

  static async updateForm(formId: string, updates: Partial<CreateAdmissionFormInput> & { status?: string }): Promise<AdmissionForm> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_forms')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', formId)
      .select()
      .single();
    if (error) throw error;
    return data as AdmissionForm;
  }

  static async deleteForm(formId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('admission_forms')
      .delete()
      .eq('id', formId);
    if (error) throw error;
  }

  // ─── Sections CRUD ──────────────────────────────────────────

  static async createSection(
    formId: string,
    section: { title: string; description?: string; display_order: number; is_collapsible?: boolean; condition?: FormFieldCondition | null }
  ): Promise<AdmissionFormSection> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_form_sections')
      .insert({ form_id: formId, ...section })
      .select()
      .single();
    if (error) throw error;
    return data as AdmissionFormSection;
  }

  static async updateSection(sectionId: string, updates: Partial<AdmissionFormSection>): Promise<AdmissionFormSection> {
    const supabase = createClientSupabaseClient();
    const { id: _, form_id: __, created_at: ___, ...safeUpdates } = updates as any;
    const { data, error } = await supabase
      .from('admission_form_sections')
      .update(safeUpdates)
      .eq('id', sectionId)
      .select()
      .single();
    if (error) throw error;
    return data as AdmissionFormSection;
  }

  static async deleteSection(sectionId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('admission_form_sections')
      .delete()
      .eq('id', sectionId);
    if (error) throw error;
  }

  // ─── Fields CRUD ────────────────────────────────────────────

  static async createField(
    formId: string,
    field: Omit<AdmissionFormField, 'id' | 'form_id' | 'created_at'>
  ): Promise<AdmissionFormField> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_form_fields')
      .insert({ form_id: formId, ...field })
      .select()
      .single();
    if (error) throw error;
    return data as AdmissionFormField;
  }

  static async updateField(fieldId: string, updates: Partial<AdmissionFormField>): Promise<AdmissionFormField> {
    const supabase = createClientSupabaseClient();
    const { id: _, form_id: __, created_at: ___, ...safeUpdates } = updates as any;
    const { data, error } = await supabase
      .from('admission_form_fields')
      .update(safeUpdates)
      .eq('id', fieldId)
      .select()
      .single();
    if (error) throw error;
    return data as AdmissionFormField;
  }

  static async deleteField(fieldId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('admission_form_fields')
      .delete()
      .eq('id', fieldId);
    if (error) throw error;
  }

  static async reorderFields(fieldOrders: { id: string; display_order: number; section_id: string | null }[]): Promise<void> {
    const supabase = createClientSupabaseClient();
    // Batch update via individual calls (Supabase doesn't support bulk update easily)
    const promises = fieldOrders.map(({ id, display_order, section_id }) =>
      supabase
        .from('admission_form_fields')
        .update({ display_order, section_id })
        .eq('id', id)
    );
    const results = await Promise.all(promises);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }

  static async reorderSections(sectionOrders: { id: string; display_order: number }[]): Promise<void> {
    const supabase = createClientSupabaseClient();
    const promises = sectionOrders.map(({ id, display_order }) =>
      supabase
        .from('admission_form_sections')
        .update({ display_order })
        .eq('id', id)
    );
    const results = await Promise.all(promises);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }

  // ─── Templates ──────────────────────────────────────────────

  static async getTemplates(): Promise<AdmissionFormTemplate[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_form_templates')
      .select('*')
      .order('name');
    if (error) throw error;
    return (data ?? []) as AdmissionFormTemplate[];
  }

  static async createFormFromTemplate(
    templateId: string,
    input: CreateAdmissionFormInput,
    userId: string
  ): Promise<AdmissionForm> {
    const supabase = createClientSupabaseClient();

    // 1. Fetch template
    const { data: template, error: tErr } = await supabase
      .from('admission_form_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    if (tErr) throw tErr;

    // 2. Create form
    const form = await this.createForm(input, userId);

    // 3. Create sections and fields from template_data
    const templateData = (template as AdmissionFormTemplate).template_data;
    for (let si = 0; si < templateData.sections.length; si++) {
      const sectionDef = templateData.sections[si];
      const section = await this.createSection(form.id, {
        title: sectionDef.title,
        description: sectionDef.description,
        display_order: si,
      });

      for (let fi = 0; fi < sectionDef.fields.length; fi++) {
        const fieldDef = sectionDef.fields[fi];
        await this.createField(form.id, {
          ...fieldDef,
          section_id: section.id,
          display_order: fi,
        });
      }
    }

    return form;
  }

  // ─── Public Form Access (no auth) ──────────────────────────

  static async getPublishedFormBySlug(slug: string): Promise<(AdmissionForm & { sections: (AdmissionFormSection & { fields: AdmissionFormField[] })[] }) | null> {
    // This is called from public API routes using service role client
    // The caller must pass a supabase client with service role
    const supabase = createClientSupabaseClient();
    const { data: form, error } = await supabase
      .from('admission_forms')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .eq('is_active', true)
      .single();

    if (error || !form) return null;

    // Check expiry
    const now = new Date();
    if (form.starts_at && new Date(form.starts_at) > now) return null;
    if (form.expires_at && new Date(form.expires_at) < now) return null;

    // Check max submissions
    if (form.max_submissions) {
      const { count } = await supabase
        .from('admission_form_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('form_id', form.id);
      if ((count ?? 0) >= form.max_submissions) return null;
    }

    // Fetch sections + fields
    const { data: sections } = await supabase
      .from('admission_form_sections')
      .select('*')
      .eq('form_id', form.id)
      .order('display_order');

    const { data: fields } = await supabase
      .from('admission_form_fields')
      .select('*')
      .eq('form_id', form.id)
      .order('display_order');

    const sectionsWithFields = (sections ?? []).map((s: any) => ({
      ...s,
      fields: (fields ?? []).filter((f: any) => f.section_id === s.id),
    }));

    return { ...form, sections: sectionsWithFields } as any;
  }

  // ─── Slug Generation ────────────────────────────────────────

  static generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  static async isSlugAvailable(slug: string, excludeFormId?: string): Promise<boolean> {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('admission_forms')
      .select('id')
      .eq('slug', slug);
    if (excludeFormId) {
      query = query.neq('id', excludeFormId);
    }
    const { data } = await query;
    return !data || data.length === 0;
  }
}
```

**Step 2: Commit**
```bash
git add lib/services/admission/form-builder-service.ts
git commit -m "feat(admission): add FormBuilderService with CRUD for forms, sections, fields"
```

---

### Task 2.2: Form Submission Service

**Files:**
- Create: `lib/services/admission/form-submission-service.ts`

**Step 1: Create the service**

```typescript
// lib/services/admission/form-submission-service.ts
// Handles public form submissions → lead creation pipeline

import type {
  AdmissionForm,
  AdmissionFormField,
  AdmissionFormSection,
  AdmissionFormSubmission,
  CreateLeadInput,
  LeadSource,
} from '@/types/admission';
import { LeadService } from './lead-service';

interface SubmissionInput {
  formData: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrerUrl?: string;
  deviceType?: string;
}

interface SubmissionResult {
  success: boolean;
  submissionId?: string;
  leadId?: string;
  error?: string;
  isDuplicate?: boolean;
}

export class FormSubmissionService {
  /**
   * Process a public form submission:
   * 1. Validate form data against field schema
   * 2. Extract lead fields via lead_field_map
   * 3. Determine institution_id from program selection
   * 4. Create lead via LeadService.createLead()
   * 5. Store raw submission
   */
  static async processSubmission(
    form: AdmissionForm & { sections: (AdmissionFormSection & { fields: AdmissionFormField[] })[] },
    input: SubmissionInput,
    supabaseServiceClient: any
  ): Promise<SubmissionResult> {
    const { formData } = input;

    // 1. Flatten all fields from sections
    const allFields = form.sections.flatMap((s) => s.fields ?? []);

    // 2. Validate required fields
    for (const field of allFields) {
      if (field.is_required) {
        const value = formData[field.field_key];
        if (value === undefined || value === null || value === '') {
          return { success: false, error: `${field.field_label} is required` };
        }
      }
    }

    // 3. Extract lead data via lead_field_map
    const leadData: Partial<CreateLeadInput> = {
      source: 'admission_form' as LeadSource,
      tags: [`form:${form.slug}`],
      notes: `Submitted via public form: ${form.name}`,
    };

    for (const field of allFields) {
      if (field.lead_field_map && formData[field.field_key] !== undefined) {
        (leadData as any)[field.lead_field_map] = formData[field.field_key];
      }
    }

    // 4. Determine institution_id
    // If form has institution_program_selector, use the selected institution
    const programSelectorField = allFields.find((f) => f.field_type === 'institution_program_selector');
    let institutionId: string;

    if (programSelectorField && formData[programSelectorField.field_key]) {
      const selection = formData[programSelectorField.field_key] as {
        institution_id: string;
        program_id: string;
      };
      institutionId = selection.institution_id;
      leadData.interested_programs = [selection.program_id];
    } else if (form.institution_ids.length === 1) {
      institutionId = form.institution_ids[0];
    } else {
      institutionId = form.institution_id;
    }

    leadData.institution_id = institutionId;

    // 5. Ensure required lead fields
    if (!leadData.first_name) {
      // Try full_name fallback
      const fullName = formData['full_name'] as string;
      if (fullName) {
        const parts = fullName.trim().split(/\s+/);
        leadData.first_name = parts[0];
        leadData.last_name = parts.slice(1).join(' ') || null;
      } else {
        return { success: false, error: 'Name is required' };
      }
    }

    if (!leadData.phone) {
      return { success: false, error: 'Phone number is required' };
    }

    // 6. Add UTM tags
    if (input.utmSource) {
      leadData.tags = [...(leadData.tags ?? []), `utm:${input.utmSource}`];
    }

    // 7. Set WhatsApp opt-in from form
    if (formData['wa_opt_in'] === true) {
      leadData.wa_opt_in = true;
      leadData.wa_opt_in_source = 'public_form';
    }

    // 8. Create lead via existing service
    try {
      const lead = await LeadService.createLead(
        leadData as CreateLeadInput,
        undefined,
        supabaseServiceClient
      );

      // 9. Store raw submission
      const { data: submission, error: subError } = await supabaseServiceClient
        .from('admission_form_submissions')
        .insert({
          form_id: form.id,
          lead_id: lead.id,
          institution_id: institutionId,
          submission_data: formData,
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
          utm_source: input.utmSource,
          utm_medium: input.utmMedium,
          utm_campaign: input.utmCampaign,
          referrer_url: input.referrerUrl,
          device_type: input.deviceType,
        })
        .select('id')
        .single();

      if (subError) {
        console.error('[admission/forms] Failed to store submission:', subError);
        // Lead was created successfully, don't fail the whole operation
      }

      return {
        success: true,
        submissionId: submission?.id,
        leadId: lead.id,
      };
    } catch (error: any) {
      // Handle duplicate lead
      if (error?.message?.includes('Duplicate lead') || error?.code === '409') {
        return {
          success: false,
          error: 'An application with this phone number already exists. Our team will contact you.',
          isDuplicate: true,
        };
      }
      console.error('[admission/forms] Submission failed:', error);
      return { success: false, error: 'Failed to submit application. Please try again.' };
    }
  }
}
```

**Step 2: Commit**
```bash
git add lib/services/admission/form-submission-service.ts
git commit -m "feat(admission): add FormSubmissionService for public form → lead pipeline"
```

---

### Task 2.3: Form Analytics Service

**Files:**
- Create: `lib/services/admission/form-analytics-service.ts`

**Step 1: Create the service**

```typescript
// lib/services/admission/form-analytics-service.ts
// Analytics queries for form builder dashboard

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  FormAnalyticsSummary,
  FieldDropOff,
  FormTrafficSource,
  FormDeviceBreakdown,
} from '@/types/admission';

export class FormAnalyticsService {
  static async getFormSummary(formId: string): Promise<FormAnalyticsSummary> {
    const supabase = createClientSupabaseClient();

    // Count events by type
    const { data: events } = await supabase
      .from('admission_form_events')
      .select('event_type')
      .eq('form_id', formId);

    const viewed = (events ?? []).filter((e) => e.event_type === 'form_viewed').length;
    const started = (events ?? []).filter((e) => e.event_type === 'form_started').length;
    const submitted = (events ?? []).filter((e) => e.event_type === 'form_submitted').length;

    // Submissions today and this week
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { count: todayCount } = await supabase
      .from('admission_form_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('form_id', formId)
      .gte('submitted_at', today);

    const { count: weekCount } = await supabase
      .from('admission_form_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('form_id', formId)
      .gte('submitted_at', weekAgo);

    return {
      form_id: formId,
      total_views: viewed,
      total_starts: started,
      total_submissions: submitted,
      view_to_start_rate: viewed > 0 ? Math.round((started / viewed) * 1000) / 10 : 0,
      start_to_submit_rate: started > 0 ? Math.round((submitted / started) * 1000) / 10 : 0,
      overall_conversion_rate: viewed > 0 ? Math.round((submitted / viewed) * 1000) / 10 : 0,
      avg_completion_time_seconds: null, // TODO: compute from session timestamps
      submissions_today: todayCount ?? 0,
      submissions_this_week: weekCount ?? 0,
    };
  }

  static async getFieldDropOff(formId: string): Promise<FieldDropOff[]> {
    const supabase = createClientSupabaseClient();

    // Get field events
    const { data: events } = await supabase
      .from('admission_form_events')
      .select('event_type, field_key')
      .eq('form_id', formId)
      .in('event_type', ['field_focused', 'field_completed']);

    // Get field labels
    const { data: fields } = await supabase
      .from('admission_form_fields')
      .select('field_key, field_label, display_order')
      .eq('form_id', formId)
      .order('display_order');

    if (!fields || !events) return [];

    return fields.map((field) => {
      const focused = events.filter((e) => e.field_key === field.field_key && e.event_type === 'field_focused').length;
      const completed = events.filter((e) => e.field_key === field.field_key && e.event_type === 'field_completed').length;
      return {
        field_key: field.field_key,
        field_label: field.field_label,
        started: focused,
        completed: completed,
        drop_off_rate: focused > 0 ? Math.round(((focused - completed) / focused) * 1000) / 10 : 0,
      };
    });
  }

  static async getTrafficSources(formId: string): Promise<FormTrafficSource[]> {
    const supabase = createClientSupabaseClient();
    const { data: submissions } = await supabase
      .from('admission_form_submissions')
      .select('utm_source')
      .eq('form_id', formId);

    if (!submissions || submissions.length === 0) return [];

    const counts: Record<string, number> = {};
    for (const s of submissions) {
      const source = s.utm_source || 'direct';
      counts[source] = (counts[source] || 0) + 1;
    }

    const total = submissions.length;
    return Object.entries(counts)
      .map(([source, count]) => ({
        source,
        count,
        percentage: Math.round((count / total) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
  }

  static async getDeviceBreakdown(formId: string): Promise<FormDeviceBreakdown[]> {
    const supabase = createClientSupabaseClient();
    const { data: submissions } = await supabase
      .from('admission_form_submissions')
      .select('device_type')
      .eq('form_id', formId);

    if (!submissions || submissions.length === 0) return [];

    const counts: Record<string, number> = {};
    for (const s of submissions) {
      const device = s.device_type || 'unknown';
      counts[device] = (counts[device] || 0) + 1;
    }

    const total = submissions.length;
    return Object.entries(counts)
      .map(([device_type, count]) => ({
        device_type,
        count,
        percentage: Math.round((count / total) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
  }

  static async getSubmissionsOverTime(formId: string, days: number = 30): Promise<{ date: string; count: number }[]> {
    const supabase = createClientSupabaseClient();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: submissions } = await supabase
      .from('admission_form_submissions')
      .select('submitted_at')
      .eq('form_id', formId)
      .gte('submitted_at', since)
      .order('submitted_at');

    if (!submissions) return [];

    const dayCounts: Record<string, number> = {};
    for (const s of submissions) {
      const date = s.submitted_at.split('T')[0];
      dayCounts[date] = (dayCounts[date] || 0) + 1;
    }

    return Object.entries(dayCounts).map(([date, count]) => ({ date, count }));
  }

  // ─── Event Tracking (called from public forms) ──────────────

  static async trackEvent(
    formId: string,
    eventType: string,
    fieldKey: string | null,
    sessionId: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    await supabase.from('admission_form_events').insert({
      form_id: formId,
      event_type: eventType,
      field_key: fieldKey,
      session_id: sessionId,
      metadata,
    });
  }

  // ─── Submission Count (for forms list) ──────────────────────

  static async getSubmissionCounts(formIds: string[]): Promise<Record<string, number>> {
    const supabase = createClientSupabaseClient();
    const counts: Record<string, number> = {};

    for (const formId of formIds) {
      const { count } = await supabase
        .from('admission_form_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('form_id', formId);
      counts[formId] = count ?? 0;
    }

    return counts;
  }

  static async getViewCounts(formIds: string[]): Promise<Record<string, number>> {
    const supabase = createClientSupabaseClient();
    const counts: Record<string, number> = {};

    for (const formId of formIds) {
      const { count } = await supabase
        .from('admission_form_events')
        .select('*', { count: 'exact', head: true })
        .eq('form_id', formId)
        .eq('event_type', 'form_viewed');
      counts[formId] = count ?? 0;
    }

    return counts;
  }
}
```

**Step 2: Commit**
```bash
git add lib/services/admission/form-analytics-service.ts
git commit -m "feat(admission): add FormAnalyticsService with funnel, drop-off, traffic analytics"
```

---

### Task 2.4: React Query Hooks

**Files:**
- Create: `hooks/admission/use-admission-forms.ts`
- Create: `hooks/admission/use-form-analytics.ts`

**Step 1: Create form hooks**

```typescript
// hooks/admission/use-admission-forms.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FormBuilderService } from '@/lib/services/admission/form-builder-service';
import type { CreateAdmissionFormInput } from '@/types/admission';
import { toast } from 'sonner';

export function useAdmissionForms(institutionId?: string) {
  return useQuery({
    queryKey: ['admission-forms', institutionId],
    queryFn: () => FormBuilderService.getForms(institutionId),
    enabled: !!institutionId,
  });
}

export function useAdmissionForm(formId: string | undefined) {
  return useQuery({
    queryKey: ['admission-form', formId],
    queryFn: () => FormBuilderService.getFormById(formId!),
    enabled: !!formId,
  });
}

export function useFormTemplates() {
  return useQuery({
    queryKey: ['admission-form-templates'],
    queryFn: () => FormBuilderService.getTemplates(),
  });
}

export function useFormMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admission-forms'] });
    queryClient.invalidateQueries({ queryKey: ['admission-form'] });
  };

  const createForm = useMutation({
    mutationFn: ({ input, userId }: { input: CreateAdmissionFormInput; userId: string }) =>
      FormBuilderService.createForm(input, userId),
    onSuccess: () => { invalidate(); toast.success('Form created'); },
    onError: (err: any) => toast.error(err?.message || 'Failed to create form'),
  });

  const createFromTemplate = useMutation({
    mutationFn: ({ templateId, input, userId }: { templateId: string; input: CreateAdmissionFormInput; userId: string }) =>
      FormBuilderService.createFormFromTemplate(templateId, input, userId),
    onSuccess: () => { invalidate(); toast.success('Form created from template'); },
    onError: (err: any) => toast.error(err?.message || 'Failed to create form'),
  });

  const updateForm = useMutation({
    mutationFn: ({ formId, updates }: { formId: string; updates: Partial<CreateAdmissionFormInput> & { status?: string } }) =>
      FormBuilderService.updateForm(formId, updates),
    onSuccess: () => { invalidate(); toast.success('Form updated'); },
    onError: (err: any) => toast.error(err?.message || 'Failed to update form'),
  });

  const deleteForm = useMutation({
    mutationFn: (formId: string) => FormBuilderService.deleteForm(formId),
    onSuccess: () => { invalidate(); toast.success('Form deleted'); },
    onError: (err: any) => toast.error(err?.message || 'Failed to delete form'),
  });

  const createSection = useMutation({
    mutationFn: ({ formId, section }: { formId: string; section: Parameters<typeof FormBuilderService.createSection>[1] }) =>
      FormBuilderService.createSection(formId, section),
    onSuccess: () => invalidate(),
  });

  const updateSection = useMutation({
    mutationFn: ({ sectionId, updates }: { sectionId: string; updates: any }) =>
      FormBuilderService.updateSection(sectionId, updates),
    onSuccess: () => invalidate(),
  });

  const deleteSection = useMutation({
    mutationFn: (sectionId: string) => FormBuilderService.deleteSection(sectionId),
    onSuccess: () => invalidate(),
  });

  const createField = useMutation({
    mutationFn: ({ formId, field }: { formId: string; field: any }) =>
      FormBuilderService.createField(formId, field),
    onSuccess: () => invalidate(),
  });

  const updateField = useMutation({
    mutationFn: ({ fieldId, updates }: { fieldId: string; updates: any }) =>
      FormBuilderService.updateField(fieldId, updates),
    onSuccess: () => invalidate(),
  });

  const deleteField = useMutation({
    mutationFn: (fieldId: string) => FormBuilderService.deleteField(fieldId),
    onSuccess: () => invalidate(),
  });

  const reorderFields = useMutation({
    mutationFn: (orders: Parameters<typeof FormBuilderService.reorderFields>[0]) =>
      FormBuilderService.reorderFields(orders),
    onSuccess: () => invalidate(),
  });

  const reorderSections = useMutation({
    mutationFn: (orders: Parameters<typeof FormBuilderService.reorderSections>[0]) =>
      FormBuilderService.reorderSections(orders),
    onSuccess: () => invalidate(),
  });

  return {
    createForm, createFromTemplate, updateForm, deleteForm,
    createSection, updateSection, deleteSection,
    createField, updateField, deleteField,
    reorderFields, reorderSections,
  };
}
```

**Step 2: Create analytics hooks**

```typescript
// hooks/admission/use-form-analytics.ts

import { useQuery } from '@tanstack/react-query';
import { FormAnalyticsService } from '@/lib/services/admission/form-analytics-service';

export function useFormAnalyticsSummary(formId: string | undefined) {
  return useQuery({
    queryKey: ['form-analytics-summary', formId],
    queryFn: () => FormAnalyticsService.getFormSummary(formId!),
    enabled: !!formId,
    refetchInterval: 60_000, // refresh every minute
  });
}

export function useFieldDropOff(formId: string | undefined) {
  return useQuery({
    queryKey: ['form-field-dropoff', formId],
    queryFn: () => FormAnalyticsService.getFieldDropOff(formId!),
    enabled: !!formId,
  });
}

export function useFormTrafficSources(formId: string | undefined) {
  return useQuery({
    queryKey: ['form-traffic-sources', formId],
    queryFn: () => FormAnalyticsService.getTrafficSources(formId!),
    enabled: !!formId,
  });
}

export function useFormDeviceBreakdown(formId: string | undefined) {
  return useQuery({
    queryKey: ['form-device-breakdown', formId],
    queryFn: () => FormAnalyticsService.getDeviceBreakdown(formId!),
    enabled: !!formId,
  });
}

export function useSubmissionsOverTime(formId: string | undefined, days: number = 30) {
  return useQuery({
    queryKey: ['form-submissions-overtime', formId, days],
    queryFn: () => FormAnalyticsService.getSubmissionsOverTime(formId!, days),
    enabled: !!formId,
  });
}

export function useFormSubmissionCounts(formIds: string[]) {
  return useQuery({
    queryKey: ['form-submission-counts', formIds],
    queryFn: () => FormAnalyticsService.getSubmissionCounts(formIds),
    enabled: formIds.length > 0,
  });
}

export function useFormViewCounts(formIds: string[]) {
  return useQuery({
    queryKey: ['form-view-counts', formIds],
    queryFn: () => FormAnalyticsService.getViewCounts(formIds),
    enabled: formIds.length > 0,
  });
}
```

**Step 3: Commit**
```bash
git add hooks/admission/use-admission-forms.ts hooks/admission/use-form-analytics.ts
git commit -m "feat(admission): add React Query hooks for form builder and analytics"
```

---

## Phase 3: Public API Routes

### Task 3.1: Public Form Schema API

**Files:**
- Create: `app/api/public/forms/[slug]/route.ts`

**Step 1: Create the route**

```typescript
// app/api/public/forms/[slug]/route.ts
// GET — returns published form schema for public rendering (no auth required)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Use service role client — public forms bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch published form
    const { data: form, error: formError } = await supabase
      .from('admission_forms')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .eq('is_active', true)
      .single();

    if (formError || !form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    // Check scheduling
    const now = new Date();
    if (form.starts_at && new Date(form.starts_at) > now) {
      return NextResponse.json({ error: 'Form is not yet active' }, { status: 404 });
    }
    if (form.expires_at && new Date(form.expires_at) < now) {
      return NextResponse.json({ error: 'Form has expired' }, { status: 410 });
    }

    // Check max submissions
    if (form.max_submissions) {
      const { count } = await supabase
        .from('admission_form_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('form_id', form.id);
      if ((count ?? 0) >= form.max_submissions) {
        return NextResponse.json({ error: 'Form is no longer accepting submissions' }, { status: 410 });
      }
    }

    // Fetch sections + fields
    const { data: sections } = await supabase
      .from('admission_form_sections')
      .select('*')
      .eq('form_id', form.id)
      .order('display_order');

    const { data: fields } = await supabase
      .from('admission_form_fields')
      .select('*')
      .eq('form_id', form.id)
      .order('display_order');

    // Fetch programs for institution_program_selector fields
    let programs: any[] = [];
    const institutionIds = form.institution_ids?.length > 0
      ? form.institution_ids
      : [form.institution_id];

    const { data: programData } = await supabase
      .from('programs')
      .select('id, name, institution_id, institutions(name)')
      .in('institution_id', institutionIds)
      .eq('is_active', true)
      .order('name');

    if (programData) {
      // Filter by program_ids if specified
      programs = form.program_ids?.length > 0
        ? programData.filter((p: any) => form.program_ids.includes(p.id))
        : programData;
    }

    // Fetch institution names
    const { data: institutions } = await supabase
      .from('institutions')
      .select('id, name, logo_url')
      .in('id', institutionIds);

    // Group fields by section
    const sectionsWithFields = (sections ?? []).map((s: any) => ({
      ...s,
      fields: (fields ?? []).filter((f: any) => f.section_id === s.id),
    }));

    // Return public form schema (strip internal fields)
    return NextResponse.json({
      id: form.id,
      name: form.name,
      slug: form.slug,
      description: form.description,
      logo_url: form.logo_url,
      banner_url: form.banner_url,
      primary_color: form.primary_color,
      thank_you_title: form.thank_you_title,
      thank_you_message: form.thank_you_message,
      sections: sectionsWithFields,
      institutions: institutions ?? [],
      programs,
    });
  } catch (error: any) {
    console.error('[public/forms] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Step 2: Commit**
```bash
git add app/api/public/forms/[slug]/route.ts
git commit -m "feat(admission): add public form schema API at /api/public/forms/[slug]"
```

---

### Task 3.2: Public Form Submission API

**Files:**
- Create: `app/api/public/forms/[slug]/submit/route.ts`

**Step 1: Create the submission route**

```typescript
// app/api/public/forms/[slug]/submit/route.ts
// POST — processes public form submission and creates lead

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FormSubmissionService } from '@/lib/services/admission/form-submission-service';

export const dynamic = 'force-dynamic';

// Simple in-memory rate limiting (per IP, 5 submissions per hour)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { formData, honeypot, sessionId, ...meta } = body;

    // Honeypot check (spam bots fill invisible fields)
    if (honeypot) {
      // Silently accept but don't process — makes bot think it succeeded
      return NextResponse.json({ success: true, leadId: null });
    }

    if (!formData || typeof formData !== 'object') {
      return NextResponse.json({ error: 'Invalid submission data' }, { status: 400 });
    }

    // Service role client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch form with schema
    const { data: form, error: formError } = await supabase
      .from('admission_forms')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .eq('is_active', true)
      .single();

    if (formError || !form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    // Fetch sections + fields
    const { data: sections } = await supabase
      .from('admission_form_sections')
      .select('*')
      .eq('form_id', form.id)
      .order('display_order');

    const { data: fields } = await supabase
      .from('admission_form_fields')
      .select('*')
      .eq('form_id', form.id)
      .order('display_order');

    const sectionsWithFields = (sections ?? []).map((s: any) => ({
      ...s,
      fields: (fields ?? []).filter((f: any) => f.section_id === s.id),
    }));

    const formWithSchema = { ...form, sections: sectionsWithFields };

    // Detect device type
    const userAgent = request.headers.get('user-agent') || '';
    const deviceType = /mobile/i.test(userAgent) ? 'mobile' : /tablet/i.test(userAgent) ? 'tablet' : 'desktop';

    // Process submission
    const result = await FormSubmissionService.processSubmission(
      formWithSchema as any,
      {
        formData,
        ipAddress: ip,
        userAgent,
        utmSource: meta.utmSource,
        utmMedium: meta.utmMedium,
        utmCampaign: meta.utmCampaign,
        referrerUrl: meta.referrerUrl,
        deviceType,
      },
      supabase
    );

    // Track form_submitted event
    if (result.success && sessionId) {
      await supabase.from('admission_form_events').insert({
        form_id: form.id,
        event_type: 'form_submitted',
        session_id: sessionId,
        metadata: { deviceType, ip },
      });
    }

    if (!result.success) {
      const status = result.isDuplicate ? 409 : 422;
      return NextResponse.json({ error: result.error, isDuplicate: result.isDuplicate }, { status });
    }

    return NextResponse.json({
      success: true,
      leadId: result.leadId,
      submissionId: result.submissionId,
    }, { status: 201 });

  } catch (error: any) {
    console.error('[public/forms] Submit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Step 2: Commit**
```bash
git add app/api/public/forms/[slug]/submit/route.ts
git commit -m "feat(admission): add public form submission API with rate limiting and honeypot"
```

---

### Task 3.3: Analytics Events API

**Files:**
- Create: `app/api/public/forms/events/route.ts`

**Step 1: Create the events route**

```typescript
// app/api/public/forms/events/route.ts
// POST — tracks form analytics events (views, field interactions, abandonment)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const VALID_EVENTS = ['form_viewed', 'form_started', 'field_focused', 'field_completed', 'form_abandoned'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { formId, eventType, fieldKey, sessionId, metadata } = body;

    if (!formId || !eventType || !sessionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!VALID_EVENTS.includes(eventType)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabase.from('admission_form_events').insert({
      form_id: formId,
      event_type: eventType,
      field_key: fieldKey || null,
      session_id: sessionId,
      metadata: metadata || {},
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[public/forms/events] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Step 2: Commit**
```bash
git add app/api/public/forms/events/route.ts
git commit -m "feat(admission): add public form analytics events tracking API"
```

---

## Phase 4: Public Form UI (`/apply/[slug]`)

### Task 4.1: Public Form Page

**Files:**
- Create: `app/apply/[slug]/page.tsx`
- Create: `app/apply/[slug]/thank-you/page.tsx`
- Create: `app/apply/layout.tsx`

**Step 1: Create the public layout (no sidebar, no auth)**

```typescript
// app/apply/layout.tsx
// Minimal layout for public forms — no sidebar, no auth required

export const metadata = {
  title: 'Apply - JKKN',
  description: 'Admission application form',
};

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {children}
    </div>
  );
}
```

**Step 2: Create the public form page**

This is a large component — create `app/apply/[slug]/page.tsx` as a server component that fetches form schema and renders a client component.

```typescript
// app/apply/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import PublicFormClient from './_components/public-form-client';

export const dynamic = 'force-dynamic';

export default async function PublicFormPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  // Fetch form via internal API or directly
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: form } = await supabase
    .from('admission_forms')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .eq('is_active', true)
    .single();

  if (!form) notFound();

  // Check scheduling
  const now = new Date();
  if (form.starts_at && new Date(form.starts_at) > now) notFound();
  if (form.expires_at && new Date(form.expires_at) < now) notFound();

  // Fetch sections + fields
  const { data: sections } = await supabase
    .from('admission_form_sections')
    .select('*')
    .eq('form_id', form.id)
    .order('display_order');

  const { data: fields } = await supabase
    .from('admission_form_fields')
    .select('*')
    .eq('form_id', form.id)
    .order('display_order');

  // Fetch programs and institutions
  const institutionIds = form.institution_ids?.length > 0 ? form.institution_ids : [form.institution_id];

  const { data: programs } = await supabase
    .from('programs')
    .select('id, name, institution_id')
    .in('institution_id', institutionIds)
    .eq('is_active', true)
    .order('name');

  const { data: institutions } = await supabase
    .from('institutions')
    .select('id, name, logo_url')
    .in('id', institutionIds);

  const sectionsWithFields = (sections ?? []).map((s: any) => ({
    ...s,
    fields: (fields ?? []).filter((f: any) => f.section_id === s.id),
  }));

  const filteredPrograms = form.program_ids?.length > 0
    ? (programs ?? []).filter((p: any) => form.program_ids.includes(p.id))
    : programs ?? [];

  return (
    <PublicFormClient
      form={{ ...form, sections: sectionsWithFields }}
      institutions={institutions ?? []}
      programs={filteredPrograms}
      utmSource={query.utm_source}
      utmMedium={query.utm_medium}
      utmCampaign={query.utm_campaign}
    />
  );
}
```

**Step 3: Create the thank-you page**

```typescript
// app/apply/[slug]/thank-you/page.tsx
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

export default async function ThankYouPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: form } = await supabase
    .from('admission_forms')
    .select('name, slug, logo_url, primary_color, thank_you_title, thank_you_message')
    .eq('slug', slug)
    .single();

  if (!form) notFound();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {form.logo_url && (
          <img src={form.logo_url} alt="Logo" className="h-16 mx-auto" />
        )}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
          style={{ backgroundColor: `${form.primary_color}20` }}
        >
          <CheckCircle2 className="w-10 h-10" style={{ color: form.primary_color }} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {form.thank_you_title}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {form.thank_you_message}
        </p>
        <p className="text-sm text-gray-500">
          Our admission team will contact you shortly via WhatsApp or phone call.
        </p>
      </div>
    </div>
  );
}
```

**Step 4: Commit**
```bash
git add app/apply/layout.tsx app/apply/[slug]/page.tsx app/apply/[slug]/thank-you/page.tsx
git commit -m "feat(admission): add public form page and thank-you page at /apply/[slug]"
```

---

### Task 4.2: Public Form Client Component (Dynamic Renderer)

**Files:**
- Create: `app/apply/[slug]/_components/public-form-client.tsx`

This is the core public-facing form renderer — renders fields dynamically from the schema, handles conditional logic, validates with Zod, and submits to the API.

**Step 1: Create the component**

> **Note to implementer:** This is a large component (~300 lines). It should:
> 1. Generate a `sessionId` on mount (uuid or crypto.randomUUID())
> 2. Track `form_viewed` event on mount
> 3. Build a dynamic Zod schema from the form fields (follow `service-requests/_components/dynamic-request-form.tsx:buildDynamicSchema()` pattern)
> 4. Use `react-hook-form` with `zodResolver`
> 5. Render sections with `FormSection` wrappers
> 6. Render each field via a `DynamicField` switch component based on `field_type`
> 7. Handle conditional logic: watch dependent field values, show/hide fields based on `field.condition`
> 8. For `institution_program_selector`: render institution dropdown → program dropdown (cascading)
> 9. Include an invisible honeypot field `<input name="company_website" style={{ display: 'none' }} />`
> 10. On field focus/blur, track `field_focused`/`field_completed` events
> 11. On submit, POST to `/api/public/forms/${slug}/submit`
> 12. On success, redirect to `/apply/${slug}/thank-you`
> 13. Style with the form's `primary_color` for buttons and accents
> 14. Mobile-responsive layout (single column on mobile, comfortable spacing)
> 15. Show form header with logo, banner, title, description

Key patterns to follow from `service-requests/_components/dynamic-request-form.tsx`:
- `buildDynamicSchema(fields)` — creates Zod schema dynamically from field config
- `getCascadingOptions(field, watchedValues)` — handles dependent dropdowns
- Field type rendering switch: text → Input, select → Select, date → DatePicker, etc.

**Step 2: Commit**
```bash
git add app/apply/[slug]/_components/public-form-client.tsx
git commit -m "feat(admission): add dynamic form renderer for public admission forms"
```

---

## Phase 5: Admin Form Builder UI

### Task 5.1: Forms List Page

**Files:**
- Create: `app/(routes)/admission/settings/forms/page.tsx`
- Create: `app/(routes)/admission/settings/forms/_components/forms-data-table.tsx`
- Create: `app/(routes)/admission/settings/forms/_components/columns.tsx`
- Create: `app/(routes)/admission/settings/forms/_components/create-form-dialog.tsx`

> **Note:** Follow the established pattern from `app/(routes)/admission/settings/sources/page.tsx` for page layout, breadcrumbs, and data table structure.

**Key features:**
- Data table showing: Name, Status (badge), Submissions count, Views count, Created date, Actions
- Actions: Edit (→ builder), Analytics, Copy Link, Delete
- "Create Form" button opens dialog with: Name, slug (auto-generated), template selector
- Status badges: Draft (gray), Published (green), Archived (red)
- Copy link button copies `${window.location.origin}/apply/${slug}` to clipboard

**Step 1: Create all files following the sources page pattern**

**Step 2: Commit**
```bash
git add app/(routes)/admission/settings/forms/
git commit -m "feat(admission): add forms list page with data table and create dialog"
```

---

### Task 5.2: Form Builder Canvas (Drag-and-Drop)

**Files:**
- Create: `app/(routes)/admission/settings/forms/[id]/page.tsx`
- Create: `app/(routes)/admission/settings/forms/[id]/_components/form-builder-canvas.tsx`
- Create: `app/(routes)/admission/settings/forms/[id]/_components/field-palette.tsx`
- Create: `app/(routes)/admission/settings/forms/[id]/_components/field-config-panel.tsx`
- Create: `app/(routes)/admission/settings/forms/[id]/_components/section-block.tsx`
- Create: `app/(routes)/admission/settings/forms/[id]/_components/field-block.tsx`
- Create: `app/(routes)/admission/settings/forms/[id]/_components/conditional-logic-editor.tsx`
- Create: `app/(routes)/admission/settings/forms/[id]/_components/form-settings-panel.tsx`
- Create: `app/(routes)/admission/settings/forms/[id]/_components/form-preview-dialog.tsx`
- Create: `app/(routes)/admission/settings/forms/[id]/_components/institution-program-picker.tsx`

**Key implementation details:**

**Page layout (3-column):**
```
┌─ Left Sidebar (200px) ─┐ ┌─ Canvas (flex-1) ─┐ ┌─ Right Panel (320px) ─┐
│ Field Palette           │ │ Sections & Fields  │ │ Field Config / Settings│
│ (draggable field types) │ │ (drop targets)     │ │ (context-dependent)    │
└─────────────────────────┘ └────────────────────┘ └────────────────────────┘
```

**Drag-and-drop using @dnd-kit:**
- `@dnd-kit/core` DndContext wraps the entire builder
- `@dnd-kit/sortable` SortableContext for field reordering within sections
- Field Palette items are `draggable` — dragging from palette creates a new field
- Field blocks within sections are `sortable` — dragging reorders
- Cross-section dragging: move fields between sections

**Field Palette items:**
```typescript
const FIELD_TYPES = [
  { type: 'text', label: 'Text Input', icon: Type },
  { type: 'number', label: 'Number', icon: Hash },
  { type: 'phone', label: 'Phone', icon: Phone },
  { type: 'email', label: 'Email', icon: Mail },
  { type: 'select', label: 'Dropdown', icon: ChevronDown },
  { type: 'multi_select', label: 'Multi-Select', icon: CheckSquare },
  { type: 'date', label: 'Date Picker', icon: Calendar },
  { type: 'textarea', label: 'Text Area', icon: AlignLeft },
  { type: 'file', label: 'File Upload', icon: Upload },
  { type: 'checkbox', label: 'Checkbox', icon: CheckCircle },
  { type: 'radio', label: 'Radio Group', icon: Circle },
  { type: 'institution_program_selector', label: 'Institution & Program', icon: GraduationCap },
];
```

**Field Config Panel (right sidebar):**
When a field is selected on the canvas, the right panel shows:
- Field label (editable)
- Field key (auto-generated, editable)
- Placeholder text
- Help text
- Required toggle
- Lead field mapping dropdown (maps to admission_leads columns)
- Validation settings (min/max length, min/max value, pattern)
- Options editor (for select/radio/checkbox — add/remove/reorder options)
- Conditional logic editor (which field to depend on, operator, value)

**Form Settings Panel (tab in right sidebar):**
- Form name, slug, description
- Institution selector (multi-select from user's accessible institutions)
- Program selector (auto-filtered by selected institutions)
- Branding: logo upload, banner upload, primary color picker
- Thank-you page: custom title and message
- Settings: allow duplicates, auto WhatsApp, WA template selector
- Scheduling: start date, expiry date, max submissions

**Bottom action bar:**
- Save Draft button
- Preview button (opens FormPreviewDialog — renders the form as students will see it)
- Publish button (changes status to 'published')
- Copy Link button (only visible when published)

**Step 1: Create all component files**

**Step 2: Commit**
```bash
git add app/(routes)/admission/settings/forms/[id]/
git commit -m "feat(admission): add drag-and-drop form builder with field palette and config panel"
```

---

### Task 5.3: Form Analytics Page

**Files:**
- Create: `app/(routes)/admission/settings/forms/[id]/analytics/page.tsx`

**Key features:**
- Conversion funnel visualization (viewed → started → submitted)
- Field drop-off table with color-coded severity (green < 5%, yellow 5-15%, red > 15%)
- Submissions over time line chart
- Traffic sources bar chart (UTM breakdown)
- Device breakdown pie chart
- Key metrics cards: conversion rate, avg completion time, submissions today/week

Follow chart patterns from existing analytics pages in the codebase.

**Step 1: Create the analytics page**

**Step 2: Commit**
```bash
git add app/(routes)/admission/settings/forms/[id]/analytics/
git commit -m "feat(admission): add form analytics dashboard with funnel and drop-off analysis"
```

---

## Phase 6: Sidebar Navigation & Templates

### Task 6.1: Add Forms to Sidebar Menu

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

**Step 1: Add route permission mapping**

At `lib/sidebarMenuLink.ts` around line 441 (after the `sources` entry), add:

```typescript
'/admission/settings/forms': 'admission.settings.forms.view',
'/admission/settings/forms/new': 'admission.settings.forms.manage',
```

**Step 2: Add sidebar submenu item**

At `lib/sidebarMenuLink.ts` around line 1087 (inside the admission Settings submenus array, after the "Lead Sources" entry), add:

```typescript
{
  href: '/admission/settings/forms',
  label: 'Form Builder',
  active: pathname.startsWith('/admission/settings/forms')
},
```

**Step 3: Commit**
```bash
git add lib/sidebarMenuLink.ts
git commit -m "feat(admission): add Form Builder to admission settings sidebar menu"
```

---

### Task 6.2: Seed Pre-Built Templates

**Files:**
- Create: `lib/services/admission/form-templates-seed.ts`

**Step 1: Create template seed data**

This file exports the 4 pre-built form templates as data that can be seeded to `admission_form_templates` table:

```typescript
// lib/services/admission/form-templates-seed.ts
// Pre-built admission form templates for quick start

export const ADMISSION_FORM_TEMPLATES = [
  {
    name: 'UG Admission Form',
    description: 'Standard undergraduate admission enquiry form with personal, academic, and parent details.',
    form_type: 'ug_admission',
    is_system: true,
    template_data: {
      sections: [
        {
          title: 'Personal Information',
          fields: [
            { field_key: 'first_name', field_label: 'Full Name', field_type: 'text', is_required: true, lead_field_map: 'first_name', placeholder: 'Enter your full name', display_order: 0 },
            { field_key: 'phone', field_label: 'Phone Number', field_type: 'phone', is_required: true, lead_field_map: 'phone', placeholder: '10-digit mobile number', help_text: 'We will contact you on this number', display_order: 1 },
            { field_key: 'email', field_label: 'Email Address', field_type: 'email', is_required: false, lead_field_map: 'email', placeholder: 'your.email@example.com', display_order: 2 },
            { field_key: 'gender', field_label: 'Gender', field_type: 'select', is_required: false, lead_field_map: 'gender', options: [{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' }, { label: 'Other', value: 'other' }], display_order: 3 },
            { field_key: 'date_of_birth', field_label: 'Date of Birth', field_type: 'date', is_required: false, lead_field_map: 'date_of_birth', display_order: 4 },
          ],
        },
        {
          title: 'Parent / Guardian Details',
          fields: [
            { field_key: 'parent_name', field_label: 'Parent/Guardian Name', field_type: 'text', is_required: true, lead_field_map: 'parent_name', placeholder: 'Father/Mother/Guardian name', display_order: 0 },
            { field_key: 'parent_phone', field_label: 'Parent Phone', field_type: 'phone', is_required: true, lead_field_map: 'parent_phone', placeholder: '10-digit mobile number', display_order: 1 },
          ],
        },
        {
          title: 'Academic Interest',
          fields: [
            { field_key: 'institution_program', field_label: 'Preferred Institution & Program', field_type: 'institution_program_selector', is_required: true, display_order: 0 },
            { field_key: 'twelfth_marks', field_label: '12th Standard Marks (%)', field_type: 'number', is_required: false, min_value: 0, max_value: 100, placeholder: 'Enter percentage', display_order: 1 },
            { field_key: 'district', field_label: 'District', field_type: 'text', is_required: false, lead_field_map: 'district', placeholder: 'Your district', display_order: 2 },
            { field_key: 'state', field_label: 'State', field_type: 'select', is_required: false, lead_field_map: 'state', options: [
              { label: 'Tamil Nadu', value: 'Tamil Nadu' }, { label: 'Kerala', value: 'Kerala' },
              { label: 'Karnataka', value: 'Karnataka' }, { label: 'Andhra Pradesh', value: 'Andhra Pradesh' },
              { label: 'Telangana', value: 'Telangana' }, { label: 'Maharashtra', value: 'Maharashtra' },
              { label: 'Other', value: 'Other' },
            ], display_order: 3 },
          ],
        },
      ],
    },
  },
  {
    name: 'PG Admission Form',
    description: 'Postgraduate admission enquiry form with UG degree, CGPA, and work experience fields.',
    form_type: 'pg_admission',
    is_system: true,
    template_data: {
      sections: [
        {
          title: 'Personal Information',
          fields: [
            { field_key: 'first_name', field_label: 'Full Name', field_type: 'text', is_required: true, lead_field_map: 'first_name', display_order: 0 },
            { field_key: 'phone', field_label: 'Phone Number', field_type: 'phone', is_required: true, lead_field_map: 'phone', display_order: 1 },
            { field_key: 'email', field_label: 'Email Address', field_type: 'email', is_required: true, lead_field_map: 'email', display_order: 2 },
          ],
        },
        {
          title: 'Academic Background',
          fields: [
            { field_key: 'ug_degree', field_label: 'UG Degree', field_type: 'text', is_required: true, placeholder: 'e.g., B.Tech CSE, BBA', display_order: 0 },
            { field_key: 'ug_cgpa', field_label: 'UG CGPA / Percentage', field_type: 'number', is_required: false, min_value: 0, max_value: 100, display_order: 1 },
            { field_key: 'work_experience', field_label: 'Work Experience (years)', field_type: 'number', is_required: false, min_value: 0, max_value: 40, display_order: 2 },
            { field_key: 'institution_program', field_label: 'Preferred PG Program', field_type: 'institution_program_selector', is_required: true, display_order: 3 },
          ],
        },
      ],
    },
  },
  {
    name: 'Hostel Enquiry Form',
    description: 'Hostel accommodation enquiry form for prospective and current students.',
    form_type: 'hostel_enquiry',
    is_system: true,
    template_data: {
      sections: [
        {
          title: 'Student Details',
          fields: [
            { field_key: 'first_name', field_label: 'Full Name', field_type: 'text', is_required: true, lead_field_map: 'first_name', display_order: 0 },
            { field_key: 'phone', field_label: 'Phone Number', field_type: 'phone', is_required: true, lead_field_map: 'phone', display_order: 1 },
            { field_key: 'institution_program', field_label: 'Institution & Program', field_type: 'institution_program_selector', is_required: true, display_order: 2 },
          ],
        },
        {
          title: 'Hostel Preferences',
          fields: [
            { field_key: 'room_type', field_label: 'Room Type', field_type: 'select', is_required: true, options: [
              { label: 'Single Room', value: 'single' }, { label: 'Double Sharing', value: 'double' },
              { label: 'Triple Sharing', value: 'triple' }, { label: 'Dormitory', value: 'dormitory' },
            ], display_order: 0 },
            { field_key: 'food_preference', field_label: 'Food Preference', field_type: 'select', is_required: true, options: [
              { label: 'Vegetarian', value: 'veg' }, { label: 'Non-Vegetarian', value: 'non_veg' },
            ], display_order: 1 },
            { field_key: 'special_needs', field_label: 'Special Requirements', field_type: 'textarea', is_required: false, placeholder: 'Any medical or dietary requirements', display_order: 2 },
          ],
        },
      ],
    },
  },
  {
    name: 'Scholarship Application',
    description: 'Scholarship application form with academic achievements and financial information.',
    form_type: 'scholarship',
    is_system: true,
    template_data: {
      sections: [
        {
          title: 'Personal Details',
          fields: [
            { field_key: 'first_name', field_label: 'Full Name', field_type: 'text', is_required: true, lead_field_map: 'first_name', display_order: 0 },
            { field_key: 'phone', field_label: 'Phone Number', field_type: 'phone', is_required: true, lead_field_map: 'phone', display_order: 1 },
            { field_key: 'email', field_label: 'Email Address', field_type: 'email', is_required: true, lead_field_map: 'email', display_order: 2 },
            { field_key: 'institution_program', field_label: 'Applied Program', field_type: 'institution_program_selector', is_required: true, display_order: 3 },
          ],
        },
        {
          title: 'Academic & Financial',
          fields: [
            { field_key: 'twelfth_marks', field_label: '12th Standard Marks (%)', field_type: 'number', is_required: true, min_value: 0, max_value: 100, display_order: 0 },
            { field_key: 'neet_score', field_label: 'NEET Score', field_type: 'number', is_required: false, display_order: 1, condition: { field: 'institution_program', op: 'program_category', value: 'medical' } },
            { field_key: 'family_income', field_label: 'Annual Family Income (₹)', field_type: 'select', is_required: true, options: [
              { label: 'Below ₹1 Lakh', value: 'below_1l' }, { label: '₹1-3 Lakhs', value: '1l_3l' },
              { label: '₹3-5 Lakhs', value: '3l_5l' }, { label: '₹5-10 Lakhs', value: '5l_10l' },
              { label: 'Above ₹10 Lakhs', value: 'above_10l' },
            ], display_order: 2 },
            { field_key: 'achievements', field_label: 'Achievements & Awards', field_type: 'textarea', is_required: false, placeholder: 'List academic achievements, sports awards, extracurricular activities', display_order: 3 },
            { field_key: 'income_proof', field_label: 'Income Certificate (PDF)', field_type: 'file', is_required: false, help_text: 'Upload scanned income certificate if available', display_order: 4 },
          ],
        },
      ],
    },
  },
];
```

**Step 2: Seed templates to database**

Run this SQL in Supabase Dashboard or create a one-time seed script:

```sql
-- Run after the template data is defined
-- The application can also seed on first access via FormBuilderService
```

Or add a seeding check in the `getTemplates()` method that auto-seeds if the table is empty.

**Step 3: Commit**
```bash
git add lib/services/admission/form-templates-seed.ts
git commit -m "feat(admission): add 4 pre-built form templates (UG, PG, Hostel, Scholarship)"
```

---

## Phase 7: Source Integration & Polish

### Task 7.1: Update Source Tracking for Form Attribution

**Files:**
- Modify: `lib/services/admission/source-tracking-service.ts`
- Modify: `app/(routes)/admission/settings/sources/_components/sources-data-table.tsx`
- Modify: `app/(routes)/admission/leads/new/page.tsx` (add 'admission_form' to LEAD_SOURCES)

**Key changes:**
1. Add `'admission_form'` to the lead sources dropdown in the new lead form
2. Update `SourceTrackingService.getSourceBreakdown()` to show form-level breakdown under 'admission_form' source
3. Update the sources data table to render form names for 'admission_form' leads

**Step 1: Update leads/new/page.tsx LEAD_SOURCES array** (~line 60-72)

Add `{ value: 'admission_form', label: 'Admission Form' }` to the array.

**Step 2: Update source tracking service** to include form name in breakdown

**Step 3: Commit**
```bash
git add lib/services/admission/source-tracking-service.ts app/(routes)/admission/settings/sources/ app/(routes)/admission/leads/new/page.tsx
git commit -m "feat(admission): integrate admission_form source into tracking and lead creation UI"
```

---

### Task 7.2: Add Lead Source Filter Badge for Form Leads

**Files:**
- Modify: `app/(routes)/admission/leads/_components/columns.tsx`

**Key change:** In the source column renderer, add an `admission_form` badge/icon distinct from generic `website`.

**Step 1: Update the source badge rendering**

**Step 2: Commit**
```bash
git add app/(routes)/admission/leads/_components/columns.tsx
git commit -m "feat(admission): add admission_form badge to leads data table source column"
```

---

## Implementation Order & Dependencies

```
Phase 1 (Database) → Phase 2 (Services) → Phase 3 (Public API) → Phase 4 (Public UI)
                                        → Phase 5 (Admin UI)   → Phase 6 (Nav + Templates)
                                                                → Phase 7 (Integration)
```

Phases 4 and 5 can be built in parallel once Phase 3 is complete.
Phase 6 and 7 can be built in parallel once Phase 5 is complete.

---

## Testing Checklist

After implementation, verify:

- [ ] Admin can create a form from template
- [ ] Admin can add/remove/reorder fields via drag-and-drop
- [ ] Admin can configure field validation and conditional logic
- [ ] Admin can select multiple institutions and their programs
- [ ] Admin can set branding (logo, color, thank-you message)
- [ ] Admin can publish/unpublish/archive forms
- [ ] Public form loads at `/apply/[slug]` without auth
- [ ] Public form renders all field types correctly
- [ ] Conditional fields show/hide based on selections
- [ ] Institution/program selector cascades correctly
- [ ] Phone validation enforces Indian mobile format
- [ ] Form submission creates a lead in `admission_leads`
- [ ] Lead appears in leads list with source `admission_form`
- [ ] Duplicate phone submission returns friendly error
- [ ] Thank-you page shows after successful submission
- [ ] Auto WhatsApp triggers on submission (if enabled)
- [ ] Analytics events tracked (viewed, started, field interactions, submitted)
- [ ] Analytics dashboard shows funnel, drop-off, traffic, devices
- [ ] Rate limiting prevents spam (5 per IP per hour)
- [ ] Honeypot catches bot submissions silently
- [ ] Form respects scheduling (starts_at, expires_at)
- [ ] Form respects max_submissions cap
- [ ] Copy link works and URL is correct
- [ ] Form builder appears in sidebar under Admission → Settings → Form Builder
- [ ] Mobile responsive on both admin builder and public form
