export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { WorkPulseService } from '@/lib/services/work-pulse/work-pulse-service';
import { AdminPulseFilters } from '@/types/work-pulse';

const ADMIN_ROLES = ['super_admin', 'administrator'];

/** GET /api/work-pulse/admin?page=1&limit=20&search=...&institution_id=...&... */
export async function GET(request: NextRequest) {
  await connection();

  const { profile, error: authError } = await getEnhancedUserProfile();
  if (authError || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!ADMIN_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;

  const filters: AdminPulseFilters = {
    page: parseInt(params.get('page') || '1'),
    limit: parseInt(params.get('limit') || '20'),
    search: params.get('search') || undefined,
    institution_id: params.get('institution_id') || undefined,
    department_id: params.get('department_id') || undefined,
    role: params.get('role') || undefined,
    talent_waste_category: params.get('talent_waste_category') || undefined,
    repetition_category: params.get('repetition_category') || undefined,
    week_of: params.get('week_of') || undefined,
    date_from: params.get('date_from') || undefined,
    date_to: params.get('date_to') || undefined,
  };

  try {
    const result = await WorkPulseService.getAllPulseEntries(filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[work-pulse/admin]', error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }
}
