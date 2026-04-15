// app/api/users/permissions-audit/impact-preview/route.ts
// ============================================================================
// POST /api/users/permissions-audit/impact-preview
// Returns a "what changes if I save?" delta for a custom_role being edited.
// Super admin only. Read-only — computes preview data, never writes.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { getImpactPreviewData } from '@/lib/services/permissions-audit/impact-preview-service';

interface RequestBody {
  roleId?: string;
  proposedPermissions?: Record<string, boolean>;
}

export async function POST(request: NextRequest) {
  await connection();

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const isSuperAdmin =
      profile.is_super_admin === true || profile.role === 'super_admin';
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Only super administrators can preview role impact.' },
        { status: 403 },
      );
    }

    // ── Parse + validate request body ────────────────────────────────────
    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { roleId, proposedPermissions } = body;
    if (!roleId || typeof roleId !== 'string') {
      return NextResponse.json(
        { error: 'roleId is required.' },
        { status: 400 },
      );
    }
    if (
      !proposedPermissions ||
      typeof proposedPermissions !== 'object' ||
      Array.isArray(proposedPermissions)
    ) {
      return NextResponse.json(
        { error: 'proposedPermissions must be an object of { key: boolean }.' },
        { status: 400 },
      );
    }
    // Cheap guardrail — a sane permissions payload is small (hundreds of keys
    // max). Anything bigger than 10k entries is abusive.
    if (Object.keys(proposedPermissions).length > 10_000) {
      return NextResponse.json(
        { error: 'proposedPermissions payload too large.' },
        { status: 413 },
      );
    }

    // ── Elevate to service-role for aggregate reads ──────────────────────
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const data = await getImpactPreviewData(
      serviceClient,
      roleId,
      proposedPermissions,
    );

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      },
    });
  } catch (err) {
    console.error(
      '[permissions-audit/impact-preview] Failed to compute preview:',
      err,
    );
    const message =
      err instanceof Error ? err.message : 'Failed to compute impact preview.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
