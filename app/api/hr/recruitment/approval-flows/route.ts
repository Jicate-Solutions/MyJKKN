export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
}

import { RecruitmentService } from '@/lib/services/hr/recruitment-service';

// GET  /api/hr/recruitment/approval-flows — list recruitment routing rules.
// POST /api/hr/recruitment/approval-flows — upsert a role-category flow
//      template across one or more organizations (dynamic flow builder,
//      /hr/admin/recruitment-approval-flows).

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const hrOrgId = url.searchParams.get('hr_organization_id');

    let q = supabase
      .from('hr_approval_flows')
      .select('id, flow_name, flow_for, conditions, steps, is_active, hr_organization_id')
      .eq('flow_for', 'recruitment_approval')
      .order('flow_name', { ascending: true });

    if (hrOrgId) {
      q = q.eq('hr_organization_id', hrOrgId);
    }

    const { data, error } = await q;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[hr/recruitment/approval-flows] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Body: { flow_name, role_categories: RoleCategory[], steps:
 *         ApprovalFlowStepTemplate[], hr_organization_ids: string[], is_active? }
 * (legacy single `role_category` string also accepted).
 * Gated on hr.recruitment.edit (or super-admin). RLS additionally restricts
 * which orgs a non-admin can actually write.
 */
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
    if (!isSuperAdmin) {
      const { data: canEdit } = await supabase.rpc('user_has_permission', {
        permission_name: 'hr.recruitment.edit',
      });
      if (!canEdit) {
        return NextResponse.json(
          { error: 'Insufficient permissions to edit approval flows' },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const roleCategories: string[] = Array.isArray(body.role_categories)
      ? body.role_categories
      : body.role_category
      ? [body.role_category]
      : [];
    if (!body.flow_name || roleCategories.length === 0 || !Array.isArray(body.steps)) {
      return NextResponse.json(
        { error: 'flow_name, role_categories and steps are required' },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.hr_organization_ids) || body.hr_organization_ids.length === 0) {
      return NextResponse.json({ error: 'hr_organization_ids is required' }, { status: 400 });
    }

    const result = await RecruitmentService.upsertRecruitmentFlow(supabase, {
      flow_name: body.flow_name,
      role_categories: roleCategories as import('@/types/hr-recruitment').RoleCategory[],
      steps: body.steps,
      hr_organization_ids: body.hr_organization_ids,
      is_active: body.is_active ?? true,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[hr/recruitment/approval-flows] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
