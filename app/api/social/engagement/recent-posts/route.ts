export const dynamic = 'force-dynamic';

/**
 * /api/social/engagement/recent-posts — the owner's post-attribution picker.
 *
 *   GET ?deptAccountId=<uuid> → recent IG posts for a handle the caller MANAGES,
 *                               so the owner can link a posted contribution to its
 *                               exact ig_posts row (→ truthful recognition signal).
 *
 * Backed by fn_social_recent_posts_for_handle (SECURITY DEFINER, manager gate
 * DUPLICATED inside the body). A non-manager caller gets [] (the gate returns
 * false → no rows), never another handle's posts.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { RecentPost, RecentPostsResponse } from '@/lib/types/social-engagement';

export async function GET(request: Request): Promise<NextResponse<RecentPostsResponse>> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const deptAccountId = new URL(request.url).searchParams.get('deptAccountId');
    if (!deptAccountId) {
      return NextResponse.json({ success: false, error: 'deptAccountId is required.' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('fn_social_recent_posts_for_handle', {
      p_dept_account_id: deptAccountId,
      p_limit: 12,
    });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    const posts: RecentPost[] = (
      (data as Array<{
        post_id: string;
        caption: string | null;
        permalink: string | null;
        media_type: string | null;
        posted_at: string | null;
      }> | null) ?? []
    ).map((r) => ({
      post_id: r.post_id,
      caption: r.caption,
      permalink: r.permalink,
      media_type: r.media_type,
      posted_at: r.posted_at,
    }));

    return NextResponse.json({ success: true, posts });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load recent posts.' },
      { status: 500 },
    );
  }
}
