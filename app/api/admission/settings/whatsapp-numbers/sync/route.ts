

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * POST /api/admission/settings/whatsapp-numbers/sync
 *
 * Syncs quality_rating, messaging_limit, verified_name, and status
 * from Meta Cloud API for all phone numbers in the database.
 */
export async function POST(request: NextRequest) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: 'WHATSAPP_ACCESS_TOKEN not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const institutionId = body.institution_id;

  const supabase = getServiceClient();

  // Get all phone numbers from DB
  let query = supabase.from('wa_phone_numbers').select('*');
  if (institutionId) {
    query = query.eq('institution_id', institutionId);
  }

  const { data: numbers, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'Failed to fetch numbers' }, { status: 500 });
  }

  if (!numbers?.length) {
    return NextResponse.json({ synced: 0, message: 'No numbers to sync' });
  }

  let synced = 0;
  let failed = 0;
  const results: { phone_number_id: string; display_number: string; status: string; changes?: string[] }[] = [];

  for (const num of numbers) {
    try {
      const res = await fetch(
        `${GRAPH_API}/${num.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,platform_type,code_verification_status,status,throughput&access_token=${accessToken}`
      );
      const meta = await res.json();

      if (meta.error) {
        results.push({ phone_number_id: num.phone_number_id, display_number: num.display_number, status: 'error: ' + meta.error.message });
        failed++;
        continue;
      }

      const changes: string[] = [];
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (meta.quality_rating && meta.quality_rating !== num.quality_rating) {
        updates.quality_rating = meta.quality_rating;
        changes.push(`quality: ${num.quality_rating} → ${meta.quality_rating}`);
      }

      if (meta.verified_name && meta.verified_name !== num.verified_name) {
        updates.verified_name = meta.verified_name;
        changes.push(`name: ${num.verified_name} → ${meta.verified_name}`);
      }

      const limit = meta.throughput?.level || 'NOT_APPLICABLE';
      if (limit !== num.messaging_limit) {
        updates.messaging_limit = limit;
        changes.push(`limit: ${num.messaging_limit} → ${limit}`);
      }

      if (meta.display_phone_number) {
        const formatted = meta.display_phone_number.replace(/\s/g, '').replace('+', '');
        if (formatted !== num.display_number?.replace(/[+\s]/g, '')) {
          updates.display_number = meta.display_phone_number;
          changes.push(`number: ${num.display_number} → ${meta.display_phone_number}`);
        }
      }

      if (changes.length > 0) {
        await supabase.from('wa_phone_numbers').update(updates).eq('id', num.id);
      }

      results.push({
        phone_number_id: num.phone_number_id,
        display_number: num.display_number,
        status: changes.length > 0 ? 'updated' : 'no changes',
        changes: changes.length > 0 ? changes : undefined,
      });
      synced++;
    } catch (err) {
      results.push({
        phone_number_id: num.phone_number_id,
        display_number: num.display_number,
        status: 'error: ' + (err instanceof Error ? err.message : 'Unknown'),
      });
      failed++;
    }
  }

  return NextResponse.json({ synced, failed, total: numbers.length, results });
}
