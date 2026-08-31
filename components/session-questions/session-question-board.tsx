'use client';

/**
 * SessionQuestionBoard — the room view of a session question board.
 *
 * ONE component for every session type. It takes a board id and nothing module-specific,
 * so induction, AI Pulse and meetings mount the SAME board rather than each growing a
 * copy (MyJKKN already carries six poll systems, five of them dead — this is the shape
 * that stops a seventh).
 *
 * What the room sees: "Learner 7", the question, and the upvote count. Never a name.
 * The host sees the real name in the host panel; that asymmetry is the whole point and
 * lives in two different RPCs, not in a flag on this component.
 *
 * Refresh is a 6s interval, matching how session-poll-banner.tsx keeps itself current.
 * Your own post appears immediately because posting refetches straight away.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import { ArrowBigUp, CheckCircle2, MessageSquare, ShieldAlert } from 'lucide-react';
import {
  SessionQuestionService,
  type RoomBoard,
  type RoomQuestion,
} from '@/lib/services/session-questions/session-question-service';

const BRAND = '#0b6d41';
const MAX_LEN = 500;
const REFRESH_MS = 6000;

function stateBadge(q: RoomQuestion) {
  if (q.state === 'answered') {
    return (
      <Badge variant="outline" className="shrink-0 gap-1 border-emerald-300 text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Answered
      </Badge>
    );
  }
  if (q.state === 'blocked') {
    return <Badge variant="outline" className="shrink-0 border-amber-300 text-amber-700">Held back</Badge>;
  }
  if (q.state === 'dismissed') {
    return <Badge variant="outline" className="shrink-0 text-muted-foreground">Closed by host</Badge>;
  }
  return null;
}

export function SessionQuestionBoard({ boardId }: { boardId: string }) {
  const [board, setBoard] = useState<RoomBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  // D7: a refusal is rendered here, in the page, not swallowed into a console line.
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setBoard(await SessionQuestionService.room(boardId));
    } catch {
      /* keep the last good view rather than blanking the room */
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  }, [load]);

  async function post() {
    const text = body.trim();
    if (!text) { setNotice('Please type your question first.'); return; }
    setBusy(true);
    setNotice(null);
    const result = await SessionQuestionService.ask(boardId, text);
    setBusy(false);
    if (!result.success) {
      // Explicit, general-terms refusal — the learner is always told, never bounced.
      setNotice(result.error ?? 'Could not post your question.');
      await load();
      return;
    }
    setBody('');
    toast.success('Your question is on the board.');
    await load();
  }

  async function upvote(q: RoomQuestion) {
    const result = await SessionQuestionService.toggleVote(q.id);
    if (!result.success) { toast.error(result.error ?? 'Could not record your upvote.'); return; }
    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        questions: prev.questions.map((x) =>
          x.id === q.id ? { ...x, my_vote: result.voted, vote_count: result.vote_count } : x),
      };
    });
  }

  if (loading) {
    return <div className="flex justify-center py-6"><BeatLoader color={BRAND} size={8} /></div>;
  }
  if (!board) return null;

  const closed = board.status === 'closed';
  const open = !closed && board.can_ask;
  const remaining = MAX_LEN - body.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquare className="h-4 w-4" style={{ color: BRAND }} />
        <span className="text-sm font-semibold">Ask a question</span>
        {board.my_nickname && (
          <Badge variant="secondary" className="text-xs">You appear as {board.my_nickname}</Badge>
        )}
        {closed && (
          <Badge variant="outline" className="text-xs text-muted-foreground">Board closed</Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Everyone in the room sees your question under a nickname, not your name. The host can
        see who asked, so they can group your questions together.
      </p>

      {/* A closed board stays readable — the questions and their answers are still here.
          Saying so is the point: a board that silently emptied itself would take the
          answers with it and tell the learner nothing (CLAUDE.md #27). */}
      {closed && (
        <p className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          The host has closed this board, so no new questions or upvotes. Everything asked
          during the session, and the answers, stay here to read.
        </p>
      )}

      {open && (
        <div className="space-y-2">
          <Textarea
            value={body}
            maxLength={MAX_LEN}
            rows={3}
            placeholder="What would you like to ask?"
            onChange={(e) => setBody(e.target.value)}
            disabled={busy}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{remaining} characters left</span>
            <Button size="sm" onClick={post} disabled={busy || !body.trim()}>
              {busy ? 'Posting…' : 'Post question'}
            </Button>
          </div>
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {board.questions.length === 0 ? (
        <p className="rounded-md bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground">
          {closed ? 'No questions were asked on this board.' : 'No questions yet. Ask the first one.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {board.questions.map((q) => (
            <li
              key={q.id}
              className={`flex items-start gap-3 rounded-md border px-3 py-2 ${
                q.state === 'blocked' || q.state === 'dismissed' ? 'bg-muted/30' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => upvote(q)}
                disabled={!open || q.state === 'blocked' || q.state === 'dismissed'}
                aria-label={q.my_vote ? 'Remove your upvote' : 'Upvote this question'}
                aria-pressed={q.my_vote}
                className={`flex w-10 shrink-0 flex-col items-center rounded-md border py-1 text-xs transition-colors disabled:opacity-50 ${
                  q.my_vote ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'hover:bg-muted'
                }`}
              >
                <ArrowBigUp className="h-4 w-4" />
                <span className="font-semibold">{q.vote_count}</span>
              </button>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {q.nickname}{q.is_mine ? ' (you)' : ''}
                  </span>
                  {stateBadge(q)}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{q.body}</p>
                {q.is_mine && q.state === 'blocked' && (
                  <p className="text-xs text-amber-700">
                    This may breach community rules, so it is not on the board. Reword it, or ask
                    the host directly.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
