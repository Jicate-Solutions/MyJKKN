'use client';

/**
 * AIQueryContainer
 * Main container component for the AI Query System
 */

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAIQuery } from '@/hooks/use-ai-query';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
  Maximize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import { SuggestedQueries } from './SuggestedQueries';
import { ChatHistorySheet } from './ChatHistorySheet';
import { DrainHealthBanner } from './DrainHealthBanner';
import { ArtifactPanel } from './ArtifactPanel';
import type { ActionDefinition } from '@/types/ai-query';
import type { AskPageContext } from './AskAssistantRules';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reports ?conversation=<id> on arrival AND on every later change of the query
 * string. A bell link to /ai-query?conversation=<id> clicked while already on
 * /ai-query is a same-route navigation that remounts nothing, so reading the
 * URL once on mount would miss it. Rendered inside its own Suspense boundary so
 * useSearchParams never forces the whole page into client-only rendering.
 */
function ConversationLinkWatcher({ onLink }: { onLink: (id: string) => void }) {
  const params = useSearchParams();
  const id = params?.get('conversation') ?? null;
  useEffect(() => {
    if (id) onLink(id);
  }, [id, onLink]);
  return null;
}

interface AIQueryContainerProps {
  className?: string;
  /** 'full' = the /ai-query page. 'compact' = the Ask panel on every page. */
  variant?: 'full' | 'compact';
  /** The page the Ask panel was opened on (compact only). Sent with the
   *  first question of a conversation as a short note for the AI. */
  pageContext?: AskPageContext | null;
  /** Reopen this conversation on mount (the panel reopening its last chat). */
  initialConversationId?: string | null;
  /** Told whenever the active conversation changes (null after Clear). */
  onConversationChange?: (conversationId: string | null) => void;
}

export function AIQueryContainer({
  className,
  variant = 'full',
  pageContext = null,
  initialConversationId = null,
  onConversationChange,
}: AIQueryContainerProps) {
  const compact = variant === 'compact';
  const [inputValue, setInputValue] = useState('');
  const [background, setBackground] = useState(false);
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openArtifact = (id: string) => {
    setOpenArtifactId(id);
    setArtifactOpen(true);
  };

  const { isSuperAdmin } = usePermissions([]);

  const {
    messages,
    isLoading,
    error,
    rateLimit,
    suggestions,
    conversationId,
    sendMessage,
    clearMessages,
    loadConversation,
  } = useAIQuery({
    pageContext: compact ? pageContext : null,
    onError: (err) => {
      console.warn('[AIQueryContainer] Error:', err);
    },
  });

  // The panel reopens its last chat once, on arrival.
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    const target = compact ? initialConversationId : null;
    if (target && UUID_RE.test(target)) void loadConversation(target);
  }, [compact, initialConversationId, loadConversation]);

  // The full page opens ?conversation=<id> — the link an "answer ready" notice
  // carries — on arrival and whenever that link changes while already here.
  const linkedRef = useRef<string | null>(null);
  const openFromLink = useCallback(
    (id: string) => {
      if (!UUID_RE.test(id) || linkedRef.current === id) return;
      linkedRef.current = id;
      void loadConversation(id);
    },
    [loadConversation],
  );

  useEffect(() => {
    onConversationChange?.(conversationId);
  }, [conversationId, onConversationChange]);

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
    await sendMessage(message, { background });
  };

  const handleSuggestionClick = async (suggestion: string) => {
    if (isLoading) return;
    setInputValue('');
    await sendMessage(suggestion, { background });
  };

  const handleActionClick = async (action: ActionDefinition, messageId: string) => {
    // Handle action execution
    console.log('Action clicked:', action, messageId);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {!compact && (
        <Suspense fallback={null}>
          <ConversationLinkWatcher onLink={openFromLink} />
        </Suspense>
      )}
      {/* Admin-only banner — renders only when the Max chat drain is confirmed offline */}
      <DrainHealthBanner />

      {/* Header - Responsive */}
      {/* compact: pr-12 keeps the header clear of the sheet's own close button */}
      <div
        className={cn(
          'flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b gap-2',
          compact && 'pr-12 sm:pr-12',
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg flex-shrink-0">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold truncate">AI Assistant</h1>
            {!compact && (
              <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
                Ask questions about learners, learning participation, billing, and more
              </p>
            )}
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
          {/* Your past chats — visible to every user; tap one to reopen + continue */}
          <ChatHistorySheet onSelect={loadConversation} />
          {/* compact: open this chat on the full assistant page */}
          {compact && (
            <Button variant="ghost" size="sm" asChild className="h-8 px-2" title="Open the full AI Assistant">
              <Link
                href={conversationId ? `/ai-query?conversation=${conversationId}` : '/ai-query'}
                aria-label="Open the full AI Assistant"
              >
                <Maximize2 className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {/* Super Admin Only - AI Query Tools Link */}
          {isSuperAdmin && !compact && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="gap-1 h-8 px-2 sm:px-3"
                  >
                    <Link href="/ai-query/admin">
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
          <div
            className={cn(
              'flex flex-col items-center justify-center h-full text-center px-2',
              compact ? 'min-h-[240px]' : 'min-h-[300px] sm:min-h-[400px]',
            )}
          >
            <div className="p-3 sm:p-4 bg-primary/5 rounded-full mb-3 sm:mb-4">
              <Bot className="h-8 w-8 sm:h-12 sm:w-12 text-primary/60" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold mb-2">How can I help you today?</h2>
            <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6 max-w-md">
              {compact
                ? 'Ask me anything about MyJKKN. I know which page you are on.'
                : 'Ask me about learners, learning participation, billing, team members, or any other data in the system.'}
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
                onOpenArtifact={openArtifact}
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
      <div
        className={cn(
          'p-3 sm:p-4 border-t bg-background',
          // compact is full screen on phones: clear the iOS home indicator.
          compact && 'pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-4',
        )}
      >
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

        {/* Hand a longer question off: the answer arrives as an in-app notice. */}
        <div className="flex items-center gap-2 mt-2">
          <Switch
            id={compact ? 'ai-background-compact' : 'ai-background'}
            checked={background}
            onCheckedChange={setBackground}
            disabled={isLoading}
          />
          <Label
            htmlFor={compact ? 'ai-background-compact' : 'ai-background'}
            className="text-xs text-muted-foreground font-normal cursor-pointer"
          >
            Do it in the background — I’ll get a notification when it’s ready
          </Label>
        </div>

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

      {/* Artifact side panel — opens when a message's artifact card is tapped */}
      <ArtifactPanel
        artifactId={openArtifactId}
        open={artifactOpen}
        onOpenChange={setArtifactOpen}
      />
    </div>
  );
}

export default AIQueryContainer;
