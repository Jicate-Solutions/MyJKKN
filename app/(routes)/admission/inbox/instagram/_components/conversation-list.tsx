'use client';

// app/(routes)/admission/inbox/instagram/_components/conversation-list.tsx
//
// Left rail of the IG DM inbox: lists open conversations sorted by the most
// recent inbound DM. Renders nothing fancy — PSID prefix + last-inbound
// "X minutes ago" + a "in window" badge when the 24-hour reply window is
// still open. Mirrors the Messenger inbox left rail but for ig_user_id /
// ig_account_id naming.

import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { IgDmConversationRow } from '@/lib/services/admission/ig-dm-service';

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

export interface ConversationListProps {
  conversations: IgDmConversationRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  error: string | null;
  /**
   * The 'open' / 'closed' / 'all' label rendered in the header. The IG DM
   * API doesn't currently expose a status field on conversations the way
   * Messenger does (status='open'|'closed') — so the parent passes the
   * label as a string for now and we treat all rows as "open".
   */
  statusLabel: string;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  isLoading,
  error,
  statusLabel,
}: ConversationListProps) {
  return (
    <Card className="flex h-[calc(100vh-220px)] flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <div className="text-sm font-semibold">{statusLabel} conversations</div>
        <div className="text-xs text-muted-foreground">
          {isLoading
            ? 'Loading…'
            : `${conversations.length} thread${conversations.length === 1 ? '' : 's'}`}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="p-4 text-sm text-red-600">{error}</div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No DM conversations yet. New inbound DMs will appear here once
            Instagram Advanced Access is approved and a follower messages
            one of the connected JKKN IG accounts.
          </div>
        ) : (
          <ul className="divide-y">
            {conversations.map((c) => {
              const isSelected = c.id === selectedId;
              const inWindow = isWithin24h(c.last_inbound_at);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                      isSelected ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-sm">
                        IG user {c.ig_user_id.slice(0, 12)}…
                      </span>
                      {inWindow ? (
                        <Badge
                          variant="secondary"
                          className="shrink-0 text-[10px]"
                        >
                          in window
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Account {c.ig_account_id.slice(0, 10)}…
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Last inbound {timeAgo(c.last_inbound_at)}
                    </div>
                    {c.lead_id ? (
                      <Badge
                        variant="outline"
                        className="mt-1 text-[10px]"
                      >
                        Linked lead
                      </Badge>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
