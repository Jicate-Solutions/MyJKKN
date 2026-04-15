export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentPackageService } from '@/lib/services/hr/recruitment-package-service';

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

// POST /api/hr/recruitment/candidates/[id]/packages/[packageId]/counter
// Body: { proposed_ctc_amount, proposed_ctc_breakdown?, currency?, notes? }

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; packageId: string }> }
) {
  await connection();
  try {
    const { id, packageId } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    if (!body.proposed_ctc_amount) {
      return NextResponse.json({ error: 'proposed_ctc_amount is required' }, { status: 400 });
    }

    const created = await RecruitmentPackageService.counterOffer(supabase, packageId, {
      candidate_id: id,
      proposed_by: user.id,
      proposed_ctc_amount: body.proposed_ctc_amount,
      proposed_ctc_breakdown: body.proposed_ctc_breakdown ?? null,
      currency: body.currency ?? 'INR',
      hr_organization_id: body.hr_organization_id ?? null,
      notes: body.notes ?? null,
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error('[hr/recruitment/candidates/:id/packages/:packageId/counter] error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
