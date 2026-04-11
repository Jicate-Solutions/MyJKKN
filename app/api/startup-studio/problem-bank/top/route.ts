import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProblemBankService } from '@/lib/services/startup-studio/problem-bank-service'
import { successApiResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const limitParam = getStringParam(url, 'limit')
  const limit = limitParam ? parseInt(limitParam, 10) : 10

  const result = await ProblemBankService.getTopProblems(limit)
  return successApiResponse(result)
}, { requiredPermission: 'read' })
