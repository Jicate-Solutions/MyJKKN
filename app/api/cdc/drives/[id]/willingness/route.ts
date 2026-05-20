export const dynamic = 'force-dynamic';

/**
 * T1.1 — Learner-facing willingness declaration API.
 *
 * GET  /api/cdc/drives/[id]/willingness  → snapshot for the page (drive + eligibility +
 *                                         existing willingness + computed booleans)
 * POST /api/cdc/drives/[id]/willingness  → declare 'willing' or 'decline'
 *
 * Auth: caller is an authenticated learner. We resolve auth.uid() to learners_profiles.id
 * server-side and never trust client-supplied learner_id. RLS on cdc_drive_willingness
 * (PR #987 / 20260519T1140Z) enforces the row-level scope; this layer adds the
 * eligibility + window-open soft checks for friendly errors.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { CdcWillingnessService } from '@/lib/services/cdc/willingness-service';

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
    const { id } = await params;
    const supabase = await getClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const learner = await CdcWillingnessService.resolveLearner(supabase, user.id);
    if (!learner) {
      return NextResponse.json(
        { error: 'This page is only available to learners with a linked learner profile.' },
        { status: 403 }
      );
    }

    const snapshot = await CdcWillingnessService.getLearnerWillingnessSnapshot(
      supabase,
      id,
      learner
    );
    if (!snapshot) {
      return NextResponse.json({ error: 'Drive not found' }, { status: 404 });
    }
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error('[cdc/drives/[id]/willingness] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const learner = await CdcWillingnessService.resolveLearner(supabase, user.id);
    if (!learner) {
      return NextResponse.json(
        { error: 'Only learners can declare willingness.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const intent = body.intent as 'willing' | 'decline' | undefined;
    if (intent !== 'willing' && intent !== 'decline') {
      return NextResponse.json(
        { error: 'intent must be "willing" or "decline"' },
        { status: 400 }
      );
    }

    const willingness = await CdcWillingnessService.declareWillingness(
      supabase,
      id,
      learner,
      user.id,
      intent
    );
    return NextResponse.json({ data: willingness });
  } catch (err) {
    console.error('[cdc/drives/[id]/willingness] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
