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
//      registrants who match no account and will therefore hear nothing.
//   2. Sending takes a second, explicit confirmation that repeats the count.
//   3. Everything already sent is listed, with who sent it and how far it
//      reached — so the organiser can see they have already said this.
//
// ---------------------------------------------------------------------------
// WHO DECIDES ACCESS — the server, and only the server
// ---------------------------------------------------------------------------
// This board does NOT gate on the host page's `canManage` prop, and that is
// deliberate rather than lax. On /events/[id] — every non-tournament event —
// `canManage` is canEditEvent(), which mirrors events_auth_update: super admin,
// the creator, or the grandfather clause for creator-less rows. It recognises
// NEITHER the event's appointed in-charge (events.config->incharges) NOR an
// ordinary admin. Both of those ARE allowed by fn_can_manage_event_messages,
// which is the authority the route actually enforces. Gating the board on
// `canManage` therefore handed a "you do not have access" card to two of the
// four roles this feature exists for, on almost every event in the system,
// without ever asking the server.
//
// So: the panel request always goes out, and the denial card renders only when
// the SERVER refuses. Exactly the reasoning the post-event feedback card on the
// same page already carries. Denial stays explicit, never a redirect and never
// an empty panel (house rule #27).

import { useMemo, useRef, useState } from 'react';
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
import {
  composeKey,
  mintComposeToken,
  tokenForCompose,
  type ComposeToken,
} from '@/lib/services/events/organiser-message-compose';

const SUBJECT_MAX = 120;
const BODY_MAX = 2000;

const NO_ACCESS_TITLE = 'You do not have access to this';
const NO_ACCESS_BODY =
  'Messaging an event\'s registrants is limited to the event\'s creator, the person named as its in-charge, and administrators. Ask an event coordinator to add you as in-charge if you need to send updates.';

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
  // The unreachable number is STORED, never derived: audience_total counts
  // registrations and recipient_count counts people, so one learner registered
  // twice would otherwise be reported as someone who heard nothing.
  const unreachable = message.unreachable_count ?? 0;
  return (
    <li className="rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{message.subject}</p>
        <span className="text-xs text-muted-foreground">{formatWhen(message.sent_at)}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{message.body}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {/* "Who sent it" — promised in this board's header and in the PR, so it
            is shown. sent_by_name is resolved server-side; an unresolvable
            sender says so rather than silently collapsing to nothing. */}
        Sent by {message.sent_by_name ?? (message.sent_by ? 'a former account' : 'an unknown sender')}.{' '}
        {failed ? (
          <span className="text-destructive">
            This send did not complete — nothing was delivered. Send it again.
          </span>
        ) : (
          <>
            Delivered to {message.delivered_count} of {message.recipient_count}{' '}
            {message.recipient_count === 1 ? 'registrant' : 'registrants'} we could reach
            {unreachable > 0
              ? ` (${unreachable} more could not be matched to a MyJKKN account)`
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
  canManage: _canManage,
}: {
  eventId: string;
  /**
   * Accepted so this board drops into the shared tab registry like every other
   * one — and deliberately UNUSED as an authority. See the file header: on
   * /events/[id] this prop is canEditEvent(), which does not recognise the
   * event's in-charge or an ordinary admin, both of whom
   * fn_can_manage_event_messages allows. Gating on it locked out the people the
   * feature is for. The server decides; this board renders the server's answer.
   */
  canManage?: boolean;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{ delivered: number; repeated: boolean } | null>(null);

  // The idempotency token is bound to the CONTENT being sent and held in a ref,
  // not in state, so a retry reads the same token synchronously rather than
  // whatever a pending re-render has settled on. See
  // lib/services/events/organiser-message-compose.ts for why a failed send must
  // NOT re-mint it.
  const composeToken = useRef<ComposeToken | null>(null);
  const tokenFor = (subjectText: string, bodyText: string): string => {
    const next = tokenForCompose(
      composeToken.current,
      composeKey(subjectText, bodyText),
      mintComposeToken
    );
    composeToken.current = next;
    return next.token;
  };

  // ALWAYS asks. The host page's `canManage` is not consulted — it is wrong for
  // the in-charge and for an ordinary admin on every non-tournament event.
  const panel = useEventMessagePanel(eventId);
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

  if (deniedByServer) return <DeniedCard />;

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
    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();
    try {
      const outcome = await send.mutateAsync({
        subject: trimmedSubject,
        body: trimmedBody,
        clientToken: tokenFor(trimmedSubject, trimmedBody),
      });
      setConfirmOpen(false);
      setResult({
        delivered: outcome.message.delivered_count,
        repeated: outcome.deduplicated,
      });
      setSubject('');
      setBody('');
      // Only a CONFIRMED send clears the binding: the next message is a new
      // message, never a repeat of the one just sent.
      composeToken.current = null;
    } catch (error) {
      setConfirmOpen(false);
      // The token is deliberately KEPT. This is the path a human repeats — an
      // error they may well have been shown after the send already committed —
      // and re-minting here would let the retry claim a fresh ledger row, a
      // fresh fanout key, and deliver the same announcement twice.
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
          {/* NOT "registered without a MyJKKN account". A registration is
              matched to a person by profile_id OR by learner_id resolved
              through profiles.learner_id; what is left is a registration we
              could not match to an account, which is not the same claim as the
              person not having one. Saying the stronger thing tells an
              organiser a learner has no account when the registration desk
              simply filed them by phone. */}
          {audience && audience.unreachable > 0 ? (
            <span className="text-xs text-muted-foreground">
              {audience.unreachable}{' '}
              {audience.unreachable === 1 ? 'registration' : 'registrations'} could not be matched to
              a MyJKKN account, so those people will not see an in-app message. Reach them by phone.
            </span>
          ) : null}
          {audience?.truncated ? (
            <span className="flex items-center gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              This event has more registrations than the panel reads in one go — the number above is
              a minimum, and the message will reach at least that many.
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
            No registration for this event could be matched to a MyJKKN account, so there is no one
            to message in the app.
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
