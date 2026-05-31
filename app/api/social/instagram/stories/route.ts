export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/stories
 *
 * Reads Instagram stories for an account from the LOCAL ig_stories table.
 * Use the /sync sibling to refresh from Graph.
 *
 * Query params:
 *   ig_account_id?: string    — UUID FK into ig_accounts (preferred filter)
 *   institution_id?: string   — required if ig_account_id not provided
 *   active_only?: 'true'      — default true: only stories whose expires_at > now()
 *
 * Auth: super_admin OR a profile in the same institution as the parent account.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const igAccountId = searchParams.get('ig_account_id') || undefined;
    const institutionId = searchParams.get('institution_id') || undefined;
    const activeOnly = (searchParams.get('active_only') ?? 'true') !== 'false';

    if (!igAccountId && !institutionId) {
      return NextResponse.json(
        { success: false, error: 'Provide ig_account_id or institution_id' },
        { status: 400 }
      );
    }

    // Auth gate
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.role === 'super_admin';
    const callerInstitutionId = profile?.institution_id;

    let accountFilter: string[] = [];
    if (igAccountId) {
      // Resolve the account's institution for auth
      const { data: acct } = await supabase
        .from('ig_accounts')
        .select('id, institution_id')
        .eq('id', igAccountId)
        .single();
      if (!acct) {
        return NextResponse.json(
          { success: false, error: 'Account not found' },
          { status: 404 }
        );
      }
      if (!isSuperAdmin && acct.institution_id !== callerInstitutionId) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
      accountFilter = [acct.id];
    } else if (institutionId) {
      if (!isSuperAdmin && institutionId !== callerInstitutionId) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
      const { data: accts } = await supabase
        .from('ig_accounts')
        .select('id')
        .eq('institution_id', institutionId);
      accountFilter = (accts ?? []).map((a) => a.id);
    }

    if (accountFilter.length === 0) {
      return NextResponse.json({ success: true, data: { stories: [], count: 0 } });
    }

    let query = supabase
      .from('ig_stories')
      .select('id, story_id, ig_account_id, media_type, permalink, media_url, thumbnail_url, posted_at, expires_at, captured_at, last_polled_at')
      .in('ig_account_id', accountFilter)
      .order('posted_at', { ascending: false })
      .limit(100);

    if (activeOnly) {
      query = query.gt('expires_at', new Date().toISOString());
    }

    const { data: stories, error } = await query;
    if (error) {
      return NextResponse.json(
        { success: false, error: `Query failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { stories: stories ?? [], count: (stories ?? []).length },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
