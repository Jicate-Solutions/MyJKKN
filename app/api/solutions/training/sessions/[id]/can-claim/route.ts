import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { TrainingService } from '@/lib/services/solutions/training-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (_request, auth, context) => {
  const { id } = await context!.params!

  const result = await TrainingService.canSelfClaimSession(id)

  return successApiResponse({ canClaim: result })
}, { requiredPermission: 'read' })
