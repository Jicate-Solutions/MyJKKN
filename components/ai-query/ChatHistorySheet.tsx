'use client';

/**
 * ChatHistorySheet
 * "Your past chats" — a read-only side panel of the current user's own
 * conversations. Tapping one reopens the whole thread in the assistant and
 * lets the user continue it.
 *
 * Scope (server-enforced): fn_ai_my_conversations pins auth.uid() and filters
 * ai_jobs.requested_by = auth.uid(), so a user only ever sees their OWN chats
 * (no cross-user visibility, no delete).
 *
 * "Repeat…" on a past chat schedules its opening question (ScheduleDialog);
 * the "Scheduled" tab lists the person's own schedules (ScheduleList). A link
 * of the form /ai-query?scheduled=<id> (from a scheduled answer's email or
 * notification) opens this sheet straight on that schedule.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { History, Loader2, MessageSquare, MessagesSquare, Repeat } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { ScheduleDialog } from './ScheduleDialog';
import { ScheduleList } from './ScheduleList';

type HistoryTab = 'chats' | 'scheduled';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ConversationRow {
  conversation_id: string;
  title: string | null;
  turn_count: number;
  last_at: string;
  last_status: string | null;
}

function statusTone(status: string | null): string {
  switch (status) {
    case 'done':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    case 'error':
    case 'canceled':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    default:
      return 'bg-muted text-muted-foreground border-border/50';
  }
}

export function ChatHistorySheet({
  onSelect,
}: {
  /** Called with the conversation_id when the user taps a past chat to reopen it. */
  onSelect?: (conversationId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [tab, setTab] = useState<HistoryTab>('chats');
  const [repeatQuestion, setRepeatQuestion] = useState<string | null>(null);
  const [scheduleRefresh, setScheduleRefresh] = useState(0);
  const [focusScheduleId, setFocusScheduleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrored(false);
    try {
      const supabase = createClientSupabaseClient();
      // fn not yet in generated types (ships with the conversation-history migration).
      const { data, error } = await (supabase as any).rpc('fn_ai_my_conversations', {
        p_limit: 30,
      });
      if (error) {
        setErrored(true);
        setRows([]);
      } else {
        setRows(Array.isArray(data) ? (data as ConversationRow[]) : []);
      }
    } catch {
      setErrored(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelect = (conversationId: string) => {
    onSelect?.(conversationId);
    setOpen(false);
  };

  // Arriving from a scheduled answer's link: open straight on that schedule.
  // Read once from the URL (no useSearchParams, so the page needs no Suspense).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = new URLSearchParams(window.location.search).get('scheduled');
    if (id && UUID_RE.test(id)) {
      setFocusScheduleId(id);
      setTab('scheduled');
      setOpen(true);
      void load();
    }
  }, [load]);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void load();
      }}
    >
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 sm:px-3">
          <History className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">History</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            Your past chats
          </SheetTitle>
          <SheetDescription className="text-xs">
            Only you can see your own chats — tap one to reopen it and continue, or press Repeat…
            to have it answered for you on a schedule.
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as HistoryTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="mx-4 mt-3 grid grid-cols-2">
            <TabsTrigger value="chats">Past chats</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          </TabsList>

        <TabsContent value="chats" className="mt-0 min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col">
        <ScrollArea className="flex-1 px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : errored ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Couldn’t load your chats. Please try again.
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-3 opacity-40" />
              <p className="text-sm">You haven’t asked anything yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.conversation_id} className="relative">
                <button
                  type="button"
                  onClick={() => handleSelect(r.conversation_id)}
                  className="w-full text-left rounded-lg border border-border/60 bg-gradient-to-br from-muted/60 to-muted/20 p-3 pb-9 transition-colors hover:border-primary/40 hover:from-muted/80 hover:to-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground/90 line-clamp-2">
                      {r.title || '(no question text)'}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] flex-shrink-0', statusTone(r.last_status))}
                    >
                      {r.last_status ?? 'unknown'}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                    {r.turn_count > 1 && (
                      <span className="inline-flex items-center gap-1">
                        <MessagesSquare className="h-3 w-3" />
                        {r.turn_count} messages
                      </span>
                    )}
                    <span>{new Date(r.last_at).toLocaleString()}</span>
                  </div>
                </button>
                {r.title && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute bottom-1.5 right-1.5 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setRepeatQuestion(r.title)}
                    aria-label={`Repeat the question: ${r.title}`}
                  >
                    <Repeat className="mr-1 h-3 w-3" />
                    Repeat…
                  </Button>
                )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        </TabsContent>

        <TabsContent value="scheduled" className="mt-0 min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col">
          <ScrollArea className="flex-1 px-4 py-3">
            {tab === 'scheduled' && (
              <ScheduleList refreshKey={scheduleRefresh} focusId={focusScheduleId} />
            )}
          </ScrollArea>
        </TabsContent>
        </Tabs>
      </SheetContent>

      <ScheduleDialog
        open={repeatQuestion !== null}
        onOpenChange={(o) => {
          if (!o) setRepeatQuestion(null);
        }}
        question={repeatQuestion ?? ''}
        onCreated={() => {
          setScheduleRefresh((n) => n + 1);
          setTab('scheduled');
        }}
      />
    </Sheet>
  );
}

export default ChatHistorySheet;
