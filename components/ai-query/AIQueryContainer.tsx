'use client';

/**
 * AIQueryContainer
 * Main container component for the AI Query System
 */

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAIQuery } from '@/hooks/use-ai-query';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  RefreshCw,
  Clock,
  AlertCircle,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import { SuggestedQueries } from './SuggestedQueries';
import type { ActionDefinition } from '@/types/ai-query';

interface AIQueryContainerProps {
  className?: string;
}

export function AIQueryContainer({ className }: AIQueryContainerProps) {
  const [inputValue, setInputValue] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isSuperAdmin } = usePermissions([]);

  const {
    messages,
    isLoading,
    error,
    rateLimit,
    suggestions,
    sendMessage,
    clearMessages,
  } = useAIQuery({
    onError: (err) => {
      console.warn('[AIQueryContainer] Error:', err);
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const message = inputValue.trim();
    setInputValue('');
    await sendMessage(message);
  };

  const handleSuggestionClick = async (suggestion: string) => {
    if (isLoading) return;
    setInputValue('');
    await sendMessage(suggestion);
  };

  const handleActionClick = async (action: ActionDefinition, messageId: string) => {
    // Handle action execution
    console.log('Action clicked:', action, messageId);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">AI Assistant</h1>
            <p className="text-xs text-muted-foreground">
              Ask questions about learners, learning participation, billing, and more
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rateLimit && (
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {rateLimit.remaining} queries left
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearMessages}
            disabled={messages.length === 0}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Clear
          </Button>
          {/* Super Admin Only - AI Query Tools Link */}
          {isSuperAdmin && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="gap-1.5"
                  >
                    <Link href="/admin/ai-query-tools">
                      <Settings2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Tools Registry</span>
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>View all AI Query Tools (Super Admin)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
            <div className="p-4 bg-primary/5 rounded-full mb-4">
              <Bot className="h-12 w-12 text-primary/60" />
            </div>
            <h2 className="text-xl font-semibold mb-2">How can I help you today?</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              Ask me about learners, learning participation, billing, team members, or any other data in the system.
              I can help you find information, generate reports, and take actions.
            </p>

            {/* Suggested Queries */}
            <SuggestedQueries
              suggestions={suggestions}
              onSuggestionClick={handleSuggestionClick}
              disabled={isLoading}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onActionClick={handleActionClick}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Error Display */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>{error.message}</span>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t bg-background">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask a question..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !inputValue.trim()}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>

        {/* Quick Suggestions when typing */}
        {messages.length > 0 && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {suggestions.slice(0, 3).map((suggestion, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleSuggestionClick(suggestion.text)}
                disabled={isLoading}
                className="text-xs"
              >
                {suggestion.text}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AIQueryContainer;
