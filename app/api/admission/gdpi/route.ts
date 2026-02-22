// app/api/admission/gdpi/route.ts
// GET  /api/admission/gdpi — List GD-PI sessions
// POST /api/admission/gdpi — Create a new session

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { GDPIService, type GDPISessionFilters, type GDPISessionType, type GDPISessionStatus } from '@/lib/services/admission/gdpi-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const institution_id = searchParams.get('institution_id');

    if (!institution_id) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'institution_id is required' },
        { status: 400 }
      );
    }

    const filters: GDPISessionFilters = {
      type: (searchParams.get('type') as GDPISessionType) || undefined,
      status: (searchParams.get('status') as GDPISessionStatus) || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      search: searchParams.get('search') || undefined,
    };

    const sessions = await GDPIService.getSessions(institution_id, filters);

    return NextResponse.json({ success: true, data: sessions });
  } catch (error) {
    logger.error('admission/gdpi', 'GET sessions error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { institution_id, type, title, scheduled_at, duration_minutes, venue, topic, max_candidates, notes } = body;

    if (!institution_id || !type || !title || !scheduled_at) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'institution_id, type, title, and scheduled_at are required' },
        { status: 400 }
      );
    }

    if (!['gd', 'pi'].includes(type)) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'type must be "gd" or "pi"' },
        { status: 400 }
      );
    }

    const session = await GDPIService.createSession({
      institution_id,
      type,
      title,
      scheduled_at,
      duration_minutes,
      venue,
      topic,
      max_candidates,
      notes,
      created_by: user.id,
    });

    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (error) {
    logger.error('admission/gdpi', 'POST session error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
