// app/api/parent-portal/dashboard/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ParentSessionService } from '@/lib/services/parent-portal/parent-session-service';

export async function GET(request: NextRequest) {
  try {
    // Validate session - REQUIRED for all protected routes
    const parentId = await ParentSessionService.getCurrentParentId();

    if (!parentId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const supabase = await createClient();

    // Use the optimized database function to get complete dashboard data
    const { data, error } = await supabase.rpc('get_parent_dashboard', {
      p_parent_id: parentId,
    });

    if (error) {
      console.error('[parent-portal/dashboard] Database error:', error);
      throw error;
    }

    if (data?.error) {
      return NextResponse.json({ error: data.error }, { status: 404 });
    }

    // The database function returns the complete dashboard structure
    // including parent info, learners, unread_messages, and pending_surveys
    return NextResponse.json(data);
  } catch (error) {
    console.error('[parent-portal/dashboard] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
