// GET /api/admission/consultants/referrers/{internal|student}/{id}
//
// One student or staff referrer: who they are, and every learner they referred.
// The detail-page counterpart of ../route.ts (the directory list), with the same
// source and the same enrolled allow-list, so the numbers on the list and on the
// page agree.
//
// referred_by_id is polymorphic on referral_type: 'faculty' → staff.id (listed as
// Internal), 'student' → learners_profiles.id. Service role for the same reason
// as the list: referrals cross institutions and RLS scopes rows per institution.

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ENROLLED = new Set(['active', 'admitted', 'reserved', 'graduated']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;

export interface ReferrerProfile {
  id: string;
  type: 'internal' | 'student';
  name: string;
  /** Designation for staff; roll number for learners. */
  detail: string | null;
  email: string | null;
  phone: string | null;
  institution: string | null;
  /** Department for staff; programme for learners. */
  unit: string | null;
  department: string | null;
  program: string | null;
  code: string | null;
  status: string | null;
}

export interface ReferredLearner {
  id: string;
  name: string;
  roll_number: string | null;
  institution: string | null;
  program: string | null;
  admission_year: string | null;
  lifecycle_status: string | null;
  enquiry_date: string | null;
  enrolled: boolean;
}

export const GET = withAuth(async (_request, _auth, context) => {
  try {
    const params = (await context?.params) as { type?: string; id?: string } | undefined;
    const type = params?.type;
    const id = params?.id;
    if ((type !== 'internal' && type !== 'student') || !id || !UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid referrer' }, { status: 400 });
    }
    const admin = createServiceRoleClient() as any;

    // 1. The person.
    let profile: ReferrerProfile;
    if (type === 'internal') {
      const { data: s, error } = await admin
        .from('staff')
        .select('id, first_name, last_name, designation, email, institution_email, phone, staff_id, status, institution:institutions!institution_id(name), department:departments!department_id(department_name)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      profile = {
        id,
        type,
        name: s ? `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unnamed team member' : 'Unknown referrer (record missing)',
        detail: s?.designation ?? null,
        email: s?.institution_email || s?.email || null,
        phone: s?.phone ?? null,
        institution: s?.institution?.name ?? null,
        unit: s?.department?.department_name ?? null,
        department: s?.department?.department_name ?? null,
        program: null,
        code: s?.staff_id ?? null,
        status: s?.status ?? null,
      };
    } else {
      const { data: l, error } = await admin
        .from('learners_profiles')
        .select('id, first_name, last_name, roll_number, student_email, student_mobile, lifecycle_status, institution:institutions!institution_id(name), department:departments!department_id(department_name), program:programs!program_id(program_name)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      profile = {
        id,
        type,
        name: l ? `${l.first_name || ''} ${l.last_name || ''}`.trim() || 'Unnamed learner' : 'Unknown referrer (record missing)',
        detail: l?.roll_number ?? null,
        email: l?.student_email ?? null,
        phone: l?.student_mobile ?? null,
        institution: l?.institution?.name ?? null,
        unit: l?.program?.program_name ?? null,
        department: l?.department?.department_name ?? null,
        program: l?.program?.program_name ?? null,
        code: l?.roll_number ?? null,
        status: l?.lifecycle_status ?? null,
      };
    }

    // 2. Everyone they referred, paged past the 1,000-row cap.
    const referrals: ReferredLearner[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from('learners_profiles')
        .select('id, first_name, last_name, roll_number, lifecycle_status, enquiry_date, institution:institutions!institution_id(name), program:programs!program_id(program_name), admission_year:admission_years!admission_year_id(admission_year_name)')
        .eq('referral_type', type === 'student' ? 'student' : 'faculty')
        .eq('referred_by_id', id)
        .order('enquiry_date', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const r of data ?? []) {
        referrals.push({
          id: r.id,
          name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unnamed learner',
          roll_number: r.roll_number ?? null,
          institution: r.institution?.name ?? null,
          program: r.program?.program_name ?? null,
          admission_year: r.admission_year?.admission_year_name ?? null,
          lifecycle_status: r.lifecycle_status ?? null,
          enquiry_date: r.enquiry_date ?? null,
          enrolled: ENROLLED.has(String(r.lifecycle_status)),
        });
      }
      if (!data || data.length < PAGE) break;
    }

    return NextResponse.json({ profile, referrals });
  } catch (err: any) {
    console.error('[api/admission/consultants/referrers/[type]/[id]] Error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to load referrer' }, { status: 500 });
  }
}, { allowApiKey: false, requirePermission: 'admission.consultants.view' });

// POST — the consultant row for this referrer, created on first open, so the
// directory can send the user to the full consultant page (commission tabs,
// payments). Runs as the CALLER: fn_ensure_referrer_consultant checks the same
// permission as the directory itself.
export const POST = withAuth(async (_request, _auth, context) => {
  try {
    const params = (await context?.params) as { type?: string; id?: string } | undefined;
    const type = params?.type;
    const id = params?.id;
    if ((type !== 'internal' && type !== 'student') || !id || !UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid referrer' }, { status: 400 });
    }
    const supabase = (await createClient()) as any;
    const { data, error } = await supabase.rpc('fn_ensure_referrer_consultant', {
      p_type: type,
      p_person_id: id,
    });
    if (error) {
      const status = /not_authorized/.test(error.message) ? 403 : /not_a_referrer|person_not_found/.test(error.message) ? 404 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ consultant_id: data });
  } catch (err: any) {
    console.error('[api/admission/consultants/referrers/[type]/[id]] POST error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to open referrer' }, { status: 500 });
  }
}, { allowApiKey: false, requirePermission: 'admission.consultants.view' });
