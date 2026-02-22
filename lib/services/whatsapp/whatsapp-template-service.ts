// WhatsApp Template Service
// Sync and manage Meta-approved WhatsApp message templates
// Uses Meta WhatsApp Business Management API

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface MetaTemplate {
  name: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  id: string;
  components: MetaTemplateComponent[];
  quality_score?: { score: string; date: number };
}

export interface MetaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: { body_text?: string[][] };
  buttons?: {
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phone_number?: string;
  }[];
}

export interface CreateMetaTemplateParams {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  components: MetaTemplateComponent[];
}

export interface WhatsAppTemplate {
  id: string;
  institution_id: string;
  name: string;
  content: string;
  category: string | null;
  variables: string[];
  attachment_type: 'image' | 'document' | 'audio' | 'video' | null;
  attachment_url: string | null;
  use_count: number;
  last_used_at: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Meta-specific fields
  meta_template_id?: string;
  meta_status?: string;
  meta_language?: string;
  meta_category?: string;
  quality_rating?: string;
}

export interface WhatsAppTemplateFilters {
  institution_id?: string;
  category?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface WhatsAppTemplateListResponse {
  data: WhatsAppTemplate[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// =============================================================================
// Service
// =============================================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getMetaApiConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!accessToken || !businessAccountId) {
    throw new Error(
      'Missing Meta API credentials. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID.'
    );
  }
  return { accessToken, businessAccountId };
}

export class WhatsAppTemplateService {
  /**
   * Sync templates from Meta Business API into local DB
   */
  static async syncTemplatesFromMeta(institutionId: string): Promise<{
    synced: number;
    created: number;
    updated: number;
  }> {
    const { accessToken, businessAccountId } = getMetaApiConfig();
    const supabase = getServiceClient();

    // Fetch all templates from Meta
    const { data: metaResponse } = await axios.get<{ data: MetaTemplate[] }>(
      `https://graph.facebook.com/v21.0/${businessAccountId}/message_templates`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { limit: 250 },
      }
    );

    const metaTemplates = metaResponse.data || [];
    let created = 0;
    let updated = 0;

    for (const mt of metaTemplates) {
      // Extract body text from components
      const bodyComponent = mt.components.find((c) => c.type === 'BODY');
      const headerComponent = mt.components.find((c) => c.type === 'HEADER');
      const bodyText = bodyComponent?.text || '';

      // Extract variables like {{1}}, {{2}} etc.
      const variables: string[] = [];
      const varRegex = /\{\{(\d+)\}\}/g;
      let match;
      while ((match = varRegex.exec(bodyText)) !== null) {
        variables.push(match[1]);
      }

      // Determine attachment type from header
      let attachmentType: 'image' | 'document' | 'video' | null = null;
      if (headerComponent?.format === 'IMAGE') attachmentType = 'image';
      else if (headerComponent?.format === 'DOCUMENT') attachmentType = 'document';
      else if (headerComponent?.format === 'VIDEO') attachmentType = 'video';

      // Check if template exists locally
      const { data: existing } = await supabase
        .from('admission_communication_templates')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('name', mt.name)
        .eq('channel', 'whatsapp')
        .single();

      const templateData = {
        institution_id: institutionId,
        name: mt.name,
        channel: 'whatsapp',
        content: bodyText,
        category: mt.category.toLowerCase(),
        variables,
        attachment_type: attachmentType,
        is_active: mt.status === 'APPROVED',
        metadata: {
          meta_template_id: mt.id,
          meta_status: mt.status,
          meta_language: mt.language,
          meta_category: mt.category,
          quality_rating: mt.quality_score?.score || 'UNKNOWN',
          components: mt.components,
        },
      };

      if (existing) {
        await supabase
          .from('admission_communication_templates')
          .update({ ...templateData, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        updated++;
      } else {
        await supabase.from('admission_communication_templates').insert(templateData);
        created++;
      }
    }

    return { synced: metaTemplates.length, created, updated };
  }

  /**
   * Get template status from Meta API
   */
  static async getTemplateStatus(
    templateName: string
  ): Promise<'APPROVED' | 'PENDING' | 'REJECTED' | 'NOT_FOUND'> {
    const { accessToken, businessAccountId } = getMetaApiConfig();

    try {
      const { data } = await axios.get<{ data: MetaTemplate[] }>(
        `https://graph.facebook.com/v21.0/${businessAccountId}/message_templates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { name: templateName },
        }
      );

      if (data.data && data.data.length > 0) {
        return data.data[0].status;
      }
      return 'NOT_FOUND';
    } catch {
      return 'NOT_FOUND';
    }
  }

  /**
   * Submit a new template to Meta for approval
   */
  static async submitTemplate(params: CreateMetaTemplateParams): Promise<{
    success: boolean;
    template_id?: string;
    error?: string;
  }> {
    const { accessToken, businessAccountId } = getMetaApiConfig();

    try {
      const { data } = await axios.post(
        `https://graph.facebook.com/v21.0/${businessAccountId}/message_templates`,
        params,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      return { success: true, template_id: data.id };
    } catch (error) {
      const errMsg =
        axios.isAxiosError(error) && error.response?.data?.error?.message
          ? error.response.data.error.message
          : 'Failed to submit template';
      return { success: false, error: errMsg };
    }
  }

  /**
   * Get template quality rating from Meta
   */
  static async getTemplateQualityRating(
    templateName: string
  ): Promise<'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'> {
    const { accessToken, businessAccountId } = getMetaApiConfig();

    try {
      const { data } = await axios.get<{ data: MetaTemplate[] }>(
        `https://graph.facebook.com/v21.0/${businessAccountId}/message_templates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { name: templateName, fields: 'quality_score' },
        }
      );

      if (data.data?.[0]?.quality_score?.score) {
        return data.data[0].quality_score.score as 'HIGH' | 'MEDIUM' | 'LOW';
      }
      return 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }

  /**
   * Refresh quality ratings for all WhatsApp templates from Meta API.
   * Fetches the latest quality_score for each template and updates metadata.
   */
  static async refreshAllQualityRatings(institutionId: string): Promise<number> {
    const supabase = getServiceClient();

    // Fetch all WhatsApp templates for this institution
    const { data: templates, error } = await supabase
      .from('admission_communication_templates')
      .select('id, name, metadata')
      .eq('institution_id', institutionId)
      .eq('channel', 'whatsapp');

    if (error) throw new Error(`Failed to fetch templates: ${error.message}`);
    if (!templates || templates.length === 0) return 0;

    let updated = 0;

    for (const template of templates) {
      if (!template.name) continue;

      const rating = await this.getTemplateQualityRating(template.name);
      if (rating !== 'UNKNOWN') {
        const existingMetadata = (template.metadata as Record<string, unknown>) || {};
        await supabase
          .from('admission_communication_templates')
          .update({
            metadata: { ...existingMetadata, quality_rating: rating },
            updated_at: new Date().toISOString(),
          })
          .eq('id', template.id);
        updated++;
      }
    }

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Local DB Operations (backward-compatible with existing code)
  // ---------------------------------------------------------------------------

  static async getTemplates(filters: WhatsAppTemplateFilters): Promise<WhatsAppTemplateListResponse> {
    const supabase = getServiceClient();
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('admission_communication_templates')
      .select('*', { count: 'exact' })
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters.search) {
      query = query.or(
        `name.ilike.%${filters.search}%,content.ilike.%${filters.search}%`
      );
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch templates: ${error.message}`);

    const total = count || 0;
    return {
      data: (data as WhatsAppTemplate[]) || [],
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getTemplateById(id: string): Promise<WhatsAppTemplate | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('admission_communication_templates')
      .select('*')
      .eq('id', id)
      .eq('channel', 'whatsapp')
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch template: ${error.message}`);
    }
    return data as WhatsAppTemplate;
  }

  static async createTemplate(
    data: {
      institution_id: string;
      name: string;
      content: string;
      category?: string | null;
      variables?: string[];
      attachment_type?: string | null;
      attachment_url?: string | null;
      is_active?: boolean;
    },
    userId: string
  ): Promise<WhatsAppTemplate> {
    const supabase = getServiceClient();

    const { data: template, error } = await supabase
      .from('admission_communication_templates')
      .insert({
        institution_id: data.institution_id,
        name: data.name,
        channel: 'whatsapp',
        content: data.content,
        category: data.category || null,
        variables: data.variables || [],
        attachment_type: data.attachment_type || null,
        attachment_url: data.attachment_url || null,
        is_active: data.is_active ?? true,
        created_by: userId,
      })
      .select('*')
      .single();

    if (error) throw new Error(`Failed to create template: ${error.message}`);
    return template as WhatsAppTemplate;
  }

  static async updateTemplate(
    id: string,
    data: {
      name?: string;
      content?: string;
      category?: string | null;
      variables?: string[];
      attachment_type?: string | null;
      attachment_url?: string | null;
      is_active?: boolean;
    }
  ): Promise<WhatsAppTemplate> {
    const supabase = getServiceClient();

    const { data: template, error } = await supabase
      .from('admission_communication_templates')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error(`Failed to update template: ${error.message}`);
    return template as WhatsAppTemplate;
  }

  static async deleteTemplate(id: string): Promise<void> {
    const supabase = getServiceClient();
    const { error } = await supabase
      .from('admission_communication_templates')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`Failed to delete template: ${error.message}`);
  }

  static extractVariables(content: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }
    return variables;
  }

  static renderTemplate(content: string, variables: Record<string, string>): string {
    let rendered = content;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(regex, value);
    }
    return rendered;
  }

  static async incrementUseCount(id: string): Promise<void> {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from('admission_communication_templates')
      .select('use_count')
      .eq('id', id)
      .single();

    if (data) {
      await supabase
        .from('admission_communication_templates')
        .update({
          use_count: ((data as { use_count: number }).use_count || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', id);
    }
  }

  // ---------------------------------------------------------------------------
  // Pre-built Enrollment Template Library (Gap 8)
  // ---------------------------------------------------------------------------

  static getStarterTemplates(): Array<{
    name: string;
    category: 'MARKETING' | 'UTILITY';
    language: string;
    body: string;
    variables: string[];
    suggested_header?: string;
    suggested_buttons?: Array<{ type: 'QUICK_REPLY' | 'URL'; text: string }>;
    use_case: string;
  }> {
    return [
      // Welcome & Introduction
      { name: 'jkkn_welcome', category: 'MARKETING', language: 'en',
        body: 'Hello {{1}}! Thank you for your interest in JKKN Institutions. We offer world-class programs in Engineering, Pharmacy, Nursing, and Management. Reply YES to learn more!',
        variables: ['full_name'], use_case: 'First contact after inquiry',
        suggested_buttons: [{ type: 'QUICK_REPLY', text: 'Yes, tell me more' }, { type: 'QUICK_REPLY', text: 'Call me' }] },

      { name: 'jkkn_counselor_intro', category: 'MARKETING', language: 'en',
        body: 'Hi {{1}}, I am {{2}}, your admission counselor at JKKN. I will be your guide throughout the admission process for {{3}}. Feel free to ask me anything!',
        variables: ['full_name', 'counselor_name', 'program'], use_case: 'Counselor assignment notification' },

      // Application Process
      { name: 'jkkn_application_received', category: 'UTILITY', language: 'en',
        body: 'Hi {{1}}, we have received your application for {{2}} at JKKN. Your application reference number is {{3}}. We will review it within 3 working days.',
        variables: ['full_name', 'program', 'reference_number'], use_case: 'Application confirmation' },

      { name: 'jkkn_application_status', category: 'UTILITY', language: 'en',
        body: 'Hi {{1}}, update on your {{2}} application: {{3}}. Log in to MyJKKN to view details.',
        variables: ['full_name', 'program', 'status_message'], use_case: 'Status change notification' },

      { name: 'jkkn_document_request', category: 'UTILITY', language: 'en',
        body: 'Hi {{1}}, to proceed with your admission to {{2}}, please submit the following documents: {{3}}. Upload them via the link below by {{4}}.',
        variables: ['full_name', 'program', 'documents_list', 'deadline'], use_case: 'Document collection' },

      // Financial
      { name: 'jkkn_fee_reminder', category: 'UTILITY', language: 'en',
        body: 'Hi {{1}}, your fee payment of INR {{2}} for {{3}} is due by {{4}}. Pay online to confirm your seat. Contact us if you need a payment plan.',
        variables: ['full_name', 'amount', 'program', 'deadline'], use_case: 'Fee payment reminder' },

      { name: 'jkkn_scholarship_info', category: 'MARKETING', language: 'en',
        body: 'Hi {{1}}, based on your academic profile, you may be eligible for scholarships worth up to INR {{2}} for {{3}} at JKKN. Reply SCHOLARSHIP for details.',
        variables: ['full_name', 'amount', 'program'], use_case: 'Scholarship notification' },

      // Engagement
      { name: 'jkkn_campus_visit', category: 'MARKETING', language: 'en',
        body: 'Hi {{1}}, experience JKKN campus first-hand! We would love to show you our facilities, labs, and hostel. Reply VISIT to schedule a campus tour at your convenience.',
        variables: ['full_name'], use_case: 'Campus visit invitation' },

      { name: 'jkkn_event_invite', category: 'MARKETING', language: 'en',
        body: 'Hi {{1}}, you are invited to {{2}} at JKKN on {{3}}. It is a great chance to meet faculty and current learners. Register now!',
        variables: ['full_name', 'event_name', 'event_date'], use_case: 'Event/webinar invitation' },

      { name: 'jkkn_offer_letter', category: 'UTILITY', language: 'en',
        body: 'Congratulations {{1}}! Your offer letter for {{2}} at JKKN Institutions is ready. Download it and complete acceptance by {{3}} to secure your seat.',
        variables: ['full_name', 'program', 'deadline'], use_case: 'Offer letter delivery' },

      // Re-engagement
      { name: 'jkkn_followup', category: 'MARKETING', language: 'en',
        body: 'Hi {{1}}, we noticed you were exploring {{2}} at JKKN. Do you have any questions about the program, fees, or campus life? Reply HELP to connect with your counselor.',
        variables: ['full_name', 'program'], use_case: 'Follow-up for inactive leads' },

      { name: 'jkkn_deadline_alert', category: 'UTILITY', language: 'en',
        body: 'Hi {{1}}, reminder: the admission deadline for {{2}} at JKKN is {{3}}. Only {{4}} seats remaining. Complete your application now to avoid missing out.',
        variables: ['full_name', 'program', 'deadline', 'seats_remaining'], use_case: 'Urgency/deadline reminder' },
    ];
  }

  static async installStarterTemplates(institutionId: string, userId: string): Promise<{ installed: number; skipped: number }> {
    const starters = this.getStarterTemplates();
    const existing = await this.getTemplates({ institution_id: institutionId });
    const existingNames = new Set((existing.data || []).map(t => t.name));

    let installed = 0;
    let skipped = 0;

    for (const starter of starters) {
      if (existingNames.has(starter.name)) { skipped++; continue; }

      await this.createTemplate({
        institution_id: institutionId,
        name: starter.name,
        content: starter.body,
        category: starter.category.toLowerCase(),
        variables: starter.variables,
        is_active: false, // Must be submitted to Meta before use
      }, userId);
      installed++;
    }

    return { installed, skipped };
  }

  static async getTemplatesByCategory(
    institutionId: string,
    category: string
  ): Promise<WhatsAppTemplate[]> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('admission_communication_templates')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('channel', 'whatsapp')
      .eq('category', category)
      .eq('is_active', true)
      .order('use_count', { ascending: false });

    if (error) throw new Error(`Failed to fetch templates: ${error.message}`);
    return (data as WhatsAppTemplate[]) || [];
  }
}

// Export standalone functions for compatibility
export async function getTemplates(filters: WhatsAppTemplateFilters) {
  return WhatsAppTemplateService.getTemplates(filters);
}
export async function getTemplateById(id: string) {
  return WhatsAppTemplateService.getTemplateById(id);
}
export async function createTemplate(
  data: Parameters<typeof WhatsAppTemplateService.createTemplate>[0],
  userId: string
) {
  return WhatsAppTemplateService.createTemplate(data, userId);
}
export async function updateTemplate(
  id: string,
  data: Parameters<typeof WhatsAppTemplateService.updateTemplate>[1]
) {
  return WhatsAppTemplateService.updateTemplate(id, data);
}
export async function deleteTemplate(id: string) {
  return WhatsAppTemplateService.deleteTemplate(id);
}
