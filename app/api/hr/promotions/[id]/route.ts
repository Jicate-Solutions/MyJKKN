/**
 * HR — Promotion Workflow API (T5.2)
 * GET    /api/hr/promotions/:id         → fetch single application + decisions
 * PATCH  /api/hr/promotions/:id         → SEDC-score / Director-decide / withdraw
 */
export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { PromotionService } from '@/lib/services/hr/promotion-service';

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;

    const application = await PromotionService.getById(supabase, id);
    if (!application) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const decisions = await PromotionService.getDecisions(supabase, id);
    return NextResponse.json({ data: { application, decisions } });
  } catch (err) {
    console.error('[hr/promotions/:id] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

interface PatchBody {
  action: 'sedc_score' | 'director_decide' | 'withdraw';
  // sedc_score:
  merit_score?: number;
  qualification_points?: number;
  commitment_points?: number;
  // director_decide:
  decision?: 'approved' | 'rejected';
  // common:
  notes?: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;
    const body = (await request.json()) as PatchBody;

    if (body.action === 'sedc_score') {
      if (
        typeof body.merit_score !== 'number' ||
        typeof body.qualification_points !== 'number' ||
        typeof body.commitment_points !== 'number'
      ) {
        return NextResponse.json(
          { error: 'merit_score, qualification_points, commitment_points are required numbers' },
          { status: 400 }
        );
      }
      const out = await PromotionService.sedcScore(
        supabase,
        id,
        {
          merit_score: body.merit_score,
          qualification_points: body.qualification_points,
          commitment_points: body.commitment_points,
          notes: body.notes,
        },
        user.id
      );
      return NextResponse.json({ data: out });
    }

    if (body.action === 'director_decide') {
      if (body.decision !== 'approved' && body.decision !== 'rejected') {
        return NextResponse.json(
          { error: 'decision must be "approved" or "rejected"' },
          { status: 400 }
        );
      }
      const out = await PromotionService.directorDecide(
        supabase,
        id,
        body.decision,
        body.notes ?? null,
        user.id
      );
      return NextResponse.json({ data: out });
    }

    if (body.action === 'withdraw') {
      const out = await PromotionService.withdraw(supabase, id, body.notes ?? null, user.id);
      return NextResponse.json({ data: out });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[hr/promotions/:id] PATCH error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
