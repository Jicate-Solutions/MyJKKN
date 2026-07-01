// app/api/cdc/internships/route.ts
// CDC Sprint 4 — List + Create corporate internships

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { CdcInternshipFilters, CreateCorporateInternshipPayload } from '@/types/cdc/internships';

const ASSIGNMENT_SELECT = `
  id, institution_id, cycle_id, learner_id, site_id, facilitator_id,
  preceptor_id, program_id, department_rotation,
  rotation_start_date, rotation_end_date, assignment_join_date,
  required_attendance_pct, status, internship_type, internship_type_id,
  total_days, days_present, attendance_percentage, overall_grade,
  offer_letter_url,
  created_at, updated_at, created_by, updated_by,
  site:internship_external_sites (
    id, institution_id, site_name, internship_type,
    city, state, address_line1, is_active, operates_weekends, created_at
  ),
  certificate:internship_certificates (
    id, institution_id, assignment_id, certificate_number, issued_date,
    attendance_percentage, evaluation_average,
    certificate_pdf_url, verification_url, is_revoked, created_at, created_by
  )
`;

/**
 * GET /api/cdc/internships
 * Query params: internship_type, status, institution_id, page, limit
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const filters: CdcInternshipFilters = {
      internship_type: (sp.get('internship_type') as CdcInternshipFilters['internship_type']) || 'corporate_internship',
      status: sp.get('status') as CdcInternshipFilters['status'] || undefined,
      institution_id: sp.get('institution_id') || undefined,
      page: sp.get('page') ? parseInt(sp.get('page')!) : 1,
      limit: sp.get('limit') ? parseInt(sp.get('limit')!) : 20,
    };

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = (supabase as any)
      .from('internship_assignments')
      .select(ASSIGNMENT_SELECT, { count: 'exact' })
      .eq('internship_type', filters.internship_type || 'corporate_internship')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      data: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error('[CDC Internships API] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/cdc/internships
 * Creates a new corporate internship assignment.
 * Body: CreateCorporateInternshipPayload
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check coordinator or cdc_head role
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const allowedRoles = ['cdc_head', 'cdc_coordinator', 'admin'];
    if (!profile.is_super_admin && !allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden — CDC staff only' }, { status: 403 });
    }

    const body: CreateCorporateInternshipPayload & {
      institution_id?: string;
      is_paid?: boolean;
      stipend_amount?: number | null;
      offer_letter_url?: string | null;
      // BUG-004293 / BUG-004295 / BUG-004292 — website, perks, duration
      company_website_url?: string | null;
      has_accommodation?: boolean;
      has_transport?: boolean;
      has_food?: boolean;
      duration_months?: number | null;
    } = await request.json();

    if (!body.learner_id || !body.site_id || !body.facilitator_id || !body.cycle_id) {
      return NextResponse.json({
        error: 'Missing required fields: learner_id, site_id, facilitator_id, cycle_id'
      }, { status: 400 });
    }

    if (!body.rotation_start_date || !body.rotation_end_date) {
      return NextResponse.json({ error: 'rotation_start_date and rotation_end_date are required' }, { status: 400 });
    }

    // BUG-004039: internship type is now a CRUDable config-master (cdc_internship_types).
    // The FK is REQUIRED on new records (Director decision). Look the chosen master row up
    // by id so we can (a) validate the FK exists and (b) derive the legacy internship_type
    // ENUM from its config_key — keeping both columns provably consistent for back-compat.
    if (!body.internship_type_id) {
      return NextResponse.json({ error: 'internship_type_id is required' }, { status: 400 });
    }

    const { data: typeRow, error: typeError } = await (supabase as any)
      .from('cdc_internship_types')
      .select('id, config_key, is_active')
      .eq('id', body.internship_type_id)
      .maybeSingle();

    if (typeError) throw new Error(typeError.message);
    if (!typeRow || typeRow.is_active === false) {
      return NextResponse.json({ error: 'Invalid or inactive internship type' }, { status: 400 });
    }
    const internshipTypeKey = typeRow.config_key as string;

    const institutionId = body.institution_id || profile.institution_id;
    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id required' }, { status: 400 });
    }

    // BUG-004040: Paid/Unpaid + stipend amount. Unpaid internships never carry a
    // stipend, so force stipend_amount to null when is_paid is false.
    const isPaid = body.is_paid ?? false;
    const stipendAmount = isPaid ? (body.stipend_amount ?? null) : null;

    const { data, error } = await (supabase as any)
      .from('internship_assignments')
      .insert({
        institution_id: institutionId,
        cycle_id: body.cycle_id,
        learner_id: body.learner_id,
        site_id: body.site_id,
        facilitator_id: body.facilitator_id,
        rotation_start_date: body.rotation_start_date,
        rotation_end_date: body.rotation_end_date,
        required_attendance_pct: body.required_attendance_pct ?? 75,
        department_rotation: body.department_rotation ?? null,
        is_paid: isPaid,
        stipend_amount: stipendAmount,
        // BUG-004087: optional offer-letter document URL
        offer_letter_url: body.offer_letter_url ?? null,
        // BUG-004293: optional company/host website URL
        company_website_url: body.company_website_url ?? null,
        // BUG-004295: perks beyond stipend (default false when omitted)
        has_accommodation: body.has_accommodation ?? false,
        has_transport: body.has_transport ?? false,
        has_food: body.has_food ?? false,
        // BUG-004292: internship duration in months (null when unspecified)
        duration_months: body.duration_months ?? null,
        // BUG-004039: persist the new config-master FK (forward source of truth)
        // AND the legacy internship_type ENUM derived from the SAME master row's
        // config_key, so existing reads that key off internship_type still work.
        internship_type_id: typeRow.id,
        internship_type: internshipTypeKey,
        status: 'pending',
        created_by: user.id,
        updated_by: user.id,
      })
      .select(ASSIGNMENT_SELECT)
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('[CDC Internships API] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
