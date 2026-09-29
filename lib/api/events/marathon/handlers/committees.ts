// POST /api/events/marathon/[eventId]/committees — Create committee
// PATCH /api/events/marathon/[eventId]/committees — Update committee (id in body)
// Uses service role client to bypass RLS for event coordinators — so the
// caller's authority is checked here, before any write (2026-09-18). The old
// check was `const user = await getAuthUser(); if (!user)`: getAuthUser()
// returns {user, error}, never null, so it passed everyone, signed out included.

import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
  getAuthUser,
} from '@/lib/supabase/server';
import { canManageEventOps } from '@/lib/services/events/shared/event-manage-access';

/** 401/403 response when the caller may not manage this event's committees, else null. */
async function denyUnlessManager(eventId: string): Promise<NextResponse | null> {
  const { user } = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const allowed = await canManageEventOps(
    { auth: (await createServerSupabaseClient()) as any, svc: createServiceRoleClient(), userId: user.id },
    eventId
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "You don't have permission to manage this event's committees" },
      { status: 403 }
    );
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const body = await req.json();

    const denied = await denyUnlessManager(eventId);
    if (denied) return denied;

    const supabase = createServiceRoleClient();

    const insertPayload = {
      event_id: eventId,
      name: body.name,
      description: body.description ?? null,
      lead_id: body.lead_id ?? null,
      lead_name: body.lead_name ?? null,
      member_ids: body.member_ids ?? [],
      member_names: body.member_names ?? [],
      external_members: body.external_members ?? [],
      status: 'active',
    };

    const { data, error } = await supabase
      // Events Platform Promotion PR3: marathon_committees → event_committees
      .from('event_committees')
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

    const denied = await denyUnlessManager(eventId);
    if (denied) return denied;

    const supabase = createServiceRoleClient();

    // Strip any joined/computed fields
    const { tasks, ...cleanPayload } = updateFields;

    const { data, error } = await supabase
      // Events Platform Promotion PR3: marathon_committees → event_committees
      .from('event_committees')
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
