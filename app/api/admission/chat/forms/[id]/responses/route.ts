// app/api/admission/chat/forms/[id]/responses/route.ts
// GET form responses for a specific form template

import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppFormsService } from '@/lib/services/whatsapp/whatsapp-forms-service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const institutionId = searchParams.get('institution_id');

    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    const result = await WhatsAppFormsService.getFormResponses({
      institutionId,
      formTemplateId: id,
      leadId: searchParams.get('lead_id') || undefined,
      phoneNumber: searchParams.get('phone_number') || undefined,
      syncedToLead: searchParams.get('synced') !== null ? searchParams.get('synced') === 'true' : undefined,
      fromDate: searchParams.get('from_date') || undefined,
      toDate: searchParams.get('to_date') || undefined,
      limit: parseInt(searchParams.get('limit') || '50'),
      offset: parseInt(searchParams.get('offset') || '0'),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/chat/forms/responses] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch form responses' },
      { status: 500 }
    );
  }
}
