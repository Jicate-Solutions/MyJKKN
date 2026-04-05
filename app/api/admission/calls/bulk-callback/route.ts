import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { TelephonyService } from '@/lib/services/telephony/telephony-service';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { callbackIds } = await request.json();

  if (!Array.isArray(callbackIds) || callbackIds.length === 0) {
    return NextResponse.json({ error: 'callbackIds required' }, { status: 400 });
  }

  if (callbackIds.length > 20) {
    return NextResponse.json({ error: 'Max 20 callbacks at once' }, { status: 400 });
  }

  // Fetch callback entries
  const { data: entries } = await supabase
    .from('admission_callback_queue')
    .select('id, caller_number, institution_id, lead_id')
    .in('id', callbackIds)
    .eq('status', 'pending');

  if (!entries?.length) {
    return NextResponse.json({ error: 'No pending callbacks found' }, { status: 404 });
  }

  const results: { id: string; success: boolean; error?: string }[] = [];

  for (const entry of entries) {
    try {
      // Mark as in_progress
      await supabase
        .from('admission_callback_queue')
        .update({ status: 'in_progress' })
        .eq('id', entry.id);

      // Initiate call via existing TelephonyService
      const callResult = await TelephonyService.initiateCall({
        institution_id: entry.institution_id,
        counselor_id: '', // Will be assigned by routing
        counselor_phone: '', // Will be determined by routing
        prospect_phone: entry.caller_number,
        lead_id: entry.lead_id ?? undefined,
      }, supabase);

      if (callResult.success) {
        // Link callback to return call
        await supabase
          .from('admission_callback_queue')
          .update({
            callback_call_id: callResult.call_log_id,
          })
          .eq('id', entry.id);
      }

      results.push({ id: entry.id, success: callResult.success, error: callResult.error });
    } catch (error) {
      results.push({ id: entry.id, success: false, error: String(error) });
    }
  }

  return NextResponse.json({ results, initiated: results.filter(r => r.success).length });
}
