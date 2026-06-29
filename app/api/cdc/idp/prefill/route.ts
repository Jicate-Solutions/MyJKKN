// app/api/cdc/idp/prefill/route.ts — IDP create-time prefill (BUG-004197).
// GET ?learner_id=<id> → a draft assembled from the learner's existing data so a
// new IDP starts pre-filled (interests, skills, prior academic-strengths text,
// active club memberships) instead of blank. READ-ONLY assembly; nothing is saved.
//
// Reads use the SERVICE-ROLE client + re-impose the SAME institution filter as the
// learner picker (CDC staff hold cdc.* but not learners.* — the BUG-004044 class).
// A coordinator can never prefill a learner outside their scope.
//
// Decision D1 (Director 2026-06-22): carry forward the learner's SELF-REPORTED
// prior academic_strengths text. OBE marks are empty in prod; the plan
// auto-enriches later once they exist — do not block on them.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery,
} from '@/lib/auth/api-institution-filter';
import type { PrefilledIdpDraft } from '@/types/cdc/idp';

// JSONB "array of strings OR array of {skill,level}" → string[] of names.
// Handles the JSONB array-or-object gotcha for both the native form (strings)
// and migrated Google-form rows (objects).
function toStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((el) => {
      if (typeof el === 'string') return el.trim();
      if (el && typeof el === 'object') {
        const o = el as Record<string, unknown>;
        const s = o.skill ?? o.name ?? o.value ?? o.label;
        return typeof s === 'string' ? s.trim() : '';
      }
      return '';
    })
    .filter((s): s is string => !!s);
}

// Pull a display name out of a PostgREST embedded resource. To-one embeds normally
// come back as an object, but the codebase's array-or-object gotcha means we
// defensively unwrap a one-element array too (BUG-004264).
function embeddedName(v: unknown, key: string): string | null {
  const o = Array.isArray(v) ? v[0] : v;
  if (o && typeof o === 'object') {
    const name = (o as Record<string, unknown>)[key];
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const learnerId = req.nextUrl.searchParams.get('learner_id');
    if (!learnerId) return NextResponse.json({ error: 'learner_id is required' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: canCreate } = await supabase.rpc('user_has_permission', { permission_name: 'cdc.idp.create' });
    if (canCreate !== true) return NextResponse.json({ error: 'Forbidden — cdc.idp.create required' }, { status: 403 });

    const filter = await createApiInstitutionFilter(req);
    if (!filter.isAllowed) {
      return NextResponse.json({ error: filter.reason ?? 'Not authorized' },
        { status: filter.reason === 'User not authenticated' ? 401 : 403 });
    }

    const svc = createServiceRoleClient();

    // Profile — scope-checked exactly like the picker (no cross-tenant prefill).
    let pq: any = svc
      .from('learners_profiles')
      .select(
        `id, first_name, last_name, register_number, institution_id,
         student_email, college_email, student_mobile, father_mobile,
         program:programs!fk_learners_profiles_program(program_name),
         department:departments!fk_learners_profiles_department(department_name),
         semester:semesters!fk_learners_profiles_semester(semester_name)`
      )
      .eq('id', learnerId);
    pq = applyInstitutionFilterToQuery(pq, filter, 'institution_id');
    const { data: profile, error: profErr } = await pq.maybeSingle();
    if (profErr) {
      console.error('[cdc/idp/prefill] profile load failed:', profErr);
      return NextResponse.json({ error: 'Could not load learner (you may not have access).' }, { status: 403 });
    }
    if (!profile) return NextResponse.json({ error: 'Learner not found' }, { status: 404 });

    // Prior IDP (most recent) — carry forward as editable defaults.
    const { data: prior } = await svc
      .from('cdc_idp_responses')
      .select('interests, skills_self_attribution, academic_strengths, academic_year_label, submitted_at')
      .eq('learner_id', learnerId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Active club memberships → suggested club picks.
    const { data: clubRows } = await svc
      .from('cdc_club_memberships')
      .select('club:cdc_clubs(name)')
      .eq('learner_id', learnerId)
      .eq('is_active', true);

    const clubPicks = (clubRows ?? [])
      .map((r: any) => r?.club?.name)
      .filter((n: unknown): n is string => typeof n === 'string' && !!n.trim());

    const p = profile as Record<string, unknown>;
    const draft: PrefilledIdpDraft = {
      learner: {
        id: p.id as string,
        name: [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'the learner',
        register_number: (p.register_number as string | null) ?? null,
        // Contact + academic enrichment (BUG-004264). Prefer the learner's own
        // email/mobile, falling back to college email / father's mobile when blank.
        email: ((p.student_email as string | null) || (p.college_email as string | null)) ?? null,
        mobile: ((p.student_mobile as string | null) || (p.father_mobile as string | null)) ?? null,
        program: embeddedName(p.program, 'program_name'),
        department: embeddedName(p.department, 'department_name'),
        semester: embeddedName(p.semester, 'semester_name'),
      },
      interests: toStringList(prior?.interests),
      skills: toStringList(prior?.skills_self_attribution),
      academicStrengths: typeof prior?.academic_strengths === 'string' ? prior.academic_strengths : '',
      clubPicks,
      priorIdpYear: (prior?.academic_year_label as string | null) ?? null,
      hasPriorIdp: !!prior,
    };

    return NextResponse.json(draft);
  } catch (e) {
    console.error('[cdc/idp/prefill] unexpected error:', e);
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}
