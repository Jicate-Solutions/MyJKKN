/**
 * Dashboard v2 Week-2 — Role Detection (server-side)
 *
 * Determines which persona of the dashboard to render for the current user:
 *   - 'director'  → existing HeroStrip + institution chips + decision queue + leaderboards
 *   - 'counselor' → CounselorHeroStrip + decision queue + leaderboards (no institution chips)
 *   - 'fallback'  → defaults to director view
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §5 (role-aware view)
 */

import { createClient } from '@/lib/supabase/server';

export type DashboardPersona = 'director' | 'counselor' | 'fallback';

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

/**
 * Resolves the dashboard persona for the currently authenticated user.
 * Reads profiles.role + is_super_admin via cookie-based server client.
 */
export async function getDashboardPersona(): Promise<DashboardPersona> {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return 'fallback';

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !profile) {
      return 'fallback';
    }

    if (profile.is_super_admin === true) return 'director';

    const role = (profile.role ?? '').toLowerCase();
    if (DIRECTOR_ROLES.has(role)) return 'director';
    if (COUNSELOR_ROLES.has(role)) return 'counselor';

    return 'fallback';
  } catch (err) {
    console.error('[dashboard/role] unexpected error:', err);
    return 'fallback';
  }
}
