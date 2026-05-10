export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/recruitment/candidates/alumni-signal-bulk
 *
 * Body: { emails: string[] }  // up to 100 emails per call
 * Returns: { data: Record<email, AlumniSignalPayload | null> }
 *
 * Used by the approvals queue + candidates list to render a compact
 * one-line "JKKN alumni" badge inline with each row, without an N+1
 * single-candidate-detail fetch.
 *
 * T8.5 — Alumni signal coverage expansion across hire categories.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
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

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { emails?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const emails = Array.isArray(body.emails)
      ? body.emails.filter((e): e is string => typeof e === 'string' && e.length > 0)
      : null;

    if (!emails || emails.length === 0) {
      return NextResponse.json({ data: {} });
    }

    if (emails.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 emails per request' },
        { status: 400 }
      );
    }

    const result = await AlumniSignalService.lookupByEmails(supabase, emails);
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[hr/recruitment/candidates/alumni-signal-bulk] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
