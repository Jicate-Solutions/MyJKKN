// app/api/api-management/okr/objectives/[id]/route.ts
// External API for single OKR Objective by ID

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id } = await context!.params!

  // Fetch objective with all related data
  const { data, error } = await (auth.supabase as any)
    .from('okr_objectives')
    .select(`
      *,
      owner:auth.users!owner_id(id, email, raw_user_meta_data),
      parent_objective:okr_objectives!parent_objective_id(id, title, overall_progress),
      institution:institutions(id, name),
      department:departments(id, department_name),
      key_results:okr_key_results(*),
      dependencies:okr_dependencies(*),
      tasks:okr_tasks(*),
      risks:okr_risks(*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Objective not found' },
        { status: 404, headers: corsHeaders }
      )
    }
    throw error
  }

  return NextResponse.json({ data }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
