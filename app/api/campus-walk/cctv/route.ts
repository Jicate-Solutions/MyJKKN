// app/api/campus-walk/cctv/route.ts
// ============================================================================
// Campus Walk — the CCTV front door (Director decisions, 9 Oct 2026).
//
//   GET   the rooms and departments the operator picks from
//   POST  file one CCTV report -> a Campus Walk job routed to the room's HOD
//         (or the CAO, or the Controller of Examinations) — see
//         lib/campus-walk/cctv.ts for every rule.
//
// Same gate as the walk screen: the Campus Walk reporters list
// (lib/campus-walk/reporters.ts). The CCTV operator is added to that list by
// the Director, not by code. The writes use the service client only AFTER the
// gate, for the same reason app/api/campus-walk/observations does: routing
// reads profiles, staff and departments a reporter may not see.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isCampusWalkReporter } from '@/lib/campus-walk/reporters';
import { fileCctvReport, isCctvCategory, namesAllowedFor } from '@/lib/campus-walk/cctv';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function gate() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { user: null, denied: fail('You are signed out. Sign in and try again.', 401) };
  if (!(await isCampusWalkReporter(user.email))) {
    return {
      user: null,
      denied: fail(
        "You don't have access to file Campus Walk reports. Contact the Director's office to be added.",
        403
      )
    };
  }
  return { user, denied: null };
}

export async function GET() {
  const { denied } = await gate();
  if (denied) return denied;
  const admin = createServiceRoleClient();

  const [{ data: rooms, error: roomErr }, { data: depts, error: deptErr }] = await Promise.all([
    admin
      .from('resources')
      .select('id, name, room_number, department_id')
      .order('name', { ascending: true })
      .limit(2000),
    admin
      .from('departments')
      .select('id, department_name, display_name, institution_id')
      .eq('is_active', true)
      .order('department_name', { ascending: true })
  ]);
  if (roomErr || deptErr) return fail('The room list could not be loaded. Please try again.', 500);

  const deptName = new Map(
    ((depts ?? []) as any[]).map((d) => [d.id, d.display_name || d.department_name])
  );
  return NextResponse.json({
    ok: true,
    rooms: ((rooms ?? []) as any[]).map((r) => ({
      id: r.id,
      label: `${r.name}${r.room_number ? ` (${r.room_number})` : ''}`,
      department: r.department_id ? deptName.get(r.department_id) ?? null : null
    })),
    departments: ((depts ?? []) as any[]).map((d) => ({
      id: d.id,
      label: d.display_name || d.department_name
    }))
  });
}

export async function POST(request: NextRequest) {
  const { user, denied } = await gate();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('Expected a JSON body.', 400);
  }

  const category = body.category;
  if (!isCctvCategory(category)) return fail('Pick what was seen.', 400);

  const observedAt = typeof body.observed_at === 'string' ? new Date(body.observed_at) : null;
  if (!observedAt || Number.isNaN(observedAt.getTime())) return fail('Enter the time it was seen.', 400);
  if (observedAt.getTime() > Date.now() + 10 * 60_000) return fail('The time seen cannot be in the future.', 400);

  const resourceId = typeof body.resource_id === 'string' && UUID_RE.test(body.resource_id) ? body.resource_id : null;
  const departmentId =
    typeof body.department_id === 'string' && UUID_RE.test(body.department_id) ? body.department_id : null;
  const roomLabel = typeof body.room_label === 'string' ? body.room_label.trim().slice(0, 120) : '';
  if (!resourceId && !roomLabel) return fail('Pick the room, or type its name.', 400);

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  const isExam = category === 'exam_copying';
  // Decision 5 + 9 Oct edge cases: a seat only for exam copying, a name only
  // for exam copying and team-member conduct. Anything else is not accepted.
  const seat = isExam && typeof body.seat === 'string' ? body.seat.trim().slice(0, 60) : null;
  const names =
    namesAllowedFor(category) && typeof body.names === 'string' ? body.names.trim().slice(0, 300) : null;
  const involvesHod = body.involves_hod === true && category !== 'exam_copying';
  if (isExam && !seat) return fail('For exam copying, enter the seat number.', 400);

  const admin = createServiceRoleClient();
  const result = await fileCctvReport(admin, {
    category,
    observedAt: observedAt.toISOString(),
    resourceId,
    roomLabel,
    departmentId,
    note,
    seat,
    names,
    involvesHod,
    raisedByProfileId: user!.id
  });
  if (result.ok === false) return fail(result.error, 500);

  // A name to show the operator: whoever ended up accountable (after any
  // leave reassignment inside createWalkTask).
  let ownerName: string | null = null;
  if (result.task.accountableProfileId) {
    const { data: p } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', result.task.accountableProfileId)
      .maybeSingle();
    ownerName = (p as any)?.full_name ?? null;
  }

  return NextResponse.json({
    ok: true,
    task_id: result.task.taskId,
    due_date: result.task.dueDate ?? null,
    owner_source: result.routing.ownerSource,
    owner_name: ownerName,
    room: result.room.label,
    repeat_count: result.repeatCount
  });
}
