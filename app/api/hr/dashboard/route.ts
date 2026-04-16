export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/dashboard — returns the role-adapted payload.
 *
 * Query params:
 *   mode=institution-grid | rolled-up       (super admin only; default = institution-grid)
 *   hr_organization_id=<uuid>               (optional; HR Officer uses their own, super admin = null)
 *   institution_id=<uuid>                   (optional; for institution-scoped banners)
 *
 * Role detection is server-side via profiles.role (+ is_super_admin).
 * Non-HR users → 403 (route-level gate; page-level redirect to /dashboard
 * with toast is the UX per decision #13, but the API is still denied).
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { HRDashboardService } from '@/lib/services/hr/dashboard-service';
import type { DashboardMode, ViewerRole } from '@/types/hr-dashboard';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {}
        },
      },
    }
  );
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve viewer role from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .maybeSingle();

    const isSuperAdmin = !!profile?.is_super_admin;
    const role = (profile?.role as string | undefined) ?? '';
    const isHROfficer = role === 'hr_officer' || role === 'hr_admin' || role === 'hr_manager';
    const isDirector = role === 'director' || role === 'admin';

    if (!isSuperAdmin && !isHROfficer && !isDirector) {
      return NextResponse.json({ error: 'Forbidden — not an HR role' }, { status: 403 });
    }

    const viewer_role: ViewerRole = isSuperAdmin
      ? 'super_admin'
      : isHROfficer
      ? 'hr_officer'
      : 'director';

    const url = new URL(request.url);
    const modeParam = url.searchParams.get('mode') as DashboardMode | null;
    const mode: DashboardMode =
      isSuperAdmin && modeParam === 'rolled-up' ? 'rolled-up' : 'institution-grid';

    // HR Officer / Director: lookup their hr_organization_id from user_hr_access.
    // Super admin: null (sees all or grid).
    let hrOrgId: string | null = null;
    if (!isSuperAdmin) {
      const { data: access } = await supabase
        .from('user_hr_access')
        .select('hr_organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      hrOrgId = (access?.hr_organization_id as string | null) ?? null;
    }

    const institutionIdParam = url.searchParams.get('institution_id');
    const institution_id =
      institutionIdParam || (profile?.institution_id as string | null) || null;

    const payload = await HRDashboardService.getPayload(supabase, {
      viewer_role,
      hr_organization_id: hrOrgId,
      institution_id,
      mode: isSuperAdmin ? mode : 'rolled-up',
    });

    return NextResponse.json(payload, {
      headers: {
        // Live queries, no cache (decision #2). Client shows "Refresh" button
        // with generated_at timestamp per decision #9.
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err) {
    console.error('[hr/dashboard] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
