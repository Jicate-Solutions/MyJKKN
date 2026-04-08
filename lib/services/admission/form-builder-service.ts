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
} from '@/types/admission';

export class FormBuilderService {
  // ─── Forms CRUD ─────────────────────────────────────────────

  static async getForms(institutionId?: string): Promise<AdmissionForm[]> {
    const supabase = createClientSupabaseClient();
    let query = (supabase as any)
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
