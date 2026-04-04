// lib/services/whatsapp/whatsapp-personal-template-service.ts
// Manages wa_personal_message_templates table — CRUD + variable substitution

import { createClient } from '@supabase/supabase-js';
import type {
  PersonalMessageTemplate,
  CreatePersonalTemplateInput,
  UpdatePersonalTemplateInput,
  TemplateVariableContext,
  PersonalTemplateCategory,
} from '@/types/whatsapp-personal';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class WhatsAppPersonalTemplateService {
  /** Extract {{variable_name}} patterns from template content */
  static extractVariables(content: string): string[] {
    const matches = content.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
  }

  /** Substitute variables in template content */
  static substituteVariables(content: string, context: TemplateVariableContext): string {
    return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = context[key as keyof TemplateVariableContext];
      return value || match; // Keep placeholder if no value provided
    });
  }

  static async getTemplates(
    institutionId: string,
    category?: PersonalTemplateCategory
  ): Promise<PersonalMessageTemplate[]> {
    const supabase = getServiceClient();
    let query = supabase
      .from('wa_personal_message_templates')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('name');

    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) {
      console.error('[whatsapp-personal] getTemplates error:', error.message);
      return [];
    }
    return (data || []) as PersonalMessageTemplate[];
  }

  static async getTemplate(id: string): Promise<PersonalMessageTemplate | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_personal_message_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[whatsapp-personal] getTemplate error:', error.message);
      return null;
    }
    return data as PersonalMessageTemplate;
  }

  static async getDefaultTemplate(
    institutionId: string,
    category: PersonalTemplateCategory
  ): Promise<PersonalMessageTemplate | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_personal_message_templates')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('category', category)
      .eq('is_default', true)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[whatsapp-personal] getDefaultTemplate error:', error.message);
      return null;
    }
    return data as PersonalMessageTemplate | null;
  }

  static async createTemplate(
    input: CreatePersonalTemplateInput,
    userId: string
  ): Promise<PersonalMessageTemplate | null> {
    const supabase = getServiceClient();
    const variables = this.extractVariables(input.content);

    // If setting as default, unset other defaults in same category
    if (input.is_default) {
      await supabase
        .from('wa_personal_message_templates')
        .update({ is_default: false })
        .eq('institution_id', input.institution_id)
        .eq('category', input.category)
        .eq('is_default', true);
    }

    const { data, error } = await supabase
      .from('wa_personal_message_templates')
      .insert({
        ...input,
        variables,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('[whatsapp-personal] createTemplate error:', error.message);
      return null;
    }
    return data as PersonalMessageTemplate;
  }

  static async updateTemplate(
    id: string,
    input: UpdatePersonalTemplateInput
  ): Promise<PersonalMessageTemplate | null> {
    const supabase = getServiceClient();
    const updateData: Record<string, unknown> = { ...input };

    if (input.content) {
      updateData.variables = this.extractVariables(input.content);
    }

    // If setting as default, unset other defaults in same category
    if (input.is_default) {
      const existing = await this.getTemplate(id);
      if (existing) {
        await supabase
          .from('wa_personal_message_templates')
          .update({ is_default: false })
          .eq('institution_id', existing.institution_id)
          .eq('category', input.category || existing.category)
          .eq('is_default', true)
          .neq('id', id);
      }
    }

    const { data, error } = await supabase
      .from('wa_personal_message_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[whatsapp-personal] updateTemplate error:', error.message);
      return null;
    }
    return data as PersonalMessageTemplate;
  }

  static async deleteTemplate(id: string): Promise<boolean> {
    const supabase = getServiceClient();
    const { error } = await supabase
      .from('wa_personal_message_templates')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('[whatsapp-personal] deleteTemplate error:', error.message);
      return false;
    }
    return true;
  }
}
