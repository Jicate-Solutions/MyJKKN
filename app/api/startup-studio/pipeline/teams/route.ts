import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { PipelineService, type PipelineStage } from '@/lib/services/startup-studio/pipeline-service';
import { successApiResponse, errorResponse } from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

const VALID_STAGES: PipelineStage[] = ['appathon', 'sarvam_galatta', 'solve_for_100', 'nif'];

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export const GET = withAuth(async (request) => {
  const { searchParams } = new URL(request.url);
  const stage = searchParams.get('stage') as PipelineStage | null;

  if (!stage || !VALID_STAGES.includes(stage)) {
    return errorResponse('Invalid stage. Must be one of: ' + VALID_STAGES.join(', '), 400);
  }

  const teams = await PipelineService.getTeamsAtStage(stage);
  return successApiResponse({ stage, teams });
}, { requiredPermission: 'read' });
