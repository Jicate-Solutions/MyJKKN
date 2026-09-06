'use client';

/**
 * SessionQuestionDialog — the HOST end of the shared question board.
 *
 * Opening it switches the board on for this session (fn_session_question_board_ensure
 * creates it 'open'), so there is no separate enable step. The host sees the SAME
 * questions the room sees plus the real name behind each nickname, and can mark one
 * ANSWERED — which is the state the one-month success test counts.
 *
 * The board itself is module-agnostic; only the trigger and the "which session" wiring
 * live in the induction folder.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { BeatLoader } from 'react-spinners';
import { ArrowBigUp, CheckCircle2, MessagesSquare, Undo2, X } from 'lucide-react';
import {
  SessionQuestionService,
  type HostBoard,
  type HostQuestion,
  type SessionQuestionState,
} from '@/lib/services/session-questions/session-question-service';

const BRAND = '#0b6d41';
const REFRESH_MS = 8000;

function askedBy(q: HostQuestion): string {
  const name = q.learner_name ?? 'Name not on file';
  return q.register_number ? `${name} · ${q.register_number}` : name;
}

export function SessionQuestionDialog({ sessionId, sessionTitle }: { sessionId: string; sessionTitle: string }) {
  const [open, setOpen] = useState(false);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [board, setBoard] = useState<HostBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stop, []);

  const refresh = useCallback(async (id: string) => {
    try { setBoard(await SessionQuestionService.hostList(id)); } catch { /* keep the last good list */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const id = await SessionQuestionService.ensureBoard('induction', sessionId);
      setBoardId(id);
      await refresh(id);
      stop();
      timer.current = setInterval(() => refresh(id), REFRESH_MS);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not open the question board');
    } finally {
      setLoading(false);
    }
  }, [sessionId, refresh]);

  useEffect(() => {
    if (open) { load(); } else { stop(); setBoard(null); }
  }, [open, load]);

  async function move(q: HostQuestion, state: SessionQuestionState) {
    const result = await SessionQuestionService.setState(q.id, state);
    if (!result.success) { toast.error(result.error ?? 'Could not update that question.'); return; }
    if (boardId) await refresh(boardId);
  }

  async function toggleBoard() {
    if (!boardId || !board) return;
    const next = board.status === 'open' ? 'closed' : 'open';
    const result = await SessionQuestionService.setBoardStatus(boardId, next);
    if (!result.success) { toast.error(result.error ?? 'Could not update the board.'); return; }
    await refresh(boardId);
  }

  const answered = board ? board.questions.filter((q) => q.state === 'answered').length : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Questions">
          <MessagesSquare className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] sm:max-w-2xl flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Questions — {sessionTitle}
            {board && (
              <Badge variant={board.status === 'open' ? 'default' : 'secondary'}>{board.status}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Learners ask and upvote; the room sees only a nickname. You see who asked, so you can
            group one learner&apos;s questions. Mark a question answered once you have taken it.
          </DialogDescription>
        </DialogHeader>

        {loading && !board ? (
          <div className="flex justify-center py-8"><BeatLoader color={BRAND} size={9} /></div>
        ) : !board ? null : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{board.questions.length} asked · {answered} answered</span>
              <Button size="sm" variant="outline" onClick={toggleBoard}>
                {board.status === 'open' ? 'Close the board' : 'Reopen the board'}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {board.questions.length === 0 ? (
                <p className="rounded-md bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
                  No questions yet. The board is live for this session&apos;s learners.
                </p>
              ) : (
                <ul className="space-y-2">
                  {board.questions.map((q) => (
                    <li key={q.id} className="rounded-md border px-3 py-2 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="flex items-center gap-1 font-semibold">
                          <ArrowBigUp className="h-3.5 w-3.5" />{q.vote_count}
                        </span>
                        <Badge variant="secondary" className="text-[11px]">{q.nickname}</Badge>
                        <span className="text-muted-foreground">{askedBy(q)}</span>
                        {q.state === 'answered' && (
                          <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" /> Answered
                          </Badge>
                        )}
                        {q.state === 'blocked' && (
                          <Badge variant="outline" className="border-amber-300 text-amber-700">Held back</Badge>
                        )}
                        {q.state === 'dismissed' && (
                          <Badge variant="outline" className="text-muted-foreground">Closed</Badge>
                        )}
                      </div>

                      <p className="whitespace-pre-wrap break-words text-sm">{q.body}</p>
                      {q.moderation_note && (
                        <p className="text-xs text-muted-foreground">{q.moderation_note}</p>
                      )}

                      <div className="flex flex-wrap gap-1">
                        {q.state !== 'answered' && (
                          <Button size="sm" variant="outline" className="h-7" onClick={() => move(q, 'answered')}>
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Mark answered
                          </Button>
                        )}
                        {q.state !== 'visible' && (
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => move(q, 'visible')}>
                            <Undo2 className="mr-1 h-3 w-3" /> Put back on the board
                          </Button>
                        )}
                        {q.state !== 'dismissed' && (
                          <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => move(q, 'dismissed')}>
                            <X className="mr-1 h-3 w-3" /> Remove
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
