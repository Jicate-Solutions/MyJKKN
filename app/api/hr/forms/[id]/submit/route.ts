/**
 * POST /api/hr/forms/[id]/submit
 *
 * Submit a published HR form. The authenticated user becomes the submitter
 * (RLS enforces submitted_by = auth.uid()).
 *
 * Body: { data: Record<string, unknown>, institution_id?: string }
 * Returns: HrFormSubmission row + dispatched notification summary metadata.
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

export async function POST(
  request: NextRequest,
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
    const body = await request.json().catch(() => null);
    if (!body || typeof body.data !== 'object' || body.data === null) {
      return NextResponse.json(
        { error: "missing 'data' object in request body" },
        { status: 400 },
      );
    }

    const submission = await formBuilderService.submitForm(
      supabase,
      id,
      body.data as Record<string, unknown>,
      { institutionId: body.institution_id ?? null },
    );

    return NextResponse.json({ submission });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'failed to submit form';
    const status = /not found|not published/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
