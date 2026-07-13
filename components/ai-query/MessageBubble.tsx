'use client';

/**
 * MessageBubble
 * Displays a single message in the AI Query chat with analytics dashboard styling
 */

import { Bot, User, Loader2, CheckCircle, BarChart3, FileText, Table2, Presentation, Lock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AIQueryMessage, ActionDefinition, ArtifactRef, ArtifactType } from '@/types/ai-query';
import { AnswerFeedback } from './AnswerFeedback';
import { markdownComponents } from './markdown-components';

interface MessageBubbleProps {
  message: AIQueryMessage;
  onActionClick?: (action: ActionDefinition, messageId: string) => void;
  /** Open an artifact in the side panel (by artifact id). */
  onOpenArtifact?: (artifactId: string) => void;
}

// Format the Max-lane response time for the badge (e.g. 25s, 1m 30s).
function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 1) return '<1s';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

const ARTIFACT_META: Record<ArtifactType, { icon: typeof BarChart3; label: string }> = {
  chart: { icon: BarChart3, label: 'Chart' },
  report: { icon: FileText, label: 'Report' },
  spreadsheet: { icon: Table2, label: 'Spreadsheet' },
  slides: { icon: Presentation, label: 'Slides' },
};

function ArtifactCard({
  artifact,
  onOpen,
}: {
  artifact: ArtifactRef;
  onOpen?: (id: string) => void;
}) {
  const meta = ARTIFACT_META[artifact.type] ?? ARTIFACT_META.report;
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen?.(artifact.id)}
      className="group flex w-full items-center gap-3 rounded-lg border border-border/60 bg-gradient-to-br from-primary/5 to-primary/[0.02] p-3 text-left transition-colors hover:border-primary/40 hover:from-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground/90">
            {artifact.title || `${meta.label}`}
          </p>
          {artifact.is_sensitive && (
            <Lock className="h-3 w-3 flex-shrink-0 text-amber-500" aria-label="Contains sensitive data" />
          )}
        </div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {meta.label} · tap to open
        </p>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

export function MessageBubble({ message, onActionClick, onOpenArtifact }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming;

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

      {/* Message Content - Responsive width */}
      <div
        className={cn(
          'flex flex-col min-w-0',
          isUser ? 'items-end max-w-[85%] sm:max-w-[80%]' : 'items-start max-w-[95%] sm:max-w-[90%]'
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
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3">
              <div className="relative flex-shrink-0">
                <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-primary" />
                <div className="absolute inset-0 h-4 w-4 sm:h-5 sm:w-5 animate-ping opacity-20 rounded-full bg-primary" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs sm:text-sm font-medium">Analyzing your request...</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Fetching data from the system</span>
              </div>
            </div>
          ) : isUser ? (
            <div className="text-xs sm:text-sm">{message.content}</div>
          ) : (
            <div className="ai-response-content p-2 sm:p-4">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Artifact cards — click opens the side panel (charts/reports/etc.) */}
        {!isUser && message.artifacts && message.artifacts.length > 0 && (
          <div className="mt-2 flex w-full max-w-md flex-col gap-2">
            {message.artifacts.map((a) => (
              <ArtifactCard key={a.id} artifact={a} onOpen={onOpenArtifact} />
            ))}
          </div>
        )}

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
                {tool.name === 'max_lane' && typeof message.responseMs === 'number' && (
                  <span className="ml-1 opacity-70">· {formatDuration(message.responseMs)}</span>
                )}
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

        {/* "Looks wrong?" feedback — assistant answers only; logs for admin review (no user alert) */}
        {!isUser && !isStreaming && message.jobId && (
          <AnswerFeedback jobId={message.jobId} />
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
