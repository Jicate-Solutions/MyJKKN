import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * GET /api/admin/notifications/audiences/[id]/preview
 *
 * Resolves a saved audience via the `resolve_audience` Postgres function and
 * returns the full user_id list plus a hydrated preview of the first 20 users
 * (with name, email, role, and institution).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Audience id is required' },
        { status: 400, headers: NO_STORE }
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE }
      );
    }

    // Load the audience row to get its name (and verify it exists)
    const { data: audience, error: audienceError } = await (supabase as any)
      .from('notification_audiences')
      .select('id, name, is_active')
      .eq('id', id)
      .single();

    if (audienceError || !audience) {
      return NextResponse.json(
        { error: 'Audience not found' },
        { status: 404, headers: NO_STORE }
      );
    }

    // Resolve audience via Postgres function
    const { data: resolveData, error: resolveError } = await (supabase as any).rpc(
      'resolve_audience',
      { p_audience_id: id }
    );

    if (resolveError) {
      console.error(
        '[notifications/audiences/:id/preview] resolve_audience failed:',
        resolveError
      );
      return NextResponse.json(
        { error: 'Failed to resolve audience' },
        { status: 500, headers: NO_STORE }
      );
    }

    // Normalize shape - resolve_audience may return a table (array of rows with user_id)
    // or a single object with user_ids[]. Support both.
    let allUserIds: string[] = [];

    if (Array.isArray(resolveData)) {
      // Table/set result: either [{ user_id }, ...] or [uuid, ...]
      allUserIds = resolveData
        .map((row: any) => {
          if (typeof row === 'string') return row;
          if (row && typeof row === 'object') return row.user_id || row.id || null;
          return null;
        })
        .filter((v: any): v is string => typeof v === 'string' && v.length > 0);
    } else if (resolveData && typeof resolveData === 'object') {
      if (Array.isArray(resolveData.user_ids)) {
        allUserIds = resolveData.user_ids.filter(
          (v: any): v is string => typeof v === 'string' && v.length > 0
        );
      }
    }

    // De-dupe
    allUserIds = [...new Set(allUserIds)];

    const previewIds = allUserIds.slice(0, 20);

    // Fetch profile info for the preview user ids
    let previewUsers: any[] = [];
    let institutionMap: Record<string, string> = {};

    if (previewIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, institution_id')
        .in('id', previewIds);

      if (profilesError) {
        console.warn(
          '[notifications/audiences/:id/preview] Failed to fetch profiles:',
          profilesError
        );
      }

      const profileRows = (profiles || []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        role: string | null;
        institution_id: string | null;
      }>;

      const institutionIds = [
        ...new Set(
          profileRows
            .map((p) => p.institution_id)
            .filter((v): v is string => !!v)
        )
      ];

      if (institutionIds.length > 0) {
        const { data: institutions } = await supabase
          .from('institutions')
          .select('id, name')
          .in('id', institutionIds);

        const instRows = (institutions || []) as Array<{ id: string; name: string | null }>;
        institutionMap = Object.fromEntries(
          instRows.map((inst) => [inst.id, inst.name || 'Unknown Institution'])
        );
      }

      previewUsers = profileRows.map((p) => ({
        id: p.id,
        full_name: p.full_name || 'Unknown',
        email: p.email || '',
        role: p.role || '',
        institution_id: p.institution_id,
        institution_name: p.institution_id
          ? institutionMap[p.institution_id] || null
          : null
      }));
    }

    return NextResponse.json(
      {
        audience_id: audience.id,
        name: audience.name,
        count: allUserIds.length,
        preview_users: previewUsers,
        all_user_ids: allUserIds
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error(
      '[notifications/audiences/:id/preview] Unexpected error:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE }
    );
  }
}
