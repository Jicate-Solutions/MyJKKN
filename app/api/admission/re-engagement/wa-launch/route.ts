export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WhatsAppReengagementService } from '@/lib/services/whatsapp/whatsapp-reengagement-service';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { institution_id, sequence_template, target_option, created_by } = body;

    if (!institution_id || !sequence_template) {
      return NextResponse.json(
        { error: 'institution_id and sequence_template are required' },
        { status: 400 }
      );
    }

    // Get cold leads based on target option
    const daysSinceContact = target_option === 'very_cold' ? 60 : 14;
    const coldLeads = await WhatsAppReengagementService.getColdLeads(
      institution_id,
      daysSinceContact
    );

    if (coldLeads.length === 0) {
      return NextResponse.json(
        { error: 'No cold leads found matching the criteria' },
        { status: 400 }
      );
    }

    const leadIds = coldLeads.map((lead) => lead.id);

    // Launch the campaign
    const result = await WhatsAppReengagementService.launchReengagementCampaign({
      institutionId: institution_id,
      sequenceTemplate: sequence_template,
      leadIds,
      createdBy: created_by || 'system',
    });

    return NextResponse.json({
      success: true,
      data: {
        sequencesCreated: result.sequencesCreated,
        totalLeads: leadIds.length,
        errors: result.errors,
      },
    });
  } catch (error) {
    console.error('[re-engagement/wa-launch] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
