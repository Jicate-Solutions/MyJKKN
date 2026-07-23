export const dynamic = 'force-dynamic';

/**
 * /api/social/engagement/manage — owner-facing handle management.
 *
 *   GET   → the handles the caller may curate (fn_social_managed_handles: admin / social.manage
 *           / accountable_owner_id), with each handle's current brief. Safe columns only.
 *   PATCH { dept_account_id, purpose_line?, content_playbook?, posting_cadence_days? }
 *         → set the handle's brief via fn_social_set_handle_brief (manager-gated inside the RPC;
 *           a non-manager caller gets 42501 → surfaced as 403). Writes only the three brief
 *           fields — never credentials.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  ManagedHandle,
  ManagedHandlesResponse,
  SetBriefBody,
} from '@/lib/types/social-engagement';

export async function GET(): Promise<NextResponse<ManagedHandlesResponse>> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase.rpc('fn_social_managed_handles');
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, handles: (data as ManagedHandle[] | null) ?? [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load managed handles.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request): Promise<NextResponse<ManagedHandlesResponse>> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as SetBriefBody | null;
    if (!body?.dept_account_id) {
      return NextResponse.json({ success: false, error: 'dept_account_id is required.' }, { status: 400 });
    }

    const { error } = await supabase.rpc('fn_social_set_handle_brief', {
      p_dept_account_id: body.dept_account_id,
      p_purpose_line: body.purpose_line ?? null,
      p_content_playbook: body.content_playbook ?? null,
      p_posting_cadence_days: body.posting_cadence_days ?? null,
    });
    if (error) {
      const status = error.code === '42501' || /not permitted/i.test(error.message) ? 403 : 400;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }

    // Return the refreshed managed list so the UI reflects the saved brief.
    const { data } = await supabase.rpc('fn_social_managed_handles');
    return NextResponse.json({ success: true, handles: (data as ManagedHandle[] | null) ?? [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to save the brief.' },
      { status: 500 }
    );
  }
}
