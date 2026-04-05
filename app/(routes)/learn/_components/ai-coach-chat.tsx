'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, User, Loader2 } from 'lucide-react';
import { useCoachConversation, useSendCoachMessage } from '@/hooks/pde/use-pde';
import type { CoachingStyle, CoachContextType, CoachMessage } from '@/types/pde';
import { cn } from '@/lib/utils';

interface AICoachChatProps {
  learnerId: string;
  contextType: CoachContextType;
  contextId: string;
  className?: string;
}

const COACHING_STYLE_LABELS: Record<CoachingStyle, { label: string; color: string }> = {
  scaffolding: { label: 'Scaffolding', color: 'bg-blue-100 text-blue-800' },
  guided: { label: 'Guided', color: 'bg-green-100 text-green-800' },
  challenging: { label: 'Challenging', color: 'bg-amber-100 text-amber-800' },
  socratic: { label: 'Socratic', color: 'bg-purple-100 text-purple-800' },
  peer: { label: 'Peer', color: 'bg-emerald-100 text-emerald-800' },
};

export function AICoachChat({ learnerId, contextType, contextId, className }: AICoachChatProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversation, isLoading } = useCoachConversation(learnerId, contextType, contextId);
  const sendMessage = useSendCoachMessage();

  const messages: CoachMessage[] = conversation?.messages || [];
  const coachingStyle = conversation?.coaching_style || 'scaffolding';
  const styleInfo = COACHING_STYLE_LABELS[coachingStyle as CoachingStyle] || COACHING_STYLE_LABELS.scaffolding;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || sendMessage.isPending) return;

    sendMessage.mutate({
      learner_id: learnerId,
      context_type: contextType,
      context_id: contextId,
      message: trimmed,
    });
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="flex-shrink-0 pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">AI Coach</CardTitle>
          </div>
          <Badge variant="outline" className={cn('text-xs', styleInfo.color)}>
            {styleInfo.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        {/* Messages area */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading conversation...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="font-medium">Ask me anything about this {contextType}.</p>
              <p className="mt-1">
                I will guide your thinking, not give you answers.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex gap-2 max-w-[85%]',
                    msg.role === 'learner' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                  )}
                >
                  <div
                    className={cn(
                      'flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center',
                      msg.role === 'learner'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    )}
                  >
                    {msg.role === 'learner' ? (
                      <User className="h-3.5 w-3.5" />
                    ) : (
                      <Bot className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm',
                      msg.role === 'learner'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {sendMessage.isPending && (
                <div className="flex gap-2 mr-auto max-w-[85%]">
                  <div className="flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center bg-muted">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="rounded-lg px-3 py-2 text-sm bg-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input bar */}
        <div className="flex-shrink-0 border-t p-3">
          <div className="flex gap-2">
            <Input
              placeholder="Ask the AI Coach..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sendMessage.isPending}
              className="flex-1"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || sendMessage.isPending}
            >
              {sendMessage.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
