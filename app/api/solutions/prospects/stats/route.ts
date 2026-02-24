import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProspectsService } from '@/lib/services/solutions/prospects-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const result = await ProspectsService.getProspectStats()
  return successApiResponse(result)
}, { requiredPermission: 'read' })
