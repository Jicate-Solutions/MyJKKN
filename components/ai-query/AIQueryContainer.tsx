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
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header - Responsive */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg flex-shrink-0">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold truncate">AI Assistant</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
              Ask questions about learners, learning participation, billing, and more
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {rateLimit && (
            <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 hidden sm:flex">
              <Clock className="h-3 w-3 mr-1" />
              {rateLimit.remaining} left
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearMessages}
            disabled={messages.length === 0}
            className="h-8 px-2 sm:px-3"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Clear</span>
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
                    className="gap-1 h-8 px-2 sm:px-3"
                  >
                    <Link href="/admin/ai-query-tools">
                      <Settings2 className="h-4 w-4" />
                      <span className="hidden md:inline">Tools</span>
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

      {/* Messages Area - Responsive padding */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 px-3 sm:px-4 py-3 sm:py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] sm:min-h-[400px] text-center px-2">
            <div className="p-3 sm:p-4 bg-primary/5 rounded-full mb-3 sm:mb-4">
              <Bot className="h-8 w-8 sm:h-12 sm:w-12 text-primary/60" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold mb-2">How can I help you today?</h2>
            <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6 max-w-md">
              Ask me about learners, learning participation, billing, team members, or any other data in the system.
            </p>

            {/* Suggested Queries */}
            <SuggestedQueries
              suggestions={suggestions}
              onSuggestionClick={handleSuggestionClick}
              disabled={isLoading}
            />
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
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

      {/* Input Area - Responsive */}
      <div className="p-3 sm:p-4 border-t bg-background">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask a question..."
            disabled={isLoading}
            className="flex-1 h-10 sm:h-10 text-sm"
          />
          <Button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="h-10 w-10 sm:w-auto sm:px-4 p-0 sm:p-2"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>

        {/* Quick Suggestions when typing - scrollable on mobile */}
        {messages.length > 0 && suggestions.length > 0 && (
          <div className="flex gap-2 mt-2 sm:mt-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {suggestions.slice(0, 3).map((suggestion, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleSuggestionClick(suggestion.text)}
                disabled={isLoading}
                className="text-xs whitespace-nowrap flex-shrink-0"
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
