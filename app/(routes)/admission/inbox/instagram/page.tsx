'use client';

// app/(routes)/admission/inbox/instagram/page.tsx
//
// Instagram DM 2-pane inbox. Mirror of /admission/inbox/messenger/page.tsx
// for IG DMs landing via the meta/instagram-messaging webhook (PR #1153).
//
//  ┌───────────────────────────────┬───────────────────────────────────────┐
//  │ Conversation list             │ Selected thread                       │
//  │ (open / closed / all)         │ Message log + composer                │
//  │ Sorted by last_inbound_at desc│                                       │
//  └───────────────────────────────┴───────────────────────────────────────┘
//
// Data flow:
//   - left rail polls /api/social/instagram/dm/conversations (via the
//     useIgDmConversations hook) every 30s, scoped to the user's
//     institution_id
//   - right rail polls /api/social/instagram/dm/conversations/{id}/messages
//     every 15s
//   - composer POSTs to /api/social/instagram/dm/conversations/{id}/reply
//
// 24h-window UX:
//   IG DM enforces a 24-hour reply window with no message-tag exceptions
//   (unlike Messenger). When the window is closed the composer disables
//   itself and surfaces "wait for the user to reply" copy.
//
// Empty-state copy:
//   When the substrate isn't ready (ig_dm_conversations missing, policy
//   off, or zero rows) the page renders the "Awaiting Meta IG Advanced
//   Access approval" notice with a pointer to
//   /docs/meta-integration-app-review-submission-2026.md.

import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConversationList } from './_components/conversation-list';
import { ConversationView } from './_components/conversation-view';
import {
  useIgDmConversations,
  useIgDmMessages,
  useSendIgDmReply,
} from '@/hooks/admission/use-ig-dm-conversations';

type StatusFilter = 'open' | 'closed';

const AWAITING_APPROVAL_HREF =
  '/docs/meta-integration-app-review-submission-2026.md';

export default function InstagramInboxPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? null;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [windowNotice, setWindowNotice] = useState<string | null>(null);

  // IG DM conversations don't currently expose a status column, so the
  // open/closed toggle is a UX placeholder: 'open' shows everything,
  // 'closed' filters to rows whose 24h window has expired AND that have
  // no lead linkage (a pragmatic local-only definition until the schema
  // adds an explicit status).
  const conversationsQuery = useIgDmConversations({
    institutionId,
  });

  const conversations = useMemo(() => {
    const rows = conversationsQuery.data?.conversations ?? [];
    if (statusFilter === 'open') return rows;
    const now = Date.now();
    return rows.filter((c) => {
      if (!c.last_inbound_at) return false;
      const t = new Date(c.last_inbound_at).getTime();
      if (Number.isNaN(t)) return false;
      return now - t > 24 * 60 * 60 * 1000;
    });
  }, [conversationsQuery.data, statusFilter]);

  const effectiveSelectedId =
    selectedId && conversations.some((c) => c.id === selectedId)
      ? selectedId
      : conversations[0]?.id ?? null;

  const selected = useMemo(
    () =>
      conversations.find((c) => c.id === effectiveSelectedId) ?? null,
    [conversations, effectiveSelectedId]
  );

  const messagesQuery = useIgDmMessages(effectiveSelectedId);
  const sendMutation = useSendIgDmReply({
    institutionId,
    conversationId: effectiveSelectedId,
  });

  const onSend = () => {
    const text = draft.trim();
    if (!text) return;
    setWindowNotice(null);
    sendMutation.mutate(text, {
      onSuccess: (result) => {
        if ('kind' in result && result.kind === 'outside_window') {
          setWindowNotice(result.message);
          return;
        }
        setDraft('');
      },
    });
  };

  const renderEmptyState = (heading: string, body: React.ReactNode) => (
    <Card className="p-8">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-2 text-base font-semibold">{heading}</div>
        <div className="text-sm text-muted-foreground">{body}</div>
      </div>
    </Card>
  );

  // Top-of-page rendering: if we have no profile yet, render a thin
  // skeleton. If the user is a super_admin with no institution_id, ask
  // them to pick one via a follow-up — for now render the awaiting-
  // approval card with a different reason.
  const isReadyForData = !!institutionId;

  return (
    <ContentLayout title="Instagram DM Inbox">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/dashboard">
                Admission
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/inbox/messenger">
                Inbox
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Instagram</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Status filter chips */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={statusFilter === 'open' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('open')}
          >
            Open
          </Button>
          <Button
            type="button"
            variant={statusFilter === 'closed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('closed')}
          >
            Closed
          </Button>
          <Badge variant="outline" className="ml-auto text-[10px]">
            Awaiting IG Advanced Access approval
          </Badge>
        </div>

        {!isReadyForData ? (
          renderEmptyState(
            'No institution scope',
            <>
              Your profile has no institution_id set. Pick an institution to
              view its IG DM conversations, or contact a super admin if you
              expected to see this inbox.
            </>
          )
        ) : conversationsQuery.error ? (
          renderEmptyState(
            'Awaiting IG Advanced Access approval',
            <>
              The Instagram DM substrate is not yet reachable from this
              account.{' '}
              <a
                href={AWAITING_APPROVAL_HREF}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Meta App Review submission notes
              </a>{' '}
              track the approval status. Error:{' '}
              {(conversationsQuery.error as Error).message}
            </>
          )
        ) : !conversationsQuery.isLoading && conversations.length === 0 ? (
          renderEmptyState(
            statusFilter === 'open'
              ? 'No open IG DM conversations'
              : 'No closed IG DM conversations',
            <>
              Awaiting IG Advanced Access approval — see{' '}
              <a
                href={AWAITING_APPROVAL_HREF}
                className="underline underline-offset-2 hover:text-foreground"
              >
                /docs/meta-integration-app-review-submission-2026.md
              </a>
              . Once approved and a follower DMs one of the connected JKKN IG
              accounts, the thread will appear here.
            </>
          )
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
            <ConversationList
              conversations={conversations}
              selectedId={effectiveSelectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setWindowNotice(null);
              }}
              isLoading={conversationsQuery.isLoading}
              error={
                conversationsQuery.error
                  ? (conversationsQuery.error as Error).message
                  : null
              }
              statusLabel={statusFilter === 'open' ? 'Open' : 'Closed'}
            />

            <ConversationView
              selected={selected}
              messages={messagesQuery.data?.messages ?? []}
              messagesLoading={messagesQuery.isLoading}
              messagesError={
                messagesQuery.error
                  ? (messagesQuery.error as Error).message
                  : null
              }
              canReply={messagesQuery.data?.canReply ?? false}
              draft={draft}
              onDraftChange={(next) => {
                setDraft(next);
                if (windowNotice) setWindowNotice(null);
              }}
              onSend={onSend}
              sendPending={sendMutation.isPending}
              sendError={
                sendMutation.error
                  ? (sendMutation.error as Error).message
                  : null
              }
              windowExpiredNotice={windowNotice}
            />
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
