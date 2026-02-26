// lib/services/whatsapp/whatsapp-forms-service.ts
// WhatsApp In-Chat Forms Service
// Send interactive button/list/flow messages and collect responses via WhatsApp Cloud API

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export type WAFormType = 'button' | 'list' | 'flow';

export interface WAButtonOption {
  id: string;
  title: string;
}

export interface WAListSection {
  title: string;
  rows: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
}

export interface WAFlowConfig {
  flow_id: string;
  flow_action: 'navigate' | 'data_exchange';
  flow_params?: Record<string, unknown>;
}

export interface WAFormTemplate {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  form_type: WAFormType;
  body_text: string;
  // Button-specific
  buttons?: WAButtonOption[];
  // List-specific
  list_button_text?: string;
  sections?: WAListSection[];
  // Flow-specific
  flow_config?: WAFlowConfig;
  // Auto-mapping
  response_field_mapping: Record<string, string>; // response_id -> lead field name
  is_active: boolean;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWAFormTemplateInput {
  institution_id: string;
  name: string;
  description?: string;
  form_type: WAFormType;
  body_text: string;
  buttons?: WAButtonOption[];
  list_button_text?: string;
  sections?: WAListSection[];
  flow_config?: WAFlowConfig;
  response_field_mapping?: Record<string, string>;
  is_active?: boolean;
  category?: string;
}

export interface UpdateWAFormTemplateInput {
  name?: string;
  description?: string;
  body_text?: string;
  buttons?: WAButtonOption[];
  list_button_text?: string;
  sections?: WAListSection[];
  flow_config?: WAFlowConfig;
  response_field_mapping?: Record<string, string>;
  is_active?: boolean;
  category?: string;
}

export interface WAFormResponse {
  id: string;
  institution_id: string;
  form_template_id: string;
  lead_id: string | null;
  phone_number: string;
  wa_message_id: string;
  response_type: WAFormType;
  response_data: Record<string, unknown>;
  selected_option_id: string | null;
  selected_option_title: string | null;
  raw_payload: Record<string, unknown>;
  synced_to_lead: boolean;
  created_at: string;
  // Virtual fields from joins
  lead_name?: string;
  form_name?: string;
}

export interface WAFormResponseFilters {
  institutionId: string;
  formTemplateId?: string;
  leadId?: string;
  phoneNumber?: string;
  syncedToLead?: boolean;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface WAFormTemplateFilters {
  institutionId: string;
  formType?: WAFormType;
  isActive?: boolean;
  category?: string;
  search?: string;
}

export interface SendFormResult {
  success: boolean;
  wa_message_id?: string;
  error?: string;
}

// Predefined form templates
const PREDEFINED_FORMS: Omit<CreateWAFormTemplateInput, 'institution_id'>[] = [
  {
    name: 'Program Interest',
    description: 'Ask which program the prospect is interested in',
    form_type: 'list',
    body_text: 'Welcome to JKKN Institutions! Which program are you interested in?',
    list_button_text: 'View Programs',
    sections: [
      {
        title: 'Engineering',
        rows: [
          { id: 'btech_cse', title: 'B.Tech CSE', description: 'Computer Science & Engineering' },
          { id: 'btech_eee', title: 'B.Tech EEE', description: 'Electrical & Electronics' },
          { id: 'btech_mech', title: 'B.Tech Mechanical', description: 'Mechanical Engineering' },
        ],
      },
      {
        title: 'Health Sciences',
        rows: [
          { id: 'bpharm', title: 'B.Pharm', description: 'Bachelor of Pharmacy' },
          { id: 'mpharm', title: 'M.Pharm', description: 'Master of Pharmacy' },
          { id: 'bsc_nursing', title: 'B.Sc Nursing', description: 'Nursing Program' },
        ],
      },
      {
        title: 'Management',
        rows: [
          { id: 'mba', title: 'MBA', description: 'Master of Business Administration' },
          { id: 'bba', title: 'BBA', description: 'Bachelor of Business Administration' },
        ],
      },
    ],
    response_field_mapping: { selected_option_id: 'interested_program' },
    category: 'qualification',
  },
  {
    name: 'Campus Preference',
    description: 'Ask which campus the prospect prefers',
    form_type: 'button',
    body_text: 'Which campus do you prefer?',
    buttons: [
      { id: 'komarapalayam', title: 'Komarapalayam' },
      { id: 'erode', title: 'Erode' },
      { id: 'namakkal', title: 'Namakkal' },
    ],
    response_field_mapping: { selected_option_id: 'preferred_campus' },
    category: 'qualification',
  },
  {
    name: 'Callback Request',
    description: 'Ask when to call the prospect',
    form_type: 'button',
    body_text: 'When would you like us to call you?',
    buttons: [
      { id: 'morning', title: 'Morning (9-12)' },
      { id: 'afternoon', title: 'Afternoon (12-5)' },
      { id: 'evening', title: 'Evening (5-8)' },
    ],
    response_field_mapping: { selected_option_id: 'preferred_call_time' },
    category: 'scheduling',
  },
  {
    name: 'Feedback Survey',
    description: 'Collect feedback about the admission experience',
    form_type: 'list',
    body_text: 'How would you rate your experience with JKKN Admissions?',
    list_button_text: 'Rate Experience',
    sections: [
      {
        title: 'Rating',
        rows: [
          { id: 'rating_5', title: 'Excellent', description: '5 stars' },
          { id: 'rating_4', title: 'Very Good', description: '4 stars' },
          { id: 'rating_3', title: 'Good', description: '3 stars' },
          { id: 'rating_2', title: 'Fair', description: '2 stars' },
          { id: 'rating_1', title: 'Poor', description: '1 star' },
        ],
      },
    ],
    response_field_mapping: { selected_option_id: 'feedback_rating' },
    category: 'feedback',
  },
];

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class WhatsAppFormsService {
  private static supabase = createClientSupabaseClient();

  // ============================================================================
  // FORM TEMPLATES CRUD
  // ============================================================================

  /**
   * Get all form templates
   */
  static async getFormTemplates(filters: WAFormTemplateFilters): Promise<WAFormTemplate[]> {
    let query = (this.supabase as any)
      .from('wa_form_templates')
      .select('*')
      .eq('institution_id', filters.institutionId)
      .order('created_at', { ascending: false });

    if (filters.formType) query = query.eq('form_type', filters.formType);
    if (filters.isActive !== undefined) query = query.eq('is_active', filters.isActive);
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.search) query = query.ilike('name', `%${filters.search}%`);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch form templates: ${error.message}`);
    return (data || []) as WAFormTemplate[];
  }

  /**
   * Get a single form template
   */
  static async getFormTemplate(id: string): Promise<WAFormTemplate | null> {
    const { data, error } = await (this.supabase as any)
      .from('wa_form_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch form template: ${error.message}`);
    }
    return data as WAFormTemplate;
  }

  /**
   * Create a form template
   */
  static async createFormTemplate(input: CreateWAFormTemplateInput): Promise<WAFormTemplate> {
    const { data, error } = await (this.supabase as any)
      .from('wa_form_templates')
      .insert({
        institution_id: input.institution_id,
        name: input.name,
        description: input.description || null,
        form_type: input.form_type,
        body_text: input.body_text,
        buttons: input.buttons || null,
        list_button_text: input.list_button_text || null,
        sections: input.sections || null,
        flow_config: input.flow_config || null,
        response_field_mapping: input.response_field_mapping || {},
        is_active: input.is_active ?? true,
        category: input.category || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create form template: ${error.message}`);
    return data as WAFormTemplate;
  }

  /**
   * Update a form template
   */
  static async updateFormTemplate(id: string, input: UpdateWAFormTemplateInput): Promise<WAFormTemplate> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.body_text !== undefined) updateData.body_text = input.body_text;
    if (input.buttons !== undefined) updateData.buttons = input.buttons;
    if (input.list_button_text !== undefined) updateData.list_button_text = input.list_button_text;
    if (input.sections !== undefined) updateData.sections = input.sections;
    if (input.flow_config !== undefined) updateData.flow_config = input.flow_config;
    if (input.response_field_mapping !== undefined) updateData.response_field_mapping = input.response_field_mapping;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    if (input.category !== undefined) updateData.category = input.category;

    const { data, error } = await (this.supabase as any)
      .from('wa_form_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update form template: ${error.message}`);
    return data as WAFormTemplate;
  }

  /**
   * Delete a form template
   */
  static async deleteFormTemplate(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('wa_form_templates')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete form template: ${error.message}`);
  }

  /**
   * Initialize predefined form templates for an institution
   */
  static async initializePredefinedForms(institutionId: string): Promise<WAFormTemplate[]> {
    const existing = await this.getFormTemplates({ institutionId });
    const existingNames = new Set(existing.map(f => f.name));

    const newForms = PREDEFINED_FORMS
      .filter(f => !existingNames.has(f.name))
      .map(f => ({ ...f, institution_id: institutionId }));

    if (newForms.length === 0) return existing;

    const { data, error } = await (this.supabase as any)
      .from('wa_form_templates')
      .insert(newForms)
      .select();

    if (error) throw new Error(`Failed to initialize predefined forms: ${error.message}`);
    return [...existing, ...(data || [])] as WAFormTemplate[];
  }

  // ============================================================================
  // SEND INTERACTIVE MESSAGES
  // ============================================================================

  /**
   * Send a button message via WhatsApp Cloud API
   */
  static async sendButtonMessage(params: {
    to: string;
    body: string;
    buttons: WAButtonOption[];
    institutionId: string;
    formTemplateId?: string;
    leadId?: string;
  }): Promise<SendFormResult> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      return { success: false, error: 'WhatsApp API not configured' };
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: params.to,
            type: 'interactive',
            interactive: {
              type: 'button',
              body: { text: params.body },
              action: {
                buttons: params.buttons.map(btn => ({
                  type: 'reply',
                  reply: { id: btn.id, title: btn.title },
                })),
              },
            },
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error?.message || 'Failed to send button message' };
      }

      const waMessageId = data.messages?.[0]?.id;
      return { success: true, wa_message_id: waMessageId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Send a list message via WhatsApp Cloud API
   */
  static async sendListMessage(params: {
    to: string;
    body: string;
    buttonText: string;
    sections: WAListSection[];
    institutionId: string;
    formTemplateId?: string;
    leadId?: string;
  }): Promise<SendFormResult> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      return { success: false, error: 'WhatsApp API not configured' };
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: params.to,
            type: 'interactive',
            interactive: {
              type: 'list',
              body: { text: params.body },
              action: {
                button: params.buttonText,
                sections: params.sections,
              },
            },
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error?.message || 'Failed to send list message' };
      }

      const waMessageId = data.messages?.[0]?.id;
      return { success: true, wa_message_id: waMessageId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Send a flow message via WhatsApp Cloud API
   */
  static async sendFlowMessage(params: {
    to: string;
    body: string;
    flowConfig: WAFlowConfig;
    institutionId: string;
    formTemplateId?: string;
    leadId?: string;
  }): Promise<SendFormResult> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      return { success: false, error: 'WhatsApp API not configured' };
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: params.to,
            type: 'interactive',
            interactive: {
              type: 'flow',
              body: { text: params.body },
              action: {
                name: 'flow',
                parameters: {
                  flow_message_version: '3',
                  flow_id: params.flowConfig.flow_id,
                  flow_action: params.flowConfig.flow_action,
                  flow_cta: 'Open Form',
                  ...(params.flowConfig.flow_params || {}),
                },
              },
            },
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error?.message || 'Failed to send flow message' };
      }

      const waMessageId = data.messages?.[0]?.id;
      return { success: true, wa_message_id: waMessageId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Send a form using a template
   */
  static async sendForm(params: {
    formTemplateId: string;
    to: string;
    institutionId: string;
    leadId?: string;
  }): Promise<SendFormResult> {
    const template = await this.getFormTemplate(params.formTemplateId);
    if (!template) return { success: false, error: 'Form template not found' };
    if (!template.is_active) return { success: false, error: 'Form template is inactive' };

    switch (template.form_type) {
      case 'button':
        return this.sendButtonMessage({
          to: params.to,
          body: template.body_text,
          buttons: template.buttons || [],
          institutionId: params.institutionId,
          formTemplateId: params.formTemplateId,
          leadId: params.leadId,
        });

      case 'list':
        return this.sendListMessage({
          to: params.to,
          body: template.body_text,
          buttonText: template.list_button_text || 'Select',
          sections: template.sections || [],
          institutionId: params.institutionId,
          formTemplateId: params.formTemplateId,
          leadId: params.leadId,
        });

      case 'flow':
        if (!template.flow_config) return { success: false, error: 'No flow config in template' };
        return this.sendFlowMessage({
          to: params.to,
          body: template.body_text,
          flowConfig: template.flow_config,
          institutionId: params.institutionId,
          formTemplateId: params.formTemplateId,
          leadId: params.leadId,
        });

      default:
        return { success: false, error: `Unknown form type: ${template.form_type}` };
    }
  }

  // ============================================================================
  // FORM RESPONSES
  // ============================================================================

  /**
   * Get form responses with filters
   */
  static async getFormResponses(filters: WAFormResponseFilters): Promise<{
    responses: WAFormResponse[];
    total: number;
  }> {
    let query = (this.supabase as any)
      .from('wa_form_responses')
      .select('*', { count: 'exact' })
      .eq('institution_id', filters.institutionId)
      .order('created_at', { ascending: false });

    if (filters.formTemplateId) query = query.eq('form_template_id', filters.formTemplateId);
    if (filters.leadId) query = query.eq('lead_id', filters.leadId);
    if (filters.phoneNumber) query = query.eq('phone_number', filters.phoneNumber);
    if (filters.syncedToLead !== undefined) query = query.eq('synced_to_lead', filters.syncedToLead);
    if (filters.fromDate) query = query.gte('created_at', filters.fromDate);
    if (filters.toDate) query = query.lte('created_at', filters.toDate);

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch form responses: ${error.message}`);

    return {
      responses: (data || []) as WAFormResponse[],
      total: count || 0,
    };
  }

  /**
   * Process an incoming form response from WhatsApp webhook
   */
  static async processFormResponse(params: {
    institutionId: string;
    phoneNumber: string;
    waMessageId: string;
    responseType: WAFormType;
    selectedOptionId: string;
    selectedOptionTitle: string;
    rawPayload: Record<string, unknown>;
    contextMessageId?: string;
  }): Promise<WAFormResponse | null> {
    // Find the lead by phone number
    const { data: leads } = await (this.supabase as any)
      .from('admission_leads')
      .select('id')
      .eq('institution_id', params.institutionId)
      .or(`phone.eq.${params.phoneNumber},mobile.eq.${params.phoneNumber}`)
      .limit(1);

    const leadId = leads?.[0]?.id || null;

    // Find the form template that was sent (by matching context message)
    // For now, match by form type and institution
    let formTemplateId: string | null = null;
    const { data: templates } = await (this.supabase as any)
      .from('wa_form_templates')
      .select('id, response_field_mapping')
      .eq('institution_id', params.institutionId)
      .eq('is_active', true);

    if (templates && templates.length > 0) {
      formTemplateId = templates[0].id;
    }

    // Save response
    const { data: response, error } = await (this.supabase as any)
      .from('wa_form_responses')
      .insert({
        institution_id: params.institutionId,
        form_template_id: formTemplateId,
        lead_id: leadId,
        phone_number: params.phoneNumber,
        wa_message_id: params.waMessageId,
        response_type: params.responseType,
        response_data: {
          selected_option_id: params.selectedOptionId,
          selected_option_title: params.selectedOptionTitle,
        },
        selected_option_id: params.selectedOptionId,
        selected_option_title: params.selectedOptionTitle,
        raw_payload: params.rawPayload,
        synced_to_lead: false,
      })
      .select()
      .single();

    if (error) {
      console.error('[wa-forms] Failed to save form response:', error);
      return null;
    }

    // Auto-sync to lead profile if mapping exists
    if (leadId && formTemplateId) {
      const template = templates?.find((t: any) => t.id === formTemplateId);
      if (template?.response_field_mapping) {
        await this.syncResponseToLead(
          leadId,
          params.selectedOptionId,
          template.response_field_mapping
        );

        // Mark as synced
        await (this.supabase as any)
          .from('wa_form_responses')
          .update({ synced_to_lead: true })
          .eq('id', response.id);
      }
    }

    return response as WAFormResponse;
  }

  /**
   * Sync a form response value to the lead profile
   */
  private static async syncResponseToLead(
    leadId: string,
    selectedOptionId: string,
    fieldMapping: Record<string, string>
  ): Promise<void> {
    const leadField = fieldMapping.selected_option_id || fieldMapping[selectedOptionId];
    if (!leadField) return;

    try {
      // Update the lead's metadata with the response
      const { data: lead } = await (this.supabase as any)
        .from('admission_leads')
        .select('metadata')
        .eq('id', leadId)
        .single();

      const currentMetadata = lead?.metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        [leadField]: selectedOptionId,
      };

      await (this.supabase as any)
        .from('admission_leads')
        .update({ metadata: updatedMetadata })
        .eq('id', leadId);
    } catch (err) {
      console.error(`[wa-forms] Failed to sync response to lead ${leadId}:`, err);
    }
  }
}
