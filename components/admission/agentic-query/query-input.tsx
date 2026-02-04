'use client';

// components/admission/agentic-query/query-input.tsx
// Natural language input component for agentic queries

import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2, X, History, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface QueryInputProps {
  onSubmit: (query: string) => void;
  isLoading?: boolean;
  suggestions?: string[];
  recentQueries?: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onCancel?: () => void;
}

export function QueryInput({
  onSubmit,
  isLoading = false,
  suggestions = [],
  recentQueries = [],
  placeholder = 'Ask a question about your leads...',
  className,
  disabled = false,
  onCancel,
}: QueryInputProps) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [query]);

  const handleSubmit = () => {
    if (!query.trim() || isLoading || disabled) return;
    onSubmit(query.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    // Auto-submit after selecting suggestion
    onSubmit(suggestion);
  };

  const exampleQueries = [
    'How many leads came from Google Ads this month?',
    'Who are the top 5 counselors by conversion?',
    'Show leads interested in MBA who visited 3+ times',
    'What is our conversion rate this quarter?',
    'List hot leads that need follow-up today',
  ];

  const displaySuggestions = suggestions.length > 0 ? suggestions : exampleQueries;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Input Area */}
      <div className="relative">
        <div className="flex items-start gap-2 rounded-lg border bg-background p-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <Sparkles className="mt-2.5 h-5 w-5 text-muted-foreground flex-shrink-0" />

          <Textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            placeholder={placeholder}
            disabled={isLoading || disabled}
            className="min-h-[40px] max-h-[150px] resize-none border-0 p-0 focus-visible:ring-0 bg-transparent"
            rows={1}
          />

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Recent queries dropdown */}
            {recentQueries.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={isLoading || disabled}
                  >
                    <History className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Recent Queries</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {recentQueries.slice(0, 5).map((q, i) => (
                    <DropdownMenuItem
                      key={i}
                      onClick={() => handleSuggestionClick(q)}
                      className="text-sm"
                    >
                      <span className="truncate">{q}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Cancel button when loading */}
            {isLoading && onCancel && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onCancel}
              >
                <X className="h-4 w-4" />
              </Button>
            )}

            {/* Submit button */}
            <Button
              size="icon"
              className="h-8 w-8"
              onClick={handleSubmit}
              disabled={!query.trim() || isLoading || disabled}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Character count */}
        {query.length > 0 && (
          <div className="absolute bottom-2 right-24 text-xs text-muted-foreground">
            {query.length}/500
          </div>
        )}
      </div>

      {/* Suggestion chips */}
      {showSuggestions && !query && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Try asking:</span>
            <ChevronDown className="h-3 w-3" />
          </div>
          <div className="flex flex-wrap gap-2">
            {displaySuggestions.slice(0, 5).map((suggestion, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80 transition-colors text-xs py-1.5"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion.length > 50 ? `${suggestion.slice(0, 50)}...` : suggestion}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard shortcut hint */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Press Enter to send, Shift+Enter for new line</span>
        {query && (
          <button
            onClick={() => setQuery('')}
            className="hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// Compact version for sidebars
export function QueryInputCompact({
  onSubmit,
  isLoading = false,
  placeholder = 'Ask AI...',
  className,
  disabled = false,
}: Omit<QueryInputProps, 'suggestions' | 'recentQueries' | 'onCancel'>) {
  const [query, setQuery] = useState('');

  const handleSubmit = () => {
    if (!query.trim() || isLoading || disabled) return;
    onSubmit(query.trim());
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative flex-1">
        <Sparkles className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading || disabled}
          className="w-full pl-8 pr-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={!query.trim() || isLoading || disabled}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
