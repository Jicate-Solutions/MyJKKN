export const dynamic = 'force-dynamic';

// ============================================================================
// /api/events/[eventId]/messages — the organiser's message to an event's
// registrants. The entry point the Events module never had.
//
//   GET  → who would receive a message right now, plus what has already been
//          sent (so the organiser can see they already said it).
//   POST { subject, body, client_token } → send it, once.
//
// ---------------------------------------------------------------------------
// Why this route exists next to app/api/events/notify
// ---------------------------------------------------------------------------
// That route is the SERVER-TO-SERVER door: it authenticates with
// `x-api-key: EVENTS_API_KEY` and sends fixed-template notifications for two
// state changes. A browser cannot hold that key, and an organiser's message is
// free text authorised by a SESSION, so the two doors cannot be one.
//
// What is NOT duplicated is delivery: both end in fanoutNotification() with the
// same `type: 'events'` envelope, so there is a single notification path and a
// single inbox. See lib/services/events/organiser-message-service.ts.
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
  getAudience,
  listSentMessages,
  sendRegistrantMessage,
  validateMessageInput,
} from '@/lib/services/events/organiser-message-service';
import { logger } from '@/lib/utils/enhanced-logger';

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
    const sent = await listSentMessages(auth.db, eventId);

    return NextResponse.json({
      success: true,
      audience: {
        // Distinct people who will actually receive it.
        recipient_count: audience.recipientIds.length,
        // Everyone registered, including those with no account to receive it.
        audience_total: audience.audienceTotal,
        unreachable: audience.unreachable,
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
  try {
    const auth = await authorise(eventId);
    if (auth.denied) return auth.denied;

    const raw = await request.json().catch(() => null);
    const parsed = validateMessageInput({
      subject: raw?.subject,
      body: raw?.body,
      clientToken: raw?.client_token,
    });
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.error, code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    // Refuse rather than record a send that reaches nobody. The panel already
    // shows the count, so this is the race guard, not the primary check.
    const audience = await getAudience(auth.service, eventId);
    if (audience.recipientIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Nobody registered for this event has a MyJKKN account yet, so there is no one to message in the app.',
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
