// WhatsApp Chat Service — Two-way conversation management
// Meritto Echo equivalent for MyJKKN Admission CRM
// Manages wa_conversations and wa_messages tables

import { createClient } from '@supabase/supabase-js';
import {
  sendTextMessage,
  sendTemplateMessage as apiSendTemplate,
  sendMediaMessage as apiSendMedia,
  markAsRead,
  getMediaUrl,
  type WATemplateComponent,
} from './whatsapp-api-client';
import { WhatsAppConsentService } from './whatsapp-consent-service';
import { WhatsAppRoutingService } from './whatsapp-routing-service';

// =============================================================================
// Types
// =============================================================================

export interface Conversation {
  id: string;
  institution_id: string;
  lead_id: string | null;
  contact_phone: string;
  contact_name: string | null;
  contact_wa_id: string | null;
  contact_profile_pic_url: string | null;
  assigned_to: string | null;
  status: 'open' | 'waiting' | 'resolved' | 'expired';
  last_message_at: string;
  last_message_preview: string | null;
  last_inbound_at: string | null;
  unread_count: number;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined relations
  lead?: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    stage: string;
    score: number | null;
    source: string | null;
    assigned_to: string | null;
  } | null;
  assigned_profile?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  wa_message_id: string | null;
  direction: 'inbound' | 'outbound';
  sender_type: 'prospect' | 'counselor' | 'system' | 'bot';
  sender_id: string | null;
  message_type: string;
  content: {
    text?: string;
    media_url?: string;
    media_mime_type?: string;
    filename?: string;
    caption?: string;
    latitude?: number;
    longitude?: number;
    template_name?: string;
    interactive_type?: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  status: 'sent' | 'delivered' | 'read' | 'failed';
  error_message: string | null;
  created_at: string;
  // Joined
  sender_profile?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
}

export interface ConversationFilters {
  institution_id: string;
  status?: string;
  assigned_to?: string;
  search?: string;
  tags?: string[];
  date_from?: string;
  date_to?: string;
  funnel_stage?: string;
  page?: number;
  limit?: number;
}

export interface ChatStats {
  total_open: number;
  total_waiting: number;
  total_resolved: number;
  total_unread: number;
  avg_response_time_minutes: number | null;
  conversations_today: number;
  messages_today: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
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

export class WhatsAppChatService {
  // ---------------------------------------------------------------------------
  // 24hr Messaging Window
  // ---------------------------------------------------------------------------

  /**
   * Compute the 24-hour messaging window status from the last inbound timestamp.
   * WhatsApp only allows free-text messages within 24h of the last inbound message.
   */
  static getWindowStatus(lastInboundAt: string | null): {
    withinWindow: boolean;
    expiresAt: string | null;
    remainingMinutes: number | null;
    status: 'open' | 'closing' | 'expired' | 'never';
  } {
    if (!lastInboundAt) {
      return { withinWindow: false, expiresAt: null, remainingMinutes: null, status: 'never' };
    }

    const lastInbound = new Date(lastInboundAt);
    const windowEnd = new Date(lastInbound.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();
    const withinWindow = now < windowEnd;
    const remainingMs = windowEnd.getTime() - now.getTime();
    const remainingMinutes = withinWindow ? Math.round(remainingMs / 60000) : null;

    let status: 'open' | 'closing' | 'expired' | 'never' = 'expired';
    if (withinWindow) {
      status = remainingMinutes! < 60 ? 'closing' : 'open';
    }

    return { withinWindow, expiresAt: windowEnd.toISOString(), remainingMinutes, status };
  }

  // ---------------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------------

  /**
   * Get paginated conversation list with filters
   */
  static async getConversations(
    filters: ConversationFilters
  ): Promise<PaginatedResult<Conversation>> {
    const supabase = getServiceClient();
    const page = filters.page || 1;
    const limit = filters.limit || 25;
    const offset = (page - 1) * limit;

    // Use !inner join when filtering by funnel_stage so only conversations with matching leads are returned
    const leadJoin = filters.funnel_stage
      ? 'lead:admission_leads!wa_conversations_lead_id_fkey!inner(id, full_name, email, phone, stage, funnel_stage, score, source, assigned_to)'
      : 'lead:admission_leads!wa_conversations_lead_id_fkey(id, full_name, email, phone, stage, score, source, assigned_to)';

    let query = supabase
      .from('wa_conversations')
      .select(
        `
        *,
        ${leadJoin},
        assigned_profile:profiles!wa_conversations_assigned_to_fkey(id, full_name, avatar_url)
      `,
        { count: 'exact' }
      )
      .eq('institution_id', filters.institution_id)
      .order('last_message_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.assigned_to) {
      query = query.eq('assigned_to', filters.assigned_to);
    }
    if (filters.search) {
      query = query.or(
        `contact_phone.ilike.%${filters.search}%,contact_name.ilike.%${filters.search}%`
      );
    }
    if (filters.tags && filters.tags.length > 0) {
      query = query.overlaps('tags', filters.tags);
    }
    if (filters.date_from) {
      query = query.gte('last_message_at', filters.date_from);
    }
    if (filters.date_to) {
      query = query.lte('last_message_at', filters.date_to);
    }
    if (filters.funnel_stage) {
      query = query.eq('lead.funnel_stage' as string, filters.funnel_stage);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch conversations: ${error.message}`);

    const total = count || 0;
    return {
      data: (data as Conversation[]) || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single conversation by ID
   */
  static async getConversation(conversationId: string): Promise<Conversation | null> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('wa_conversations')
      .select(
        `
        *,
        lead:admission_leads!wa_conversations_lead_id_fkey(id, full_name, email, phone, stage, score, source, assigned_to),
        assigned_profile:profiles!wa_conversations_assigned_to_fkey(id, full_name, avatar_url)
      `
      )
      .eq('id', conversationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch conversation: ${error.message}`);
    }

    return data as Conversation;
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  /**
   * Get messages for a conversation (cursor-based pagination)
   */
  static async getMessages(
    conversationId: string,
    cursor?: string,
    limit = 50
  ): Promise<{ data: ChatMessage[]; nextCursor: string | null }> {
    const supabase = getServiceClient();

    let query = supabase
      .from('wa_messages')
      .select(
        `
        *,
        sender_profile:profiles!wa_messages_sender_id_fkey(id, full_name, avatar_url)
      `
      )
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch messages: ${error.message}`);

    const messages = (data as ChatMessage[]) || [];
    let nextCursor: string | null = null;

    if (messages.length > limit) {
      const extra = messages.pop();
      nextCursor = extra!.created_at;
    }

    // Return in chronological order
    return { data: messages.reverse(), nextCursor };
  }

  // ---------------------------------------------------------------------------
  // Send Messages
  // ---------------------------------------------------------------------------

  /**
   * Send a text message in a conversation
   */
  static async sendMessage(
    conversationId: string,
    senderId: string,
    content: { text?: string; media_url?: string; media_type?: string; caption?: string; filename?: string }
  ): Promise<ChatMessage> {
    const supabase = getServiceClient();

    // Get conversation
    const conversation = await this.getConversation(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    // Enforce 24hr messaging window — free-text/media only allowed within window
    const windowStatus = WhatsAppChatService.getWindowStatus(conversation.last_inbound_at);
    if (!windowStatus.withinWindow) {
      throw new Error(
        'Outside 24hr messaging window. Use template messages instead. ' +
        'The prospect must send a message first to reopen the window.'
      );
    }

    // Consent check for free-text messages (template messages exempt per Meta policy)
    if (conversation.lead_id) {
      const consent = await WhatsAppConsentService.checkConsent(conversation.lead_id);
      if (!consent.hasConsent) {
        throw new Error('Lead has not opted in to WhatsApp messages. Only template messages are allowed.');
      }
    }

    let waResponse;
    let messageType = 'text';

    if (content.media_url && content.media_type) {
      // Send media message
      messageType = content.media_type;
      waResponse = await apiSendMedia(
        conversation.contact_phone,
        content.media_type as 'image' | 'video' | 'document' | 'audio',
        content.media_url,
        content.caption,
        content.filename
      );
    } else if (content.text) {
      // Send text message
      waResponse = await sendTextMessage(conversation.contact_phone, content.text);
    } else {
      throw new Error('Message must have text or media content');
    }

    const waMessageId = waResponse.messages?.[0]?.id;

    // Store message
    const messageRecord = {
      conversation_id: conversationId,
      wa_message_id: waMessageId || null,
      direction: 'outbound' as const,
      sender_type: 'counselor' as const,
      sender_id: senderId,
      message_type: messageType,
      content: {
        text: content.text || content.caption || undefined,
        media_url: content.media_url || undefined,
        caption: content.caption || undefined,
        filename: content.filename || undefined,
      },
      status: 'sent' as const,
    };

    const { data: msg, error: msgError } = await supabase
      .from('wa_messages')
      .insert(messageRecord)
      .select('*')
      .single();

    if (msgError) throw new Error(`Failed to store message: ${msgError.message}`);

    // Update conversation
    const preview = content.text || content.caption || `[${messageType}]`;
    await supabase
      .from('wa_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: preview.substring(0, 200),
        status: 'waiting', // Waiting for prospect reply
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    // Gap 15: Log cost for session messages (free within 24hr window)
    try {
      await supabase.from('communication_cost_log').insert({
        institution_id: conversation.institution_id,
        channel: 'whatsapp',
        event_type: 'session_send',
        unit_cost: 0.00,
        quantity: 1,
        reference_id: msg.id,
        metadata: { conversation_id: conversationId, template_name: null },
      });
    } catch { /* Non-critical */ }

    return msg as ChatMessage;
  }

  /**
   * Send a template message in a conversation
   */
  static async sendTemplateMessage(
    conversationId: string,
    senderId: string,
    templateName: string,
    languageCode: string,
    components?: WATemplateComponent[]
  ): Promise<ChatMessage> {
    const supabase = getServiceClient();

    const conversation = await this.getConversation(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    const waResponse = await apiSendTemplate(
      conversation.contact_phone,
      templateName,
      languageCode,
      components
    );
    const waMessageId = waResponse.messages?.[0]?.id;

    const messageRecord = {
      conversation_id: conversationId,
      wa_message_id: waMessageId || null,
      direction: 'outbound' as const,
      sender_type: 'counselor' as const,
      sender_id: senderId,
      message_type: 'template',
      content: { template_name: templateName },
      status: 'sent' as const,
    };

    const { data: msg, error: msgError } = await supabase
      .from('wa_messages')
      .insert(messageRecord)
      .select('*')
      .single();

    if (msgError) throw new Error(`Failed to store template message: ${msgError.message}`);

    await supabase
      .from('wa_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: `[Template: ${templateName}]`,
        status: 'waiting',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    // Gap 15: Log cost for template messages (~INR 0.47 business-initiated)
    try {
      await supabase.from('communication_cost_log').insert({
        institution_id: conversation.institution_id,
        channel: 'whatsapp',
        event_type: 'template_send',
        unit_cost: 0.47,
        quantity: 1,
        reference_id: msg.id,
        metadata: { conversation_id: conversationId, template_name: templateName },
      });
    } catch { /* Non-critical */ }

    return msg as ChatMessage;
  }

  // ---------------------------------------------------------------------------
  // Inbound Message Handling
  // ---------------------------------------------------------------------------

  /**
   * Handle an inbound message from Meta webhook
   */
  static async handleInboundMessage(params: {
    institution_id: string;
    from: string;
    wa_id: string;
    timestamp: string;
    message_id: string;
    type: string;
    name?: string;
    text?: string;
    media_id?: string;
    media_mime_type?: string;
    caption?: string;
    latitude?: number;
    longitude?: number;
    filename?: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  }): Promise<void> {
    const supabase = getServiceClient();

    // 1. Find or create conversation
    let conversation: Conversation | null = null;

    const { data: existing } = await supabase
      .from('wa_conversations')
      .select('*')
      .eq('institution_id', params.institution_id)
      .eq('contact_phone', params.from)
      .single();

    if (existing) {
      conversation = existing as Conversation;
    } else {
      // Auto-link to lead if phone matches
      let leadId: string | null = null;
      const { data: lead } = await supabase
        .from('admission_leads')
        .select('id')
        .eq('institution_id', params.institution_id)
        .eq('phone', params.from)
        .limit(1)
        .single();

      if (lead) leadId = lead.id;

      const { data: created, error: createErr } = await supabase
        .from('wa_conversations')
        .insert({
          institution_id: params.institution_id,
          contact_phone: params.from,
          contact_name: params.name || null,
          contact_wa_id: params.wa_id,
          lead_id: leadId,
          status: 'open',
          last_message_at: new Date().toISOString(),
          unread_count: 0,
          tags: [],
          metadata: {},
        })
        .select('*')
        .single();

      if (createErr) throw new Error(`Failed to create conversation: ${createErr.message}`);
      conversation = created as Conversation;
    }

    // 2. Build media URL if applicable
    let mediaUrl: string | undefined;
    if (params.media_id) {
      try {
        mediaUrl = await getMediaUrl(params.media_id);
      } catch {
        console.warn(`[wa-chat] Failed to get media URL for ${params.media_id}`);
      }
    }

    // 3. Build message content
    const content: ChatMessage['content'] = {};
    if (params.text) content.text = params.text;
    if (mediaUrl) content.media_url = mediaUrl;
    if (params.media_mime_type) content.media_mime_type = params.media_mime_type;
    if (params.caption) content.caption = params.caption;
    if (params.filename) content.filename = params.filename;
    if (params.latitude != null) content.latitude = params.latitude;
    if (params.longitude != null) content.longitude = params.longitude;
    if (params.button_reply) content.button_reply = params.button_reply;
    if (params.list_reply) content.list_reply = params.list_reply;

    // 4. Store message
    const { error: msgErr } = await supabase.from('wa_messages').insert({
      conversation_id: conversation.id,
      wa_message_id: params.message_id,
      direction: 'inbound',
      sender_type: 'prospect',
      sender_id: null,
      message_type: params.type || 'text',
      content,
      status: 'delivered',
    });

    if (msgErr) throw new Error(`Failed to store inbound message: ${msgErr.message}`);

    // 5. Update conversation
    const preview =
      params.text || params.caption || `[${params.type || 'message'}]`;

    const updatePayload: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
      last_message_preview: preview.substring(0, 200),
      last_inbound_at: new Date().toISOString(),
      unread_count: (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    };

    // Reopen resolved conversations on new inbound
    if (conversation.status === 'resolved' || conversation.status === 'expired') {
      updatePayload.status = 'open';
    }
    // If waiting for reply, mark as open
    if (conversation.status === 'waiting') {
      updatePayload.status = 'open';
    }

    // Update contact name if provided
    if (params.name && !conversation.contact_name) {
      updatePayload.contact_name = params.name;
    }
    if (params.wa_id && !conversation.contact_wa_id) {
      updatePayload.contact_wa_id = params.wa_id;
    }

    await supabase
      .from('wa_conversations')
      .update(updatePayload)
      .eq('id', conversation.id);

    // 6. Mark as read on Meta side
    try {
      await markAsRead(params.message_id);
    } catch {
      // Non-critical
    }

    // 7. Auto-assign if no counselor and lead has one
    if (!conversation.assigned_to && conversation.lead_id) {
      const { data: lead } = await supabase
        .from('admission_leads')
        .select('assigned_to, interested_programs, source, score')
        .eq('id', conversation.lead_id)
        .single();

      if (lead?.assigned_to) {
        await supabase
          .from('wa_conversations')
          .update({ assigned_to: lead.assigned_to })
          .eq('id', conversation.id);
        // Update local reference so routing step knows it's assigned
        conversation.assigned_to = lead.assigned_to;
      }

      // 7b. Auto-grant consent on inbound (implicit consent per Meta policy)
      if (conversation.lead_id) {
        try {
          await WhatsAppConsentService.autoGrantOnInbound(conversation.lead_id, params.institution_id);
        } catch {
          // Non-critical — don't block message processing
        }
      }

      // 7c. Check for STOP keywords
      if (params.text && conversation.lead_id) {
        if (WhatsAppConsentService.isStopKeyword(params.text)) {
          try {
            await WhatsAppConsentService.handleStopKeyword(conversation.lead_id, params.institution_id);
          } catch {
            // Non-critical
          }
        }
      }

      // 8. Smart routing: categorize message and set priority
      const category = WhatsAppRoutingService.categorizeMessage(params.text || '');
      await WhatsAppRoutingService.setConversationPriority(conversation.id, category);

      if (!conversation.assigned_to) {
        // Only route if not already assigned (from step 7)
        const leadData = lead ? {
          interested_programs: lead.interested_programs as string[] | undefined,
          source: lead.source as string | undefined,
          score: lead.score as number | undefined,
        } : undefined;

        const route = await WhatsAppRoutingService.routeConversation({
          conversationId: conversation.id,
          institutionId: params.institution_id,
          messageCategory: category,
          leadData,
        });

        if (route.assignedTo) {
          await supabase.from('wa_conversations')
            .update({
              assigned_to: route.assignedTo,
              metadata: {
                ...(conversation.metadata || {}),
                routing_reason: route.routingReason,
              },
            })
            .eq('id', conversation.id);
        }
      }

      // 9. Auto-tag conversation with category
      if (category !== 'general') {
        const currentTags = conversation.tags || [];
        if (!currentTags.includes(category)) {
          await supabase.from('wa_conversations')
            .update({ tags: [...currentTags, category] })
            .eq('id', conversation.id);
        }
      }
    } else {
      // No lead linked — still do consent auto-grant for new conversations with linked lead
      // and still do routing + categorization

      // 7b. Auto-grant consent on inbound (if lead linked)
      if (conversation.lead_id) {
        try {
          await WhatsAppConsentService.autoGrantOnInbound(conversation.lead_id, params.institution_id);
        } catch {
          // Non-critical
        }
      }

      // 7c. Check for STOP keywords
      if (params.text && conversation.lead_id) {
        if (WhatsAppConsentService.isStopKeyword(params.text)) {
          try {
            await WhatsAppConsentService.handleStopKeyword(conversation.lead_id, params.institution_id);
          } catch {
            // Non-critical
          }
        }
      }

      // 8. Smart routing: categorize + set priority
      const category = WhatsAppRoutingService.categorizeMessage(params.text || '');
      await WhatsAppRoutingService.setConversationPriority(conversation.id, category);

      if (!conversation.assigned_to) {
        const route = await WhatsAppRoutingService.routeConversation({
          conversationId: conversation.id,
          institutionId: params.institution_id,
          messageCategory: category,
        });

        if (route.assignedTo) {
          await supabase.from('wa_conversations')
            .update({
              assigned_to: route.assignedTo,
              metadata: {
                ...(conversation.metadata || {}),
                routing_reason: route.routingReason,
              },
            })
            .eq('id', conversation.id);
        }
      }

      // 9. Auto-tag conversation with category
      if (category !== 'general') {
        const currentTags = conversation.tags || [];
        if (!currentTags.includes(category)) {
          await supabase.from('wa_conversations')
            .update({ tags: [...currentTags, category] })
            .eq('id', conversation.id);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Conversation Actions
  // ---------------------------------------------------------------------------

  static async assignConversation(
    conversationId: string,
    counselorId: string
  ): Promise<void> {
    const supabase = getServiceClient();

    const { error } = await supabase
      .from('wa_conversations')
      .update({
        assigned_to: counselorId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    if (error) throw new Error(`Failed to assign conversation: ${error.message}`);

    // Add system message
    await supabase.from('wa_messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      sender_type: 'system',
      sender_id: counselorId,
      message_type: 'text',
      content: { text: 'Conversation assigned' },
      status: 'delivered',
    });
  }

  static async resolveConversation(conversationId: string): Promise<void> {
    const supabase = getServiceClient();

    const { error } = await supabase
      .from('wa_conversations')
      .update({
        status: 'resolved',
        unread_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    if (error) throw new Error(`Failed to resolve conversation: ${error.message}`);
  }

  static async reopenConversation(conversationId: string): Promise<void> {
    const supabase = getServiceClient();

    const { error } = await supabase
      .from('wa_conversations')
      .update({
        status: 'open',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    if (error) throw new Error(`Failed to reopen conversation: ${error.message}`);
  }

  /**
   * Mark conversation messages as read (reset unread_count)
   */
  static async markConversationRead(conversationId: string): Promise<void> {
    const supabase = getServiceClient();
    await supabase
      .from('wa_conversations')
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq('id', conversationId);
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  static async getConversationStats(institutionId: string): Promise<ChatStats> {
    const supabase = getServiceClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Conversation counts by status
    const { data: statusCounts } = await supabase
      .from('wa_conversations')
      .select('status')
      .eq('institution_id', institutionId);

    let totalOpen = 0;
    let totalWaiting = 0;
    let totalResolved = 0;
    let totalUnread = 0;

    if (statusCounts) {
      for (const row of statusCounts) {
        switch (row.status) {
          case 'open':
            totalOpen++;
            break;
          case 'waiting':
            totalWaiting++;
            break;
          case 'resolved':
            totalResolved++;
            break;
        }
      }
    }

    // Unread total
    const { data: unreadData } = await supabase
      .from('wa_conversations')
      .select('unread_count')
      .eq('institution_id', institutionId)
      .gt('unread_count', 0);

    if (unreadData) {
      totalUnread = unreadData.reduce(
        (sum, r) => sum + ((r as { unread_count: number }).unread_count || 0),
        0
      );
    }

    // Today's conversations
    const { count: conversationsToday } = await supabase
      .from('wa_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .gte('created_at', todayStart.toISOString());

    // Today's messages
    const { count: messagesToday } = await supabase
      .from('wa_messages')
      .select('id', { count: 'exact', head: true })
      .in(
        'conversation_id',
        (
          await supabase
            .from('wa_conversations')
            .select('id')
            .eq('institution_id', institutionId)
        ).data?.map((c) => c.id) || []
      )
      .gte('created_at', todayStart.toISOString());

    return {
      total_open: totalOpen,
      total_waiting: totalWaiting,
      total_resolved: totalResolved,
      total_unread: totalUnread,
      avg_response_time_minutes: null, // Computed separately when needed
      conversations_today: conversationsToday || 0,
      messages_today: messagesToday || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  static async searchMessages(
    institutionId: string,
    query: string,
    limit = 50
  ): Promise<ChatMessage[]> {
    const supabase = getServiceClient();

    // Get conversation IDs for institution
    const { data: convIds } = await supabase
      .from('wa_conversations')
      .select('id')
      .eq('institution_id', institutionId);

    if (!convIds || convIds.length === 0) return [];

    const ids = convIds.map((c) => c.id);

    const { data, error } = await supabase
      .from('wa_messages')
      .select('*')
      .in('conversation_id', ids)
      .ilike('content->>text', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Search failed: ${error.message}`);
    return (data as ChatMessage[]) || [];
  }

  // ---------------------------------------------------------------------------
  // Delivery Status Updates
  // ---------------------------------------------------------------------------

  /**
   * Update message delivery status from webhook
   */
  static async updateMessageStatus(
    waMessageId: string,
    status: 'sent' | 'delivered' | 'read' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    const supabase = getServiceClient();

    const update: Record<string, unknown> = { status };
    if (errorMessage) update.error_message = errorMessage;

    await supabase
      .from('wa_messages')
      .update(update)
      .eq('wa_message_id', waMessageId);
  }

  // ---------------------------------------------------------------------------
  // Quick Replies
  // ---------------------------------------------------------------------------

  static async getQuickReplies(institutionId: string) {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_quick_replies')
      .select('*')
      .eq('institution_id', institutionId)
      .order('usage_count', { ascending: false });

    if (error) throw new Error(`Failed to fetch quick replies: ${error.message}`);
    return data || [];
  }

  static async createQuickReply(params: {
    institution_id: string;
    title: string;
    content: string;
    shortcut?: string;
    category?: string;
    created_by: string;
  }) {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_quick_replies')
      .insert(params)
      .select('*')
      .single();

    if (error) throw new Error(`Failed to create quick reply: ${error.message}`);
    return data;
  }

  static async updateQuickReply(
    id: string,
    params: { title?: string; content?: string; shortcut?: string; category?: string }
  ) {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_quick_replies')
      .update({ ...params, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error(`Failed to update quick reply: ${error.message}`);
    return data;
  }

  static async deleteQuickReply(id: string) {
    const supabase = getServiceClient();
    const { error } = await supabase.from('wa_quick_replies').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete quick reply: ${error.message}`);
  }

  static async incrementQuickReplyUsage(id: string) {
    const supabase = getServiceClient();
    // Use rpc or raw increment
    const { data } = await supabase
      .from('wa_quick_replies')
      .select('usage_count')
      .eq('id', id)
      .single();

    if (data) {
      await supabase
        .from('wa_quick_replies')
        .update({ usage_count: (data.usage_count || 0) + 1 })
        .eq('id', id);
    }
  }
}
