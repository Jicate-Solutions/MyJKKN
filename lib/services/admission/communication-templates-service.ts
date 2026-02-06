// lib/services/admission/communication-templates-service.ts
// Admission CRM Communication Templates Service - Supabase interactions

import { createClientSupabaseClient } from '@/lib/supabase/client';

// Types
export type TemplateChannel = 'sms' | 'email' | 'whatsapp';
// Backward-compatible alias
export type TemplateType = TemplateChannel;

export interface TemplateVariable {
  name: string;
  description?: string;
  defaultValue?: string;
}

export interface CommunicationTemplate {
  id: string;
  institution_id: string;
  name: string;
  // DB column is 'channel', not 'type'
  channel: TemplateChannel;
  subject: string | null;
  content: string;
  description: string | null;
  category: string | null;
  variables: TemplateVariable[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Virtual fields for display
  usage_count?: number;
}

export interface CreateTemplateInput {
  institution_id: string;
  name: string;
  channel: TemplateChannel;
  subject?: string;
  content: string;
  description?: string;
  category?: string;
  variables?: TemplateVariable[];
  is_active?: boolean;
}

export interface UpdateTemplateInput {
  name?: string;
  channel?: TemplateChannel;
  subject?: string;
  content?: string;
  description?: string;
  category?: string;
  variables?: TemplateVariable[];
  is_active?: boolean;
}

export interface TemplateFilters {
  institutionId: string;
  channel?: TemplateChannel;
  isActive?: boolean;
  search?: string;
}

export interface TemplateStats {
  totalTemplates: number;
  activeTemplates: number;
  byType: {
    sms: number;
    email: number;
    whatsapp: number;
  };
}

export class CommunicationTemplatesService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // CRUD METHODS
  // ============================================================================

  /**
   * Get all communication templates for an institution
   */
  static async getTemplates(filters: TemplateFilters): Promise<CommunicationTemplate[]> {
    let query = this.supabase
      .from('admission_communication_templates')
      .select('*')
      .eq('institution_id', filters.institutionId)
      .order('name', { ascending: true });

    if (filters.type) {
      query = query.eq('type', filters.type);
    }

    if (filters.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admission/communication-templates] Failed to fetch templates:', error);
      throw new Error('Failed to fetch communication templates');
    }

    let templates = (data || []).map(this.enrichTemplate);

    // Client-side search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(searchLower) ||
          t.content.toLowerCase().includes(searchLower) ||
          (t.subject && t.subject.toLowerCase().includes(searchLower))
      );
    }

    return templates;
  }

  /**
   * Get active templates for an institution (for use in workflows/campaigns)
   */
  static async getActiveTemplates(institutionId: string, type?: TemplateType): Promise<CommunicationTemplate[]> {
    let query = this.supabase
      .from('admission_communication_templates')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admission/communication-templates] Failed to fetch active templates:', error);
      throw new Error('Failed to fetch active templates');
    }

    return (data || []).map(this.enrichTemplate);
  }

  /**
   * Get a single template by ID
   */
  static async getTemplate(id: string): Promise<CommunicationTemplate | null> {
    const { data, error } = await this.supabase
      .from('admission_communication_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[admission/communication-templates] Failed to fetch template:', error);
      throw new Error('Failed to fetch template');
    }

    return data ? this.enrichTemplate(data) : null;
  }

  /**
   * Create a new communication template
   */
  static async createTemplate(input: CreateTemplateInput): Promise<CommunicationTemplate> {
    const { data, error } = await this.supabase
      .from('admission_communication_templates')
      .insert({
        institution_id: input.institution_id,
        name: input.name,
        type: input.type,
        subject: input.subject || null,
        content: input.content,
        variables: input.variables || [],
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error('[admission/communication-templates] Failed to create template:', error);
      throw new Error('Failed to create template');
    }

    return this.enrichTemplate(data);
  }

  /**
   * Update an existing template
   */
  static async updateTemplate(id: string, input: UpdateTemplateInput): Promise<CommunicationTemplate> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.type !== undefined) updateData.type = input.type;
    if (input.subject !== undefined) updateData.subject = input.subject;
    if (input.content !== undefined) updateData.content = input.content;
    if (input.variables !== undefined) updateData.variables = input.variables;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    const { data, error } = await this.supabase
      .from('admission_communication_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/communication-templates] Failed to update template:', error);
      throw new Error('Failed to update template');
    }

    return this.enrichTemplate(data);
  }

  /**
   * Delete a template
   */
  static async deleteTemplate(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_communication_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admission/communication-templates] Failed to delete template:', error);
      throw new Error('Failed to delete template');
    }
  }

  /**
   * Toggle template active status
   */
  static async toggleTemplateStatus(id: string, isActive: boolean): Promise<CommunicationTemplate> {
    return this.updateTemplate(id, { is_active: isActive });
  }

  /**
   * Duplicate a template
   */
  static async duplicateTemplate(id: string): Promise<CommunicationTemplate> {
    const original = await this.getTemplate(id);
    if (!original) {
      throw new Error('Template not found');
    }

    return this.createTemplate({
      institution_id: original.institution_id,
      name: `${original.name} (Copy)`,
      type: original.type,
      subject: original.subject || undefined,
      content: original.content,
      variables: original.variables,
      is_active: false, // Start duplicates as inactive
    });
  }

  // ============================================================================
  // STATS & ANALYTICS
  // ============================================================================

  /**
   * Get template statistics for an institution
   */
  static async getTemplateStats(institutionId: string): Promise<TemplateStats> {
    const { data, error } = await this.supabase
      .from('admission_communication_templates')
      .select('id, type, is_active')
      .eq('institution_id', institutionId);

    if (error) {
      console.warn('[admission/communication-templates] Failed to fetch stats:', error);
    }

    const templates = data || [];
    const activeTemplates = templates.filter((t: { is_active: boolean }) => t.is_active);

    return {
      totalTemplates: templates.length,
      activeTemplates: activeTemplates.length,
      byType: {
        sms: templates.filter((t: { type: string }) => t.type === 'sms').length,
        email: templates.filter((t: { type: string }) => t.type === 'email').length,
        whatsapp: templates.filter((t: { type: string }) => t.type === 'whatsapp').length,
      },
    };
  }

  // ============================================================================
  // TEMPLATE VARIABLE HELPERS
  // ============================================================================

  /**
   * Extract variables from template content ({{variable_name}})
   */
  static extractVariables(content: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const matches = content.matchAll(regex);
    const variables = new Set<string>();

    for (const match of matches) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  /**
   * Replace variables in template content
   */
  static replaceVariables(content: string, values: Record<string, string>): string {
    return content.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return values[variable] !== undefined ? values[variable] : match;
    });
  }

  /**
   * Get common template variables for leads
   */
  static getLeadVariables(): TemplateVariable[] {
    return [
      { name: 'first_name', description: 'Lead first name' },
      { name: 'last_name', description: 'Lead last name' },
      { name: 'full_name', description: 'Lead full name' },
      { name: 'email', description: 'Lead email address' },
      { name: 'phone', description: 'Lead phone number' },
      { name: 'program', description: 'Program of interest' },
      { name: 'counselor_name', description: 'Assigned counselor name' },
      { name: 'institution_name', description: 'Institution name' },
      { name: 'application_status', description: 'Application status' },
      { name: 'next_deadline', description: 'Next deadline date' },
    ];
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Enrich template with derived fields
   */
  private static enrichTemplate(template: CommunicationTemplate): CommunicationTemplate {
    // Infer category from name if not set
    let category = 'general';
    const nameLower = template.name.toLowerCase();

    if (nameLower.includes('welcome')) category = 'welcome';
    else if (nameLower.includes('follow') || nameLower.includes('followup')) category = 'follow_up';
    else if (nameLower.includes('remind')) category = 'reminder';
    else if (nameLower.includes('confirm')) category = 'confirmation';
    else if (nameLower.includes('notif')) category = 'notification';
    else if (nameLower.includes('promo')) category = 'promotional';

    return {
      ...template,
      category,
      usage_count: 0, // Would need activity logs to calculate
    };
  }

  /**
   * Validate template content
   */
  static validateTemplate(input: CreateTemplateInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!input.name || input.name.trim().length === 0) {
      errors.push('Template name is required');
    }

    if (!input.content || input.content.trim().length === 0) {
      errors.push('Template content is required');
    }

    if (input.type === 'email' && !input.subject) {
      errors.push('Email templates require a subject');
    }

    if (input.type === 'sms' && input.content.length > 160) {
      errors.push('SMS templates should be under 160 characters for single-part messages');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
