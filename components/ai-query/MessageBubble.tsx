'use client';

/**
 * MessageBubble
 * Displays a single message in the AI Query chat with analytics dashboard styling
 */

import { Bot, User, Loader2, CheckCircle, TrendingUp, Users, DollarSign, BarChart3, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AIQueryMessage, ActionDefinition } from '@/types/ai-query';

interface MessageBubbleProps {
  message: AIQueryMessage;
  onActionClick?: (action: ActionDefinition, messageId: string) => void;
}

// Helper to detect and style stat values in text
function parseStatValue(text: string): { value: string; label: string } | null {
  const match = text.match(/^(\d+[\d,]*\.?\d*%?)\s*(.*)$/);
  if (match) {
    return { value: match[1], label: match[2] };
  }
  return null;
}

// Detect if content has KPI-like patterns
function hasKPIPattern(content: string): boolean {
  return /Total\s+\w+:|Active\s+\w+:|Count:|students?:|staff:|Amount:|\d+%/i.test(content);
}

export function MessageBubble({ message, onActionClick }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming;
  const hasKPIs = !isUser && hasKPIPattern(message.content);

  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          'flex flex-col',
          isUser ? 'items-end max-w-[80%]' : 'items-start max-w-[90%]'
        )}
      >
        <div
          className={cn(
            'rounded-xl',
            isUser
              ? 'bg-primary text-primary-foreground px-4 py-2'
              : 'bg-gradient-to-br from-muted/80 to-muted/40 border border-border/50 shadow-sm'
          )}
        >
          {isStreaming ? (
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="relative">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div className="absolute inset-0 h-5 w-5 animate-ping opacity-20 rounded-full bg-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">Analyzing your request...</span>
                <span className="text-xs text-muted-foreground">Fetching data from the system</span>
              </div>
            </div>
          ) : isUser ? (
            <div className="text-sm">{message.content}</div>
          ) : (
            <div className="ai-response-content p-4">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Enhanced headings with icons
                  h1: ({ children }) => (
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border/50">
                      <div className="p-1.5 rounded-lg bg-primary/10">
                        <BarChart3 className="h-5 w-5 text-primary" />
                      </div>
                      <h1 className="text-lg font-bold text-foreground m-0">{children}</h1>
                    </div>
                  ),
                  h2: ({ children }) => (
                    <div className="flex items-center gap-2 mt-4 mb-3">
                      <div className="w-1 h-5 rounded-full bg-primary" />
                      <h2 className="text-base font-semibold text-foreground m-0">{children}</h2>
                    </div>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-semibold text-foreground/90 mt-3 mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                      {children}
                    </h3>
                  ),
                  // Enhanced table styling - Analytics Dashboard Style
                  table: ({ children }) => (
                    <div className="my-4 rounded-lg border border-border/60 overflow-hidden shadow-sm">
                      <table className="w-full text-sm">
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-gradient-to-r from-muted/80 to-muted/50">
                      {children}
                    </thead>
                  ),
                  th: ({ children }) => (
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground border-b border-border/50">
                      {children}
                    </th>
                  ),
                  tbody: ({ children }) => (
                    <tbody className="divide-y divide-border/30">
                      {children}
                    </tbody>
                  ),
                  tr: ({ children }) => (
                    <tr className="hover:bg-muted/30 transition-colors">
                      {children}
                    </tr>
                  ),
                  td: ({ children }) => {
                    const text = String(children);
                    // Style numeric values
                    const isNumeric = /^\d+[\d,]*\.?\d*%?$/.test(text.trim());
                    const isPercentage = text.includes('%');
                    const isHighValue = parseInt(text.replace(/[^\d]/g, '')) > 50;

                    return (
                      <td className={cn(
                        "px-4 py-3",
                        isNumeric && "font-mono font-semibold",
                        isNumeric && isHighValue && "text-primary",
                        isPercentage && "text-emerald-600 dark:text-emerald-400"
                      )}>
                        {isNumeric && !isPercentage ? (
                          <span className="inline-flex items-center gap-1">
                            {children}
                          </span>
                        ) : children}
                      </td>
                    );
                  },
                  // Enhanced list styling
                  ul: ({ children }) => (
                    <ul className="space-y-1.5 my-3 ml-1">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="space-y-1.5 my-3 ml-1 list-decimal list-inside">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="flex items-start gap-2 text-sm text-foreground/90">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
                      <span className="flex-1">{children}</span>
                    </li>
                  ),
                  // Enhanced code styling - Preview Style
                  code: ({ className, children }) => {
                    const isInline = !className;
                    const text = String(children);

                    // Check if it looks like a stat/KPI value
                    if (isInline && /^\d+[\d,]*\.?\d*%?$/.test(text.trim())) {
                      return (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono font-bold text-sm">
                          {children}
                        </span>
                      );
                    }

                    return isInline ? (
                      <code className="px-1.5 py-0.5 rounded-md bg-muted border border-border/50 text-xs font-mono text-foreground/90">
                        {children}
                      </code>
                    ) : (
                      <div className="my-3 rounded-lg overflow-hidden border border-border/60 shadow-sm">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/80 border-b border-border/50">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Output</span>
                          <div className="flex gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-400" />
                            <span className="w-2 h-2 rounded-full bg-yellow-400" />
                            <span className="w-2 h-2 rounded-full bg-green-400" />
                          </div>
                        </div>
                        <pre className="p-3 bg-slate-950 overflow-x-auto">
                          <code className={cn("text-xs font-mono text-slate-300", className)}>
                            {children}
                          </code>
                        </pre>
                      </div>
                    );
                  },
                  // Enhanced pre styling
                  pre: ({ children }) => <>{children}</>,
                  // Enhanced blockquote - Info/Alert style
                  blockquote: ({ children }) => (
                    <div className="my-3 flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-foreground/90">{children}</div>
                    </div>
                  ),
                  // Enhanced strong - highlight important text
                  strong: ({ children }) => {
                    const text = String(children);
                    // Check for status-like text
                    if (/no\s+(fee\s+)?defaulters?|success|complete|active/i.test(text)) {
                      return (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {children}
                        </span>
                      );
                    }
                    if (/error|fail|overdue|pending|inactive/i.test(text)) {
                      return (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {children}
                        </span>
                      );
                    }
                    return <strong className="font-semibold text-foreground">{children}</strong>;
                  },
                  // Enhanced paragraph
                  p: ({ children }) => (
                    <p className="text-sm text-foreground/90 leading-relaxed my-2">
                      {children}
                    </p>
                  ),
                  // Enhanced links
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {children}
                    </a>
                  ),
                  // Enhanced horizontal rule
                  hr: () => (
                    <div className="my-4 flex items-center gap-2">
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                    </div>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Tool Calls Indicator - Enhanced */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {message.toolCalls.map((tool, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="text-xs py-0.5 px-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                {tool.name.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
        )}

        {/* Actions - Enhanced */}
        {message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {message.actions.map((action) => (
              <Button
                key={action.id}
                variant={action.variant || 'outline'}
                size="sm"
                onClick={() => onActionClick?.(action, message.id)}
                className="text-xs h-8"
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}

        {/* Timestamp - Subtle */}
        <span className="text-[10px] text-muted-foreground/70 mt-1.5 uppercase tracking-wider">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  );
}

export default MessageBubble;
