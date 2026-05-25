export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentNeedSignalService } from '@/lib/services/hr/recruitment-need/signal-service';
import type { HRRecruitmentSignalSnapshotInsert } from '@/types/hr-recruitment-need';

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

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const institutionId = url.searchParams.get('institution_id') ?? undefined;
    const includeArchived = url.searchParams.get('include_archived') === 'true';

    let query = supabase
      .from('hr_recruitment_signal_snapshots')
      .select('*')
      .order('taken_at', { ascending: false });

    if (!includeArchived) query = query.eq('is_archived', false);
    if (institutionId) query = query.eq('scope_institution_id', institutionId);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    if (!body.snapshot_name) {
      return NextResponse.json({ error: 'Missing required field: snapshot_name' }, { status: 400 });
    }

    // If no signal_data provided, snapshot current cache
    let signalData = body.signal_data;
    if (!signalData) {
      let cacheQuery = supabase.from('hr_recruitment_signal_cache').select('*');
      if (body.scope_institution_id) cacheQuery = cacheQuery.eq('institution_id', body.scope_institution_id);
      const { data: cacheRows, error: cacheError } = await cacheQuery;
      if (cacheError) throw cacheError;
      signalData = { signals: cacheRows ?? [], captured_at: new Date().toISOString() };
    }

    const insert: HRRecruitmentSignalSnapshotInsert = {
      snapshot_name: body.snapshot_name,
      snapshot_description: body.snapshot_description ?? null,
      financial_year: body.financial_year ?? null,
      scope_institution_id: body.scope_institution_id ?? null,
      signal_data: signalData,
      metadata: body.metadata ?? null,
    };

    const data = await RecruitmentNeedSignalService.createSnapshot(supabase, insert);
    return NextResponse.json(data, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
