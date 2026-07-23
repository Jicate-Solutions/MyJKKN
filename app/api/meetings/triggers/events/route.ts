// app/api/meetings/triggers/events/route.ts
// ============================================================================
// Auto-accountability-meeting engine — PR4 console: recent breach events.
//   GET ?limit=N → newest breach events (college, rate, status, explanation).
// Director-only (super-admin / admin gate). Used to refresh the console after
// a skip/meet decision.
// ============================================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { listRecentTriggerEvents } from '@/lib/services/meetings/meeting-trigger-service';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();
    const isAdmin =
      (profile as any)?.is_super_admin === true ||
      (profile as any)?.role === 'super_admin' ||
      (profile as any)?.role === 'admin';
    if (!isAdmin)
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );

    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 30, 100) : 30;
    const events = await listRecentTriggerEvents({ limit });
    return NextResponse.json({ events });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
