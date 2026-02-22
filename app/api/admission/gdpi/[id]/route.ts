// app/api/admission/gdpi/[id]/route.ts
// GET    /api/admission/gdpi/:id — Get session details
// PUT    /api/admission/gdpi/:id — Update session
// DELETE /api/admission/gdpi/:id — Delete session

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { GDPIService } from '@/lib/services/admission/gdpi-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(
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
    const session = await GDPIService.getSession(id);

    if (!session) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    logger.error('admission/gdpi', 'GET session detail error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
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

    const session = await GDPIService.updateSession(id, body);

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    logger.error('admission/gdpi', 'PUT session error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    await GDPIService.deleteSession(id);

    return NextResponse.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    logger.error('admission/gdpi', 'DELETE session error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
