/**
 * GET /api/hr/forms/submissions/[id]
 *
 * Fetch a single submission. RLS gates visibility:
 *   - super_admin / admin: any row
 *   - submitter: own rows
 *   - same-institution HR officer: institution-scoped rows
 *
 * Wave 3 — M9 workflow-engine follow-up (2026-05-15).
 */

export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { formBuilderService } from '@/lib/services/hr/form-builder-service';

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
    },
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
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

    const { id } = await context.params;
    const submission = await formBuilderService.getSubmission(supabase, id);
    if (!submission) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ submission });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'failed to fetch submission';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
