export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role client for webhook (no user auth — authenticated via API key)
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/whatsapp-personal/webhook
 * Receives incoming messages from Railway WhatsApp service.
 * Authenticated via X-API-Key header (same key as Railway).
 */
export async function POST(request: NextRequest) {
  await connection();
  // Verify API key (Railway sends the same API_KEY)
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.WHATSAPP_PERSONAL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { client_id, from, sender_name, message_id, body: messageBody, type, timestamp, is_group } = body;

  if (!client_id || !from || !messageBody) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Skip group messages for now
  if (is_group) {
    return NextResponse.json({ success: true, skipped: 'group_message' });
  }

  const supabase = getServiceClient();

  // Find the connection by client_id to get department_id and connected_by
  const { data: connection } = await supabase
    .from('wa_personal_connections')
    .select('id, department_id, connected_by')
    .eq('client_id', client_id)
    .maybeSingle();

  if (!connection) {
    console.error('[webhook] No connection found for client_id:', client_id);
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  // Try to find the lead by phone number (match against admission_leads.phone)
  const cleanPhone = from.replace(/\D/g, '');
  const phoneVariants = [
    cleanPhone,
    cleanPhone.startsWith('91') ? cleanPhone.substring(2) : `91${cleanPhone}`,
    `+${cleanPhone}`,
    `+91${cleanPhone.startsWith('91') ? cleanPhone.substring(2) : cleanPhone}`,
  ];

  let leadId: string | null = null;

  // Search admission_leads for matching phone
  for (const phoneVar of phoneVariants) {
    const { data: lead } = await supabase
      .from('admission_leads')
      .select('id')
      .ilike('phone', `%${phoneVar.slice(-10)}%`)
      .limit(1)
      .maybeSingle();

    if (lead) {
      leadId = lead.id;
      break;
    }
  }

  // Store the incoming message
  const { data: msg, error } = await supabase
    .from('wa_personal_message_logs')
    .insert({
      department_id: connection.department_id,
      connection_id: connection.id,
      direction: 'inbound',
      recipient_type: 'individual',
      recipient_phone: from,
      recipient_name: sender_name || null,
      sender_phone: from,
      sender_name: sender_name || null,
      message_content: messageBody,
      message_preview: messageBody.substring(0, 100),
      status: 'delivered',
      whatsapp_message_id: message_id || null,
      lead_id: leadId,
      sent_by: connection.connected_by || null, // Null for inbound — no user "sent" it
      sent_at: timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[webhook] Failed to store incoming message:', error.message);
    return NextResponse.json({ error: 'Failed to store message' }, { status: 500 });
  }

  console.log(`[webhook] Incoming message stored: ${msg.id} from ${from} (lead: ${leadId || 'unknown'})`);

  // Spec 3 H3.1: increment recovery_inbound_count IF connection is in active
  // 24h post-reconnect window. RPC handles the window check internally —
  // a connection not in recovery is a no-op. Failure here must NOT fail the
  // webhook (the message persisted successfully), so we ignore RPC errors.
  try {
    await supabase.rpc('fn_byow_increment_recovery_count', {
      p_connection_id: connection.id,
    });
  } catch (rpcErr) {
    console.warn('[webhook] fn_byow_increment_recovery_count failed:', rpcErr);
  }

  return NextResponse.json({ success: true, message_id: msg.id, lead_id: leadId });
}
