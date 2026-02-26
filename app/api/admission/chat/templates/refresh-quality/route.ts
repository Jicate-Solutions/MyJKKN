// POST /api/admission/chat/templates/refresh-quality
// Refresh quality ratings for all WhatsApp templates from Meta API

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppTemplateService } from '@/lib/services/whatsapp/whatsapp-template-service';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { institution_id } = body;

    if (!institution_id) {
      return NextResponse.json(
        { error: 'institution_id is required' },
        { status: 400 }
      );
    }

    // Verify institution access
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    if (profile?.institution_id !== institution_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const updated = await WhatsAppTemplateService.refreshAllQualityRatings(institution_id);

    return NextResponse.json({ updated });
  } catch (error) {
    console.error('[chat/templates/refresh-quality] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
