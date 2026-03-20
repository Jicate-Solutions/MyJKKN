import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ParadigmShiftService } from '@/lib/services/solutions/paradigm-shift-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const params = await context?.params
  const departmentId = params?.departmentId
  if (!departmentId) {
    return errorResponse('Department ID is required', 400)
  }

  const result = await ParadigmShiftService.runWithClient(auth.supabase, () =>
    ParadigmShiftService.getDepartmentDetail(departmentId)
  )

  if (!result) {
    return errorResponse('Department not found', 404)
  }

  return successApiResponse(result)
}, { requiredPermission: 'read' })
