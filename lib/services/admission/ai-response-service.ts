// lib/services/admission/ai-response-service.ts
// AI Response Generation Service for Admission CRM

import Anthropic from '@anthropic-ai/sdk';
import type { AdmissionLead, TemplateType } from '@/types/admission';

// Types
export type CommunicationChannel = 'email' | 'whatsapp' | 'sms';

export type ResponseIntent =
  | 'greeting'
  | 'follow_up'
  | 'inquiry_response'
  | 'document_reminder'
  | 'interview_schedule'
  | 'offer_details'
  | 'payment_reminder'
  | 'general';

export interface LeadContext {
  lead: AdmissionLead;
  recentInteractions?: LeadInteraction[];
  counselorName?: string;
  institutionName?: string;
}

export interface LeadInteraction {
  type: 'call' | 'email' | 'whatsapp' | 'sms' | 'meeting';
  direction: 'inbound' | 'outbound';
  summary: string;
  timestamp: string;
}

export interface GenerateResponseInput {
  leadContext: LeadContext;
  channel: CommunicationChannel;
  intent: ResponseIntent;
  customPrompt?: string;
}

export interface SuggestedResponse {
  id: string;
  content: string;
  subject?: string; // For email
  tone: 'formal' | 'friendly' | 'professional';
  confidence: number;
}

export interface GenerateResponseResult {
  suggestions: SuggestedResponse[];
  generatedAt: string;
}

export interface PersonalizeTemplateInput {
  templateContent: string;
  templateSubject?: string;
  lead: AdmissionLead;
  counselorName?: string;
  institutionName?: string;
  customVariables?: Record<string, string>;
}

export interface PersonalizedTemplate {
  content: string;
  subject?: string;
  variablesUsed: string[];
}

/**
 * AIResponseService
 *
 * Service for generating AI-powered response suggestions for counselors
 * Uses Claude API to generate contextual, personalized responses
 */
export class AIResponseService {
  private static anthropic: Anthropic | null = null;

  /**
   * Initialize Anthropic client
   */
  private static getClient(): Anthropic {
    if (!this.anthropic) {
      const apiKey = process.env.CLAUDE_API_KEY;

      if (!apiKey || apiKey === 'your-api-key-here') {
        throw new Error(
          'CLAUDE_API_KEY is not configured. Please add your API key to .env file.'
        );
      }

      this.anthropic = new Anthropic({
        apiKey: apiKey
      });
    }

    return this.anthropic;
  }

  /**
   * Generate AI response suggestions for a lead
   */
  static async generateResponse(
    input: GenerateResponseInput
  ): Promise<GenerateResponseResult> {
    try {
      const client = this.getClient();

      // Build the prompt
      const prompt = this.buildResponsePrompt(input);

      // Call Claude API
      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2048,
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      // Extract text content
      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      // Parse the response
      const suggestions = this.parseResponseSuggestions(
        textContent.text,
        input.channel
      );

      return {
        suggestions,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[admission/ai-response] Error generating response:', error);
      throw error;
    }
  }

  /**
   * Get suggested replies for a lead based on their current stage
   */
  static async getSuggestedReplies(
    leadId: string,
    channel: CommunicationChannel,
    leadContext: LeadContext
  ): Promise<SuggestedResponse[]> {
    // Determine intent based on funnel stage
    const intent = this.determineIntentFromStage(
      leadContext.lead.funnel_stage
    );

    const result = await this.generateResponse({
      leadContext,
      channel,
      intent
    });

    return result.suggestions;
  }

  /**
   * Personalize a template with lead data
   */
  static personalizeTemplate(
    input: PersonalizeTemplateInput
  ): PersonalizedTemplate {
    let content = input.templateContent;
    let subject = input.templateSubject;
    const variablesUsed: string[] = [];

    // Build variables map
    const variables: Record<string, string> = {
      // Lead info
      first_name: this.getFirstName(input.lead.full_name),
      last_name: this.getLastName(input.lead.full_name),
      full_name: input.lead.full_name,
      email: input.lead.email || '',
      phone: input.lead.phone,
      program: input.lead.program_interest || 'your program of interest',

      // Counselor & Institution
      counselor_name: input.counselorName || 'your counselor',
      institution_name: input.institutionName || 'our institution',

      // Stage-specific
      funnel_stage: this.formatStageName(input.lead.funnel_stage),
      priority: input.lead.priority,

      // Custom variables
      ...input.customVariables
    };

    // Replace variables in content
    content = content.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      if (variables[variable] !== undefined) {
        variablesUsed.push(variable);
        return variables[variable];
      }
      return match;
    });

    // Replace variables in subject if present
    if (subject) {
      subject = subject.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
        if (variables[variable] !== undefined) {
          if (!variablesUsed.includes(variable)) {
            variablesUsed.push(variable);
          }
          return variables[variable];
        }
        return match;
      });
    }

    return {
      content,
      subject,
      variablesUsed
    };
  }

  /**
   * Build the prompt for response generation
   */
  private static buildResponsePrompt(input: GenerateResponseInput): string {
    const { leadContext, channel, intent, customPrompt } = input;
    const { lead, recentInteractions, counselorName, institutionName } = leadContext;

    // Channel-specific tone guidance
    const toneGuidance = this.getToneGuidance(channel);

    // Recent interactions context
    let interactionsContext = '';
    if (recentInteractions && recentInteractions.length > 0) {
      interactionsContext = `
Recent Interactions:
${recentInteractions
  .slice(0, 5)
  .map(
    (i) =>
      `- ${i.type.toUpperCase()} (${i.direction}): ${i.summary} - ${new Date(
        i.timestamp
      ).toLocaleDateString()}`
  )
  .join('\n')}
`;
    }

    return `You are a professional admissions counselor assistant for ${
      institutionName || 'an educational institution'
    }. Generate 3 suggested response messages for the following context.

Lead Information:
- Name: ${lead.full_name}
- Email: ${lead.email || 'Not provided'}
- Phone: ${lead.phone}
- Program Interest: ${lead.program_interest || 'Not specified'}
- Current Stage: ${this.formatStageName(lead.funnel_stage)}
- Priority: ${lead.priority}
- Source: ${lead.source}
${lead.notes ? `- Notes: ${lead.notes}` : ''}

${interactionsContext}

Communication Channel: ${channel.toUpperCase()}
Intent: ${this.formatIntentName(intent)}
${counselorName ? `Counselor Name: ${counselorName}` : ''}

${toneGuidance}

${customPrompt ? `Additional Context: ${customPrompt}` : ''}

Generate 3 different response suggestions with varying tones (formal, friendly, professional). Each response should:
1. Be appropriate for ${channel} communication
2. Address the lead by their first name (${this.getFirstName(lead.full_name)})
3. Be contextually relevant to their ${this.formatStageName(lead.funnel_stage)} stage
4. Include a clear call-to-action when appropriate
5. ${channel === 'sms' ? 'Be under 160 characters for single SMS' : channel === 'whatsapp' ? 'Be conversational and use appropriate formatting' : 'Include a proper subject line'}

Return the responses in the following JSON format:
{
  "suggestions": [
    {
      "id": "1",
      "content": "Message content here",
      ${channel === 'email' ? '"subject": "Email subject line",' : ''}
      "tone": "formal|friendly|professional",
      "confidence": 0.0-1.0
    }
  ]
}

IMPORTANT: Return ONLY valid JSON, no markdown code blocks or additional text.`;
  }

  /**
   * Parse AI response into structured suggestions
   */
  private static parseResponseSuggestions(
    responseText: string,
    channel: CommunicationChannel
  ): SuggestedResponse[] {
    try {
      // Clean up the response
      let cleanedText = responseText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText
          .replace(/^```json\n?/, '')
          .replace(/\n?```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      // Try to extract JSON
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedText = jsonMatch[0];
      }

      const parsed = JSON.parse(cleanedText);

      if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
        throw new Error('Invalid response structure');
      }

      return parsed.suggestions.map((s: any, index: number) => ({
        id: s.id || String(index + 1),
        content: String(s.content || ''),
        subject: channel === 'email' ? String(s.subject || '') : undefined,
        tone: ['formal', 'friendly', 'professional'].includes(s.tone)
          ? s.tone
          : 'professional',
        confidence: typeof s.confidence === 'number' ? s.confidence : 0.8
      }));
    } catch (error) {
      console.error('[admission/ai-response] Error parsing response:', error);

      // Return fallback suggestions
      return [
        {
          id: '1',
          content: 'Unable to generate response. Please try again.',
          tone: 'professional',
          confidence: 0
        }
      ];
    }
  }

  /**
   * Get tone guidance based on channel
   */
  private static getToneGuidance(channel: CommunicationChannel): string {
    switch (channel) {
      case 'email':
        return `
Tone Guidelines for Email:
- Use formal salutations (Dear, Hello)
- Include a proper sign-off with counselor name
- Be detailed but concise
- Use professional language
- Structure with paragraphs for readability`;

      case 'whatsapp':
        return `
Tone Guidelines for WhatsApp:
- Be conversational and warm
- Use shorter paragraphs
- Can include appropriate emojis sparingly
- Be direct and clear
- Respond promptly and naturally`;

      case 'sms':
        return `
Tone Guidelines for SMS:
- Be extremely concise (max 160 chars)
- Get to the point immediately
- Include essential info only
- Clear call-to-action
- No unnecessary pleasantries`;

      default:
        return '';
    }
  }

  /**
   * Determine intent based on funnel stage
   */
  private static determineIntentFromStage(stage: string): ResponseIntent {
    switch (stage) {
      case 'new':
        return 'greeting';
      case 'contacted':
      case 'qualified':
        return 'follow_up';
      case 'application_started':
      case 'application_submitted':
        return 'inquiry_response';
      case 'documents_pending':
      case 'documents_verified':
        return 'document_reminder';
      case 'interview_scheduled':
      case 'interview_completed':
        return 'interview_schedule';
      case 'offer_sent':
      case 'offer_accepted':
        return 'offer_details';
      case 'token_paid':
        return 'payment_reminder';
      default:
        return 'general';
    }
  }

  /**
   * Format funnel stage name for display
   */
  private static formatStageName(stage: string): string {
    return stage
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Format intent name for display
   */
  private static formatIntentName(intent: ResponseIntent): string {
    return intent
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get first name from full name
   */
  private static getFirstName(fullName: string): string {
    return fullName.split(' ')[0] || fullName;
  }

  /**
   * Get last name from full name
   */
  private static getLastName(fullName: string): string {
    const parts = fullName.split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  }

  /**
   * Check if AI response service is configured
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
        ? 'AI Response Service is configured and ready'
        : 'Claude API key not configured. Add CLAUDE_API_KEY to your .env file.'
    };
  }
}
