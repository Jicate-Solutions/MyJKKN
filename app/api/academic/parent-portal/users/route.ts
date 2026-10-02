import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireParentUserDataAdmin } from '@/lib/utils/parent-admin-auth';
import { hasSuperAdminFlag } from '@/lib/auth/super-admin-flag';

export const runtime = 'nodejs';


export interface PPUserRow {
  accountId: string;
  learnerId: string;
  rollNumber: string;
  learnerName: string;
  fatherMobile: string;
  motherMobile: string;
  loginMobile: string;
  isAdminReset: boolean;
  isActive: boolean;
}

/**
 * GET /api/academic/parent-portal/users?institutionId=&programIds=&sectionIds=&learnerIds=
 * Parent accounts joined with their learner. Gated to super_admin + principal.
 * Returns the role-scoped institution list too, so the panel can run standalone
 * for principals (who can't load the staff-only content filter). super_admin →
 * all institutions; principal → own only.
 */
export async function GET(req: NextRequest) {
  const user = await requireParentUserDataAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createServiceRoleClient();
  const url = new URL(req.url);
  // Director ruling 2026-10-02: only a super admin (profiles.is_super_admin) gets
  // the per-row "Show password" button. This flag only decides whether the
  // button appears; the show-password route checks it again on every click.
  const viewerIsSuperAdmin = await hasSuperAdminFlag(db, user.id);
  const csv = (k: string) => (url.searchParams.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);
  const programIds = csv('programIds');
  const sectionIds = csv('sectionIds');
  const learnerIds = csv('learnerIds');

  // Role-scoped institutions.
  let institutions: Array<{ id: string; name: string; entity_type: string }> = [];
  if (user.isSuperAdmin) {
    const { data } = await db.from('institutions').select('id, name, entity_type').order('name');
    institutions = (data as typeof institutions) ?? [];
  } else {
    const { data: profile } = await db.from('profiles').select('institution_id').eq('id', user.id).maybeSingle();
    const ownId = (profile as { institution_id: string | null } | null)?.institution_id;
    if (ownId) {
      const { data } = await db.from('institutions').select('id, name, entity_type').eq('id', ownId);
      institutions = (data as typeof institutions) ?? [];
    }
  }

  const requested = url.searchParams.get('institutionId');
  const institutionId =
    requested && institutions.some((i) => i.id === requested) ? requested : institutions[0]?.id ?? null;

  console.log('[PP users] isSuperAdmin=%s institutions=%d requested=%s resolved=%s',
    user.isSuperAdmin, institutions.length, requested, institutionId);

  if (!institutionId) return NextResponse.json({ institutions, users: [], institutionId: null, viewerIsSuperAdmin });

  // Learners matching the targeting (institution + optional program/section/learner).
  let lq = db
    .from('learners_profiles')
    .select('id, first_name, last_name, application_id, roll_number, register_number, father_mobile, mother_mobile')
    .eq('institution_id', institutionId)
    .limit(5000);
  if (learnerIds.length) lq = lq.in('id', learnerIds);
  else if (sectionIds.length) lq = lq.in('section_id', sectionIds);
  else if (programIds.length) lq = lq.in('program_id', programIds);

  const { data: learners, error: lErr } = await lq;
  const lrnRows = learners ?? [];
  console.log('[PP users] learners=%d learnersError=%s', lrnRows.length, lErr?.message ?? 'none');
  if (!lrnRows.length) return NextResponse.json({ institutions, users: [], institutionId, viewerIsSuperAdmin });
  const lrnById = new Map(lrnRows.map((l) => [l.id as string, l]));

  // Resilient to the reset_password column not existing yet (migration not run):
  // try with it, fall back to without it. Only the yes/no isAdminReset flag is
  // derived from it; the stored value itself is NEVER sent in this list (nor in
  // the Excel export). A super admin sees one password at a time through
  // POST ./show-password, which records every view (Director ruling 2 Oct 2026).
  const accIds = lrnRows.map((l) => l.id as string);
  const withCol = await db
    .from('pp_parent_accounts')
    .select('id, learner_profile_id, mobile, is_active, reset_password')
    .in('learner_profile_id', accIds);
  let accounts: Array<Record<string, unknown>>;
  if (withCol.error) {
    const noCol = await db
      .from('pp_parent_accounts')
      .select('id, learner_profile_id, mobile, is_active')
      .in('learner_profile_id', accIds);
    accounts = (noCol.data ?? []).map((a) => ({ ...a, reset_password: null }));
  } else {
    accounts = withCol.data ?? [];
  }

  const users: PPUserRow[] = (accounts ?? [])
    .map((a) => {
      const l = lrnById.get(a.learner_profile_id as string);
      if (!l) return null;
      return {
        accountId: a.id as string,
        learnerId: a.learner_profile_id as string,
        rollNumber: (l.roll_number || l.application_id || l.register_number || '') as string,
        learnerName: [l.first_name, l.last_name].filter(Boolean).join(' ').trim(),
        fatherMobile: (l.father_mobile as string) || '',
        motherMobile: (l.mother_mobile as string) || '',
        loginMobile: (a.mobile as string) || '',
        isAdminReset: !!a.reset_password,
        isActive: a.is_active !== false,
      } as PPUserRow;
    })
    .filter((x): x is PPUserRow => !!x)
    .sort((a, b) => a.learnerName.localeCompare(b.learnerName));

  console.log('[PP users] accountsError=%s accounts=%d → users=%d',
    withCol.error?.message ?? 'none', accounts.length, users.length);

  return NextResponse.json({ institutions, users, institutionId, viewerIsSuperAdmin });
}
