export const dynamic = 'force-dynamic';

// ============================================================================
// /api/events/[eventId]/messages — the organiser's message to an event's
// registrants. The entry point the Events module never had.
//
//   GET  → who would receive a message right now, plus what has already been
//          sent (so the organiser can see they already said it).
//   POST { subject, body, client_token } → send it, once.
//   POST { …, resend_of } → send the SAME words again, on purpose. The only
//          path by which an event's registrants can be told the same thing
//          twice, and it exists because "your send may have half-failed and you
//          cannot retry" is the worse failure. See the resend guard in POST.
//
// ---------------------------------------------------------------------------
// Why this route exists next to app/api/events/notify
// ---------------------------------------------------------------------------
// That route is the SERVER-TO-SERVER door: it authenticates with
// `x-api-key: EVENTS_API_KEY` and sends fixed-template notifications for two
// state changes. A browser cannot hold that key, and an organiser's message is
// free text authorised by a SESSION, so the two doors cannot be one.
//
// What is NOT duplicated is delivery: both end in fanoutNotification(), so
// there is a single notification path and a single inbox (matched by
// metadata.source). See lib/services/events/organiser-message-service.ts.
//
// ---------------------------------------------------------------------------
// Failure is explicit (house rule #27)
// ---------------------------------------------------------------------------
// A denial returns { success:false, error } with a status and a sentence the
// organiser can act on. Never a redirect, never a silently empty panel.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  getAuthUser,
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import {
  MODULE,
  ContentDuplicateError,
  ResendNotRecordableError,
  countResendsFor,
  findContentDuplicate,
  getAudience,
  getSentMessageById,
  listSentMessages,
  sendRegistrantMessage,
  validateMessageInput,
  type ContentMatchRow,
} from '@/lib/services/events/organiser-message-service';
import { deliveryState } from '@/lib/services/events/organiser-message-compose';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * How many sent messages the panel shows. The duplicate guard is NOT bounded by
 * this — which is why a refusal has to hand back the matched row itself rather
 * than point at a list that may not contain it.
 */
const SENT_LOG_LIMIT = 20;

/**
 * The refusal shown when a compose repeats words already on this event.
 *
 * Branched on what the ledger can actually SUPPORT, not on the fact that a row
 * exists. A matched row sitting at notification_id NULL / delivered_count 0 was
 * never confirmed — the fanout may have thrown, or may have fully succeeded
 * with only the write-back failing afterwards — and telling its author it "has
 * already been sent" is precisely the falsehood organiser-message-compose.ts
 * documents as the thing that pushes an organiser into a duplicate blast. The
 * board was changed in this same PR to stop saying it; so does the API.
 */
function alreadySentMessage(duplicate: ContentMatchRow): string {
  if (deliveryState(duplicate) === 'unconfirmed') {
    return 'An earlier message with these exact words is already on this event, but it was never confirmed as delivered — we cannot tell you whether registrants received it. Nothing was sent just now. Check with a registrant, or use "Send it again" below: it will tell you how many people receive it, and some of them may have it twice.';
  }
  return 'This message has already been sent to this event\'s registrants. Nothing was sent again. If you meant to send it a second time, use "Send it again" below — it will tell you how many people receive it, and some of them will have it twice.';
}

/**
 * The 409 for a message whose words are already on this event.
 *
 * It carries the MATCHED ROW, not just its id, and that is the whole point.
 * The panel renders the newest 20 messages and has no pagination and no lookup
 * by id, while the guard covers every message on the event however old — so
 * telling the organiser to "use Send again on it in the list below" was, on a
 * busy event, an instruction they could not follow, and there was then no route
 * by which that text could be sent at all. With the row in the response the
 * board offers the resend against that exact message, whatever its position in
 * the history.
 *
 * `duplicate` is null only when the database's constraint fired and even the
 * exhaustive lookup could not name a row (it should not happen; the copy does
 * not promise a row in that case).
 */
async function duplicateRefusal(
  service: Parameters<typeof getSentMessageById>[0],
  eventId: string,
  duplicate: ContentMatchRow | null
): Promise<NextResponse> {
  const full = duplicate ? await getSentMessageById(service, eventId, duplicate.id) : null;
  return NextResponse.json(
    {
      success: false,
      error: duplicate
        ? alreadySentMessage(duplicate)
        : 'A message with these exact words already exists on this event, so nothing was sent just now. Find it in the sent log and use "Send again" on it if you meant to repeat it — that will tell you how many people receive it, and some of them may have it twice.',
      code: 'ALREADY_SENT',
      duplicate_of: duplicate?.id ?? null,
      // The row itself, so the board never has to find it.
      duplicate: full,
    },
    { status: 409 }
  );
}

const NO_ACCESS =
  'You do not have access to message this event\'s registrants. Only the event\'s creator, its in-charge, or an administrator can. Ask an event coordinator to add you as in-charge.';

/**
 * Establish the caller AND their authority over this event in one place.
 * Returns either a ready-made error response or the two clients the handlers
 * need. The gate is fn_can_manage_event_messages — the same four branches as
 * the feedback builder's gate, and the same RLS the message log is read under.
 */
interface Authorised {
  /** Non-null means STOP and return this. Everything else is then unset. */
  denied: NextResponse | null;
  userId: string;
  db: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  service: ReturnType<typeof createServiceRoleClient>;
  eventName: string;
}

/** A refusal, shaped so the caller can `if (auth.denied) return auth.denied`. */
function refuse(body: Record<string, unknown>, status: number): Authorised {
  return {
    denied: NextResponse.json(body, { status }),
    userId: null,
    db: null,
    service: null,
    eventName: null,
  };
}

async function authorise(eventId: string): Promise<Authorised> {
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return refuse(
      { success: false, error: 'Please sign in to message this event\'s registrants.' },
      401
    );
  }

  const db = await createServerSupabaseClient();

  const { data: allowed, error: gateError } = await (db as any).rpc(
    'fn_can_manage_event_messages',
    { p_event_id: eventId }
  );

  if (gateError) {
    logger.error(MODULE, 'fn_can_manage_event_messages failed', gateError);
    return refuse(
      {
        success: false,
        error:
          'Could not check who may message this event. If this persists, the event_registrant_messages migration may not be applied yet.',
        code: 'GATE_UNAVAILABLE',
      },
      500
    );
  }

  if (allowed !== true) {
    return refuse({ success: false, error: NO_ACCESS, code: 'NO_ACCESS' }, 403);
  }

  const service = createServiceRoleClient();

  const { data: event } = await service
    .from('events')
    .select('id, name')
    .eq('id', eventId)
    .maybeSingle();

  if (!event) {
    return refuse(
      { success: false, error: 'We can\'t find this event.', code: 'EVENT_NOT_FOUND' },
      404
    );
  }

  return {
    denied: null,
    userId: user.id,
    db,
    service,
    eventName: ((event as { name?: string | null }).name ?? '').trim(),
  };
}

// ---------------------------------------------------------------------------
// GET — audience + what was already sent
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  const { eventId } = await params;
  try {
    const auth = await authorise(eventId);
    if (auth.denied) return auth.denied;

    const audience = await getAudience(auth.service, eventId);
    const sent = await listSentMessages(auth.db, eventId, SENT_LOG_LIMIT, auth.service);
    // Counted over the WHOLE event, not over the page above. Tallying repeats
    // from the 20 rows the board renders made a message resent three times,
    // whose repeats had scrolled past, read as never repeated — a false zero in
    // the one feature whose purpose is an honest blast radius.
    const resendCounts = await countResendsFor(
      auth.service,
      eventId,
      sent.map((m) => m.id)
    );

    return NextResponse.json({
      success: true,
      resend_counts: resendCounts,
      audience: {
        // Distinct people who will actually receive it — including learners
        // registered by learner_id rather than profile_id.
        recipient_count: audience.recipientIds.length,
        // Every registration in scope, matched or not.
        audience_total: audience.audienceTotal,
        // Registrations that match no MyJKKN account we can find.
        unreachable: audience.unreachable,
        // True when the paged read hit its cap: the counts are then a floor.
        truncated: audience.truncated,
      },
      messages: sent,
    });
  } catch (error) {
    logger.error(MODULE, 'GET failed', error);
    return NextResponse.json(
      {
        success: false,
        error:
          'Could not load the message panel. If this persists, the event_registrant_messages migration may not be applied yet.',
      },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — send it
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  const { eventId } = await params;
  // Hoisted out of the try: the duplicate-race branch in the catch needs the
  // service client to read back the row the constraint collided with.
  let auth: Awaited<ReturnType<typeof authorise>> | null = null;
  try {
    auth = await authorise(eventId);
    if (auth.denied) return auth.denied;

    const raw = await request.json().catch(() => null);
    const parsed = validateMessageInput({
      subject: raw?.subject,
      body: raw?.body,
      clientToken: raw?.client_token,
      resendOf: raw?.resend_of,
    });
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.error, code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    // ── The second send is a decision, not an accident ──────────────────
    //
    // Without `resend_of` this POST claims to be a NEW message. If the same
    // words already went out on this event under a different token, it is not
    // one, and sending it would put the announcement in front of the same
    // people twice with nobody having chosen that.
    //
    // The previous behaviour was worse than a plain duplicate: whether a
    // re-typed message was swallowed or delivered depended on a token held in
    // browser memory, so the same keystrokes sent twice after a page reload and
    // sent nothing at all without one. This makes the outcome legible — the
    // organiser is told which message it matched and offered the explicit
    // "Send again" on it.
    //
    // A request that DOES carry `resend_of` skips this entirely: repeating is
    // what it is for, and it has already passed a confirmation stating the
    // recipient count and warning that some people may receive it twice.
    //
    // This read is the FIRST of two guards, and on its own it is a
    // time-of-check/time-of-use gap: it reads, then sendRegistrantMessage
    // inserts, so two concurrent composes carrying different tokens can both
    // pass here. UNIQUE (event_id, client_token) does not close that — the
    // tokens differ. The partial UNIQUE index in 20261205141500 does, and the
    // ContentDuplicateError branch in the catch below turns its 23505 into this
    // same 409. This read exists so the ordinary case gets a sentence rather
    // than a constraint violation.
    if (!parsed.value.resendOf) {
      const duplicate = await findContentDuplicate(auth.service, eventId, parsed.value);
      if (duplicate) return duplicateRefusal(auth.service, eventId, duplicate);
    } else {
      // A resend must name a message that exists ON THIS EVENT. Unchecked, the
      // id is caller-supplied and would let one event's row be recorded as a
      // repeat of another's — a false line in the only history the organiser
      // has. The FK alone does not constrain which event the target belongs to.
      const { data: original, error: originalErr } = await auth.service
        .from('event_registrant_messages')
        .select('id')
        .eq('id', parsed.value.resendOf)
        .eq('event_id', eventId)
        .maybeSingle();
      if (originalErr) throw originalErr;
      if (!original) {
        return NextResponse.json(
          {
            success: false,
            error:
              'We could not find the message you asked to send again. Reload the page and try from the list of sent messages.',
            code: 'RESEND_TARGET_NOT_FOUND',
          },
          { status: 404 }
        );
      }
    }

    // Refuse rather than record a send that reaches nobody. The panel already
    // shows the count, so this is the race guard, not the primary check.
    const audience = await getAudience(auth.service, eventId);
    if (audience.recipientIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No registration for this event could be matched to a MyJKKN account, so there is no one to message in the app.',
          code: 'NO_RECIPIENTS',
        },
        { status: 409 }
      );
    }

    const result = await sendRegistrantMessage(auth.service, {
      eventId,
      eventName: auth.eventName,
      actorId: auth.userId,
      input: parsed.value,
    });

    return NextResponse.json({
      success: true,
      deduplicated: result.deduplicated,
      message: result.message,
    });
  } catch (error) {
    // The database's duplicate guard refused the insert. NOTHING was delivered
    // here — the ledger row is claimed before the fanout runs — which the
    // generic 500 copy below would get wrong in the most dangerous direction,
    // so this answers exactly as the pre-check above would have.
    //
    // TWO WAYS TO ARRIVE HERE, and the unnamed one is why the fallback sentence
    // dates nothing. Usually a concurrent compose of the same words won the
    // race, and `duplicate` names the row that won. But the index also catches
    // what the pre-check structurally cannot: it reads only the 50 most recent
    // messages with this subject, while the constraint covers every row on the
    // event. A repeat of something far enough back is refused here with
    // `findContentDuplicate` still returning null — so the copy must not say
    // "a moment ago" about a message that may be months old.
    if (error instanceof ContentDuplicateError && auth?.service) {
      logger.warn(MODULE, 'duplicate first send refused by the database guard', {
        event_id: eventId,
        duplicate_of: error.duplicate?.id ?? null,
        matched_in_read: Boolean(error.duplicate),
      });
      return duplicateRefusal(auth.service, eventId, error.duplicate);
    }

    // A deliberate resend on a database that has no column to record it on.
    // Refused rather than sent, because a repeat filed as a first send is the
    // unlabelled duplicate this feature exists to abolish — and, again, nothing
    // was delivered.
    if (error instanceof ResendNotRecordableError) {
      logger.error(MODULE, 'resend refused: migration 20261205141500 is not applied', {
        event_id: eventId,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            'Sending a message again is not available on this site yet — a pending database update has not been applied. Nothing was sent. Ask an administrator to apply it.',
          code: 'RESEND_UNAVAILABLE',
        },
        { status: 503 }
      );
    }

    logger.error(MODULE, 'POST failed', error);
    return NextResponse.json(
      {
        success: false,
        error:
          'The send did not complete. Check the sent log below before trying again — if the message is listed there, some registrants may already have it.',
      },
      { status: 500 }
    );
  }
}
