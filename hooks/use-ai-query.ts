/**
 * useAIQuery Hook
 * React hook for the AI Query System
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AIQueryMessage,
  AIQueryResponse,
  RateLimitResult,
  ActionDefinition,
  ArtifactRef,
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
  loadConversation: (conversationId: string) => Promise<void>;
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

  // Max-lane "while you were away" inbox: if a subscription-lane answer
  // finished AFTER the tab/phone died mid-wait, it's waiting on the server.
  // Read it once on mount, render, and only THEN acknowledge (PATCH) — a
  // lost fetch/render means the answers simply resurface on the next load
  // (at-least-once; deep-review consensus: duplicate beats loss). Any
  // failure is silent — an empty inbox, never an error state.
  const inboxDrainedRef = useRef(false);
  useEffect(() => {
    if (inboxDrainedRef.current) return;
    inboxDrainedRef.current = true;
    (async () => {
      try {
        const res = await fetch('/api/ai-query', {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return;
        const json = await res.json();
        const rows: Array<{ id: string; message: string; answer: string; completed_at: string }> = (
          Array.isArray(json?.inbox) ? json.inbox : []
        ).sort(
          (a: { completed_at: string }, b: { completed_at: string }) =>
            new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime(),
        );
        if (rows.length === 0) return;
        const restored: AIQueryMessage[] = rows.flatMap((r) => [
          {
            id: `${r.id}-q`,
            role: 'user' as const,
            content: r.message,
            timestamp: new Date(r.completed_at),
          },
          {
            id: r.id,
            role: 'assistant' as const,
            content: `${r.answer}\n\nⓘ _Answered on Max while you were away._`,
            timestamp: new Date(r.completed_at),
            jobId: r.id,
            toolCalls: [
              { id: `${r.id}-max`, name: 'max_lane', arguments: {}, status: 'completed' as const },
            ],
          },
        ]);
        setMessages((prev) => [...restored, ...prev]);
        // Rendered — acknowledge so these don't re-show. Best-effort: a lost
        // ack means one harmless duplicate next load, never a lost answer.
        void fetch('/api/ai-query', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ack_ids: rows.map((r) => r.id) }),
        }).catch(() => {});
      } catch {
        // silent — inbox is a bonus, never a blocker
      }
    })();
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;

    // Stamp a stable conversation_id from the VERY first turn so every job in
    // this thread shares it — this is what lets the Max drain rebuild memory of
    // the conversation (and what makes the thread reopenable from history).
    if (!conversationIdRef.current) conversationIdRef.current = crypto.randomUUID();

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
        responseMs: (data as { response_ms?: number }).response_ms,
        // Carry the ai_jobs.id so the answer can be flagged as "looks wrong".
        jobId:
          typeof (data as { max_request_id?: unknown }).max_request_id === 'string'
            ? (data as { max_request_id: string }).max_request_id
            : undefined,
        // Artifact refs the drain produced (empty/absent = today's plain answer).
        artifacts: Array.isArray((data as { artifacts?: ArtifactRef[] }).artifacts)
          ? (data as { artifacts: ArtifactRef[] }).artifacts
          : undefined,
      };

      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== loadingMessage.id);
        return [...filtered, assistantMessage];
      });

      // Live Max-lane delivery: acknowledge AFTER the answer is in state so a
      // response lost before this point would have resurfaced via the inbox.
      const maxRequestId = (data as { max_request_id?: unknown }).max_request_id;
      if (typeof maxRequestId === 'string' && maxRequestId.length > 0) {
        void fetch('/api/ai-query', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ack_ids: [maxRequestId] }),
        }).catch(() => {});
      }

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

  // Reopen a past conversation from history: load ALL of its turns into the
  // thread and set the active conversation id, so follow-up questions continue
  // it (the Max drain reloads prior turns of that conversation as context).
  const loadConversation = useCallback(async (conversationId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClientSupabaseClient();
      // fn not yet in generated types (ships with the conversation-history migration).
      const { data, error } = await (supabase as any).rpc('fn_ai_conversation_turns', {
        p_conversation_id: conversationId,
      });
      if (error) return;
      const turns: Array<{
        id: string;
        question: string | null;
        answer: string | null;
        status: string | null;
        asked_at: string;
      }> = Array.isArray(data) ? data : [];
      const restored: AIQueryMessage[] = turns.flatMap((t) => {
        const out: AIQueryMessage[] = [
          {
            id: `${t.id}-q`,
            role: 'user' as const,
            content: t.question ?? '',
            timestamp: new Date(t.asked_at),
          },
        ];
        if (t.answer) {
          out.push({
            id: t.id,
            role: 'assistant' as const,
            content: t.answer,
            timestamp: new Date(t.asked_at),
            jobId: t.id,
            toolCalls: [
              { id: `${t.id}-max`, name: 'max_lane', arguments: {}, status: 'completed' as const },
            ],
          });
        }
        return out;
      });
      // Reattach any artifacts this user produced in these turns (owner-scoped;
      // fn_ai_my_artifacts pins auth.uid()). Match by job_id → the turn's id.
      try {
        const { data: arts } = await (supabase as any).rpc('fn_ai_my_artifacts', { p_limit: 200 });
        const TYPES: ArtifactRef['type'][] = ['chart', 'report', 'spreadsheet', 'slides'];
        const byJob = new Map<string, ArtifactRef[]>();
        (Array.isArray(arts) ? arts : []).forEach((a: {
          id: string; job_id: string | null; type: ArtifactRef['type'];
          title: string | null; is_sensitive: boolean;
        }) => {
          if (!a?.job_id || typeof a.id !== 'string' || !TYPES.includes(a.type)) return;
          const list = byJob.get(a.job_id) ?? [];
          list.push({ id: a.id, type: a.type, title: a.title ?? null, is_sensitive: a.is_sensitive === true });
          byJob.set(a.job_id, list);
        });
        if (byJob.size > 0) {
          for (const m of restored) {
            if (m.role === 'assistant' && m.jobId && byJob.has(m.jobId)) {
              m.artifacts = byJob.get(m.jobId);
            }
          }
        }
      } catch {
        // silent — artifacts are a bonus on reopen, never block the thread
      }
      setMessages(restored);
      conversationIdRef.current = conversationId;
    } catch {
      // silent — a failed reopen leaves the current chat untouched
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    loadConversation,
  };
}

export default useAIQuery;
