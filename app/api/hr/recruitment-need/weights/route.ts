export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentNeedAdminService } from '@/lib/services/hr/recruitment-need/admin-service';

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

export async function GET() {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const data = await RecruitmentNeedAdminService.listWeightPolicies(supabase);
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[hr/recruitment-need/weights] GET error', err);
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

    const { weights } = await request.json();
    await RecruitmentNeedAdminService.updateWeightPolicies(supabase, weights);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[hr/recruitment-need/weights] PUT error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
