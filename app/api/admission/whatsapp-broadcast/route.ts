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

    // Get institution_id from user's profile (same pattern as chat routes)
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    if (!profile?.institution_id) {
      return NextResponse.json({ error: 'No institution found for user' }, { status: 403 });
    }

    // Only super_admin can launch broadcast campaigns
    if (profile.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super admins can send broadcast campaigns' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      campaign_name,
      template_name,
      template_id,
      recipients,
      scheduled_at,
      header_media_url,
      phone_number_id,
    } = body;

    const institution_id = body.institution_id || profile.institution_id;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'Missing or empty recipients array' }, { status: 400 });
    }

    if (recipients.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` },
        { status: 400 }
      );
    }

    // Generate campaign ID
    const campaign_id = crypto.randomUUID();

    // Build message inputs
    const messages = recipients.map((r: { phone: string; lead_id?: string; variables?: Record<string, string>; message_content?: string }) => ({
      institution_id,
      lead_id: r.lead_id || null,
      template_id: template_id || undefined,
      recipient_phone: r.phone,
      message_content: r.message_content || template_name || '',
      variables: r.variables || {},
      header_media_url: header_media_url || undefined,
      phone_number_id: phone_number_id || undefined,
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

    // Only super_admin can view broadcast campaigns
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can access broadcasts' }, { status: 403 });
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

    // Collect unique creator IDs to resolve names in one query
    const creatorIds = new Set<string>();
    for (const log of logs || []) {
      const createdBy = (log.metadata as Record<string, string>)?.created_by;
      if (createdBy) creatorIds.add(createdBy);
    }

    // Resolve creator names
    const creatorNames: Record<string, string> = {};
    if (creatorIds.size > 0) {
      const { data: creators } = await serviceClient
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(creatorIds));
      for (const c of creators || []) {
        creatorNames[c.id] = c.full_name || 'Unknown';
      }
    }

    // Group by campaign_id
    const campaignMap = new Map<string, {
      campaign_id: string;
      campaign_name: string;
      template_name: string;
      created_by: string;
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
      const createdById = (log.metadata as Record<string, string>)?.created_by || '';
      const existing = campaignMap.get(log.campaign_id) || {
        campaign_id: log.campaign_id,
        campaign_name: (log.metadata as Record<string, string>)?.campaign_name || 'Untitled',
        template_name: (log.metadata as Record<string, string>)?.template_name || '',
        created_by: creatorNames[createdById] || 'Unknown',
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
