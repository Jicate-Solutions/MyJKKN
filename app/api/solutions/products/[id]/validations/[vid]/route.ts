import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProductsService } from '@/lib/services/solutions/products-service'
import { successApiResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { vid } = await context!.params!
  const body = await request.json()
  const { id: _id, product_id, created_by, created_at, ...safeBody } = body
  const result = await ProductsService.updateValidation(vid, safeBody)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { vid } = await context!.params!
  await ProductsService.deleteValidation(vid)
  return noContentResponse()
})
