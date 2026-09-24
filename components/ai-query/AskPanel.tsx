'use client';

/**
 * AskPanel — the AI Assistant in a right-side sheet, reachable from every page.
 *
 * It holds the SAME assistant as /ai-query (AIQueryContainer, compact variant),
 * not a copy. Right side on desktop and tablets, full screen on phones.
 *
 * The sheet unmounts its content when closed, which would drop the thread. The
 * panel therefore remembers the conversation id and reopens it next time
 * (fn_ai_conversation_turns, owner-scoped), until the person presses Clear.
 */

import { useCallback, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { AIQueryContainer } from './AIQueryContainer';
import type { AskPageContext } from './AskAssistantRules';

interface AskPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The page the panel was opened on. */
  pageContext: AskPageContext | null;
}

export function AskPanel({ open, onOpenChange, pageContext }: AskPanelProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const rememberConversation = useCallback((id: string | null) => setConversationId(id), []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md md:max-w-lg p-0 gap-0 flex flex-col"
      >
        <SheetTitle className="sr-only">AI Assistant</SheetTitle>
        <SheetDescription className="sr-only">
          Ask the AI Assistant a question about the page you are on, or anything else in MyJKKN.
        </SheetDescription>
        <AIQueryContainer
          variant="compact"
          className="flex-1 min-h-0"
          pageContext={pageContext}
          initialConversationId={conversationId}
          onConversationChange={rememberConversation}
        />
      </SheetContent>
    </Sheet>
  );
}

export default AskPanel;
