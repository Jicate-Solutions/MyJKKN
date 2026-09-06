// app/api/meetings/triggers/decision/route.ts
// ============================================================================
// Auto-accountability-meeting engine — PR1b Director judgment endpoint.
//
// POST { event_id, decision: 'skip' | 'meet' }
//   skip → event 'dismissed'; meet → event 'meeting_pending' (PR1c books it).
//
// Director-only (decision #7): super-admin gate. The decision UI/console is a
// follow-up (PR4); this endpoint is the authoritative action the console (or a
// direct call) drives.
// ============================================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { decideOnEvent } from '@/lib/services/meetings/meeting-trigger-service';

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Director-only gate (super-admin / admin).
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();
    const isAdmin =
      profile?.is_super_admin === true ||
      profile?.role === 'super_admin' ||
      profile?.role === 'admin';
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const event_id: string | undefined = body?.event_id;
    const decision: string | undefined = body?.decision;
    if (!event_id || (decision !== 'skip' && decision !== 'meet')) {
      return NextResponse.json(
        { error: 'event_id and decision ("skip" | "meet") are required' },
        { status: 400 }
      );
    }

    const result = await decideOnEvent({
      eventId: event_id,
      decision,
      deciderId: user.id
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, status: result.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
