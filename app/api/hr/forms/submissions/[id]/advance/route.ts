/**
 * POST /api/hr/forms/submissions/[id]/advance
 *
 * Advance a submission through its workflow. Action = 'approve' or 'reject',
 * reason is mandatory and lands in approval_history.
 *
 * Body: { action: 'approve' | 'reject', reason: string }
 *
 * RLS allows: super_admin / admin / same-institution HR officers to UPDATE.
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

    if (!body || (body.action !== 'approve' && body.action !== 'reject')) {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 },
      );
    }
    if (typeof body.reason !== 'string' || !body.reason.trim()) {
      return NextResponse.json(
        { error: 'reason is required' },
        { status: 400 },
      );
    }

    const submission = await formBuilderService.advanceSubmission(
      supabase,
      id,
      body.action,
      body.reason,
    );

    return NextResponse.json({ submission });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'failed to advance submission';
    const status = /not found/i.test(message)
      ? 404
      : /already/i.test(message)
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
