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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  await connection();
  try {
    const { table } = await params;
    if (!getPolicyTableDef(table)) {
      return NextResponse.json({ error: 'Unknown policy table' }, { status: 404 });
    }
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const result = await PolicyService.list(supabase, table, {
      hr_organization_id: url.searchParams.get('hr_organization_id') ?? undefined,
      showSuperseded: url.searchParams.get('showSuperseded') === 'true',
      page: url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!, 10) : 1,
      pageSize: url.searchParams.get('pageSize') ? parseInt(url.searchParams.get('pageSize')!, 10) : 50,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[hr/policies] GET error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  await connection();
  try {
    const { table } = await params;
    const def = getPolicyTableDef(table);
    if (!def) return NextResponse.json({ error: 'Unknown policy table' }, { status: 404 });

    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const payload = { ...body, created_by: user.id, updated_by: user.id };
    const created = await PolicyService.create(supabase, table, payload);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error('[hr/policies] POST error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
