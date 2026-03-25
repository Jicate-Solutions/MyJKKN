// lib/services/ai/chatbot-service.ts
// Chatbot service stub - to be fully implemented when chatbot integration is ready

export interface ChatbotAnalytics {
  total_sessions: number;
  active_sessions: number;
  avg_messages_per_session: number;
  handoff_rate: number;
  resolution_rate: number;
  avg_response_time_ms: number;
  top_intents: Array<{ intent: string; count: number }>;
}

export class ChatbotService {
  static async getAnalytics(
    chatbotId: string,
    from?: string,
    to?: string
  ): Promise<ChatbotAnalytics> {
    console.warn('[chatbot-service] getAnalytics stub called');
    return {
      total_sessions: 0,
      active_sessions: 0,
      avg_messages_per_session: 0,
      handoff_rate: 0,
      resolution_rate: 0,
      avg_response_time_ms: 0,
      top_intents: [],
    };
  }

  static async handoffToHuman(
    sessionId: string,
    reason: string,
    counselorId?: string
  ): Promise<void> {
    console.warn('[chatbot-service] handoffToHuman stub called');
    throw new Error('Chatbot service not yet implemented');
  }
}
