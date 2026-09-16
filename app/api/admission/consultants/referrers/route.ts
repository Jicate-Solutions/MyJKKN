// GET /api/admission/consultants/referrers?year=2026
//
// Student and staff referrers for the consultants directory "Type" filter.
//
// Why a route and not education_consultants: those referrers were never
// consultant rows. A learner's referrer is recorded on learners_profiles as
// referral_type ('consultant' | 'student' | 'faculty') + referred_by_id, and
// referred_by_id is POLYMORPHIC — it points at education_consultants, at
// learners_profiles, or at staff depending on referral_type. The consultants
// table only ever held external + alumni agencies, so filtering it by
// Student/Internal matched nothing while 590+ learners were in fact referred
// by students and staff.
//
// Counts use the SAME source and enrolled allow-list as fn_consultant_directory
// (learners_profiles, active/admitted/reserved/graduated), so a staff member's
// "Referrals / Enrolled" means exactly what an agency's does on the same screen.
//
// Service role because referrers are cross-institution (a student at one
// institution refers a learner to another) and RLS scopes rows per institution.
// The permission gate is the one that opens the consultants module.

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ENROLLED = new Set(['active', 'admitted', 'reserved', 'graduated']);
const PAGE = 1000;
const IN_CHUNK = 200;

export interface ReferrerRow {
  referrer_id: string;
  /** Directory type the row is listed under: learners → student, staff → internal. */
  type: 'student' | 'internal';
  name: string;
  /** Roll number / programme for learners, designation for staff. */
  detail: string | null;
  email: string | null;
  phone: string | null;
  referrals: number;
  enrolled: number;
}

export const GET = withAuth(async (request) => {
  try {
    const admin = createServiceRoleClient();
    const yearParam = new URL(request.url).searchParams.get('year');
    const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;

    // 1. Every learner referred by a student or staff member, paged past the
    //    PostgREST 1,000-row cap.
    const referred: { referral_type: string; referred_by_id: string; lifecycle_status: string | null }[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = (admin as any)
        .from('learners_profiles')
        .select(`referral_type, referred_by_id, lifecycle_status${year ? ', admission_year:admission_years!admission_year_id!inner(year)' : ''}`)
        .in('referral_type', ['student', 'faculty'])
        .not('referred_by_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (year) q = q.eq('admission_year.year', year);
      const { data, error } = await q;
      if (error) throw error;
      referred.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }

    // 2. Aggregate per referrer.
    const agg = new Map<string, { type: 'student' | 'internal'; referrals: number; enrolled: number }>();
    for (const r of referred) {
      const type = r.referral_type === 'student' ? 'student' : 'internal';
      const cur = agg.get(r.referred_by_id) ?? { type, referrals: 0, enrolled: 0 };
      cur.referrals += 1;
      if (ENROLLED.has(String(r.lifecycle_status))) cur.enrolled += 1;
      agg.set(r.referred_by_id, cur);
    }

    // 3. Resolve names from the table each type points at.
    const ids = (t: 'student' | 'internal') =>
      [...agg.entries()].filter(([, v]) => v.type === t).map(([id]) => id);
    const people = new Map<string, Omit<ReferrerRow, 'referrer_id' | 'type' | 'referrals' | 'enrolled'>>();

    const studentIds = ids('student');
    for (let i = 0; i < studentIds.length; i += IN_CHUNK) {
      const { data, error } = await (admin as any)
        .from('learners_profiles')
        .select('id, first_name, last_name, roll_number, student_email, student_mobile, program:programs!program_id(program_name)')
        .in('id', studentIds.slice(i, i + IN_CHUNK));
      if (error) throw error;
      for (const s of data ?? []) {
        people.set(s.id, {
          name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unnamed learner',
          detail: [s.roll_number, s.program?.program_name].filter(Boolean).join(' · ') || null,
          email: s.student_email || null,
          phone: s.student_mobile || null,
        });
      }
    }

    const staffIds = ids('internal');
    for (let i = 0; i < staffIds.length; i += IN_CHUNK) {
      const { data, error } = await (admin as any)
        .from('staff')
        .select('id, first_name, last_name, designation, email, institution_email, phone')
        .in('id', staffIds.slice(i, i + IN_CHUNK));
      if (error) throw error;
      for (const f of data ?? []) {
        people.set(f.id, {
          name: `${f.first_name || ''} ${f.last_name || ''}`.trim() || 'Unnamed team member',
          detail: f.designation || null,
          email: f.institution_email || f.email || null,
          phone: f.phone || null,
        });
      }
    }

    // A referred_by_id whose target row is gone is still a real referral; list
    // it rather than silently dropping its count.
    const referrers: ReferrerRow[] = [...agg.entries()]
      .map(([id, v]) => ({
        referrer_id: id,
        type: v.type,
        ...(people.get(id) ?? { name: 'Unknown referrer (record missing)', detail: null, email: null, phone: null }),
        referrals: v.referrals,
        enrolled: v.enrolled,
      }))
      .sort((a, b) => b.referrals - a.referrals || a.name.localeCompare(b.name));

    return NextResponse.json({ academic_year: year, referrers });
  } catch (err: any) {
    console.error('[api/admission/consultants/referrers] Error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to load referrers' }, { status: 500 });
  }
}, { allowApiKey: false, requirePermission: 'admission.consultants.view' });
