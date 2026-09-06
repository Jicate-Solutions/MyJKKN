export const dynamic = 'force-dynamic';

// app/api/learners-council/broadcast/route.ts
// The Learners Council broadcast surface: submit a message, and (for the named
// approver) approve, reject or cancel one.
//
// Director's rules, 2026-08-08:
//   • own-college  → sent immediately;
//   • all-colleges → held for ONE named approver;
//   • no response within the configured window → sent anyway (silence = yes);
//   • a wrong message is corrected by sending a NEW one — there is no recall.
//
// Every decision is made inside the SECURITY DEFINER RPCs, which re-check who
// the caller is and what they are targeting. This route is a thin, honest
// wrapper: it never decides authorisation itself, and it never invents a
// success. The RPCs return { ok, error } and we surface that verbatim so a
// refusal reaches the person as a sentence they can act on (rule 27).

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServerSupabaseClient } from '@/lib/supabase/server';

interface RpcResult {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
}

/** Map an RPC's own {ok,error} verdict onto an HTTP response, unchanged. */
function fromRpc(data: unknown, fallback: string): NextResponse {
  const result = (data ?? {}) as RpcResult;
  if (result.ok === false) {
    return NextResponse.json(
      { success: false, error: result.error || fallback },
      { status: 403 }
    );
  }
  return NextResponse.json({ success: true, ...result }, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // RLS on lc_broadcast_requests decides what comes back: your own requests,
  // or everything if you are the named approver / an admin.
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('lc_broadcast_requests')
    .select('id, title, body, reach, status, decision_note, auto_send_at, created_at, decided_at, requester_id')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[learners-council/broadcast] list failed:', error.message);
    return NextResponse.json({ error: 'Could not load broadcast requests' }, { status: 500 });
  }

  return NextResponse.json(
    { requests: data ?? [] },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const action = String(body.action || 'submit');

  try {
    if (action === 'submit') {
      const title = String(body.title || '').trim();
      const message = String(body.body || '').trim();
      if (!title || !message) {
        return NextResponse.json(
          { success: false, error: 'Please give the message a title and some text.' },
          { status: 400 }
        );
      }
      const reach = String(body.reach || '');
      const { data, error } = await supabase.rpc('fn_lc_broadcast_submit', {
        p_title: title,
        p_body: message,
        p_targeting: body.targeting ?? {},
        p_reach: reach,
      });
      if (error) {
        console.error('[learners-council/broadcast] submit failed:', error.message);
        return NextResponse.json({ success: false, error: 'Could not send that message.' }, { status: 500 });
      }
      return fromRpc(data, 'You cannot send that message.');
    }

    if (action === 'approve' || action === 'reject') {
      const { data, error } = await supabase.rpc('fn_lc_broadcast_decide', {
        p_request_id: String(body.request_id || ''),
        p_approve: action === 'approve',
        p_note: body.note ? String(body.note) : null,
      });
      if (error) {
        console.error('[learners-council/broadcast] decide failed:', error.message);
        return NextResponse.json({ success: false, error: 'Could not record that decision.' }, { status: 500 });
      }
      return fromRpc(data, 'You cannot decide on that message.');
    }

    if (action === 'cancel') {
      const { data, error } = await supabase.rpc('fn_lc_broadcast_cancel', {
        p_request_id: String(body.request_id || ''),
      });
      if (error) {
        console.error('[learners-council/broadcast] cancel failed:', error.message);
        return NextResponse.json({ success: false, error: 'Could not cancel that message.' }, { status: 500 });
      }
      return fromRpc(data, 'You cannot cancel that message.');
    }

    return NextResponse.json({ success: false, error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    console.error('[learners-council/broadcast] error:', err);
    return NextResponse.json({ success: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
