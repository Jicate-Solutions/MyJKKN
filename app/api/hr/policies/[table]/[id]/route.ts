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

async function requireAuth() {
  const supabase = await getClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase: null, user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { supabase, user, response: null };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  await connection();
  try {
    const { table, id } = await params;
    if (!getPolicyTableDef(table)) return NextResponse.json({ error: 'Unknown policy table' }, { status: 404 });
    const { supabase, response } = await requireAuth();
    if (response) return response;
    const row = await PolicyService.getById(supabase!, table, id);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: row });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

/** PATCH = supersede (creates new version, marks old as valid_until). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  await connection();
  try {
    const { table, id } = await params;
    if (!getPolicyTableDef(table)) return NextResponse.json({ error: 'Unknown policy table' }, { status: 404 });
    const { supabase, user, response } = await requireAuth();
    if (response) return response;
    const body = await request.json();
    const result = await PolicyService.supersede(supabase!, table, id, body, user!.id);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  await connection();
  try {
    const { table, id } = await params;
    if (!getPolicyTableDef(table)) return NextResponse.json({ error: 'Unknown policy table' }, { status: 404 });
    const { supabase, user, response } = await requireAuth();
    if (response) return response;
    const result = await PolicyService.deactivate(supabase!, table, id, user!.id);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
