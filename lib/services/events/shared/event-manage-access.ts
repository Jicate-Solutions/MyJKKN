// lib/services/events/shared/event-manage-access.ts
// Server-side write gates for the event-agnostic ops routes that run on the
// service-role client (committees API, QR pass generation). Those routes used to
// check nothing — or, in the committees handler, a check that could never fail
// — so any logged-in user, students included, could write any event's rows.
//
// canManageEventOps — the UNION of every console that shows the committees
// board (or QR board) with canManage=true today, so nobody who can manage from
// the UI is locked out:
//
//   super admin (profiles.is_super_admin, or role 'super_admin')    all consoles
//   role admin / administrator / event_coordinator    useMarathonAccess; the same
//                                                     roles fn_can_manage_committee_tasks
//                                                     admits on every event type
//   event in-charge (fn_is_event_incharge)            useTournamentAccess; the
//                                                     committee-task RLS
//   creator, or (staff only) a creator-less event     canEditEvent (/events/[id]),
//   in your own institution                           = events_auth_update, minus
//                                                     its learner hole (see below)
//   sports.tournaments.manage — sports_tournament     useTournamentAccess
//   events.marathon.view      — marathon only         useMarathonAccess ('full')
//
// canGenerateEventQr adds, for MARATHON events only, whoever may open the
// marathon ops QR page (useMarathonAccess.canAccessOps OR a committee member of
// the event — see app/(routes)/events/marathon/[id]/ops/qr-codes/page.tsx),
// because that page offers "Generate New" to all of them.
//
// events.view is NEVER write authority here: students hold it.
//
// RPCs run on the caller's SESSION client so auth.uid() resolves inside them.
// The caller's profile and the event's ownership columns are read with the
// service-role client (the user id comes from a verified getUser()) so an RLS
// blind spot on events cannot silently turn a legitimate owner into a 403.

type SessionClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown }>;
};

// Structural — the service-role client's generated types are incomplete.
type ReaderClient = { from: (table: string) => any };

export interface EventOpsCaller {
  /** Caller's session client (createServerSupabaseClient / createClient). */
  auth: SessionClient;
  /** Service-role client, used only to READ the caller's profile and the event. */
  svc: ReaderClient;
  /** Verified auth uid (from getAuthUser / auth.getUser). */
  userId: string;
}

const ADMIN_ROLES = ['super_admin', 'admin', 'administrator', 'event_coordinator'];
/** useMarathonAccess INSTITUTION_ROLES — ops access regardless of institution. */
const MARATHON_OPS_ROLES = ['principal', 'hod', 'faculty', 'vice_principal', 'dean'];
/** Never manage-tier by institution alone. */
const LEARNER_ROLES = ['student', 'course_participant', 'parent'];

interface Ctx {
  caller: EventOpsCaller;
  eventId: string;
  profile: { role: string | null; is_super_admin: boolean | null; institution_id: string | null } | null;
  event: { event_type: string | null; created_by: string | null; institution_id: string | null };
}

async function rpcTrue(auth: SessionClient, fn: string, args: Record<string, unknown>) {
  const { data } = await auth.rpc(fn, args);
  return data === true;
}

async function loadCtx(caller: EventOpsCaller, eventId: string): Promise<Ctx | null> {
  const [{ data: profile }, { data: event }] = await Promise.all([
    caller.svc
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', caller.userId)
      .maybeSingle(),
    caller.svc
      .from('events')
      .select('event_type, created_by, institution_id')
      .eq('id', eventId)
      .maybeSingle(),
  ]);
  if (!event) return null;
  return { caller, eventId, profile: profile ?? null, event };
}

async function evalManage(ctx: Ctx): Promise<boolean> {
  const { caller, eventId, profile, event } = ctx;
  const role = profile?.role ?? '';

  if (profile?.is_super_admin === true || ADMIN_ROLES.includes(role)) return true;

  // canEditEvent / events_auth_update — EXCEPT that a creator-less event is not
  // handed to learners. events_auth_update treats created_by IS NULL as owned by
  // anyone in the institution, and 36 of 51 events have no creator; copying that
  // verbatim would give every student in the college committee writes here.
  if (event.created_by) {
    if (event.created_by === caller.userId) return true;
  } else if (
    !LEARNER_ROLES.includes(role) &&
    profile?.institution_id &&
    event.institution_id === profile.institution_id
  ) {
    return true;
  }

  if (await rpcTrue(caller.auth, 'fn_is_event_incharge', { p_event_id: eventId })) return true;

  if (event.event_type === 'sports_tournament') {
    return rpcTrue(caller.auth, 'user_has_permission', {
      permission_name: 'sports.tournaments.manage',
    });
  }
  if (event.event_type === 'marathon') {
    return rpcTrue(caller.auth, 'user_has_permission', { permission_name: 'events.marathon.view' });
  }
  return false;
}

/** May the caller create/edit this event's committees (and other manage-tier ops)? */
export async function canManageEventOps(caller: EventOpsCaller, eventId: string): Promise<boolean> {
  const ctx = await loadCtx(caller, eventId);
  return ctx ? evalManage(ctx) : false;
}

/**
 * May the caller generate this event's QR passes? canManageEventOps, plus — on
 * marathon events only — everyone the marathon ops QR page admits.
 */
export async function canGenerateEventQr(caller: EventOpsCaller, eventId: string): Promise<boolean> {
  const ctx = await loadCtx(caller, eventId);
  if (!ctx) return false;
  if (await evalManage(ctx)) return true;
  if (ctx.event.event_type !== 'marathon') return false;

  // useMarathonAccess.canAccessOps (the manage-tier branches are covered above).
  const { auth } = ctx.caller;
  const role = ctx.profile?.role ?? '';
  if (MARATHON_OPS_ROLES.includes(role)) return true;
  if (
    await rpcTrue(auth, 'user_has_permission', {
      permission_name: 'events.marathon.committees.manage',
    })
  ) {
    return true;
  }
  // Unknown / custom roles with an institution get ops; learners do not.
  if (role && !LEARNER_ROLES.includes(role) && ctx.profile?.institution_id) return true;

  // ...OR useCommitteeMembership(eventId).isMember.
  return rpcTrue(auth, 'fn_is_event_committee_member', { p_event_id: ctx.eventId });
}
