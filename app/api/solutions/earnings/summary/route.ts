import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { EarningsService } from '@/lib/services/solutions/earnings-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const result = await EarningsService.getEarningsSummary()
  return successApiResponse(result)
}, { requiredPermission: 'read' })
