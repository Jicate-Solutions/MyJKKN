export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * GET /api/bug-reports/feedback/mine
 *
 * The reporter's own open "is this fixed for you?" prompts (self-improving
 * loop increment #2). Runs under the reporter's OWN session — RLS shows only
 * their sent/delivered/answered rows, never un-approved 'pending_send' ones.
 * Expired prompts are filtered out (E2: silence teaches nothing; we don't
 * nag past the window).
 */
export async function GET() {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data, error } = await (supabase as any)
      .from('bug_fix_feedback_requests')
      .select('id, bug_id, status, answer, expires_at, created_at, bug_reports:bug_id (display_id, description)')
      .eq('reporter_user_id', user.id)
      .in('status', ['sent', 'delivered', 'answered'])
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true });
    if (error) throw error;

    const prompts = (data ?? []).map((r: any) => ({
      id: r.id,
      bug_id: r.bug_id,
      display_id: r.bug_reports?.display_id ?? null,
      description: (r.bug_reports?.description ?? '').slice(0, 160),
      status: r.status,
      answer: r.answer ?? null,
      expires_at: r.expires_at
    }));
    return NextResponse.json({ prompts });
  } catch (error) {
    logger.error('bug-reports/feedback', 'Failed to load own feedback prompts', error);
    return NextResponse.json({ error: 'Failed to load prompts' }, { status: 500 });
  }
}
