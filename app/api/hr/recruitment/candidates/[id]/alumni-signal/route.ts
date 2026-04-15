export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/recruitment/candidates/[id]/alumni-signal
 *
 * Returns { data: AlumniSignalPayload | null }.
 * null means the candidate email has no match in JKKN alumni records.
 *
 * Auth: mirrors the existing [id]/route.ts pattern.
 * R4.3 — Alumni Signals panel on candidate detail.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';
import { AlumniSignalService } from '@/lib/services/hr/alumni-signal-service';

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
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the candidate to get their email
    const candidate = await RecruitmentService.getCandidate(supabase, id);
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    const signal = await AlumniSignalService.lookupByEmail(supabase, candidate.email);
    return NextResponse.json({ data: signal });
  } catch (err) {
    console.error('[hr/recruitment/candidates/:id/alumni-signal] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
