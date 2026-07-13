'use client';

/**
 * ChatHistorySheet
 * "Your past questions" — a read-only side panel of the current user's own
 * previous AI Assistant questions and answers.
 *
 * Pilot decision #7: each user can see their OWN past questions (no delete,
 * no cross-user visibility). Enforced server-side by fn_ai_my_chat_history,
 * which pins auth.uid() and filters ai_jobs.requested_by = auth.uid().
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
import { History, Loader2, MessageSquare } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface HistoryRow {
  id: string;
  question: string | null;
  answer: string | null;
  status: string | null;
  asked_at: string;
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

export function ChatHistorySheet() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [rows, setRows] = useState<HistoryRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrored(false);
    try {
      const supabase = createClientSupabaseClient();
      // fn not yet in generated types (ships with the pilot-polish migration).
      const { data, error } = await (supabase as any).rpc('fn_ai_my_chat_history', {
        p_limit: 30,
      });
      if (error) {
        setErrored(true);
        setRows([]);
      } else {
        setRows(Array.isArray(data) ? (data as HistoryRow[]) : []);
      }
    } catch {
      setErrored(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
            Your past questions
          </SheetTitle>
          <SheetDescription className="text-xs">
            Only you can see your own questions — your last 30 are shown here.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : errored ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Couldn’t load your history. Please try again.
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-3 opacity-40" />
              <p className="text-sm">You haven’t asked anything yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-border/60 bg-gradient-to-br from-muted/60 to-muted/20 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground/90 line-clamp-2">
                      {r.question || '(no question text)'}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] flex-shrink-0', statusTone(r.status))}
                    >
                      {r.status ?? 'unknown'}
                    </Badge>
                  </div>
                  {r.answer && (
                    <p className="mt-1.5 text-xs text-muted-foreground line-clamp-3">
                      {r.answer}
                    </p>
                  )}
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                    {new Date(r.asked_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default ChatHistorySheet;
