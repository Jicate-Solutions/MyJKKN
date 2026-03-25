// GET /api/admission/chat/consent/stats?institution_id={id}
// Gap 2 — Consent Statistics

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

    let institutionId = request.nextUrl.searchParams.get('institution_id');

    // If not provided, use user's institution
    if (!institutionId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();

      if (!profile?.institution_id) {
        return NextResponse.json({ error: 'No institution assigned' }, { status: 403 });
      }
      institutionId = profile.institution_id;
    }

    const stats = await WhatsAppConsentService.getConsentStats(institutionId);

    return NextResponse.json({ data: stats });
  } catch (error) {
    console.error('[chat/consent/stats] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
