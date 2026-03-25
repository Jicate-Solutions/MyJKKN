/**
 * useAIQuery Hook
 * React hook for the AI Query System
 */

import { useState, useCallback, useRef } from 'react';
import type {
  AIQueryMessage,
  AIQueryResponse,
  RateLimitResult,
  ActionDefinition,
  SuggestedQuery,
  DEFAULT_SUGGESTED_QUERIES,
} from '@/types/ai-query';

interface UseAIQueryOptions {
  onError?: (error: { code: string; message: string }) => void;
  onMessage?: (message: AIQueryMessage) => void;
}

interface UseAIQueryReturn {
  messages: AIQueryMessage[];
  isLoading: boolean;
  error: { code: string; message: string } | null;
  rateLimit: RateLimitResult | null;
  suggestions: SuggestedQuery[];
  conversationId: string | null;
  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
  executeAction: (action: ActionDefinition, params?: Record<string, unknown>) => Promise<void>;
}

export function useAIQuery(options: UseAIQueryOptions = {}): UseAIQueryReturn {
  const [messages, setMessages] = useState<AIQueryMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitResult | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedQuery[]>([
    { text: 'Show learners with participation below 75%', category: 'academic', icon: 'Users' },
    { text: 'List fee defaulters in current semester', category: 'billing', icon: 'CreditCard' },
    { text: 'Show admissions from Karur district', category: 'admissions', icon: 'FileText' },
    { text: 'Get department-wise learner count', category: 'students', icon: 'BarChart' },
    { text: 'Show admission statistics', category: 'admissions', icon: 'BarChart' },
    { text: 'List pending admission applications', category: 'admissions', icon: 'FileText' },
  ]);
  const conversationIdRef = useRef<string | null>(null);

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;

    setIsLoading(true);
    setError(null);

    // Add user message immediately
    const userMessage: AIQueryMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Add loading placeholder for assistant
    const loadingMessage: AIQueryMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };
    setMessages(prev => [...prev, loadingMessage]);

    try {
      const response = await fetch('/api/ai-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          conversation_id: conversationIdRef.current,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorData = data.error || { code: 'UNKNOWN_ERROR', message: 'An error occurred' };
        setError(errorData);
        options.onError?.(errorData);

        // Remove loading message and add error message
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== loadingMessage.id);
          return [
            ...filtered,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `**Error:** ${errorData.message}`,
              timestamp: new Date(),
            },
          ];
        });
        return;
      }

      const responseData = data as AIQueryResponse;
      conversationIdRef.current = responseData.conversation_id;

      // Update rate limit
      if (responseData.rate_limit) {
        setRateLimit({
          ...responseData.rate_limit,
          reset_at: new Date(responseData.rate_limit.reset_at),
        });
      }

      // Update suggestions
      if (responseData.suggestions) {
        setSuggestions(responseData.suggestions.map(text => ({
          text,
          category: 'suggested' as any,
        })));
      }

      // Replace loading message with actual response
      const assistantMessage: AIQueryMessage = {
        id: responseData.message.id,
        role: 'assistant',
        content: responseData.message.content,
        timestamp: new Date(responseData.message.timestamp),
        toolCalls: responseData.message.toolCalls,
        data: responseData.message.data,
        actions: responseData.message.actions,
      };

      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== loadingMessage.id);
        return [...filtered, assistantMessage];
      });

      options.onMessage?.(assistantMessage);

    } catch (err) {
      console.error('[useAIQuery] Error:', err);
      const errorData = {
        code: 'NETWORK_ERROR',
        message: 'Failed to connect to the server. Please try again.',
      };
      setError(errorData);
      options.onError?.(errorData);

      // Remove loading message
      setMessages(prev => prev.filter(m => m.id !== loadingMessage.id));
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    conversationIdRef.current = null;
    setError(null);
    setSuggestions([
      { text: 'Show learners with participation below 75%', category: 'academic', icon: 'Users' },
      { text: 'List fee defaulters in current semester', category: 'billing', icon: 'CreditCard' },
      { text: 'Show admissions from Karur district', category: 'admissions', icon: 'FileText' },
      { text: 'Get department-wise learner count', category: 'students', icon: 'BarChart' },
      { text: 'Show admission statistics', category: 'admissions', icon: 'BarChart' },
      { text: 'List pending admission applications', category: 'admissions', icon: 'FileText' },
    ]);
  }, []);

  const executeAction = useCallback(async (
    action: ActionDefinition,
    params?: Record<string, unknown>
  ) => {
    // For Tier 1 actions, execute directly
    if (action.tier === 1) {
      await sendMessage(`Execute action: ${action.id} ${params ? JSON.stringify(params) : ''}`);
      return;
    }

    // For Tier 2-3 actions, the UI should show a confirmation modal first
    // This is handled by the component using this hook
    await sendMessage(`Confirmed action: ${action.id} ${params ? JSON.stringify(params) : ''}`);
  }, [sendMessage]);

  return {
    messages,
    isLoading,
    error,
    rateLimit,
    suggestions,
    conversationId: conversationIdRef.current,
    sendMessage,
    clearMessages,
    executeAction,
  };
}

export default useAIQuery;
