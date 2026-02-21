// lib/services/ai/chatbot-service.ts
// Prospect-facing AI Chatbot Service for JKKN Admissions

import Anthropic from '@anthropic-ai/sdk';
import { createServiceRoleClient } from '@/lib/supabase/server';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ChatbotConfig {
  id: string;
  institution_id: string;
  name: string;
  welcome_message: string;
  system_prompt: string | null;
  enabled_channels: string[];
  languages: string[];
  business_hours: { start: string; end: string; timezone: string };
  handoff_triggers: string[];
  max_turns_before_handoff: number;
  collect_contact_info: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatbotSession {
  id: string;
  chatbot_id: string;
  institution_id: string;
  channel: 'website' | 'whatsapp';
  visitor_id: string | null;
  lead_id: string | null;
  context: SessionContext;
  status: 'active' | 'handed_off' | 'ended';
  handed_off_to: string | null;
  handoff_reason: string | null;
  message_count: number;
  started_at: string;
  last_activity_at: string;
  ended_at: string | null;
}

export interface SessionContext {
  interested_program?: string | null;
  collected_name?: string | null;
  collected_email?: string | null;
  collected_phone?: string | null;
  intent_score?: number;
  language?: string;
}

export interface ChatbotMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: {
    intent_detected?: string;
    confidence?: number;
    suggested_action?: string;
    tokens_used?: number;
  };
  created_at: string;
}

export interface ChatbotAction {
  type: 'handoff' | 'collect_info' | 'suggest_program' | 'schedule_visit' | 'none';
  data?: Record<string, unknown>;
  reason?: string;
}

export interface ChatResponse {
  response: string;
  session_id: string;
  action?: ChatbotAction;
}

export interface KnowledgeBaseDoc {
  id: string;
  chatbot_id: string;
  title: string;
  source_type: 'url' | 'document' | 'manual';
  source_url: string | null;
  content: string;
  status: 'active' | 'processing' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface ChatbotAnalytics {
  total_sessions: number;
  active_sessions: number;
  handed_off_sessions: number;
  ended_sessions: number;
  avg_message_count: number;
  handoff_rate: number;
  top_intents: { intent: string; count: number }[];
  sessions_by_day: { date: string; count: number }[];
  avg_intent_score: number;
  lead_conversion_rate: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_SYSTEM_PROMPT = `You are the JKKN Admissions Assistant, a friendly and knowledgeable AI helping prospective learners explore JKKN Institutions.

IMPORTANT TERMINOLOGY:
- Always say "Learner" (never "Student")
- Always say "Senior Learner" (never "Teacher" or "Faculty")
- Always say "Learning Studio" (never "Classroom")
- Always say "JKKNers" when referring to the JKKN community
- Always say "Learning Pathway" (never "Syllabus")

ABOUT JKKN:
- JKKN Institutions comprises 9 institutions across 6 colleges
- Vision: To be a Leading Global Innovative Solutions provider for the ever changing needs of the society
- Located in Komarapalayam, Tamil Nadu, India
- Offers programs in Health Sciences, Technology, Arts & Professional studies

YOUR BEHAVIOR:
1. Be warm, helpful, and encouraging
2. Answer admission inquiries about programs, fees, eligibility, deadlines, campus life
3. If you don't know specific details, say so honestly and offer to connect with a counselor
4. Collect the prospect's name, email, and phone number naturally during conversation
5. Detect if the prospect wants to speak to a human counselor
6. Support English, Tamil, and Hindi
7. Keep responses concise (2-4 sentences unless detailed info is requested)
8. When a prospect shows strong interest, encourage them to visit campus or schedule a call

RESPONSE FORMAT:
Always respond with valid JSON in this exact format:
{
  "message": "Your response text here",
  "intent": "greeting|program_inquiry|fee_inquiry|eligibility|deadline|campus_life|document_query|scholarship|hostel|placement|general|handoff_request|contact_collection",
  "confidence": 0.0-1.0,
  "action": {
    "type": "none|handoff|collect_info|suggest_program|schedule_visit",
    "data": {},
    "reason": "optional reason"
  },
  "collected_info": {
    "name": null,
    "email": null,
    "phone": null,
    "interested_program": null
  },
  "intent_score": 0-100
}

The intent_score represents how likely this prospect is to enroll (0=just browsing, 100=ready to enroll).
Only include collected_info fields that you actually extracted from the user's message in this turn.`;

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class ChatbotService {
  private static anthropic: Anthropic | null = null;

  /**
   * Initialize Anthropic client
   */
  private static getClient(): Anthropic {
    if (!this.anthropic) {
      const apiKey = process.env.CLAUDE_API_KEY;
      if (!apiKey || apiKey === 'your-api-key-here') {
        throw new Error('CLAUDE_API_KEY is not configured');
      }
      this.anthropic = new Anthropic({ apiKey });
    }
    return this.anthropic;
  }

  /**
   * Main chat method — process a user message and return AI response
   */
  static async chat(
    sessionId: string,
    userMessage: string
  ): Promise<ChatResponse> {
    const supabase = createServiceRoleClient();

    // 1. Get session with config
    const { data: session, error: sessionError } = await supabase
      .from('chatbot_sessions')
      .select('*, chatbot_configs(*)')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status === 'handed_off') {
      return {
        response: 'You have been connected to a counselor. They will respond shortly.',
        session_id: sessionId,
        action: { type: 'handoff', reason: 'Already handed off' },
      };
    }

    if (session.status === 'ended') {
      throw new Error('This chat session has ended');
    }

    const config = session.chatbot_configs as ChatbotConfig;

    // 2. Store user message
    await supabase.from('chatbot_messages').insert({
      session_id: sessionId,
      role: 'user',
      content: userMessage,
      metadata: {},
    });

    // 3. Get conversation history
    const { data: history } = await supabase
      .from('chatbot_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(20);

    // 4. Get knowledge base content
    const { data: knowledgeDocs } = await supabase
      .from('chatbot_knowledge_base')
      .select('title, content')
      .eq('chatbot_id', session.chatbot_id)
      .eq('status', 'active')
      .limit(10);

    const knowledgeContext = (knowledgeDocs || [])
      .map((doc: any) => `## ${doc.title}\n${doc.content}`)
      .join('\n\n');

    // 5. Build system prompt
    const systemPrompt = this.buildSystemPrompt(config, knowledgeContext, session.context);

    // 6. Build messages for Claude
    const messages = (history || []).map((msg: any) => ({
      role: msg.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: msg.content,
    }));

    // 7. Check for handoff triggers before calling AI
    const lowerMessage = userMessage.toLowerCase();
    const handoffTriggered = (config.handoff_triggers || []).some(
      (trigger: string) => lowerMessage.includes(trigger.toLowerCase())
    );

    // Check turn count for auto-handoff
    const turnCount = (history || []).filter((m: any) => m.role === 'user').length;
    const maxTurns = config.max_turns_before_handoff || 10;

    if (handoffTriggered || turnCount >= maxTurns) {
      const reason = handoffTriggered
        ? 'Prospect requested human assistance'
        : `Conversation exceeded ${maxTurns} turns`;

      const handoffResponse = handoffTriggered
        ? 'I understand you would like to speak with a counselor. Let me connect you right away. A counselor will be with you shortly.'
        : 'Let me connect you with one of our admission counselors who can assist you further. They will be with you shortly.';

      // Store assistant message
      await supabase.from('chatbot_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: handoffResponse,
        metadata: { intent_detected: 'handoff_request', suggested_action: 'handoff' },
      });

      // Update session
      await supabase
        .from('chatbot_sessions')
        .update({
          status: 'handed_off',
          handoff_reason: reason,
          message_count: (session.message_count || 0) + 2,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      return {
        response: handoffResponse,
        session_id: sessionId,
        action: { type: 'handoff', reason },
      };
    }

    // 8. Call Claude
    const client = this.getClient();
    const aiResponse = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      temperature: 0.3,
      system: systemPrompt,
      messages,
    });

    const textContent = aiResponse.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in AI response');
    }

    // 9. Parse structured response
    const parsed = this.parseAIResponse(textContent.text);

    // 10. Update session context with collected info
    const updatedContext = { ...((session.context as SessionContext) || {}) };
    if (parsed.collected_info) {
      if (parsed.collected_info.name) updatedContext.collected_name = parsed.collected_info.name;
      if (parsed.collected_info.email) updatedContext.collected_email = parsed.collected_info.email;
      if (parsed.collected_info.phone) updatedContext.collected_phone = parsed.collected_info.phone;
      if (parsed.collected_info.interested_program) updatedContext.interested_program = parsed.collected_info.interested_program;
    }
    if (parsed.intent_score !== undefined) {
      updatedContext.intent_score = parsed.intent_score;
    }

    // 11. Store assistant message
    await supabase.from('chatbot_messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content: parsed.message,
      metadata: {
        intent_detected: parsed.intent,
        confidence: parsed.confidence,
        suggested_action: parsed.action?.type,
        tokens_used: aiResponse.usage?.output_tokens,
      },
    });

    // 12. Update session
    await supabase
      .from('chatbot_sessions')
      .update({
        context: updatedContext,
        message_count: (session.message_count || 0) + 2,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    // 13. If AI suggests handoff, do it
    if (parsed.action?.type === 'handoff') {
      await supabase
        .from('chatbot_sessions')
        .update({
          status: 'handed_off',
          handoff_reason: parsed.action.reason || 'AI recommended handoff',
        })
        .eq('id', sessionId);
    }

    return {
      response: parsed.message,
      session_id: sessionId,
      action: parsed.action?.type !== 'none' ? parsed.action : undefined,
    };
  }

  /**
   * Create a new chat session
   */
  static async createSession(
    chatbotId: string,
    channel: 'website' | 'whatsapp' = 'website',
    visitorId?: string
  ): Promise<ChatbotSession> {
    const supabase = createServiceRoleClient();

    // Get chatbot config to retrieve institution_id
    const { data: config, error: configError } = await supabase
      .from('chatbot_configs')
      .select('id, institution_id, welcome_message, is_active')
      .eq('id', chatbotId)
      .single();

    if (configError || !config) {
      throw new Error(`Chatbot config not found: ${chatbotId}`);
    }

    if (!config.is_active) {
      throw new Error('This chatbot is currently disabled');
    }

    // Create session
    const { data: session, error: sessionError } = await supabase
      .from('chatbot_sessions')
      .insert({
        chatbot_id: chatbotId,
        institution_id: config.institution_id,
        channel,
        visitor_id: visitorId || null,
        context: { language: 'en', intent_score: 0 },
        status: 'active',
        message_count: 1,
      })
      .select()
      .single();

    if (sessionError || !session) {
      throw new Error(`Failed to create session: ${sessionError?.message}`);
    }

    // Store welcome message
    await supabase.from('chatbot_messages').insert({
      session_id: session.id,
      role: 'assistant',
      content: config.welcome_message,
      metadata: { intent_detected: 'greeting', confidence: 1.0 },
    });

    return session as ChatbotSession;
  }

  /**
   * Hand off a session to a human counselor
   */
  static async handoffToHuman(
    sessionId: string,
    reason: string,
    counselorId?: string
  ): Promise<void> {
    const supabase = createServiceRoleClient();

    const updateData: Record<string, unknown> = {
      status: 'handed_off',
      handoff_reason: reason,
      last_activity_at: new Date().toISOString(),
    };

    if (counselorId) {
      updateData.handed_off_to = counselorId;
    }

    const { error } = await supabase
      .from('chatbot_sessions')
      .update(updateData)
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to handoff session: ${error.message}`);
    }

    // Add system message to record handoff
    await supabase.from('chatbot_messages').insert({
      session_id: sessionId,
      role: 'system',
      content: `Session handed off to human counselor. Reason: ${reason}`,
      metadata: { suggested_action: 'handoff' },
    });
  }

  /**
   * Get session history (messages)
   */
  static async getSessionHistory(sessionId: string): Promise<ChatbotMessage[]> {
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('chatbot_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch session history: ${error.message}`);
    }

    return (data || []) as ChatbotMessage[];
  }

  /**
   * Update knowledge base documents
   */
  static async updateKnowledgeBase(
    chatbotId: string,
    documents: { title: string; source_type: string; source_url?: string; content: string }[]
  ): Promise<void> {
    const supabase = createServiceRoleClient();

    const inserts = documents.map((doc) => ({
      chatbot_id: chatbotId,
      title: doc.title,
      source_type: doc.source_type,
      source_url: doc.source_url || null,
      content: doc.content,
      status: 'active',
    }));

    const { error } = await supabase
      .from('chatbot_knowledge_base')
      .insert(inserts);

    if (error) {
      throw new Error(`Failed to update knowledge base: ${error.message}`);
    }
  }

  /**
   * Get chatbot analytics for a date range
   */
  static async getAnalytics(
    chatbotId: string,
    from?: string,
    to?: string
  ): Promise<ChatbotAnalytics> {
    const supabase = createServiceRoleClient();

    // Build sessions query
    let sessionsQuery = supabase
      .from('chatbot_sessions')
      .select('*')
      .eq('chatbot_id', chatbotId);

    if (from) sessionsQuery = sessionsQuery.gte('started_at', from);
    if (to) sessionsQuery = sessionsQuery.lte('started_at', to);

    const { data: sessions, error } = await sessionsQuery;

    if (error) {
      throw new Error(`Failed to fetch analytics: ${error.message}`);
    }

    const allSessions = sessions || [];
    const totalSessions = allSessions.length;

    const activeSessions = allSessions.filter((s: any) => s.status === 'active').length;
    const handedOffSessions = allSessions.filter((s: any) => s.status === 'handed_off').length;
    const endedSessions = allSessions.filter((s: any) => s.status === 'ended').length;

    const avgMessageCount = totalSessions > 0
      ? allSessions.reduce((sum: number, s: any) => sum + (s.message_count || 0), 0) / totalSessions
      : 0;

    const handoffRate = totalSessions > 0
      ? (handedOffSessions / totalSessions) * 100
      : 0;

    // Avg intent score
    const sessionsWithScore = allSessions.filter(
      (s: any) => s.context?.intent_score !== undefined && s.context?.intent_score > 0
    );
    const avgIntentScore = sessionsWithScore.length > 0
      ? sessionsWithScore.reduce((sum: number, s: any) => sum + (s.context?.intent_score || 0), 0) / sessionsWithScore.length
      : 0;

    // Lead conversion: sessions that got linked to a lead
    const convertedSessions = allSessions.filter((s: any) => s.lead_id).length;
    const leadConversionRate = totalSessions > 0
      ? (convertedSessions / totalSessions) * 100
      : 0;

    // Get intent distribution from messages
    let messagesQuery = supabase
      .from('chatbot_messages')
      .select('metadata, session_id')
      .eq('role', 'assistant')
      .in(
        'session_id',
        allSessions.map((s: any) => s.id)
      );

    const { data: messages } = await messagesQuery;

    // Count intents
    const intentCounts: Record<string, number> = {};
    (messages || []).forEach((msg: any) => {
      const intent = msg.metadata?.intent_detected;
      if (intent && intent !== 'greeting') {
        intentCounts[intent] = (intentCounts[intent] || 0) + 1;
      }
    });

    const topIntents = Object.entries(intentCounts)
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Sessions by day
    const dayMap: Record<string, number> = {};
    allSessions.forEach((s: any) => {
      const day = (s.started_at || s.created_at)?.split('T')[0];
      if (day) dayMap[day] = (dayMap[day] || 0) + 1;
    });

    const sessionsByDay = Object.entries(dayMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      total_sessions: totalSessions,
      active_sessions: activeSessions,
      handed_off_sessions: handedOffSessions,
      ended_sessions: endedSessions,
      avg_message_count: Math.round(avgMessageCount * 10) / 10,
      handoff_rate: Math.round(handoffRate * 10) / 10,
      top_intents: topIntents,
      sessions_by_day: sessionsByDay,
      avg_intent_score: Math.round(avgIntentScore),
      lead_conversion_rate: Math.round(leadConversionRate * 10) / 10,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build the system prompt with config, knowledge, and session context
   */
  private static buildSystemPrompt(
    config: ChatbotConfig,
    knowledgeContext: string,
    sessionContext: SessionContext
  ): string {
    let prompt = config.system_prompt || DEFAULT_SYSTEM_PROMPT;

    if (knowledgeContext) {
      prompt += `\n\nKNOWLEDGE BASE (use this information to answer questions):\n${knowledgeContext}`;
    }

    if (sessionContext) {
      const contextParts: string[] = [];
      if (sessionContext.collected_name) contextParts.push(`Prospect's name: ${sessionContext.collected_name}`);
      if (sessionContext.collected_email) contextParts.push(`Prospect's email: ${sessionContext.collected_email}`);
      if (sessionContext.collected_phone) contextParts.push(`Prospect's phone: ${sessionContext.collected_phone}`);
      if (sessionContext.interested_program) contextParts.push(`Interested in: ${sessionContext.interested_program}`);
      if (sessionContext.language && sessionContext.language !== 'en') contextParts.push(`Preferred language: ${sessionContext.language}`);

      if (contextParts.length > 0) {
        prompt += `\n\nSESSION CONTEXT (information already collected):\n${contextParts.join('\n')}`;
      }
    }

    return prompt;
  }

  /**
   * Parse AI response into structured format with fallback
   */
  private static parseAIResponse(responseText: string): {
    message: string;
    intent: string;
    confidence: number;
    action: ChatbotAction;
    collected_info: Record<string, string | null>;
    intent_score?: number;
  } {
    try {
      // Try to extract JSON from the response
      let cleanedText = responseText.trim();

      // Remove markdown code blocks
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      // Try to find JSON object
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedText = jsonMatch[0];
      }

      const parsed = JSON.parse(cleanedText);

      return {
        message: parsed.message || responseText,
        intent: parsed.intent || 'general',
        confidence: parsed.confidence || 0.8,
        action: parsed.action || { type: 'none' },
        collected_info: parsed.collected_info || {},
        intent_score: parsed.intent_score,
      };
    } catch {
      // Fallback: treat the whole response as the message
      return {
        message: responseText,
        intent: 'general',
        confidence: 0.5,
        action: { type: 'none' },
        collected_info: {},
      };
    }
  }

  /**
   * Check if the service is configured
   */
  static isConfigured(): boolean {
    const apiKey = process.env.CLAUDE_API_KEY;
    return !!apiKey && apiKey !== 'your-api-key-here';
  }

  /**
   * Get configuration status
   */
  static getConfigStatus(): { configured: boolean; message: string } {
    const configured = this.isConfigured();
    return {
      configured,
      message: configured
        ? 'Chatbot AI service is configured and ready'
        : 'CLAUDE_API_KEY is not configured. Add it to your .env file.',
    };
  }
}
