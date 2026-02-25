import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id: staffId } = await context!.params!

  if (!staffId) {
    return NextResponse.json(
      { error: 'Staff ID is required' },
      { status: 400, headers: corsHeaders }
    )
  }

  // Query for the specific staff member
  const { data: staff, error } = await auth.supabase
    .from('staff')
    .select(
      `
      *,
      category:employment_categories(id, category_name),
      institution:institutions(id, name),
      department:departments(id, department_name)
      `
    )
    .eq('id', staffId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Staff not found' },
        { status: 404, headers: corsHeaders }
      )
    }
    throw error
  }

  return NextResponse.json({ data: staff }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
