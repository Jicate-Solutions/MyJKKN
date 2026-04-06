export const dynamic = 'force-dynamic';

// app/api/admission/whatsapp-broadcast/route.ts
// POST: Create and execute a WhatsApp broadcast campaign
// GET: List broadcast campaigns with delivery stats

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { WhatsAppCampaignService } from '@/lib/services/admission/whatsapp-campaign-service';
import { isWhatsAppConfigured } from '@/lib/services/whatsapp/whatsapp-api-client';

const MAX_BATCH_SIZE = 500;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isWhatsAppConfigured()) {
      return NextResponse.json(
        { error: 'WhatsApp Cloud API not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const {
      institution_id,
      campaign_name,
      template_name,
      template_id,
      recipients,
      scheduled_at,
    } = body;

    if (!institution_id) {
      return NextResponse.json({ error: 'Missing institution_id' }, { status: 400 });
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'Missing or empty recipients array' }, { status: 400 });
    }

    if (recipients.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` },
        { status: 400 }
      );
    }

    // Verify institution access
    const { data: access } = await supabase
      .from('user_institution_access')
      .select('id')
      .eq('user_id', user.id)
      .eq('institution_id', institution_id)
      .maybeSingle();

    if (!access) {
      return NextResponse.json({ error: 'No access to this institution' }, { status: 403 });
    }

    // Generate campaign ID
    const campaign_id = crypto.randomUUID();

    // Build message inputs
    const messages = recipients.map((r: { phone: string; lead_id?: string; variables?: Record<string, string>; message_content?: string }) => ({
      institution_id,
      lead_id: r.lead_id || '',
      template_id: template_id || undefined,
      recipient_phone: r.phone,
      message_content: r.message_content || template_name || '',
      variables: r.variables || {},
      campaign_id,
      metadata: {
        campaign_name: campaign_name || `Broadcast ${new Date().toLocaleDateString('en-IN')}`,
        template_name,
        created_by: user.id,
      },
    }));

    // If scheduled, queue for later processing
    if (scheduled_at) {
      const serviceClient = createServiceRoleClient();
      const queueEntries = messages.map((msg: Record<string, unknown>) => ({
        institution_id,
        recipient_phone: msg.recipient_phone,
        message_content: msg.message_content,
        template_name: template_name || null,
        status: 'queued',
        scheduled_at,
        metadata: msg.metadata,
      }));

      const { error: queueError } = await serviceClient
        .from('wa_personal_message_queue')
        .insert(queueEntries);

      if (queueError) {
        return NextResponse.json({ error: 'Failed to schedule campaign' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        campaign_id,
        scheduled_at,
        total: recipients.length,
        message: `Campaign scheduled for ${scheduled_at}`,
      });
    }

    // Send immediately
    const result = await WhatsAppCampaignService.sendBulkMessages(messages);

    return NextResponse.json({
      success: true,
      campaign_id,
      campaign_name: campaign_name || `Broadcast ${new Date().toLocaleDateString('en-IN')}`,
      total: result.total,
      sent: result.succeeded,
      failed: result.failed,
      results: result.results,
    });
  } catch (error) {
    console.error('[whatsapp-broadcast] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institution_id = searchParams.get('institution_id');

    if (!institution_id) {
      return NextResponse.json({ error: 'Missing institution_id' }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    // Get campaigns grouped by campaign_id with delivery stats
    const { data: logs, error } = await serviceClient
      .from('admission_whatsapp_logs')
      .select('campaign_id, delivery_status, metadata, created_at')
      .eq('institution_id', institution_id)
      .not('campaign_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
    }

    // Group by campaign_id
    const campaignMap = new Map<string, {
      campaign_id: string;
      campaign_name: string;
      template_name: string;
      created_at: string;
      total: number;
      sent: number;
      delivered: number;
      read: number;
      failed: number;
      pending: number;
    }>();

    for (const log of logs || []) {
      if (!log.campaign_id) continue;
      const existing = campaignMap.get(log.campaign_id) || {
        campaign_id: log.campaign_id,
        campaign_name: (log.metadata as Record<string, string>)?.campaign_name || 'Untitled',
        template_name: (log.metadata as Record<string, string>)?.template_name || '',
        created_at: log.created_at,
        total: 0, sent: 0, delivered: 0, read: 0, failed: 0, pending: 0,
      };

      existing.total++;
      switch (log.delivery_status) {
        case 'sent': existing.sent++; break;
        case 'delivered': existing.delivered++; break;
        case 'read': existing.read++; break;
        case 'failed': existing.failed++; break;
        case 'pending': existing.pending++; break;
      }

      campaignMap.set(log.campaign_id, existing);
    }

    const campaigns = Array.from(campaignMap.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ data: campaigns });
  } catch (error) {
    console.error('[whatsapp-broadcast] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
