import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { PipelineService } from '@/lib/services/startup-studio/pipeline-service';
import { successApiResponse } from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export const GET = withAuth(async (request) => {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : 20;

  const activity = await PipelineService.getRecentActivity(limit);
  return successApiResponse({ activity });
}, { requiredPermission: 'read' });
