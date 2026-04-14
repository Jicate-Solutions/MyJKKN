export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { PolicyService } from '@/lib/services/hr/policy-service';
import { getPolicyTableDef } from '@/features/hr/policies/registry';

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

/** GET: history of versions for a table */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  await connection();
  try {
    const { table } = await params;
    if (!getPolicyTableDef(table)) return NextResponse.json({ error: 'Unknown policy table' }, { status: 404 });
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const orgId = url.searchParams.get('hr_organization_id');
    if (!orgId) return NextResponse.json({ error: 'hr_organization_id required' }, { status: 400 });

    const action = url.searchParams.get('action');

    // Diff: ?action=diff&old_id=X&new_id=Y
    if (action === 'diff') {
      const oldId = url.searchParams.get('old_id');
      const newId = url.searchParams.get('new_id');
      if (!oldId || !newId) return NextResponse.json({ error: 'old_id and new_id required' }, { status: 400 });
      const data = await PolicyService.diff(supabase, table, oldId, newId);
      return NextResponse.json({ data });
    }

    // Default: history list
    const data = await PolicyService.history(supabase, table, orgId);
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

/** POST = restore a previous version (body: { version_id }) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  await connection();
  try {
    const { table } = await params;
    if (!getPolicyTableDef(table)) return NextResponse.json({ error: 'Unknown policy table' }, { status: 404 });
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const versionId = body.version_id as string;
    if (!versionId) return NextResponse.json({ error: 'version_id required' }, { status: 400 });

    const restored = await PolicyService.restore(supabase, table, versionId, user.id);
    return NextResponse.json({ data: restored }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
