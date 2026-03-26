import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { KpiService } from '@/lib/services/startup-studio/kpi-service'
import { createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  if (!body.period_start) return errorResponse('period_start is required', 400)
  if (!body.period_end) return errorResponse('period_end is required', 400)
  if (body.value === undefined || body.value === null) return errorResponse('value is required', 400)

  const result = await KpiService.recordMeasurement(id, {
    period_start: body.period_start,
    period_end: body.period_end,
    value: body.value,
    notes: body.notes,
    data_source: body.data_source,
    institution_id: body.institution_id || auth.institutionId || undefined,
  })

  return createdResponse(result)
})
