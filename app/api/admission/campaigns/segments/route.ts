// GET /api/admission/campaigns/segments — list segments
// POST /api/admission/campaigns/segments — create segment

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppSegmentService } from '@/lib/services/whatsapp/whatsapp-segment-service';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const institutionId = searchParams.get('institution_id');
    const isActiveParam = searchParams.get('is_active');

    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;
    const segments = await WhatsAppSegmentService.getSegments(institutionId, isActive);

    return NextResponse.json({ segments });
  } catch (error) {
    console.error('[api/campaigns/segments] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch segments' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { institution_id, name, description, criteria, logic, created_by } = body;

    if (!institution_id || !name || !criteria) {
      return NextResponse.json(
        { error: 'institution_id, name, and criteria are required' },
        { status: 400 }
      );
    }

    const segment = await WhatsAppSegmentService.createSegment({
      institution_id,
      name,
      description,
      criteria,
      logic: logic || 'AND',
      created_by: created_by || user.id,
    });

    return NextResponse.json({ segment }, { status: 201 });
  } catch (error) {
    console.error('[api/campaigns/segments] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create segment' },
      { status: 500 }
    );
  }
}
