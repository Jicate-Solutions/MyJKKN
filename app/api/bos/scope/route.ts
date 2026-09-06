import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosBoardScope, hasBosPermission, isBosReadAllObserver } from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/scope ───────────────────────────────────────────────────────
// Returns the current user's board-level access scope so the client UI can
// gate buttons (New Composition / Edit Syllabus / etc.) without re-deriving
// the rules. Sets cache to no-store because memberships and chairman roles
// can change as soon as a composition is updated.
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scope = await resolveBosBoardScope(user.id);

  // Read-only observer signal: holds the compositions view grant but sits on
  // no board — the client badges these callers as view-only. VIEW ONLY.
  const canReadAllBos = isBosReadAllObserver(
    scope,
    await hasBosPermission(user.id, 'academic.bos-compositions.view')
  );

  return NextResponse.json(
    {
      isSuperAdmin: scope.isSuperAdmin,
      canReadAllBos,
      isPrincipal: scope.isPrincipal,
      role: scope.role,
      institutionsId: scope.institutionsId,
      allInstitutionIds: scope.allInstitutionIds,
      userInstitutionId: scope.userInstitutionId,
      staffId: scope.staffId,
      memberOf: Array.from(scope.memberOf),
      isChairmanIn: Array.from(scope.isChairmanIn),
      boardsOf: Array.from(scope.boardsOf),
      chairmanForBoards: Array.from(scope.chairmanForBoards),
      institutionsOf: Array.from(scope.institutionsOf),
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
