// POST /api/admission/calls/log — Log a manual call OR a counselor lead update.
// Phase 1 consolidation (2026-05-12): accepts update_only=true to skip the
// admission_call_logs.insert and write only the lead update + a note activity.
// Also accepts manual_stage, is_hot_lead, is_priority, tags for unified UX.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { TelephonyService } from '@/lib/services/telephony/telephony-service';
import type { LogCallInput } from '@/lib/services/telephony/telephony-service';
import { ALLOWED_STAGE_TRANSITIONS } from '@/lib/services/admission/lead-service';
import type { FunnelStage } from '@/types/admission';
import { logger } from '@/lib/utils/enhanced-logger';

const TAG_MAX_COUNT = 20;
const TAG_MAX_LEN = 30;

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // ── Required fields differ for update_only vs call mode ──
    // Call mode: lead_id + institution_id + call_outcome + phone_called all required.
    // Update-only: phone_called and call_outcome are not meaningful — only lead_id +
    // institution_id are required. We still send a default call_outcome to satisfy
    // the LogCallInput type contract (server-side branch B ignores it).
    const isUpdateOnly = body.update_only === true;
    if (!body.lead_id || !body.institution_id) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'lead_id and institution_id are required' },
        { status: 400 }
      );
    }
    if (!isUpdateOnly && (!body.call_outcome || !body.phone_called)) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'call_outcome and phone_called are required for call mode' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // ── Validate manual_stage transition (defense-in-depth — UI already filters) ──
    // 2026-05-30 (BUG-004110/004111): replaced the hardcoded per-stage matrix
    // with a "target is an active lead status" check, matching
    // LeadService.updateStage. The static matrix rejected legitimate moves among
    // the 26 active admission_statuses(scope='lead') rows.
    let validatedManualStage: string | null = null;
    if (body.manual_stage) {
      const { data: curLead } = await supabase
        .from('admission_leads')
        .select('funnel_stage')
        .eq('id', body.lead_id)
        .single();
      const currentStage = (curLead?.funnel_stage || 'new') as FunnelStage;
      if (body.manual_stage !== currentStage) {
        const { data: activeStatuses } = await supabase
          .from('admission_statuses')
          .select('code')
          .eq('scope', 'lead')
          .eq('is_active', true);
        const validCodes = new Set<string>(
          (activeStatuses ?? []).map((s: any) => s.code as string),
        );
        const known =
          validCodes.size > 0
            ? validCodes.has(body.manual_stage)
            : Object.prototype.hasOwnProperty.call(ALLOWED_STAGE_TRANSITIONS, body.manual_stage);
        if (!known) {
          return NextResponse.json(
            { error: 'INVALID_TRANSITION', message: `"${body.manual_stage}" is not an active lead status` },
            { status: 422 }
          );
        }
      }
      validatedManualStage = body.manual_stage !== currentStage ? body.manual_stage : null;
    }

    // ── Validate tags (max 20 items, each ≤ 30 chars, all strings) ──
    let validatedTags: string[] | undefined;
    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags)) {
        return NextResponse.json(
          { error: 'VALIDATION_ERROR', message: 'tags must be an array' },
          { status: 400 }
        );
      }
      if (body.tags.length > TAG_MAX_COUNT) {
        return NextResponse.json(
          { error: 'VALIDATION_ERROR', message: `tags array cannot exceed ${TAG_MAX_COUNT} items` },
          { status: 400 }
        );
      }
      validatedTags = [];
      const seen = new Set<string>();
      for (const t of body.tags) {
        if (typeof t !== 'string') {
          return NextResponse.json(
            { error: 'VALIDATION_ERROR', message: 'tags must be strings' },
            { status: 400 }
          );
        }
        const trimmed = t.trim();
        if (!trimmed) continue;
        if (trimmed.length > TAG_MAX_LEN) {
          return NextResponse.json(
            { error: 'VALIDATION_ERROR', message: `tag "${trimmed.slice(0, 20)}…" exceeds ${TAG_MAX_LEN} characters` },
            { status: 400 }
          );
        }
        const lower = trimmed.toLowerCase();
        if (seen.has(lower)) continue; // dedupe
        seen.add(lower);
        validatedTags.push(trimmed);
      }
    }

    const input: LogCallInput = {
      lead_id: body.lead_id,
      institution_id: body.institution_id,
      counselor_id: user.id,
      phone_called: body.phone_called || '',
      // In update-only mode call_outcome is ignored by the service; default to satisfy type.
      call_outcome: body.call_outcome || 'connected',
      interest_level: body.interest_level,
      next_action: body.next_action,
      call_notes: body.call_notes,
      follow_up_date: body.follow_up_date,
      follow_up_time: body.follow_up_time,
      suggested_stage: body.suggested_stage,
      accept_stage_change: body.accept_stage_change,
      // ── Phase 1 fields ──
      update_only: isUpdateOnly,
      manual_stage: validatedManualStage,
      is_hot_lead: typeof body.is_hot_lead === 'boolean' ? body.is_hot_lead : undefined,
      is_priority: typeof body.is_priority === 'boolean' ? body.is_priority : undefined,
      tags: validatedTags,
    };

    const result = await TelephonyService.logManualCall(input, supabase);

    logger.info('admission/calls', isUpdateOnly ? 'Counselor lead update logged' : 'Manual call logged', {
      lead_id: body.lead_id,
      mode: isUpdateOnly ? 'update_only' : 'call',
      outcome: isUpdateOnly ? null : body.call_outcome,
      manual_stage: validatedManualStage,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('admission/calls', 'Failed to log manual call', error);
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Failed to log call' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
