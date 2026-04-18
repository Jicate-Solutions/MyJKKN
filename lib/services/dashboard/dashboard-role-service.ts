/**
 * Dashboard v2 — Role Detection (server-side)
 *
 * Determines which persona of the dashboard to render for the current user:
 *   - 'director'  → full cockpit: hero strip + institution chips + queue + leaderboards
 *   - 'counselor' → counselor hero: SLA / rank / hot leads / calls
 *   - 'faculty'   → faculty hero: unmarked classes / learner flags / upcoming timetable / week attendance
 *   - 'accounts'  → accounts hero: collection vs plan / overdue bills / recon gap / pending refunds.
 *                   Institution-scoped via auth.uid(). NO leaderboards, NO institution chips.
 *   - 'student'   → student/learner hero: attendance / fees / timetable / deadlines.
 *                   Self-scoped via auth.uid(). NO leaderboards, NO institution chips.
 *   - 'limited'   → self-scoped only: morning brief + decision queue + push button.
 *                   NO hero strip (cross-institution aggregates would leak), NO institution chips,
 *                   NO leaderboards. Users in this bucket haven't been issued a role-specific
 *                   dashboard yet (HOD, Principal, Warden, Parent).
 *
 * IMPORTANT — security property: 'limited' is the safe default. Never fall back to 'director'
 * because fn_dashboard_metrics() is SECURITY DEFINER and returns JKKN-wide aggregates when called
 * without institution scope. Seeing ₹ Cr pipeline + all-institution attendance is a data leak for
 * non-admin roles.
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §5 (role-aware view)
 */

import { createClient } from '@/lib/supabase/server';

export type DashboardPersona = 'director' | 'counselor' | 'faculty' | 'hod' | 'student' | 'limited';
export type DashboardPersona = 'director' | 'counselor' | 'faculty' | 'accounts' | 'student' | 'limited';

const DIRECTOR_ROLES = new Set([
  'admin',
  'administrator',
  'super_admin',
  'admission_manager'
]);

const COUNSELOR_ROLES = new Set([
  'admission',
  'admission_staff',
  'counselor'
]);

const FACULTY_ROLES = new Set([
  'faculty'
]);

const HOD_ROLES = new Set([
  'hod'
const ACCOUNTS_ROLES = new Set([
  'accounts',
  'accountant_assistant'
]);

const STUDENT_ROLES = new Set([
  'student'
]);

export type PersonaResolution = {
  persona: DashboardPersona;
  role: string | null;
  fullName: string | null;
  isSuperAdmin: boolean;
  institutionId: string | null;
};

/**
 * Resolves the dashboard persona for the currently authenticated user.
 * Reads profiles.role + is_super_admin via cookie-based server client.
 */
export async function getDashboardPersona(): Promise<DashboardPersona> {
  const res = await resolvePersona();
  return res.persona;
}

/**
 * Rich variant: returns persona + metadata the page needs for headers/gating.
 */
export async function resolvePersona(): Promise<PersonaResolution> {
  const FALLBACK: PersonaResolution = {
    persona: 'limited',
    role: null,
    fullName: null,
    isSuperAdmin: false,
    institutionId: null
  };

  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return FALLBACK;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, is_super_admin, full_name, institution_id')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !profile) return FALLBACK;

    const role = (profile.role ?? '').toLowerCase();
    const isSuperAdmin = profile.is_super_admin === true;

    let persona: DashboardPersona = 'limited';
    if (isSuperAdmin || DIRECTOR_ROLES.has(role)) persona = 'director';
    else if (COUNSELOR_ROLES.has(role)) persona = 'counselor';
    else if (FACULTY_ROLES.has(role)) persona = 'faculty';
    else if (HOD_ROLES.has(role)) persona = 'hod';
    else if (ACCOUNTS_ROLES.has(role)) persona = 'accounts';
    else if (STUDENT_ROLES.has(role)) persona = 'student';

    return {
      persona,
      role: profile.role ?? null,
      fullName: profile.full_name ?? null,
      isSuperAdmin,
      institutionId: profile.institution_id ?? null
    };
  } catch (err) {
    console.error('[dashboard/role] unexpected error:', err);
    return FALLBACK;
  }
}
