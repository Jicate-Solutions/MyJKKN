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

    // Lookup endpoint for specialization selector
    if (lookup === 'specializations') {
      const data = await DataEntryService.listSpecializations(supabase);
      return NextResponse.json({ data });
    }

    const filters = {
      institution_id: url.searchParams.get('institution_id') || undefined,
      specialization_id: url.searchParams.get('specialization_id') || undefined,
      untagged_only: url.searchParams.get('untagged_only') === 'true',
    };
    const data = await DataEntryService.listStaffWithSpecializations(supabase, filters);
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[hr/staff-specializations] GET error', err);
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

    // Bulk add
    if (body.bulk && Array.isArray(body.staff_ids)) {
      const created = await DataEntryService.bulkAddSpecializations(
        supabase,
        body.staff_ids,
        body.specialization_id,
        body.is_primary ?? false
      );
      return NextResponse.json({ data: created }, { status: 201 });
    }

    // Single add
    const created = await DataEntryService.addSpecialization(supabase, body);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error('[hr/staff-specializations] POST error', err);
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

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const action = url.searchParams.get('action');

    if (!id) return NextResponse.json({ error: 'id query param is required' }, { status: 400 });

    if (action === 'verify') {
      const verified = await DataEntryService.verifySpecialization(supabase, id, user.id);
      return NextResponse.json({ data: verified });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[hr/staff-specializations] PUT error', err);
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

    await DataEntryService.removeSpecialization(supabase, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[hr/staff-specializations] DELETE error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
