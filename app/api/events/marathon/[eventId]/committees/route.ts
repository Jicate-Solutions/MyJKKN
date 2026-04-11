// POST /api/events/marathon/[eventId]/committees — Create committee
// PATCH /api/events/marathon/[eventId]/committees — Update committee (id in body)
// Uses service role client to bypass RLS for event coordinators

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const body = await req.json();

    // Verify the caller is authenticated
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const insertPayload = {
      event_id: eventId,
      name: body.name,
      description: body.description ?? null,
      lead_id: body.lead_id ?? null,
      lead_name: body.lead_name ?? null,
      member_ids: body.member_ids ?? [],
      member_names: body.member_names ?? [],
      status: 'active',
    };

    const { data, error } = await supabase
      .from('marathon_committees')
      .insert([insertPayload])
      .select('*')
      .single();

    if (error) {
      console.error('[committees-api] Create error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[committees-api] POST error:', error);
    return NextResponse.json({ error: error.message ?? 'Internal error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid or empty request body' }, { status: 400 });
    }

    const { id, ...updateFields } = body;

    if (!id) {
      return NextResponse.json({ error: 'Committee ID required' }, { status: 400 });
    }

    // Verify the caller is authenticated
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Strip any joined/computed fields
    const { tasks, ...cleanPayload } = updateFields;

    const { data, error } = await supabase
      .from('marathon_committees')
      .update(cleanPayload)
      .eq('id', id)
      .eq('event_id', eventId)
      .select('*')
      .single();

    if (error) {
      console.error('[committees-api] Update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[committees-api] PUT error:', error);
    return NextResponse.json({ error: error.message ?? 'Internal error' }, { status: 500 });
  }
}

// PATCH alias — calls the same handler as PUT
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  return PUT(req, context);
}
