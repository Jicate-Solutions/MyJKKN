// app/api/admission/gdpi/[id]/scores/route.ts
// GET  — Get all scores for a session
// POST — Submit scores for a candidate

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
    const results = await GDPIService.getSessionResults(id);

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    logger.error('admission/gdpi', 'GET scores error', error);
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

    const body = await request.json();
    const { candidate_id, scores } = body;

    if (!candidate_id) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'candidate_id is required' },
        { status: 400 }
      );
    }

    if (!scores || !Array.isArray(scores) || scores.length === 0) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'scores array is required' },
        { status: 400 }
      );
    }

    // Validate each score
    for (const score of scores) {
      if (!score.criterion || typeof score.score !== 'number') {
        return NextResponse.json(
          { error: 'VALIDATION_ERROR', message: 'Each score must have criterion and numeric score' },
          { status: 400 }
        );
      }
      if (score.score < 1 || score.score > 10) {
        return NextResponse.json(
          { error: 'VALIDATION_ERROR', message: 'Scores must be between 1 and 10' },
          { status: 400 }
        );
      }
    }

    const savedScores = await GDPIService.scoreCandidate(
      candidate_id,
      user.id,
      scores
    );

    return NextResponse.json(
      { success: true, data: savedScores },
      { status: 201 }
    );
  } catch (error) {
    logger.error('admission/gdpi', 'POST scores error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
