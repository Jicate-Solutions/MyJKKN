import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProblemBankService } from '@/lib/services/startup-studio/problem-bank-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const theme = getStringParam(url, 'theme')
  const status = getStringParam(url, 'status')
  const event_id = getUuidParam(url, 'event_id')
  const min_severity = getStringParam(url, 'min_severity')
  const search = getStringParam(url, 'search')

  const result = await ProblemBankService.getProblems({
    page,
    limit,
    theme: theme as any,
    status: status as any,
    event_id,
    institution_id: auth.institutionId ?? undefined,
    min_severity: min_severity ? parseInt(min_severity, 10) : undefined,
    search,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!body.title || !body.problem_statement) {
    return errorResponse('title and problem_statement are required', 400)
  }

  const result = await ProblemBankService.createProblem(body)
  return createdResponse(result)
})
