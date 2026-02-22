// POST /api/admission/campaigns/segments/preview
// Preview segment: returns count + sample leads

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppSegmentService } from '@/lib/services/whatsapp/whatsapp-segment-service';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { institution_id, criteria, logic } = body;

    if (!institution_id || !criteria) {
      return NextResponse.json(
        { error: 'institution_id and criteria are required' },
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

    const result = await WhatsAppSegmentService.previewSegment(
      institution_id,
      criteria,
      logic || 'AND'
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/campaigns/segments/preview] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to preview segment' },
      { status: 500 }
    );
  }
}
