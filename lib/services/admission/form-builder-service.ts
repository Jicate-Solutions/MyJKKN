// lib/services/admission/form-builder-service.ts
// CRUD operations for admission forms, sections, and fields
// Added: 2026-04-08

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AdmissionForm,
  AdmissionFormSection,
  AdmissionFormField,
  AdmissionFormTemplate,
  CreateAdmissionFormInput,
  FormFieldCondition,
  LeadSource,
} from '@/types/admission';

export class FormBuilderService {
  // ─── Forms CRUD ─────────────────────────────────────────────

  /**
   * Fetch forms scoped to one or more institutions.
   *
   * - Pass a single string for single-institution admin contexts.
   * - Pass an array for super admins who can see forms across multiple orgs.
   * - Pass `undefined` to let RLS alone decide (super admin only — returns all
   *   forms the user's role allows).
   */
  static async getForms(
    institutionIdOrIds?: string | string[]
  ): Promise<AdmissionForm[]> {
    const supabase = createClientSupabaseClient();
    let query = (supabase as any)
      .from('admission_forms')
      .select('*')
      .order('created_at', { ascending: false });

    if (Array.isArray(institutionIdOrIds)) {
      if (institutionIdOrIds.length > 0) {
        query = query.in('institution_id', institutionIdOrIds);
      }
    } else if (typeof institutionIdOrIds === 'string') {
      query = query.eq('institution_id', institutionIdOrIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as AdmissionForm[];
  }

  static async getFormById(
    formId: string
  ): Promise<AdmissionForm & { sections: (AdmissionFormSection & { fields: AdmissionFormField[] })[] }> {
    const supabase = createClientSupabaseClient();

    const { data: form, error: formError } = await (supabase as any)
      .from('admission_forms')
      .select('*')
      .eq('id', formId)
      .single();
    if (formError) throw formError;

    const { data: sections, error: sectionsError } = await (supabase as any)
      .from('admission_form_sections')
      .select('*')
      .eq('form_id', formId)
      .order('display_order', { ascending: true });
    if (sectionsError) throw sectionsError;

    const { data: fields, error: fieldsError } = await (supabase as any)
      .from('admission_form_fields')
      .select('*')
      .eq('form_id', formId)
      .order('display_order', { ascending: true });
    if (fieldsError) throw fieldsError;

    const sectionsWithFields = (sections ?? []).map((section: AdmissionFormSection) => ({
      ...section,
      fields: (fields ?? []).filter((f: AdmissionFormField) => f.section_id === section.id),
    }));

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
    const { data, error } = await (supabase as any)
      .from('admission_forms')
      .insert({ ...input, created_by: userId, status: 'draft' })
      .select()
      .single();
    if (error) throw error;
    return data as AdmissionForm;
  }

  static async updateForm(
    formId: string,
    updates: Partial<CreateAdmissionFormInput> & { status?: string }
  ): Promise<AdmissionForm> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
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
    const { error } = await (supabase as any).from('admission_forms').delete().eq('id', formId);
    if (error) throw error;
  }

  /**
   * Deep-clone an existing form including all sections and fields.
   *
   * Use case: ship a parallel form for a new channel (e.g. a WhatsApp-source
   * form mirroring the website form's exact schema). The clone:
   *   - takes a fresh name/slug from the caller (slug uniqueness is enforced
   *     by the DB index — caller should call isSlugAvailable first)
   *   - copies every styling/branding field (logo, banner, primary_color,
   *     thank-you copy, etc.)
   *   - lets caller override lead_source so the cloned form attributes
   *     submissions to a different channel
   *   - is always created in 'draft' status — caller reviews before publish
   *   - re-creates sections/fields with fresh IDs and remaps section_id on
   *     fields. Orphan fields (no section_id on source) stay orphan.
   */
  static async duplicateForm(
    sourceFormId: string,
    overrides: {
      name: string;
      slug: string;
      lead_source?: LeadSource;
      description?: string | null;
    },
    userId: string
  ): Promise<AdmissionForm> {
    const source = await this.getFormById(sourceFormId);

    const input: CreateAdmissionFormInput = {
      institution_id: source.institution_id,
      name: overrides.name,
      slug: overrides.slug,
      description:
        overrides.description !== undefined ? overrides.description : source.description,
      form_type: source.form_type,
      institution_ids: source.institution_ids ?? [],
      program_ids: source.program_ids ?? [],
      logo_url: source.logo_url,
      banner_url: source.banner_url,
      primary_color: source.primary_color,
      thank_you_title: source.thank_you_title,
      thank_you_message: source.thank_you_message,
      allow_duplicate: source.allow_duplicate,
      auto_whatsapp: source.auto_whatsapp,
      wa_template_id: source.wa_template_id,
      max_submissions: source.max_submissions,
      starts_at: source.starts_at,
      expires_at: source.expires_at,
      lead_source: overrides.lead_source ?? source.lead_source,
    };

    const newForm = await this.createForm(input, userId);

    // Walk sections in order; the synthetic 'unsectioned' bucket returned by
    // getFormById has id === 'unsectioned' and contains fields whose original
    // section_id was null — we re-insert those with section_id = null on the
    // new form rather than creating a section row for them.
    const sourceSections = source.sections ?? [];
    for (const section of sourceSections) {
      const sectionFields = section.fields ?? [];
      let newSectionId: string | null = null;

      if (section.id !== 'unsectioned') {
        const newSection = await this.createSection(newForm.id, {
          title: section.title,
          description: section.description ?? undefined,
          display_order: section.display_order,
          is_collapsible: section.is_collapsible,
          condition: section.condition,
        });
        newSectionId = newSection.id;
      }

      for (const field of sectionFields) {
        const {
          id: _id,
          form_id: _formId,
          section_id: _sectionId,
          created_at: _createdAt,
          ...fieldRest
        } = field as any;
        await this.createField(newForm.id, {
          ...fieldRest,
          section_id: newSectionId,
        });
      }
    }

    return newForm;
  }

  // ─── Sections CRUD ──────────────────────────────────────────

  static async createSection(
    formId: string,
    section: {
      title: string;
      description?: string;
      display_order: number;
      is_collapsible?: boolean;
      condition?: FormFieldCondition | null;
    }
  ): Promise<AdmissionFormSection> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('admission_form_sections')
      .insert({ form_id: formId, ...section })
      .select()
      .single();
    if (error) throw error;
    return data as AdmissionFormSection;
  }

  static async updateSection(
    sectionId: string,
    updates: Partial<AdmissionFormSection>
  ): Promise<AdmissionFormSection> {
    const supabase = createClientSupabaseClient();
    const { id: _, form_id: __, created_at: ___, ...safeUpdates } = updates as any;
    const { data, error } = await (supabase as any)
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
    const { error } = await (supabase as any)
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
    const { data, error } = await (supabase as any)
      .from('admission_form_fields')
      .insert({ form_id: formId, ...field })
      .select()
      .single();
    if (error) throw error;
    return data as AdmissionFormField;
  }

  static async updateField(
    fieldId: string,
    updates: Partial<AdmissionFormField>
  ): Promise<AdmissionFormField> {
    const supabase = createClientSupabaseClient();
    const { id: _, form_id: __, created_at: ___, ...safeUpdates } = updates as any;
    const { data, error } = await (supabase as any)
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
    const { error } = await (supabase as any)
      .from('admission_form_fields')
      .delete()
      .eq('id', fieldId);
    if (error) throw error;
  }

  static async reorderFields(
    fieldOrders: { id: string; display_order: number; section_id: string | null }[]
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const promises = fieldOrders.map(({ id, display_order, section_id }) =>
      (supabase as any)
        .from('admission_form_fields')
        .update({ display_order, section_id })
        .eq('id', id)
    );
    const results = await Promise.all(promises);
    const failed = results.find((r: any) => r.error);
    if (failed?.error) throw failed.error;
  }

  static async reorderSections(sectionOrders: { id: string; display_order: number }[]): Promise<void> {
    const supabase = createClientSupabaseClient();
    const promises = sectionOrders.map(({ id, display_order }) =>
      (supabase as any)
        .from('admission_form_sections')
        .update({ display_order })
        .eq('id', id)
    );
    const results = await Promise.all(promises);
    const failed = results.find((r: any) => r.error);
    if (failed?.error) throw failed.error;
  }

  // ─── Templates ──────────────────────────────────────────────

  static async getTemplates(): Promise<AdmissionFormTemplate[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
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

    const { data: template, error: tErr } = await (supabase as any)
      .from('admission_form_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    if (tErr) throw tErr;

    const form = await this.createForm(input, userId);

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
          ...(fieldDef as any),
          section_id: section.id,
          display_order: fi,
        });
      }
    }

    return form;
  }

  // ─── Slug Utilities ─────────────────────────────────────────

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
    let query = (supabase as any).from('admission_forms').select('id').eq('slug', slug);
    if (excludeFormId) {
      query = query.neq('id', excludeFormId);
    }
    const { data } = await query;
    return !data || data.length === 0;
  }
}
