import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FinanceService } from '@/lib/services/startup-studio/finance-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const status = getStringParam(url, 'status')
  const audit_type = getStringParam(url, 'audit_type')
  const institution_id = getStringParam(url, 'institution_id')

  const data = await FinanceService.getAuditRecords({ status, audit_type, institution_id })
  return successApiResponse(data)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!body.audit_type) {
    return errorResponse('audit_type is required', 400)
  }
  if (!body.audit_period_start) {
    return errorResponse('audit_period_start is required', 400)
  }
  if (!body.audit_period_end) {
    return errorResponse('audit_period_end is required', 400)
  }

  const result = await FinanceService.createAuditRecord(body)
  return createdResponse(result)
})
