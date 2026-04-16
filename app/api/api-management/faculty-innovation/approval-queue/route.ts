// app/api/api-management/faculty-innovation/approval-queue/route.ts
// GET: Role-filtered approval queue for the current session user.
// This route uses session auth (not API key auth) since it's for
// internal portal use only.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function OPTIONS() {
  return NextResponse.json({});
}

function getSessionClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return (cookieStore as any).get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSessionClient();
    const {
      data: { user },
    } = await (supabase as any).auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get profile for role + institution
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role, institution_id, is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const role = profile.role ?? '';
    const isSuperAdmin = profile.is_super_admin === true;
    const institutionId = profile.institution_id ?? undefined;

    const isApprover =
      isSuperAdmin ||
      ['director', 'dean', 'ip_cell', 'ip cell', 'hod'].includes(role);

    if (!isApprover) {
      return NextResponse.json({
        data: [],
        metadata: { total: 0, role, message: 'Not an approver role' },
      });
    }

    // Fetch initiatives in reviewable states
    const reviewStatuses = ['submitted', 'under_review'];
    let query = (supabase as any)
      .from('faculty_initiatives')
      .select('*', { count: 'exact' })
      .in('status', reviewStatuses)
      .eq('is_active', true)
      .order('submitted_at', { ascending: true });

    if (!isSuperAdmin) {
      if (role === 'director') {
        query = query.eq('approval_authority', 'director');
      } else if (role === 'dean') {
        query = query.eq('approval_authority', 'dean');
        if (institutionId) query = query.eq('institution_id', institutionId);
      } else if (role === 'ip_cell' || role === 'ip cell') {
        query = query.eq('approval_authority', 'ip_cell');
      } else if (role === 'hod') {
        query = query.eq('approval_authority', 'hod');
        if (institutionId) query = query.eq('institution_id', institutionId);
      }
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data: data ?? [],
      metadata: { total: count ?? 0, role },
    });
  } catch (err: any) {
    console.error('[faculty-innovation/approval-queue:GET]', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500 }
    );
  }
}
