export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { DataEntryService } from '@/lib/services/hr/recruitment-need/data-entry-service';

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
    const lookup = url.searchParams.get('_lookup');

    // Lookup endpoints for selectors
    if (lookup === 'institutions') {
      const data = await DataEntryService.listInstitutions(supabase);
      return NextResponse.json({ data });
    }
    if (lookup === 'programs') {
      const instId = url.searchParams.get('institution_id') || undefined;
      const data = await DataEntryService.listPrograms(supabase, instId);
      return NextResponse.json({ data });
    }

    const filters = {
      institution_id: url.searchParams.get('institution_id') || undefined,
      body_id: url.searchParams.get('body_id') || undefined,
    };
    const data = await DataEntryService.listApprovals(supabase, filters);
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[hr/recruitment-need/approvals] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const created = await DataEntryService.createApproval(supabase, body);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error('[hr/recruitment-need/approvals] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, ...updateData } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const updated = await DataEntryService.updateApproval(supabase, id, updateData);
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('[hr/recruitment-need/approvals] PUT error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id query param is required' }, { status: 400 });

    await DataEntryService.deleteApproval(supabase, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[hr/recruitment-need/approvals] DELETE error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
