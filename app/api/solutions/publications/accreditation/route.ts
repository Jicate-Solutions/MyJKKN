import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { PublicationsService } from '@/lib/services/solutions/publications-service'
import { successApiResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const type = getStringParam(url, 'type') as 'nirf' | 'naac' | undefined

  const result = await PublicationsService.getAccreditationMetrics(type)
  return successApiResponse(result)
}, { requiredPermission: 'read' })
