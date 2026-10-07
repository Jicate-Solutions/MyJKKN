export const dynamic = 'force-dynamic';

/**
 * GET    /api/hr/payroll/register/[runId]/signoff — both sign-off steps.
 * POST   /api/hr/payroll/register/[runId]/signoff — { stage, note } signs one step.
 * DELETE /api/hr/payroll/register/[runId]/signoff — { signoffId, reason } withdraws one.
 *
 * Migration 20271007161107. Every call goes to the database function with the
 * person's OWN session client: the function reads auth.uid() to name the
 * signer, and it is the real gate (stage key, college, generator, order, one
 * person per step). That is also why API keys are refused here — a signature
 * must belong to a signed-in person.
 *
 * A refusal answers { success: false, error } carrying the database's own
 * message, so the screen says exactly why (rule #27).
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  RegisterSignoffError,
  RegisterSignoffService,
} from '@/lib/services/hr/payroll/register-signoff-service';
import { REGISTER_SIGNOFF_STAGES, type RegisterSignoffStage } from '@/types/hr-register-signoff';

function refusal(err: unknown, fallback: string) {
  if (err instanceof RegisterSignoffError) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.status });
  }
  console.error('[Salary Register] sign-off error:', err);
  const message = err instanceof Error && err.message ? err.message : fallback;
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

async function readRunId(context?: { params?: Promise<Record<string, string>> }) {
  const params = await context?.params;
  return params?.runId ?? null;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

export const GET = withAuth(
  async (_request, auth, context) => {
    await connection();
    const runId = await readRunId(context);
    if (!runId) return NextResponse.json({ success: false, error: 'runId is required' }, { status: 400 });
    try {
      const status = await RegisterSignoffService.getStatus(auth.supabase, runId);
      return NextResponse.json({ success: true, data: status });
    } catch (err) {
      return refusal(err, 'Could not read the signatures on this register.');
    }
  },
  { requirePermission: 'hr.payroll.register.view', requiredPermission: 'read', allowApiKey: false },
);

export const POST = withAuth(
  async (request, auth, context) => {
    await connection();
    const runId = await readRunId(context);
    if (!runId) return NextResponse.json({ success: false, error: 'runId is required' }, { status: 400 });

    const body = await readBody(request);
    const stage = body.stage;
    if (typeof stage !== 'string' || !REGISTER_SIGNOFF_STAGES.includes(stage as RegisterSignoffStage)) {
      return NextResponse.json(
        { success: false, error: 'stage must be college_check or accounts_sign.' },
        { status: 400 },
      );
    }
    const rawNote = typeof body.note === 'string' ? body.note.trim() : '';
    if (rawNote.length > 1000) {
      return NextResponse.json({ success: false, error: 'The note can be at most 1000 characters.' }, { status: 400 });
    }

    try {
      const result = await RegisterSignoffService.sign(
        auth.supabase,
        runId,
        stage as RegisterSignoffStage,
        rawNote || null,
      );
      return NextResponse.json({ success: true, data: result });
    } catch (err) {
      return refusal(err, 'Could not sign this register.');
    }
  },
  { requirePermission: 'hr.payroll.register.view', requiredPermission: 'write', allowApiKey: false },
);

export const DELETE = withAuth(
  async (request, auth, context) => {
    await connection();
    const runId = await readRunId(context);
    if (!runId) return NextResponse.json({ success: false, error: 'runId is required' }, { status: 400 });

    const body = await readBody(request);
    const signoffId = typeof body.signoffId === 'string' ? body.signoffId : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!signoffId) {
      return NextResponse.json({ success: false, error: 'signoffId is required.' }, { status: 400 });
    }
    if (reason.length < 10) {
      return NextResponse.json(
        { success: false, error: 'Give a reason of at least 10 characters for withdrawing the signature.' },
        { status: 400 },
      );
    }

    try {
      const result = await RegisterSignoffService.revoke(auth.supabase, signoffId, reason);
      return NextResponse.json({ success: true, data: result });
    } catch (err) {
      return refusal(err, 'Could not withdraw this signature.');
    }
  },
  { requirePermission: 'hr.payroll.register.view', requiredPermission: 'write', allowApiKey: false },
);
