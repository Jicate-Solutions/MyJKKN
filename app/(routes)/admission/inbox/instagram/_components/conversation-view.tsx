'use client';

// app/(routes)/admission/inbox/instagram/_components/conversation-view.tsx
//
// Right rail of the IG DM inbox: shows the selected thread's message log
// and the reply composer. The 24-hour messaging window is the IG DM
// equivalent of Messenger's reply window — when the last inbound is
// older than 24h the composer is disabled with an explanatory notice.
//
// The composer's mutation can resolve to a "window expired" result
// (handled in the parent via use-ig-dm-conversations.ts). We pass the
// human-friendly notice text in as a prop so this component stays
// state-free beyond the local draft.

import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type {
  IgDmConversationRow,
  IgDmMessageRow,
} from '@/lib/services/admission/ig-dm-service';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function isWithin24h(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= TWENTY_FOUR_HOURS_MS;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  return formatDistanceToNow(d, { addSuffix: true });
}

export interface ConversationViewProps {
  selected: IgDmConversationRow | null;
  /**
   * Messages are stored newest-first in the API; we reverse them here so
   * the chronological reading flow matches Messenger's bottom-aligned
   * composer expectation.
   */
  messages: IgDmMessageRow[];
  messagesLoading: boolean;
  messagesError: string | null;
  /** Server's authoritative canReply (24-hour window). */
  canReply: boolean;
  draft: string;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  sendPending: boolean;
  sendError: string | null;
  /**
   * When the last reply attempt was rejected by the 24-hour window check
   * the parent passes a human-readable notice here so the composer can
   * render it inline.
   */
  windowExpiredNotice: string | null;
}

export function ConversationView({
  selected,
  messages,
  messagesLoading,
  messagesError,
  canReply,
  draft,
  onDraftChange,
  onSend,
  sendPending,
  sendError,
  windowExpiredNotice,
}: ConversationViewProps) {
  if (!selected) {
    return (
      <Card className="flex h-[calc(100vh-220px)] flex-col overflow-hidden">
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          Select a conversation on the left to see messages.
        </div>
      </Card>
    );
  }

  // The API returns newest-first; render oldest at top so the composer
  // sits beneath the most recent inbound.
  const ordered = [...messages].reverse();
  const effectiveCanSend = canReply && isWithin24h(selected.last_inbound_at);

  return (
    <Card className="flex h-[calc(100vh-220px)] flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <div className="text-sm font-semibold">
          IG user {selected.ig_user_id}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>Account {selected.ig_account_id}</span>
          {selected.lead_id ? (
            <Badge variant="outline" className="text-[10px]">
              Linked lead
            </Badge>
          ) : null}
          <span>Last inbound {timeAgo(selected.last_inbound_at)}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messagesLoading ? (
          <div className="text-sm text-muted-foreground">Loading messages…</div>
        ) : messagesError ? (
          <div className="text-sm text-red-600">{messagesError}</div>
        ) : ordered.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No messages yet in this thread.
          </div>
        ) : (
          <ul className="space-y-3">
            {ordered.map((m) => {
              const isOutbound = m.direction === 'out';
              return (
                <li
                  key={m.id}
                  className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      isOutbound
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">
                      {m.text ?? '(no text)'}
                    </div>
                    <div
                      className={`mt-1 text-[10px] ${
                        isOutbound
                          ? 'text-primary-foreground/70'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {timeAgo(m.sent_at)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t p-3">
        {windowExpiredNotice ? (
          <div className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {windowExpiredNotice}
          </div>
        ) : !effectiveCanSend ? (
          <div className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            24-hour reply window expired. Instagram requires an inbound DM in
            the last 24h before our IG account can reply (no Messenger-style
            message tags are available for IG DM at this time).
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder={
              effectiveCanSend ? 'Type a reply…' : 'Reply window closed'
            }
            disabled={!effectiveCanSend || sendPending}
            rows={2}
            className="flex-1"
          />
          <Button
            type="button"
            onClick={onSend}
            disabled={
              !effectiveCanSend || sendPending || draft.trim().length === 0
            }
          >
            {sendPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
        {sendError ? (
          <div className="mt-2 text-xs text-red-600">{sendError}</div>
        ) : null}
      </div>
    </Card>
  );
}
