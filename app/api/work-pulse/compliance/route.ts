import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { WorkPulseService } from '@/lib/services/work-pulse/work-pulse-service';

const COMPLIANCE_ROLES = ['hod', 'principal', 'super_admin', 'administrator'];

/** GET /api/work-pulse/compliance?institution_id=... */
export async function GET(request: NextRequest) {
  await connection();

  const { profile, error: authError } = await getEnhancedUserProfile();
  if (authError || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!COMPLIANCE_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const institutionId =
    request.nextUrl.searchParams.get('institution_id') || profile.institution_id;

  if (!institutionId) {
    return NextResponse.json({ error: 'Missing institution_id' }, { status: 400 });
  }

  try {
    const data = await WorkPulseService.getComplianceData(institutionId);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[work-pulse/compliance]', error);
    return NextResponse.json({ error: 'Failed to fetch compliance' }, { status: 500 });
  }
}
