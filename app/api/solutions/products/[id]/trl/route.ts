import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProductsService } from '@/lib/services/solutions/products-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  if (!body.current_trl || typeof body.current_trl !== 'number') {
    return errorResponse('current_trl (number 1-9) is required', 400)
  }

  const result = await ProductsService.updateTRL(
    id,
    body.current_trl,
    body.assessed_by ?? auth.user.id
  )

  return successApiResponse(result)
})
