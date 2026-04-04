export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTextMessage, sendTemplateMessage, isWhatsAppConfigured } from '@/lib/services/whatsapp/whatsapp-api-client';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isWhatsAppConfigured()) {
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 503 });
  }

  const supabase = getServiceClient();

  // Fetch queued messages where scheduled_at has passed
  const { data: messages, error } = await supabase
    .from('wa_personal_message_queue')
    .select('*')
    .eq('status', 'queued')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('[cron/scheduled-whatsapp] Query error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!messages?.length) {
    return NextResponse.json({ processed: 0, message: 'No scheduled messages due' });
  }

  let sent = 0;
  let failed = 0;

  for (const msg of messages) {
    try {
      const phone = msg.recipient_phone?.replace(/\D/g, '') || '';
      if (!phone) throw new Error('No phone number');

      if (msg.template_name) {
        await sendTemplateMessage(phone, msg.template_name, msg.language_code || 'en', msg.template_components);
      } else {
        await sendTextMessage(phone, msg.message_content || '');
      }

      await supabase
        .from('wa_personal_message_queue')
        .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', msg.id);

      sent++;
    } catch (err) {
      await supabase
        .from('wa_personal_message_queue')
        .update({
          status: msg.retry_count >= 3 ? 'failed' : 'queued',
          retry_count: (msg.retry_count || 0) + 1,
          next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          error_message: err instanceof Error ? err.message : 'Unknown error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', msg.id);

      failed++;
    }

    // Rate limit: 100ms between messages
    await new Promise(r => setTimeout(r, 100));
  }

  return NextResponse.json({ processed: messages.length, sent, failed });
}
