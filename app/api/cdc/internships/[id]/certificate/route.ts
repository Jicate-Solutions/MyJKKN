// app/api/cdc/internships/[id]/certificate/route.ts
// CDC Sprint 4 — Issue certificate for a completed corporate internship

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { IssueCertificatePayload } from '@/types/cdc/internships';

/**
 * POST /api/cdc/internships/[id]/certificate
 * Body: IssueCertificatePayload
 * Precondition: internship status must be 'completed'
 * Effect: inserts a row in internship_certificates, which fires the
 *   trg_cdc_internship_cert_issued_notify trigger.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    const allowedRoles = ['cdc_head', 'cdc_coordinator', 'admin'];
    if (!profile?.is_super_admin && !allowedRoles.includes(profile?.role)) {
      return NextResponse.json({ error: 'Forbidden — CDC staff only' }, { status: 403 });
    }

    // Fetch the assignment to validate preconditions
    const { data: assignment, error: fetchErr } = await (supabase as any)
      .from('internship_assignments')
      .select('id, status, internship_type, institution_id, learner_id')
      .eq('id', id)
      .single();

    if (fetchErr || !assignment) {
      return NextResponse.json({ error: 'Internship not found' }, { status: 404 });
    }

    if (assignment.internship_type !== 'corporate_internship') {
      return NextResponse.json({
        error: 'Certificate workflow is for corporate internships only'
      }, { status: 422 });
    }

    if (assignment.status !== 'completed') {
      return NextResponse.json({
        error: `Cannot issue certificate: internship status is '${assignment.status}'. Must be 'completed'.`
      }, { status: 422 });
    }

    // Check if certificate already exists
    const { data: existing } = await (supabase as any)
      .from('internship_certificates')
      .select('id, is_revoked')
      .eq('assignment_id', id)
      .maybeSingle();

    if (existing && !existing.is_revoked) {
      return NextResponse.json({
        error: 'A valid certificate already exists for this internship'
      }, { status: 409 });
    }

    const body: IssueCertificatePayload = await request.json();
    if (body.attendance_percentage === undefined || body.evaluation_average === undefined) {
      return NextResponse.json({
        error: 'attendance_percentage and evaluation_average are required'
      }, { status: 400 });
    }

    // Enforce minimum-attendance policy before issuing (NAAC/AICTE compliance).
    // Mirrors the fn_cdc_coordinator_overdue_check read idiom: read the canonical
    // global platform_policies row, coalesce to a sane default if absent.
    const { data: policyRow } = await (supabase as any)
      .from('platform_policies')
      .select('value')
      .eq('policy_key', 'cdc.min_attendance_pct_for_internship_certificate')
      .eq('scope_type', 'global')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const parsedMin = Number(policyRow?.value);
    const policyMin = Number.isFinite(parsedMin) ? parsedMin : 75;

    if (body.attendance_percentage < policyMin) {
      return NextResponse.json({
        error: `Attendance ${body.attendance_percentage}% is below the required minimum ${policyMin}% for a certificate`
      }, { status: 422 });
    }

    // Generate certificate number
    const certNum = `CDC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    // Public verification page — allowlisted in proxy.ts as '/verify/*' and used
    // as the LinkedIn "See credential" target, so it MUST resolve without login.
    // The previous '/cdc/internships/{id}/verify/{cert}' path was auth-gated AND
    // had no page (broken 3 ways). Default to www.jkkn.ai (the public alias).
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.jkkn.ai';
    const verificationUrl = `${baseUrl}/verify/${certNum}`;

    const institutionId = assignment.institution_id || profile.institution_id;

    const { data: cert, error: certErr } = await (supabase as any)
      .from('internship_certificates')
      .insert({
        institution_id: institutionId,
        assignment_id: id,
        certificate_number: certNum,
        attendance_percentage: body.attendance_percentage,
        evaluation_average: body.evaluation_average,
        competencies_passed: body.competencies_passed ?? 0,
        competencies_total: body.competencies_total ?? 0,
        certificate_pdf_url: body.certificate_pdf_url ?? null,
        verification_url: verificationUrl,
        is_revoked: false,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (certErr) throw new Error(certErr.message);

    return NextResponse.json({ success: true, data: cert }, { status: 201 });
  } catch (err) {
    console.error('[CDC Certificate API] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
