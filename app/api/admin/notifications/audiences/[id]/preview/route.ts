import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

const PREVIEW_LIMIT = 20;

/**
 * GET /api/admin/notifications/audiences/[id]/preview
 *
 * Resolves a saved audience via the `resolve_audience` Postgres function and
 * returns the total count plus a hydrated preview of the first 20 users.
 *
 * Restricted to super_admin. Returning a full user_id list leaks PII / enables
 * user-base enumeration, so we only return the 20-row preview + total count.
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

    // Require super_admin — audience previews expose user lists which leak
    // directory information, so a plain authenticated check is not enough.
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const profile = profileData as { role: string } | null;
    if (profile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: super_admin only' },
        { status: 403, headers: NO_STORE }
      );
    }

    // Load the audience row and verify it is active.
    const { data: audience, error: audienceError } = await (supabase as any)
      .from('notification_audiences')
      .select('id, name, is_active')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (audienceError || !audience) {
      return NextResponse.json(
        { error: 'Audience not found' },
        { status: 404, headers: NO_STORE }
      );
    }

    // resolve_audience is SECURITY DEFINER and only granted to service_role —
    // the authenticated role cannot execute it, so we use the service client.
    const serviceClient = createServiceRoleClient();
    const { data: resolveData, error: resolveError } = await (serviceClient as any).rpc(
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

    // Authoritative shape from the DB function:
    //   { audience_id, name, user_ids: string[], count: number }
    let allUserIds: string[] = [];
    let totalCount = 0;

    if (resolveData && typeof resolveData === 'object') {
      if (Array.isArray(resolveData.user_ids)) {
        allUserIds = resolveData.user_ids.filter(
          (v: any): v is string => typeof v === 'string' && v.length > 0
        );
      }
      if (typeof resolveData.count === 'number') {
        totalCount = resolveData.count;
      } else {
        totalCount = allUserIds.length;
      }
    }

    // De-dupe defensively (the DB function should already dedupe).
    allUserIds = [...new Set(allUserIds)];

    const previewIds = allUserIds.slice(0, PREVIEW_LIMIT);

    // Fetch profile info for the preview subset only — we never return the
    // full user_id list to clients.
    let previewUsers: Array<{
      id: string;
      full_name: string;
      email: string;
      role: string;
      institution_id: string | null;
      institution_name: string | null;
    }> = [];
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
        count: totalCount,
        preview_users: previewUsers
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
