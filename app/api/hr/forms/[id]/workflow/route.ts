/**
 * PUT /api/hr/forms/[id]/workflow
 *
 * Save a draft approval workflow for a form. RLS gates write access to
 * super_admin / admin only (see migration 20260613_hr_forms_substrate.sql).
 *
 * Body: { steps: ApprovalWorkflowStep[], reason: string }
 *
 * The new workflow lands in `draft_approval_workflow` — `publishForm()`
 * promotes it to the live column on publish.
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
import type { ApprovalWorkflowStep } from '@/types/hr-forms';

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

export async function PUT(
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

    if (!body || !Array.isArray(body.steps)) {
      return NextResponse.json(
        { error: "missing 'steps' array in body" },
        { status: 400 },
      );
    }
    if (typeof body.reason !== 'string' || !body.reason.trim()) {
      return NextResponse.json(
        { error: "missing 'reason' string for audit trail" },
        { status: 400 },
      );
    }

    // Light shape validation — full schema validation deferred to follow-up.
    for (const step of body.steps as ApprovalWorkflowStep[]) {
      if (typeof step.order !== 'number' || step.order < 1) {
        return NextResponse.json(
          { error: 'every step needs a numeric order >= 1' },
          { status: 400 },
        );
      }
      if (typeof step.label !== 'string' || !step.label.trim()) {
        return NextResponse.json(
          { error: 'every step needs a non-empty label' },
          { status: 400 },
        );
      }
      if (typeof step.required_role !== 'string' || !step.required_role.trim()) {
        return NextResponse.json(
          { error: 'every step needs a required_role role_key' },
          { status: 400 },
        );
      }
    }

    const updated = await formBuilderService.updateFormWorkflow(
      supabase,
      id,
      body.steps as ApprovalWorkflowStep[],
      body.reason,
    );

    return NextResponse.json({ form: updated });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'failed to save workflow';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
