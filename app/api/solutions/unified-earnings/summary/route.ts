import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { UnifiedEarningsService } from '@/lib/services/solutions/unified-earnings-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const userId = auth.user.id
  const result = await UnifiedEarningsService.getEarningsSummary(userId)
  return successApiResponse(result)
}, { requiredPermission: 'read' })
