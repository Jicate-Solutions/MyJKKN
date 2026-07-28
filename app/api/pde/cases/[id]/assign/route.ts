/**
 * Clinical-case assignment API.
 *
 * GET  /api/pde/cases/[id]/assign  → current visibility + assignments + sections
 * POST /api/pde/cases/[id]/assign  → set visibility_mode + the set of assigned
 *                                     sections (+ optional due date) and notify
 *                                     affected learners.
 *
 * Auth: requireCaseAuthor (has the clinical-cases author permission) AND the
 * case must be readable to the caller under pde_assess_read (staff/creator/admin
 * scope) — that RLS read is the per-case/institution guard. Writes then run via
 * the service-role client (a non-creator Senior Learner can assign but does not
 * hold pde_assess_write on the case).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireCaseAuthor } from '@/lib/services/pde/require-case-author';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadCaseOrDeny(caseId: string) {
  const supabase = await createClient();
  const gate = await requireCaseAuthor(supabase);
  if (!gate.ok) return { error: gate.message, status: gate.status } as const;
  // RLS scope check: the caller must be able to see this case as staff/creator/admin.
  const { data: caseRow } = await (supabase as any)
    .from('pde_assessments')
    .select('id, title, course_id, visibility_mode')
    .eq('id', caseId)
    .eq('assessment_type', 'clinical_case')
    .maybeSingle();
  if (!caseRow) return { error: 'Case not found or not yours to manage', status: 404 } as const;
  return { caseRow } as const;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Invalid case id' }, { status: 400 });

  const loaded = await loadCaseOrDeny(id);
  if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { caseRow } = loaded;

  const svc = createServiceRoleClient();
  const [{ data: assignments }, { data: sections }] = await Promise.all([
    svc.from('pde_case_assignments').select('section_id, due_at').eq('assessment_id', id),
    // Sections available to assign = only those with >=1 learner enrolled in this
    // case's course (assigning to an empty section is meaningless). Each row also
    // carries a disambiguating "Programme · Semester · Section" label, since a bare
    // "Section A" collides across years/programmes. fn_pde_assignable_sections is
    // service-role-locked (anon/authenticated revoked) — the join lives in SQL.
    svc.rpc('fn_pde_assignable_sections', { p_assessment_id: id }),
  ]);

  return NextResponse.json({
    visibility_mode: caseRow.visibility_mode ?? 'open',
    assignments: assignments ?? [],
    sections: sections ?? [],
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Invalid case id' }, { status: 400 });

  const loaded = await loadCaseOrDeny(id);
  if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { caseRow } = loaded;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const senderId = user?.id ?? null;

  let body: { visibility_mode?: unknown; section_ids?: unknown; due_at?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const visibility = body.visibility_mode === 'class_only' ? 'class_only' : 'open';
  const sectionIds = Array.isArray(body.section_ids)
    ? [...new Set((body.section_ids as unknown[]).filter((s): s is string => typeof s === 'string' && UUID.test(s)))]
    : [];
  const dueAt = typeof body.due_at === 'string' && body.due_at.trim() ? body.due_at : null;

  // A LOCKED case with no sections is hidden from EVERYONE — block it as a likely
  // mistake (user decision 2026-07-23) instead of silently taking the case offline.
  // (Open cases with no nudged sections are fine — they stay visible to all enrolled.)
  if (visibility === 'class_only' && sectionIds.length === 0) {
    return NextResponse.json(
      { error: 'Pick at least one section — a locked case with no sections would be hidden from every learner.' },
      { status: 400 },
    );
  }

  const svc = createServiceRoleClient();

  // 1. Visibility switch.
  const { error: visErr } = await svc
    .from('pde_assessments')
    .update({ visibility_mode: visibility })
    .eq('id', id);
  if (visErr) {
    return NextResponse.json({ error: `Failed to set visibility: ${visErr.message}` }, { status: 500 });
  }

  // 2. Replace the assignment set (delete-then-insert keeps it declarative).
  //    Snapshot the PREVIOUS sections first so we can tell which are newly added
  //    in this save — only those get a notification (user decision 2026-07-23), so
  //    a due-date tweak or re-save doesn't re-ping learners already assigned.
  const { data: prevRows } = await svc
    .from('pde_case_assignments')
    .select('section_id')
    .eq('assessment_id', id);
  const prevSectionIds = new Set(((prevRows as any[]) ?? []).map((r) => r.section_id));

  await svc.from('pde_case_assignments').delete().eq('assessment_id', id);
  let newSectionIds: string[] = [];
  if (sectionIds.length > 0) {
    const rows = sectionIds.map((sid) => ({
      assessment_id: id,
      section_id: sid,
      assigned_by: senderId,
      due_at: dueAt,
    }));
    const { error: insErr } = await svc.from('pde_case_assignments').insert(rows);
    if (insErr) {
      return NextResponse.json({ error: `Failed to save assignments: ${insErr.message}` }, { status: 500 });
    }
    newSectionIds = sectionIds;
  }

  // 3. Notify learners in the NEWLY-added sections only (in an assigned section
  //    AND enrolled in the course). Resolve in three steps: sections → learner
  //    profiles → enrolled users. (auth.users.id == profiles.id; profiles.learner_id
  //    → learners_profiles.id.) Re-saving the same sections notifies nobody.
  const addedSectionIds = newSectionIds.filter((sid) => !prevSectionIds.has(sid));
  let notified = 0;
  if (addedSectionIds.length > 0) {
    let recipientIds: string[] = [];
    const { data: lps } = await svc
      .from('learners_profiles')
      .select('id')
      .in('section_id', addedSectionIds);
    const learnerProfileIds = ((lps as any[]) ?? []).map((r) => r.id);
    if (learnerProfileIds.length > 0) {
      const { data: profs } = await svc
        .from('profiles')
        .select('id')
        .in('learner_id', learnerProfileIds);
      const userIds = ((profs as any[]) ?? []).map((r) => r.id);
      if (userIds.length > 0) {
        const { data: enr } = await svc
          .from('vac_enrollments')
          .select('user_id')
          .eq('course_id', caseRow.course_id)
          .in('user_id', userIds);
        recipientIds = [...new Set(((enr as any[]) ?? []).map((e) => e.user_id))];
      }
    }

    if (recipientIds.length > 0) {
      const dueText = dueAt ? ` (due ${new Date(dueAt).toLocaleDateString()})` : '';
      const { data: notif } = await svc
        .from('notifications')
        .insert({
          title: 'A clinical case was assigned to your section',
          body: `${caseRow.title}${dueText}`,
          created_by: senderId,
          category: 'pde.case.assignment',
          kind: 'work_item',
          url: `/pde/learn/cases/${id}`,
          targeting: { user_ids: recipientIds },
          metadata: { kind: 'pde_case_assignment', assessment_id: id, section_ids: addedSectionIds, due_at: dueAt },
        })
        .select('id')
        .single();
      if (notif?.id) {
        const links = recipientIds.map((uid) => ({ notification_id: (notif as any).id, user_id: uid }));
        await svc.from('user_notifications').insert(links);
        notified = recipientIds.length;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    visibility_mode: visibility,
    assigned_sections: newSectionIds.length,
    notified,
  });
}
