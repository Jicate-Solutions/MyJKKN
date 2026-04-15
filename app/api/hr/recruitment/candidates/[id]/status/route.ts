export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';
import type { CandidateStatus } from '@/types/hr-recruitment';

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

// PATCH /api/hr/recruitment/candidates/[id]/status
// Body: { status: CandidateStatus }
// Used for: joined, no_show, offer_issued, offer_rescinded transitions

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    if (!body.status) {
      return NextResponse.json({ error: 'status is required in request body' }, { status: 400 });
    }

    // Special case: no_show uses its own service method with validation
    if (body.status === 'no_show') {
      const updated = await RecruitmentService.markNoShow(supabase, id);
      return NextResponse.json({ data: updated });
    }

    const updated = await RecruitmentService.updateStatus(supabase, id, body.status as CandidateStatus);
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('[hr/recruitment/candidates/:id/status] PATCH error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
