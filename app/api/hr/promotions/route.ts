/**
 * HR — Promotion Workflow API (T5.2)
 * GET  /api/hr/promotions          → list (filterable)
 * POST /api/hr/promotions          → submit application
 */
export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import {
  PromotionService,
  type PromotionStatus,
  type PromotionApplicationInsert,
} from '@/lib/services/hr/promotion-service';

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

    const url = new URL(request.url);
    const statuses = url.searchParams.getAll('status') as PromotionStatus[];

    const result = await PromotionService.list(supabase, {
      staff_id: url.searchParams.get('staff_id') ?? undefined,
      hr_organization_id: url.searchParams.get('hr_organization_id') ?? undefined,
      institution_id: url.searchParams.get('institution_id') ?? undefined,
      status: statuses.length > 0 ? statuses : undefined,
      page: url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!, 10) : 1,
      pageSize: url.searchParams.get('pageSize')
        ? parseInt(url.searchParams.get('pageSize')!, 10)
        : 25,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[hr/promotions] GET error', err);
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as PromotionApplicationInsert;
    if (!body.staff_id || !body.hr_organization_id || !body.institution_id) {
      return NextResponse.json(
        { error: 'staff_id, hr_organization_id, institution_id are required' },
        { status: 400 }
      );
    }
    if (!body.from_designation_name || !body.to_designation_name) {
      return NextResponse.json(
        { error: 'from_designation_name and to_designation_name are required' },
        { status: 400 }
      );
    }

    const application = await PromotionService.submit(supabase, body, user.id);
    return NextResponse.json({ data: application }, { status: 201 });
  } catch (err) {
    console.error('[hr/promotions] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
