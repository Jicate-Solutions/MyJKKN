// GET /api/admission/chat/consent?lead_id={id}
// POST /api/admission/chat/consent — Grant or revoke consent
// Gap 2 — Opt-in Consent Tracking

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppConsentService } from '@/lib/services/whatsapp/whatsapp-consent-service';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const leadId = request.nextUrl.searchParams.get('lead_id');
    if (!leadId) {
      return NextResponse.json({ error: 'lead_id is required' }, { status: 400 });
    }

    const status = await WhatsAppConsentService.checkConsent(leadId);
    const log = await WhatsAppConsentService.getConsentLog(leadId);

    return NextResponse.json({
      data: {
        ...status,
        log,
      },
    });
  } catch (error) {
    console.error('[chat/consent] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { lead_id, institution_id, action, source, performed_by } = body;

    if (!lead_id || !institution_id || !action) {
      return NextResponse.json(
        { error: 'lead_id, institution_id, and action are required' },
        { status: 400 }
      );
    }

    if (action !== 'opt_in' && action !== 'opt_out') {
      return NextResponse.json(
        { error: 'action must be "opt_in" or "opt_out"' },
        { status: 400 }
      );
    }

    if (action === 'opt_in') {
      await WhatsAppConsentService.grantConsent({
        leadId: lead_id,
        institutionId: institution_id,
        source: source || 'manual',
        performedBy: performed_by || user.id,
      });
    } else {
      await WhatsAppConsentService.revokeConsent({
        leadId: lead_id,
        institutionId: institution_id,
        source: source || 'manual',
        performedBy: performed_by || user.id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[chat/consent] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
