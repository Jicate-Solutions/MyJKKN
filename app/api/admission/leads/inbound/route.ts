// POST /api/admission/leads/inbound — Generic inbound lead webhook
// Auth: API key (Bearer token) from api_keys table

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { IntegrationService } from '@/lib/services/admission/integration-service';
import type { InboundLeadPayload } from '@/lib/services/admission/integration-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate via API key
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Bearer token required' },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace('Bearer ', '');
    const supabase = createServiceRoleClient();

    // Look up API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('id, organization_id, is_active, name')
      .eq('key', apiKey)
      .maybeSingle();

    if (keyError || !keyData) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Invalid API key' },
        { status: 401 }
      );
    }

    if (!keyData.is_active) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'API key is disabled' },
        { status: 403 }
      );
    }

    const institutionId = keyData.organization_id;
    if (!institutionId) {
      return NextResponse.json(
        { error: 'CONFIGURATION_ERROR', message: 'API key has no organization_id' },
        { status: 500 }
      );
    }

    // 2. Parse body
    const body: InboundLeadPayload = await request.json();

    if (!body.phone) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'phone is required', errors: [{ field: 'phone', message: 'required' }] },
        { status: 400 }
      );
    }

    // 3. Find matching integration (optional — log even without one)
    let integrationId: string | null = null;
    if (body.source) {
      const { data: integration } = await supabase
        .from('admission_integrations')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('type', body.source)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      integrationId = integration?.id || null;
    }

    // 4. Process
    const result = await IntegrationService.processInboundLead(body, institutionId, integrationId, supabase);

    logger.info('admission/integrations', 'Inbound lead processed', {
      source: body.source,
      status: result.success ? 'success' : 'error',
      is_duplicate: result.is_duplicate,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      lead_id: result.lead_id,
      is_duplicate: result.is_duplicate,
      reference: result.reference,
    });
  } catch (error: any) {
    logger.error('admission/integrations', 'Inbound webhook failed', error);
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
