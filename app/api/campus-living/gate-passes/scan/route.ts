export const dynamic = 'force-dynamic';

/**
 * POST /api/campus-living/gate-passes/scan
 *
 * One scan of a learner's MyJKKN QR at the hostel gate, decided and recorded
 * in a single authenticated round trip.
 *
 * WHY THIS IS A SERVER ROUTE AND NOT A BROWSER WRITE
 * ---------------------------------------------------
 * Two halves of a scan, and only one of them can be done from a browser:
 *
 *   1. The pass update. `gate_security` holds campus_living.gate_passes.edit,
 *      which the UPDATE policy admits, so this half WOULD work client-side.
 *
 *   2. The audit-log row. hostel_access_log's INSERT policy is
 *      `.create + role_has_institution_access + role_has_block_access(block_id)`.
 *      gate_security holds NO `.create` grant, and role_has_block_access
 *      returns false for anybody without a user_block_access row — estate-wide
 *      that is 12 grants across 5 users, none of them gate staff. A
 *      browser-side log write is therefore refused 100% of the time, silently,
 *      because an RLS denial on an insert is an `{ error }` nobody at a gate
 *      will ever read.
 *
 * So the whole movement moves here: the caller's permission is checked in
 * reviewed TypeScript, and the writes go through the service role. That is the
 * playbook's own ordering — authorization in typed server code, RLS as the
 * backstop — rather than widening two grants to make a browser write legal.
 *
 * AUTO-RECORD. The guard does not tap anything. A scan that resolves to a
 * GREEN or AMBER verdict writes the movement immediately and the response says
 * what was written; the screen reports rather than asks. RED writes no
 * movement and offers no control — the hard block has no override, by
 * decision, and adding one here would be the whole point defeated.
 *
 * ALWAYS HTTP 200 ONCE AUTHORISED. A refused scan is a valid answer, not an
 * error. `recorded` is null and `verdict` says why. Only auth, a malformed
 * body and an unrecognised card get a non-200 — and even the unrecognised card
 * is a 200 with `verdict: 'unrecognised'`, because the guard needs to read it,
 * not debug it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveScannedLearner } from '@/lib/services/campus-living/gate-scan-service';
import {
  decideScan,
  formatLateness,
  type GateDecision,
  type ScannedPass,
} from '@/lib/services/campus-living/gate-scan-resolve';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';

const LOG = 'campus-living/gate-scan-route';
const EDIT_PERMISSION = 'campus_living.gate_passes.edit';

export interface GateScanResponse {
  /** 'unrecognised' when the code matched nobody; otherwise the decision. */
  verdict: 'approved' | 'returning' | 'blocked' | 'unrecognised';
  headline: string;
  detail: string;
  blockedReason: GateDecision['blockedReason'];
  learner: {
    name: string;
    photoUrl: string | null;
    passNumber: string | null;
  } | null;
  /** What was actually written to the pass. Null on RED and on unrecognised. */
  recorded: { direction: 'out' | 'in'; at: string; isLate: boolean; lateByMinutes: number } | null;
  /** Whether the movement made it into hostel_access_log. */
  logged: boolean;
  /** Whether a parent was actually told. Null when no notification applied. */
  parentNotified: boolean | null;
}

export async function POST(request: NextRequest) {
  // ── The caller must be signed in and hold the gate write permission ──
  const session = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await session.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let allowed = false;
  try {
    const { data: isSuper } = await session.rpc('is_super_admin');
    if (isSuper === true) allowed = true;
  } catch {
    // fall through to the permission check
  }
  if (!allowed) {
    try {
      const { data, error } = await session.rpc('user_has_permission', {
        permission_name: EDIT_PERMISSION,
      });
      allowed = !error && data === true;
    } catch {
      allowed = false;
    }
  }
  if (!allowed) {
    return NextResponse.json(
      { error: 'You do not have permission to record gate movements.' },
      { status: 403 },
    );
  }

  // ── Input ────────────────────────────────────────────────────────────
  let body: { code?: string; deviceId?: string; gateId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const code = (body.code ?? '').trim();
  if (!code) {
    return NextResponse.json({ error: 'A scanned code is required' }, { status: 400 });
  }

  const db = createServiceRoleClient();

  // ── Who is this? ─────────────────────────────────────────────────────
  const learner = await resolveScannedLearner(code, db as never);
  if (!learner) {
    return NextResponse.json({
      verdict: 'unrecognised',
      headline: 'CARD NOT RECOGNISED',
      detail: 'Nothing on file for this code. Send them to the office.',
      blockedReason: null,
      learner: null,
      recorded: null,
      logged: false,
      parentNotified: null,
    } satisfies GateScanResponse);
  }

  // ── What is open for them? ───────────────────────────────────────────
  // Live passes only. A request nobody has approved is not a pass, so
  // 'requested' is absent here — that is what makes an unapproved learner read
  // "GATE PASS NOT APPROVED" instead of being let out on their own paperwork.
  const { data: passRows, error: passErr } = await db
    .from('hostel_gate_passes')
    .select('id, status, destination, expected_return, out_time, pass_number, institution_id, block_id')
    .eq('learner_id', learner.profileId)
    .in('status', ['issued', 'active', 'overdue'])
    .order('expected_return', { ascending: true });

  if (passErr) {
    // A read failure must not be reported as "no pass" — that is a refusal the
    // guard would act on, generated by an outage rather than by a decision.
    logger.error(LOG, 'Could not read passes for scan', { message: passErr.message });
    return NextResponse.json(
      { error: 'Could not check this learner’s passes. Try the scan again.' },
      { status: 503 },
    );
  }

  const passes = (passRows ?? []) as unknown as (ScannedPass & {
    institution_id: string;
    block_id: string | null;
  })[];

  const now = new Date();
  const decision = decideScan(learner.subject, passes, now);

  // ── Write the movement ───────────────────────────────────────────────
  let recorded: GateScanResponse['recorded'] = null;
  let effectiveDetail = decision.detail;

  if (decision.pass && decision.action) {
    const at = now.toISOString();
    const patch =
      decision.action === 'out'
        ? { out_time: at, gate_security_out: user.id, status: 'active' as const }
        : { actual_return: at, gate_security_in: user.id, status: 'returned' as const };

    // Scoped to the status the decision was made on. Two guards scanning the
    // same learner within the same second must not both write a movement —
    // the second one's update matches zero rows and is reported honestly.
    const guardStatuses =
      decision.action === 'out' ? ['issued'] : ['active', 'overdue'];

    const { data: written, error: writeErr } = await db
      .from('hostel_gate_passes')
      .update(patch)
      .eq('id', decision.pass.id)
      .in('status', guardStatuses)
      .select('id')
      .maybeSingle();

    if (writeErr) {
      logger.error(LOG, 'Gate movement write failed', {
        passId: decision.pass.id,
        message: writeErr.message,
      });
      return NextResponse.json(
        { error: `The movement could not be recorded: ${getErrorMessage(writeErr)}` },
        { status: 500 },
      );
    }

    if (!written) {
      // Somebody else got there first. Say so plainly — a guard who sees
      // "recorded" for a write that did not happen will wave the next person
      // through on a pass that is not in the state they think it is.
      effectiveDetail =
        'This movement was already recorded, probably at another gate. Nothing was written twice.';
    } else {
      recorded = {
        direction: decision.action,
        at,
        isLate: decision.isLate,
        lateByMinutes: decision.lateByMinutes,
      };
      effectiveDetail =
        decision.action === 'out'
          ? `Marked OUT at ${clock(at)} · ${decision.pass.destination}`
          : decision.isLate
            ? `Marked IN at ${clock(at)} · ${formatLateness(decision.lateByMinutes)}`
            : `Marked IN at ${clock(at)} · on time`;
    }
  }

  // ── Log it. Every scan, allowed or refused. ──────────────────────────
  // This is the half a browser cannot do, and the reason the whole movement
  // lives in this route. A refused scan is exactly the one worth keeping: it
  // is the record that somebody was turned away and when.
  // The learner record is the primary source. A learner whose learners_profiles
  // row could not be read still has an institution if any of their passes did
  // — `decision.pass` is the narrow ScannedPass shape, so the value is looked
  // up on the row it came from rather than cast onto it.
  const passInstitutionId =
    passes.find((p) => p.id === decision.pass?.id)?.institution_id ?? null;

  const logged = await writeAccessLog(db, {
    institutionId: learner.institutionId ?? passInstitutionId,
    blockId: learner.blockId ?? null,
    personId: learner.profileId,
    personName: learner.fullName,
    // access_log_direction_enum is entry|exit only, and a REFUSED scan has no
    // action to derive one from. It logs as 'exit' — the dominant refusal is
    // somebody trying to leave without an approved pass — and the real verdict
    // rides in `metadata`, so nothing is lost to that choice.
    direction: decision.action === 'in' ? 'entry' : 'exit',
    flagged: decision.verdict === 'blocked',
    flagReason: decision.verdict === 'blocked' ? decision.blockedReason : null,
    gateId: body.gateId ?? null,
    deviceId: body.deviceId ?? null,
    recorded: Boolean(recorded),
    verdict: decision.verdict,
  });

  // ── Tell the parent ──────────────────────────────────────────────────
  // Only for movements that actually happened. Server-to-server so a parent
  // who cannot be reached never delays a gate that has already opened.
  let parentNotified: boolean | null = null;
  if (recorded && decision.pass && (recorded.direction === 'out' || recorded.isLate)) {
    parentNotified = await notifyParent(
      request,
      decision.pass.id,
      recorded.direction === 'out' ? 'out' : 'late_return',
    );
  }

  return NextResponse.json({
    verdict: decision.verdict,
    headline: decision.headline,
    detail: effectiveDetail,
    blockedReason: decision.blockedReason,
    learner: {
      name: learner.fullName,
      photoUrl: learner.photoUrl,
      passNumber: decision.pass?.pass_number ?? null,
    },
    recorded,
    logged,
    parentNotified,
  } satisfies GateScanResponse);
}

/** 8:04 PM — the form a guard compares against a wall clock. */
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * One row in hostel_access_log. Returns whether it landed.
 *
 * NEVER THROWS. The gate movement is already written by the time this runs,
 * and a failed log must not turn a successful scan into an error the guard
 * reads as "it didn't work". The caller reports `logged: false` instead, which
 * is the honest answer rather than a silent one.
 *
 * `block_id` is NOT NULL on this table. A learner with no active allocation
 * therefore cannot be logged at all — which is fine, because that learner is
 * refused at the gate anyway (`not_a_resident`). The one case that reaches
 * here with a null block is an allocation read that FAILED, and skipping the
 * log is better than inventing a block.
 */
async function writeAccessLog(
  db: ReturnType<typeof createServiceRoleClient>,
  entry: {
    institutionId: string | null;
    blockId: string | null;
    personId: string;
    personName: string;
    direction: 'entry' | 'exit';
    flagged: boolean;
    flagReason: string | null;
    gateId: string | null;
    deviceId: string | null;
    recorded: boolean;
    verdict: string;
  },
): Promise<boolean> {
  if (!entry.institutionId || !entry.blockId) {
    logger.warn(LOG, 'Scan not logged — no institution or block to attribute it to', {
      personId: entry.personId,
      institutionId: entry.institutionId,
      blockId: entry.blockId,
    });
    return false;
  }

  const { error } = await db.from('hostel_access_log').insert({
    institution_id: entry.institutionId,
    block_id: entry.blockId,
    person_type: 'student',
    person_id: entry.personId,
    person_name: entry.personName,
    direction: entry.direction,
    method: 'qr_scan',
    is_flagged: entry.flagged,
    flag_reason: entry.flagReason,
    gate_id: entry.gateId,
    device_id: entry.deviceId,
    // The verdict and whether a movement was written, so the log can be read
    // back later without re-deriving either from timestamps.
    metadata: { verdict: entry.verdict, movement_recorded: entry.recorded },
  } as never);

  if (error) {
    logger.error(LOG, 'Access log write failed', { message: error.message });
    return false;
  }
  return true;
}

/**
 * Ask the existing notify-parent route to tell the parent, forwarding the
 * caller's cookies so it authorises as the same guard.
 *
 * Returns whether a parent was actually reached — that route answers
 * `{ ok, delivered, reason, message }` and `ok` is true only when somebody was
 * really told, so "nobody is linked to this learner" comes back false rather
 * than as a false success.
 */
async function notifyParent(
  request: NextRequest,
  passId: string,
  event: 'out' | 'late_return',
): Promise<boolean> {
  try {
    const res = await fetch(new URL('/api/campus-living/gate-passes/notify-parent', request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify({ passId, event }),
    });
    if (!res.ok) return false;
    const payload = (await res.json()) as { ok?: boolean };
    return payload.ok === true;
  } catch (err) {
    logger.warn(LOG, 'Parent notification could not be attempted', {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
