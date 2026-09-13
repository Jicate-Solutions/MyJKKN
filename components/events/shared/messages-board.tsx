'use client';

// components/events/shared/messages-board.tsx
//
// "Message registrants" — the organiser-facing send surface for ANY event type.
// Until this board existed, app/api/events/notify, the events notification
// service and hooks/events/use-events-notifications were all complete and had
// no caller: a venue change, a time change or a cancellation reached nobody.
//
// Three things this board insists on, because it sends real messages to real
// people:
//   1. The recipient count is shown BEFORE the send, next to the number of
//      registrants who have no account and will therefore hear nothing.
//   2. Sending takes a second, explicit confirmation that repeats the count.
//   3. Everything already sent is listed, with who sent it and how far it
//      reached — so the organiser can see they have already said this.
//
// Denial is explicit, never a redirect and never an empty panel (house rule
// #27): someone who may not message this event is told so, and told who can.

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
  Megaphone,
  Send,
  Users,
} from 'lucide-react';
import {
  useEventMessagePanel,
  useSendRegistrantMessage,
} from '@/hooks/events/use-events-notifications';
import {
  EventMessageError,
  type EventRegistrantMessage,
} from '@/lib/services/events/notification-service';

const SUBJECT_MAX = 120;
const BODY_MAX = 2000;

const NO_ACCESS_TITLE = 'You do not have access to this';
const NO_ACCESS_BODY =
  'Messaging an event\'s registrants is limited to the event\'s creator, the person named as its in-charge, and administrators. Ask an event coordinator to add you as in-charge if you need to send updates.';

function mintToken(): string {
  // crypto.randomUUID is present in every browser this app supports; the
  // fallback keeps a non-secure context (and jsdom) from throwing.
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (ch) => {
    const n = Number(ch);
    return (n ^ (Math.floor(Math.random() * 256) & (15 >> (n / 4)))).toString(16);
  });
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DeniedCard() {
  return (
    <Card className="border-amber-200 bg-amber-50/60">
      <CardContent className="flex items-start gap-3 py-5">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-amber-900">{NO_ACCESS_TITLE}</p>
          <p className="text-sm text-amber-800">{NO_ACCESS_BODY}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SentMessageRow({ message }: { message: EventRegistrantMessage }) {
  const failed = !message.notification_id && message.delivered_count === 0;
  return (
    <li className="rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{message.subject}</p>
        <span className="text-xs text-muted-foreground">{formatWhen(message.sent_at)}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{message.body}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {failed ? (
          <span className="text-destructive">
            This send did not complete — nothing was delivered. Send it again.
          </span>
        ) : (
          <>
            Delivered to {message.delivered_count} of {message.recipient_count} registrants with an
            account
            {message.audience_total > message.recipient_count
              ? ` (${message.audience_total - message.recipient_count} more registered without one)`
              : ''}
            .
          </>
        )}
      </p>
    </li>
  );
}

export function MessagesBoard({
  eventId,
  canManage,
}: {
  eventId: string;
  canManage: boolean;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [token, setToken] = useState(() => mintToken());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{ delivered: number; repeated: boolean } | null>(null);

  // The host page's own notion of "can manage" short-circuits the request, but
  // it is NOT the authority: the route re-checks fn_can_manage_event_messages
  // and the branch below renders its denial too.
  const panel = useEventMessagePanel(eventId, canManage);
  const send = useSendRegistrantMessage(eventId);

  const deniedByServer =
    panel.error instanceof EventMessageError &&
    (panel.error.code === 'NO_ACCESS' || panel.error.status === 403);

  const audience = panel.data?.audience;
  const recipients = audience?.recipient_count ?? 0;

  const canSubmit = useMemo(
    () => subject.trim().length > 0 && body.trim().length > 0 && recipients > 0,
    [subject, body, recipients]
  );

  if (!canManage || deniedByServer) return <DeniedCard />;

  if (panel.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading the message panel…
      </div>
    );
  }

  if (panel.isError) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex items-start gap-3 py-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="text-sm font-medium">The message panel could not load</p>
            <p className="text-sm text-muted-foreground">
              {panel.error instanceof Error
                ? panel.error.message
                : 'Something went wrong. Please try again.'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const doSend = async () => {
    setFormError(null);
    try {
      const outcome = await send.mutateAsync({ subject: subject.trim(), body: body.trim(), clientToken: token });
      setConfirmOpen(false);
      setResult({
        delivered: outcome.message.delivered_count,
        repeated: outcome.deduplicated,
      });
      setSubject('');
      setBody('');
      // A fresh token: the next message is a new message, never a repeat of
      // the one just sent.
      setToken(mintToken());
    } catch (error) {
      setConfirmOpen(false);
      // The token is re-minted on failure too, so a retry of a send that may
      // have half-happened is judged on its own — the fanout's idempotency key
      // is what stops a genuine duplicate.
      setToken(mintToken());
      setFormError(
        error instanceof Error ? error.message : 'Could not send the message. Please try again.'
      );
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Blast radius, stated before anything else ─────────────────── */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              <span className="text-lg font-semibold">{recipients}</span>{' '}
              {recipients === 1 ? 'registrant' : 'registrants'} will receive this
            </span>
          </div>
          {audience && audience.unreachable > 0 ? (
            <span className="text-xs text-muted-foreground">
              {audience.unreachable} more registered without a MyJKKN account and will not see an
              in-app message. Reach them by phone.
            </span>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Compose ───────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="event-message-subject">Subject</Label>
          <Input
            id="event-message-subject"
            value={subject}
            maxLength={SUBJECT_MAX}
            placeholder="Venue changed to the main auditorium"
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-message-body">Message</Label>
          <Textarea
            id="event-message-body"
            value={body}
            maxLength={BODY_MAX}
            rows={5}
            placeholder="Tell registrants what changed and what they should do."
            onChange={(e) => setBody(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {body.length}/{BODY_MAX} characters. This goes to every registrant listed above as an
            in-app notification.
          </p>
        </div>

        {formError ? (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {formError}
          </p>
        ) : null}

        {result ? (
          <p className="flex items-start gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {result.repeated
              ? 'That message had already been sent — nothing was sent a second time.'
              : `Sent to ${result.delivered} ${result.delivered === 1 ? 'registrant' : 'registrants'}.`}
          </p>
        ) : null}

        {recipients === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody registered for this event has a MyJKKN account yet, so there is no one to message
            in the app.
          </p>
        ) : null}

        <Button
          type="button"
          disabled={!canSubmit || send.isPending}
          onClick={() => {
            setResult(null);
            setFormError(null);
            setConfirmOpen(true);
          }}
        >
          <Megaphone className="mr-2 h-4 w-4" />
          Review and send
        </Button>
      </div>

      {/* ── Already sent ──────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Already sent</h4>
        {panel.data?.messages.length ? (
          <ul className="space-y-2">
            {panel.data.messages.map((m) => (
              <SentMessageRow key={m.id} message={m} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing has been sent to this event&apos;s registrants yet.
          </p>
        )}
      </div>

      {/* ── Explicit confirmation ─────────────────────────────────────── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Send to {recipients} {recipients === 1 ? 'registrant' : 'registrants'}?
            </DialogTitle>
            <DialogDescription>
              This sends a notification to every registrant listed. It cannot be unsent.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-medium">{subject.trim()}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{body.trim()}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={send.isPending}>
              Cancel
            </Button>
            <Button onClick={doSend} disabled={send.isPending}>
              {send.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send to {recipients} {recipients === 1 ? 'registrant' : 'registrants'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
