// app/api/admission/loans/partners/[id]/route.ts
// GET, PUT, DELETE for a single loan partner

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { LoanService } from '@/lib/services/admission/loan-service';

export async function GET(
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
    const partner = await LoanService.getPartner(id);

    return NextResponse.json({ success: true, data: partner });
  } catch (error) {
    console.error('[api/admission/loans/partners/[id]] GET error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch loan partner' },
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

    const partner = await LoanService.updatePartner(id, body);

    return NextResponse.json({ success: true, data: partner });
  } catch (error) {
    console.error('[api/admission/loans/partners/[id]] PUT error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to update loan partner' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    await LoanService.deletePartner(id);

    return NextResponse.json({ success: true, message: 'Loan partner deactivated' });
  } catch (error) {
    console.error('[api/admission/loans/partners/[id]] DELETE error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to delete loan partner' },
      { status: 500 }
    );
  }
}
