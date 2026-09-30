'use client';

/**
 * Handler side of Director rulings 5 and 6 (30 Sep 2026).
 *
 *   * On an ANONYMOUS ticket: ask the filer a question. She reads it on her
 *     tracking page with her private code and answers without her name; the
 *     answer shows here. Nobody on this screen can find out who she is.
 *   * On ANY ticket the filer has rated: her 1-5 stars and note, once resolved.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageCircleQuestion, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';

interface AnonymousFilerPanelProps {
  ticketId: string;
  isAnonymous: boolean;
  status: string | null;
  withdrawn: boolean;
  rating: number | null;
  feedback: string | null;
  /** The signed-in handler, who is recorded as the one asking. */
  profileId: string | null;
}

export function AnonymousFilerPanel({
  ticketId,
  isAnonymous,
  status,
  withdrawn,
  rating,
  feedback,
  profileId,
}: AnonymousFilerPanelProps) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const messagesQ = useQuery({
    queryKey: ['grievance', 'anonymous-messages', ticketId],
    queryFn: () => GrievanceService.listAnonymousMessages(ticketId),
    enabled: isAnonymous,
  });

  const canAsk = isAnonymous && status !== 'closed' && !withdrawn;

  async function handleAsk() {
    if (!profileId) {
      toast.error('No profile loaded.');
      return;
    }
    if (!draft.trim()) return;
    setSending(true);
    try {
      await GrievanceService.askAnonymousFiler({ ticket_id: ticketId, body: draft, author_id: profileId });
      setDraft('');
      await qc.invalidateQueries({ queryKey: ['grievance', 'anonymous-messages', ticketId] });
      toast.success('Question sent. The filer sees it when they check progress with their code.');
    } catch (err) {
      toast.error('Could not send the question. ' + (err as Error).message);
    } finally {
      setSending(false);
    }
  }

  const messages = messagesQ.data ?? [];

  return (
    <>
      {isAnonymous ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircleQuestion className="h-4 w-4" /> Questions to the filer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              This complaint was filed without a name. The filer sees your question when they check
              progress with their private code, and can answer without their name. They are not
              notified, so expect a delay.
            </p>
            {messagesQ.isError ? (
              <p className="text-sm text-destructive">Could not load the questions. Refresh to try again.</p>
            ) : null}
            {messages.length === 0 && !messagesQ.isLoading && !messagesQ.isError ? (
              <p className="text-sm text-muted-foreground">No questions asked yet.</p>
            ) : null}
            {messages.map((m) => (
              <div
                key={m.id}
                className={m.direction === 'question' ? 'border-l-2 border-muted pl-3' : 'border-l-2 border-sky-400 pl-3'}
              >
                <div className="text-xs text-muted-foreground">
                  {m.direction === 'question' ? 'Question' : "Filer's answer"}
                  {m.created_at ? ` · ${new Date(m.created_at).toLocaleString()}` : ''}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
              </div>
            ))}
            {canAsk ? (
              <div className="space-y-2">
                <Label htmlFor="ask-anonymous-filer">Ask the filer</Label>
                <Textarea
                  id="ask-anonymous-filer"
                  rows={3}
                  maxLength={2000}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="For example: which block and floor was this on?"
                />
                <Button type="button" onClick={handleAsk} disabled={sending || !draft.trim()}>
                  {sending ? 'Sending…' : 'Send question'}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {rating ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="h-4 w-4" /> Filer&apos;s rating
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-1" aria-label={`${rating} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={n <= rating ? 'h-5 w-5 fill-amber-400 text-amber-500' : 'h-5 w-5 text-muted-foreground'}
                />
              ))}
              <span className="ml-2 text-sm">{rating} out of 5</span>
            </div>
            {feedback ? <p className="whitespace-pre-wrap text-sm">{feedback}</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
