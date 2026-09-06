export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

import { RecruitmentService } from '@/lib/services/hr/recruitment-service';

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

// PATCH  /api/hr/recruitment/approval-flows/[id] — { is_active } toggle.
// DELETE /api/hr/recruitment/approval-flows/[id] — remove a flow template.
// Both only touch flow_for='recruitment_approval' rows; in-flight candidates
// are unaffected (frozen-snapshot pattern). Gated like the sibling POST.

async function authorize(supabase: Awaited<ReturnType<typeof getClient>>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
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
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const supabase = await getClient();
    const denied = await authorize(supabase);
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    if (typeof body.is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active (boolean) is required' }, { status: 400 });
    }

    await RecruitmentService.setRecruitmentFlowActive(supabase, id, body.is_active);
    return NextResponse.json({ data: { id, is_active: body.is_active } });
  } catch (err) {
    console.error('[hr/recruitment/approval-flows/[id]] PATCH error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const supabase = await getClient();
    const denied = await authorize(supabase);
    if (denied) return denied;

    const { id } = await params;
    await RecruitmentService.deleteRecruitmentFlow(supabase, id);
    return NextResponse.json({ data: { id, deleted: true } });
  } catch (err) {
    console.error('[hr/recruitment/approval-flows/[id]] DELETE error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
