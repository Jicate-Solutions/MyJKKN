'use client';

import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ValidatedSuggestion } from '@/lib/procurement/quotation-compare-agent';

export interface RfqChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestion: ValidatedSuggestion | null;
  applied_at: string | null;
  created_at: string;
  user_id: string;
  author?: { full_name: string | null } | null;
  applier?: { full_name: string | null } | null;
}

/** The turn being answered right now (not yet in history). */
export interface PendingTurn {
  question: string;
  text: string;
  suggestion: ValidatedSuggestion | null;
}

const historyKey = (rfqId: string) => ['procurement-rfq-ai-chat', rfqId];

export function useQuotationChatHistory(rfqId: string, enabled: boolean) {
  return useQuery({
    queryKey: historyKey(rfqId),
    enabled: enabled && !!rfqId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<RfqChatMessage[]> => {
      const res = await fetch(`/api/procurement/rfqs/${rfqId}/ai-chat`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load the conversation.');
      return body.messages ?? [];
    },
  });
}

/**
 * Ask a question and follow the streamed answer (NDJSON: text / suggestion /
 * done / error). The pending turn is shown until history reloads with the
 * saved copy.
 */
export function useQuotationChatSend(rfqId: string) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy.current) return;
      busy.current = true;
      setError(null);
      setPending({ question: q, text: '', suggestion: null });

      let failed: string | null = null;
      try {
        const res = await fetch(`/api/procurement/rfqs/${rfqId}/ai-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: q }),
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'The AI assistant could not answer.');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            let evt: { type?: string; delta?: string; suggestion?: ValidatedSuggestion; message?: string };
            try {
              evt = JSON.parse(line);
            } catch {
              continue;
            }
            if (evt.type === 'text' && evt.delta) {
              const delta = evt.delta;
              setPending((p) => (p ? { ...p, text: p.text + delta } : p));
            } else if (evt.type === 'suggestion' && evt.suggestion) {
              const suggestion = evt.suggestion;
              setPending((p) => (p ? { ...p, suggestion } : p));
            } else if (evt.type === 'error') {
              failed = evt.message || 'The AI assistant could not answer.';
            }
          }
        }
      } catch (e) {
        failed = e instanceof Error ? e.message : 'The AI assistant could not answer.';
      }

      if (failed) {
        setError(failed);
      } else {
        await queryClient.invalidateQueries({ queryKey: historyKey(rfqId) });
      }
      setPending(null);
      busy.current = false;
    },
    [queryClient, rfqId],
  );

  const markApplied = useCallback(
    async (messageId: string) => {
      await fetch(`/api/procurement/rfqs/${rfqId}/ai-chat`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId }),
      }).catch(() => undefined);
      await queryClient.invalidateQueries({ queryKey: historyKey(rfqId) });
    },
    [queryClient, rfqId],
  );

  return { send, pending, error, clearError: () => setError(null), markApplied };
}
