'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Copy, Loader2, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { markdownComponents } from '@/components/ai-query/markdown-components';
import { AwardSuggestionCard } from '@/components/procurement/award-suggestion-card';
import { useAuth } from '@/hooks/use-auth';
import { useQuotationChatHistory, useQuotationChatSend } from '@/hooks/procurement/use-quotation-chat';
import type { ValidatedSuggestion } from '@/lib/procurement/quotation-compare-agent';

const STARTERS = [
  'What is the cheapest way to award everything?',
  'Can one vendor supply all items?',
  'Compare delivery and payment terms',
  'Which items have only one usable quote?',
  'Draft an approval note for the current awards',
];

interface QuotationChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfqId: string;
  rfqNumber: string;
  canApply: boolean;
  lockedReason: string | null;
  livePrices: Record<string, number | null>;
  awardedIds: Set<string>;
}

function AssistantBubble({ text, children }: { text: string; children?: ReactNode }) {
  const copy = () =>
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('Copied'))
      .catch(() => toast.error('Could not copy'));
  return (
    <div className="flex gap-2">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        {text && (
          <div className="group relative w-full rounded-xl border border-border/50 bg-muted/50 px-3 py-2 text-sm">
            <div className="ai-response-content prose-sm max-w-none break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {text}
              </ReactMarkdown>
            </div>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy answer"
              className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function UserBubble({ text, meta }: { text: string; meta?: string }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">
        {text}
      </div>
      {meta && <span className="text-[10px] text-muted-foreground">{meta}</span>}
    </div>
  );
}

export function QuotationChatPanel({
  open,
  onOpenChange,
  rfqId,
  rfqNumber,
  canApply,
  lockedReason,
  livePrices,
  awardedIds,
}: QuotationChatPanelProps) {
  const { profile } = useAuth();
  const { data: messages = [], isLoading, isError } = useQuotationChatHistory(rfqId, open);
  const { send, pending, error, clearError, markApplied } = useQuotationChatSend(rfqId);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, pending?.text, pending?.suggestion, open]);

  const submit = (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    setDraft('');
    clearError();
    void send(q);
  };

  const card = (s: ValidatedSuggestion, id: string | null, appliedAt: string | null, appliedBy: string | null) => (
    <AwardSuggestionCard
      rfqId={rfqId}
      suggestion={s}
      messageId={id}
      appliedAt={appliedAt}
      appliedBy={appliedBy}
      canApply={canApply}
      lockedReason={lockedReason}
      livePrices={livePrices}
      awardedIds={awardedIds}
      onApplied={markApplied}
    />
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-4 py-3 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Ask AI about these quotations
          </SheetTitle>
          <SheetDescription className="text-xs">
            {rfqNumber} · answers use only this RFQ&apos;s quotations. Suggested awards change nothing until
            someone clicks Apply.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">Could not load the earlier conversation.</p>
          ) : messages.length === 0 && !pending ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Ask anything about the vendors&apos; quotes, for example:</p>
              <div className="flex flex-col gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    className="rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) =>
              m.role === 'user' ? (
                <UserBubble
                  key={m.id}
                  text={m.content}
                  meta={`${m.user_id === profile?.id ? 'You' : m.author?.full_name || 'Someone'} · ${new Date(
                    m.created_at,
                  ).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}`}
                />
              ) : (
                <AssistantBubble key={m.id} text={m.content}>
                  {m.suggestion && card(m.suggestion, m.id, m.applied_at, m.applier?.full_name ?? null)}
                </AssistantBubble>
              ),
            )
          )}

          {pending && (
            <>
              <UserBubble text={pending.question} />
              {pending.text || pending.suggestion ? (
                <AssistantBubble text={pending.text}>
                  {pending.suggestion && card(pending.suggestion, null, null, null)}
                </AssistantBubble>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reading the quotations…
                </div>
              )}
            </>
          )}

          {error && <p className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <form
          className="flex items-end gap-2 border-t px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <Textarea
            id="quotation-chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
            placeholder="Ask about prices, vendors, delivery…"
            rows={2}
            maxLength={2000}
            className="min-h-[44px] resize-none"
            disabled={!!pending}
          />
          <Button type="submit" size="icon" disabled={!draft.trim() || !!pending} aria-label="Send">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
