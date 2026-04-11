import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { GraduationService } from '@/lib/services/startup-studio/graduation-service'
import { successApiResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const yearStr = getStringParam(url, 'year')
  const year = yearStr ? parseInt(yearStr, 10) : undefined

  const result = await GraduationService.getAlumniMetrics(
    year && !isNaN(year) ? year : undefined
  )
  return successApiResponse(result)
}, { requiredPermission: 'read' })
