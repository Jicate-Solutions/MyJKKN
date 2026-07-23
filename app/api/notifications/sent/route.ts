// app/api/notifications/sent/route.ts
//
// GET /api/notifications/sent?page=1&limit=25&search=foo&includeSystem=false
//
// Returns notifications the authenticated user authored ("Sent folder").
// Excludes cron-generated work_items by default — those aren't "things you
// sent," they're things the platform sent under your UUID via SECURITY DEFINER
// functions. Toggle via ?includeSystem=true.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSentNotifications } from '@/lib/services/notification/sent-service';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const result = await getSentNotifications(supabase, user.id, {
      page: sp.get('page') ? parseInt(sp.get('page')!, 10) : 1,
      limit: sp.get('limit') ? parseInt(sp.get('limit')!, 10) : 25,
      includeSystem: sp.get('includeSystem') === 'true',
      search: sp.get('search') || undefined
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error fetching sent notifications:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
