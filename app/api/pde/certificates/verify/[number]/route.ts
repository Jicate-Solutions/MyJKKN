

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/certificates/verify/[number] — PUBLIC endpoint (no auth)
// Lookup certificate by number, join with profiles + vac_courses for display
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> }
) {
  await connection();
  try {
    const supabase = await createClient();
    const { number: certNumber } = await params;

    if (!certNumber) {
      return NextResponse.json(
        { error: 'Certificate number is required' },
        { status: 400 }
      );
    }

    // Lookup certificate
    const { data: cert, error: certErr } = await (supabase as any)
      .from('pde_certificates')
      .select('*')
      .eq('certificate_number', certNumber)
      .single();

    if (certErr || !cert) {
      return NextResponse.json(
        { error: 'Certificate not found', valid: false },
        { status: 404 }
      );
    }

    // Fetch learner name from profiles
    let learnerName: string | null = null;
    try {
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('full_name')
        .eq('id', cert.learner_id)
        .single();
      if (profile) learnerName = profile.full_name;
    } catch {
      // Profile lookup failed — continue without name
    }

    // Fetch course name from vac_courses
    let courseName: string | null = null;
    try {
      const { data: course } = await (supabase as any)
        .from('vac_courses')
        .select('name')
        .eq('id', cert.course_id)
        .single();
      if (course) courseName = course.name;
    } catch {
      // Course lookup failed — continue without name
    }

    return NextResponse.json({
      valid: true,
      data: {
        certificate_number: cert.certificate_number,
        certificate_type: cert.certificate_type,
        issued_at: cert.issued_at,
        final_score: cert.final_score,
        completion_hours: cert.completion_hours,
        finks_profile: cert.finks_profile,
        capabilities_demonstrated: cert.capabilities_demonstrated,
        learner_name: learnerName,
        course_name: courseName,
      },
    });
  } catch (error: any) {
    console.error('Error verifying certificate:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
