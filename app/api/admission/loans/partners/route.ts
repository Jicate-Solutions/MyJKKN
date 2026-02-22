// app/api/admission/loans/partners/route.ts
// GET — List loan partners, POST — Create loan partner

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { LoanService } from '@/lib/services/admission/loan-service';

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const institutionId = searchParams.get('institution_id');

    if (!institutionId) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'institution_id is required' },
        { status: 400 }
      );
    }

    const partners = await LoanService.getPartners(institutionId);

    return NextResponse.json({ success: true, data: partners });
  } catch (error) {
    console.error('[api/admission/loans/partners] GET error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch loan partners' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { institution_id, name } = body;

    if (!institution_id || !name) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'institution_id and name are required' },
        { status: 400 }
      );
    }

    const partner = await LoanService.createPartner(institution_id, {
      name,
      logo_url: body.logo_url,
      contact_person: body.contact_person,
      contact_email: body.contact_email,
      contact_phone: body.contact_phone,
      interest_rate_min: body.interest_rate_min ? Number(body.interest_rate_min) : undefined,
      interest_rate_max: body.interest_rate_max ? Number(body.interest_rate_max) : undefined,
      max_loan_amount: body.max_loan_amount ? Number(body.max_loan_amount) : undefined,
      processing_fee_percent: body.processing_fee_percent ? Number(body.processing_fee_percent) : undefined,
      max_tenure_months: body.max_tenure_months ? Number(body.max_tenure_months) : undefined,
      collateral_required: body.collateral_required,
      documents_required: body.documents_required,
      approval_rate: body.approval_rate ? Number(body.approval_rate) : undefined,
      avg_processing_days: body.avg_processing_days ? Number(body.avg_processing_days) : undefined,
      notes: body.notes,
    });

    return NextResponse.json({ success: true, data: partner }, { status: 201 });
  } catch (error) {
    console.error('[api/admission/loans/partners] POST error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to create loan partner' },
      { status: 500 }
    );
  }
}
