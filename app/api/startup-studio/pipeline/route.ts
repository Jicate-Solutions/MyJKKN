import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { PipelineService } from '@/lib/services/startup-studio/pipeline-service';
import { successApiResponse } from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export const GET = withAuth(async () => {
  const summary = await PipelineService.getSummary();
  return successApiResponse(summary);
}, { requiredPermission: 'read' });
