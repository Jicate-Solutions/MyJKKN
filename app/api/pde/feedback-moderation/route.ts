/**
 * PDE Feedback Moderation — REST surface
 * ============================================================================
 *
 * Wires `pde.governance.feedback_identity_policy` (read via
 * `getFeedbackIdentityPolicy()`) to admin moderation actions on the
 * `pde_demonstrations.validator_notes` jsonb feedback stream.
 *
 *   GET  /api/pde/feedback-moderation
 *     → returns `{ items, policy }` — pending notes across all demonstrations.
 *       The `?institutionId=<uuid>` query param scopes the queue.
 *
 *   PATCH /api/pde/feedback-moderation
 *     → body: { demonstrationId: string, noteId: string,
 *               decision: 'approve'|'redact'|'reject', reason?: string }
 *     → returns the updated note.
 *
 * Auth pattern mirrors `app/api/pde/coordinators/can-onboard/route.ts`
 * — cookie SSR + getUser. RLS on `pde_demonstrations` is the hard layer;
 * the service is the soft layer that encodes the identity policy.
 *
 * Phase: PDE Tier 3 — 2026-05-19.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  PDEFeedbackModerationService,
  type ModerationDecision,
} from '@/lib/services/pde-feedback-moderation-service';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const institutionId = url.searchParams.get('institutionId');

    const result = await PDEFeedbackModerationService.listPendingFeedback(
      institutionId
    );
    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      demonstrationId?: string;
      noteId?: string;
      decision?: ModerationDecision;
      reason?: string | null;
    };

    if (!body.demonstrationId || typeof body.demonstrationId !== 'string') {
      return NextResponse.json(
        { error: 'demonstrationId is required (string)' },
        { status: 400 }
      );
    }
    if (!body.noteId || typeof body.noteId !== 'string') {
      return NextResponse.json(
        { error: 'noteId is required (string)' },
        { status: 400 }
      );
    }
    if (
      body.decision !== 'approve' &&
      body.decision !== 'redact' &&
      body.decision !== 'reject'
    ) {
      return NextResponse.json(
        { error: "decision must be 'approve' | 'redact' | 'reject'" },
        { status: 400 }
      );
    }

    const updated = await PDEFeedbackModerationService.moderateFeedback(
      body.demonstrationId,
      body.noteId,
      body.decision,
      user.id,
      body.reason ?? null
    );
    return NextResponse.json({ data: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
