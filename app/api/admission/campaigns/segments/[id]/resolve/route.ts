// POST /api/admission/campaigns/segments/[id]/resolve
// Resolve segment: returns all matching leads

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppSegmentService } from '@/lib/services/whatsapp/whatsapp-segment-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify institution access
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    const segment = await WhatsAppSegmentService.getSegment(id);
    if (!segment) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }
    if (segment.institution_id !== profile?.institution_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const result = await WhatsAppSegmentService.resolveSegment(id);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/campaigns/segments/[id]/resolve] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve segment' },
      { status: 500 }
    );
  }
}
