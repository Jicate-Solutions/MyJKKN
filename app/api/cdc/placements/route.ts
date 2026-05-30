export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { CdcPlacementService } from '@/lib/services/cdc/placement-service';
import type { CdcPlacementStatus } from '@/types/cdc/placements';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {}
        },
      },
    }
  );
}

// GET /api/cdc/placements
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;

    const statusParam = sp.getAll('status') as CdcPlacementStatus[];

    const result = await CdcPlacementService.listPlacements(supabase, {
      drive_id: sp.get('drive_id') ?? undefined,
      learner_id: sp.get('learner_id') ?? undefined,
      recruiter_id: sp.get('recruiter_id') ?? undefined,
      offer_type_id: sp.get('offer_type_id') ?? undefined,
      status: statusParam.length > 0 ? statusParam : undefined,
      search: sp.get('search') ?? undefined,
      page: sp.get('page') ? Number(sp.get('page')) : undefined,
      pageSize: sp.get('pageSize') ? Number(sp.get('pageSize')) : undefined,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/cdc/placements
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const placement = await CdcPlacementService.createPlacement(supabase, body);
    return NextResponse.json(placement, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
