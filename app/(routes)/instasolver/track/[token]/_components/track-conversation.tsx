'use client';

/**
 * Insta Solver — the tracking page's conversation (Director rulings 5 and 6,
 * 30 Sep 2026).
 *
 * A handler can ask the person who filed without a name a question; she reads
 * it here with her private code and answers without her name. Once the
 * complaint is resolved she can rate the outcome, 1 to 5 stars and a note.
 *
 * Everything goes through token-checked database functions (see
 * lib/grievance/track-conversation.ts); nothing here reads a table.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, MessageCircleQuestion, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  ANSWER_MAX_LENGTH,
  RATING_NOTE_MAX_LENGTH,
  loadConversation,
  sendAnswer,
  sendRating,
  type ConversationLoad,
  type TrackConversation as Conversation,
  type TrackRpc,
} from '@/lib/grievance/track-conversation';

function formatWhen(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function TrackConversation({ token }: { token: string }) {
  // The generated client does not know these functions until types are
  // regenerated after the migration applies; the helpers validate every reply.
  const rpc = useMemo<TrackRpc>(() => {
    const client = createClientSupabaseClient();
    return (fn, args) => (client.rpc as unknown as TrackRpc)(fn, args);
  }, []);

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'hidden' | 'error'>('loading');
  const [answer, setAnswer] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'answer' | 'rate' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const apply = useCallback((res: ConversationLoad) => {
    if (res.kind === 'ok') {
      setConversation(res.conversation);
      setRating((current) => current ?? res.conversation.rating);
      setNote((current) => (current ? current : res.conversation.feedback ?? ''));
      setLoadState('ok');
    } else if (res.kind === 'error') {
      setLoadState('error');
    } else {
      // 'none' or 'not-ready': the progress card above already says what there
      // is to say; show nothing extra.
      setLoadState('hidden');
    }
  }, []);

  const refresh = useCallback(async () => {
    apply(await loadConversation(rpc, token));
  }, [apply, rpc, token]);

  useEffect(() => {
    let cancelled = false;
    loadConversation(rpc, token).then((res) => {
      if (!cancelled) apply(res);
    });
    return () => {
      cancelled = true;
    };
  }, [apply, rpc, token]);

  async function handleAnswer() {
    setBusy('answer');
    setMessage(null);
    const res = await sendAnswer(rpc, token, answer);
    if (res.ok) {
      setAnswer('');
      setMessage({ tone: 'ok', text: 'Your answer was sent. Your name is not shown with it.' });
      await refresh();
    } else {
      setMessage({ tone: 'error', text: res.error });
    }
    setBusy(null);
  }

  async function handleRate() {
    setBusy('rate');
    setMessage(null);
    const res = await sendRating(rpc, token, rating, note);
    if (res.ok) {
      setMessage({ tone: 'ok', text: 'Thank you. Your rating was saved.' });
      await refresh();
    } else {
      setMessage({ tone: 'error', text: res.error });
    }
    setBusy(null);
  }

  if (loadState === 'loading' || loadState === 'hidden') return null;

  if (loadState === 'error' || !conversation) {
    return (
      <Card className="mt-4">
        <CardContent className="flex items-start gap-3 py-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm">
            We couldn&apos;t load questions for this complaint right now — try again in a minute.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { messages, canAnswer, canRate } = conversation;

  return (
    <>
      {messages.length > 0 || canAnswer ? (
        <Card className="mt-4">
          <CardContent className="space-y-4 py-6">
            <div className="flex items-center gap-2">
              <MessageCircleQuestion className="h-5 w-5 text-sky-600" />
              <p className="font-medium">Questions about your complaint</p>
            </div>
            <ul className="space-y-3">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={
                    m.direction === 'question'
                      ? 'rounded-md border bg-muted/40 p-3'
                      : 'rounded-md border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/30'
                  }
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {m.direction === 'question' ? 'Question from the team' : 'Your answer'}
                    {formatWhen(m.created_at) ? ` · ${formatWhen(m.created_at)}` : ''}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">{m.body}</p>
                </li>
              ))}
            </ul>

            {canAnswer ? (
              <div className="space-y-2">
                <Label htmlFor="track-answer">Your answer</Label>
                <Textarea
                  id="track-answer"
                  rows={4}
                  value={answer}
                  maxLength={ANSWER_MAX_LENGTH}
                  placeholder="Write your answer. Your name is not shown."
                  onChange={(e) => setAnswer(e.target.value)}
                />
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={handleAnswer}
                  disabled={busy !== null || !answer.trim()}
                >
                  {busy === 'answer' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending
                    </>
                  ) : (
                    'Send answer'
                  )}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {canRate ? (
        <Card className="mt-4">
          <CardContent className="space-y-4 py-6">
            <p className="font-medium">How was this handled?</p>
            <div className="flex gap-1" role="radiogroup" aria-label="Rating from 1 to 5 stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
                  className="rounded p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setRating(n)}
                >
                  <Star
                    className={
                      rating !== null && n <= rating
                        ? 'h-7 w-7 fill-amber-400 text-amber-500'
                        : 'h-7 w-7 text-muted-foreground'
                    }
                  />
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="track-rating-note">Anything to add? (optional)</Label>
              <Textarea
                id="track-rating-note"
                rows={3}
                value={note}
                maxLength={RATING_NOTE_MAX_LENGTH}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={handleRate}
              disabled={busy !== null || rating === null}
            >
              {busy === 'rate' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : conversation.rating ? (
                'Update my rating'
              ) : (
                'Send my rating'
              )}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {message ? (
        <p
          role="status"
          className={
            message.tone === 'ok'
              ? 'mt-3 text-sm text-emerald-700 dark:text-emerald-400'
              : 'mt-3 text-sm text-destructive'
          }
        >
          {message.text}
        </p>
      ) : null}
    </>
  );
}
