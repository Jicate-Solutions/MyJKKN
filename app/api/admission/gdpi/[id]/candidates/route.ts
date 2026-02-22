// app/api/admission/gdpi/[id]/candidates/route.ts
// GET  — List candidates for a session
// POST — Add candidates to a session

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { GDPIService } from '@/lib/services/admission/gdpi-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const session = await GDPIService.getSession(id);

    if (!session) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: session.candidates || [],
    });
  } catch (error) {
    logger.error('admission/gdpi', 'GET candidates error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { lead_ids } = body;

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'lead_ids array is required' },
        { status: 400 }
      );
    }

    const candidates = await GDPIService.addCandidates(id, lead_ids);

    return NextResponse.json(
      { success: true, data: candidates },
      { status: 201 }
    );
  } catch (error) {
    logger.error('admission/gdpi', 'POST candidates error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
