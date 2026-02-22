// app/api/admission/loans/route.ts
// GET — List loan applications, POST — Create loan application

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { LoanService } from '@/lib/services/admission/loan-service';
import type { LoanApplicationStatus } from '@/lib/services/admission/loan-service';

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

    const filters = {
      status: (searchParams.get('status') as LoanApplicationStatus) || undefined,
      partner_id: searchParams.get('partner_id') || undefined,
      search: searchParams.get('search') || undefined,
    };

    const applications = await LoanService.getApplications(institutionId, filters);

    return NextResponse.json({ success: true, data: applications });
  } catch (error) {
    console.error('[api/admission/loans] GET error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch loan applications' },
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
    const { institution_id, lead_id, partner_id, loan_amount, tenure_months, interest_rate, emi_amount, notes } = body;

    if (!institution_id || !lead_id || !partner_id || !loan_amount || !tenure_months) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'institution_id, lead_id, partner_id, loan_amount, and tenure_months are required' },
        { status: 400 }
      );
    }

    const application = await LoanService.createApplication(institution_id, {
      lead_id,
      partner_id,
      loan_amount: Number(loan_amount),
      tenure_months: Number(tenure_months),
      interest_rate: interest_rate ? Number(interest_rate) : undefined,
      emi_amount: emi_amount ? Number(emi_amount) : undefined,
      notes,
      counselor_id: user.id,
    });

    return NextResponse.json({ success: true, data: application }, { status: 201 });
  } catch (error) {
    console.error('[api/admission/loans] POST error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to create loan application' },
      { status: 500 }
    );
  }
}
