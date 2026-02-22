// app/api/admission/loans/[id]/route.ts
// GET, PUT, DELETE for a single loan application

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { LoanService } from '@/lib/services/admission/loan-service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const application = await LoanService.getApplication(id);

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    console.error('[api/admission/loans/[id]] GET error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch loan application' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const application = await LoanService.updateApplication(id, body);

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    console.error('[api/admission/loans/[id]] PUT error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to update loan application' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    await LoanService.deleteApplication(id);

    return NextResponse.json({ success: true, message: 'Loan application deleted' });
  } catch (error) {
    console.error('[api/admission/loans/[id]] DELETE error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to delete loan application' },
      { status: 500 }
    );
  }
}
