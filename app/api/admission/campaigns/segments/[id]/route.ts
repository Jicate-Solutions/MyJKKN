// GET /api/admission/campaigns/segments/[id] — single segment
// PUT /api/admission/campaigns/segments/[id] — update segment
// DELETE /api/admission/campaigns/segments/[id] — delete segment

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppSegmentService } from '@/lib/services/whatsapp/whatsapp-segment-service';

export async function GET(
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

    return NextResponse.json({ segment });
  } catch (error) {
    console.error('[api/campaigns/segments/[id]] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch segment' },
      { status: 500 }
    );
  }
}

export async function PUT(
  _req: NextRequest,
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

    const existing = await WhatsAppSegmentService.getSegment(id);
    if (!existing) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }
    if (existing.institution_id !== profile?.institution_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await _req.json();
    const { name, description, criteria, logic, is_active } = body;

    const segment = await WhatsAppSegmentService.updateSegment(id, {
      name,
      description,
      criteria,
      logic,
      is_active,
    });

    return NextResponse.json({ segment });
  } catch (error) {
    console.error('[api/campaigns/segments/[id]] PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update segment' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
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

    const existing = await WhatsAppSegmentService.getSegment(id);
    if (!existing) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }
    if (existing.institution_id !== profile?.institution_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await WhatsAppSegmentService.deleteSegment(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/campaigns/segments/[id]] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete segment' },
      { status: 500 }
    );
  }
}
