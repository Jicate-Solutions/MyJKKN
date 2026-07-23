'use client';

// app/(routes)/admission/inbox/messenger/page.tsx
// Facebook Messenger 2-pane inbox.
//
//  ┌───────────────────────────────┬───────────────────────────────────────┐
//  │ Conversation list             │ Selected thread                       │
//  │ (open / closed / all)         │ Message log + composer                │
//  │ Sorted by last_inbound_at desc│                                       │
//  └───────────────────────────────┴───────────────────────────────────────┘
//
// Data flow: /api/social/messenger/conversations populates the left rail;
// clicking a row fetches /api/social/messenger/conversations/{id}/messages
// for the right rail. Composer posts to /api/social/messenger/send and
// triggers a messages-refresh on success.
//
// The 24-hour-window policy is enforced server-side; UI hints disable the
// composer when the last inbound was >24h ago so the user knows ahead of
// the send attempt.

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

interface ConversationRow {
  id: string;
  page_id: string;
  psid: string;
  lead_id: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  status: 'open' | 'closed';
}

interface MessageRow {
  id: string;
  direction: 'in' | 'out';
  text: string | null;
  sent_at: string;
}

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

export default function MessengerInboxPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const conversationsQuery = useQuery({
    queryKey: ['messenger-conversations', 'open'],
    queryFn: async () => {
      const res = await fetch('/api/social/messenger/conversations?status=open');
      const body = await res.json();
      if (!body.success) throw new Error(body.error || 'Failed to load conversations');
      return body.data as ConversationRow[];
    },
    refetchInterval: 30_000,
  });

  const conversations = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data]
  );

  // Effective selection: explicit `selectedId` if it still exists in the list,
  // otherwise the first conversation. Derived (no setState in effect) so the
  // initial render shows a selected thread without a cascading re-render.
  const effectiveSelectedId =
    (selectedId && conversations.some((c) => c.id === selectedId))
      ? selectedId
      : (conversations[0]?.id ?? null);

  const selected = useMemo(
    () => conversations.find((c) => c.id === effectiveSelectedId) ?? null,
    [conversations, effectiveSelectedId]
  );

  const messagesQuery = useQuery({
    queryKey: ['messenger-messages', effectiveSelectedId],
    queryFn: async () => {
      if (!effectiveSelectedId) return [];
      const res = await fetch(
        `/api/social/messenger/conversations/${effectiveSelectedId}/messages`
      );
      const body = await res.json();
      if (!body.success) throw new Error(body.error || 'Failed to load messages');
      return body.data as MessageRow[];
    },
    enabled: !!effectiveSelectedId,
    refetchInterval: 15_000,
  });

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!selected) throw new Error('No conversation selected');
      const res = await fetch('/api/social/messenger/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_id: selected.page_id,
          psid: selected.psid,
          text,
        }),
      });
      const body = await res.json();
      if (!body.success) throw new Error(body.error || 'Send failed');
      return body.data;
    },
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({
        queryKey: ['messenger-messages', effectiveSelectedId],
      });
      queryClient.invalidateQueries({
        queryKey: ['messenger-conversations', 'open'],
      });
    },
  });

  const canSend = selected ? isWithin24h(selected.last_inbound_at) : false;

  return (
    <ContentLayout title="Messenger Inbox">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Messenger Inbox</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
          {/* Left rail: conversation list */}
          <Card className="flex h-[calc(100vh-220px)] flex-col overflow-hidden">
            <div className="border-b px-4 py-3">
              <div className="text-sm font-semibold">Open conversations</div>
              <div className="text-xs text-muted-foreground">
                {conversationsQuery.isLoading
                  ? 'Loading…'
                  : `${conversations.length} thread${conversations.length === 1 ? '' : 's'}`}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversationsQuery.error ? (
                <div className="p-4 text-sm text-red-600">
                  {(conversationsQuery.error as Error).message}
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No open conversations. New inbound messages will appear here.
                </div>
              ) : (
                <ul className="divide-y">
                  {conversations.map((c) => {
                    const isSelected = c.id === effectiveSelectedId;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(c.id)}
                          className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                            isSelected ? 'bg-muted' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-sm">
                              PSID {c.psid.slice(0, 12)}…
                            </span>
                            {isWithin24h(c.last_inbound_at) ? (
                              <Badge variant="secondary" className="shrink-0 text-[10px]">
                                in window
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Page {c.page_id.slice(0, 10)}…
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Last inbound {timeAgo(c.last_inbound_at)}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>

          {/* Right rail: messages + composer */}
          <Card className="flex h-[calc(100vh-220px)] flex-col overflow-hidden">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                Select a conversation on the left to see messages.
              </div>
            ) : (
              <>
                <div className="border-b px-4 py-3">
                  <div className="text-sm font-semibold">PSID {selected.psid}</div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Page {selected.page_id}</span>
                    {selected.lead_id ? (
                      <Badge variant="outline" className="text-[10px]">
                        Linked lead
                      </Badge>
                    ) : null}
                    <span>Status: {selected.status}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {messagesQuery.isLoading ? (
                    <div className="text-sm text-muted-foreground">Loading messages…</div>
                  ) : messagesQuery.error ? (
                    <div className="text-sm text-red-600">
                      {(messagesQuery.error as Error).message}
                    </div>
                  ) : (messagesQuery.data ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No messages yet in this thread.
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {(messagesQuery.data ?? []).map((m) => {
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
                  {!canSend ? (
                    <div className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      24-hour reply window expired. Use a Meta-approved message
                      tag (e.g. CONFIRMED_EVENT_UPDATE) from the API to reply
                      outside the window.
                    </div>
                  ) : null}
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={
                        canSend
                          ? 'Type a reply…'
                          : 'Reply window closed'
                      }
                      disabled={!canSend || sendMutation.isPending}
                      rows={2}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={() => {
                        if (draft.trim()) sendMutation.mutate(draft.trim());
                      }}
                      disabled={
                        !canSend || sendMutation.isPending || draft.trim().length === 0
                      }
                    >
                      {sendMutation.isPending ? 'Sending…' : 'Send'}
                    </Button>
                  </div>
                  {sendMutation.error ? (
                    <div className="mt-2 text-xs text-red-600">
                      {(sendMutation.error as Error).message}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
