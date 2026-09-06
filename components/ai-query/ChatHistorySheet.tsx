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
 */

import { useState, useCallback } from 'react';
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
import { History, Loader2, MessageSquare, MessagesSquare } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

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
            Only you can see your own chats — tap one to reopen it and continue.
          </SheetDescription>
        </SheetHeader>

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
                <button
                  key={r.conversation_id}
                  type="button"
                  onClick={() => handleSelect(r.conversation_id)}
                  className="w-full text-left rounded-lg border border-border/60 bg-gradient-to-br from-muted/60 to-muted/20 p-3 transition-colors hover:border-primary/40 hover:from-muted/80 hover:to-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default ChatHistorySheet;
