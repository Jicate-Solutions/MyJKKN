export const dynamic = 'force-dynamic';

/**
 * /api/admin/social/subscribed-apps
 *
 * GET → live snapshot from Meta Graph API of:
 *   - every Page in the Business Manager (via /me/accounts)
 *   - each Page's currently-subscribed_apps
 *   - each Page's linked IG account (if any) and that IG's subscribed_apps
 *
 * Powers the "Subscribed Assets" panel on /admin/social/facebook and
 * /admin/social/instagram so admins can see DRIFT between intended
 * webhook subscription state and actual Meta-side state.
 *
 * The known_app_ids field labels which App is the webhook-host (JKKN
 * Institutions = 437028995095541) vs. the trap App (MyJKKN =
 * 1380007247501251 — see feedback_meta_system_user_app_must_match_webhook_app
 * memory entry).
 *
 * Role: super_admin / administrator only.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const GRAPH_VERSION = 'v25.0';

const KNOWN_APP_IDS = {
  jkkn_institutions: '437028995095541',
  myjkkn: '1380007247501251',
} as const;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile) return { ok: false as const, status: 403 };

  const allowed =
    profile.is_super_admin ||
    profile.role === 'super_admin' ||
    profile.role === 'administrator';
  if (!allowed) return { ok: false as const, status: 403 };

  return { ok: true as const, userId: user.id };
}

interface SubscribedApp {
  id: string;
  name: string;
}

interface IgChild {
  id: string;
  username: string;
  subscribed_apps: SubscribedApp[];
}

interface PageRow {
  id: string;
  name: string;
  subscribed_apps: SubscribedApp[];
  ig: IgChild | null;
}

interface AccountsResponse {
  data?: Array<{
    id: string;
    name: string;
    access_token: string;
    instagram_business_account?: { id: string; username?: string };
  }>;
  error?: { message: string };
}

interface SubscribedAppsResponse {
  data?: Array<{ id?: string; name?: string }>;
  error?: { message: string };
}

async function fetchSubscribedApps(
  assetId: string,
  pageToken: string
): Promise<SubscribedApp[]> {
  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${assetId}/subscribed_apps?access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json()) as SubscribedAppsResponse;
    if (!res.ok || json.error) return [];
    return (json.data ?? [])
      .filter((a): a is { id: string; name: string } => Boolean(a.id))
      .map((a) => ({ id: a.id, name: a.name ?? '(unnamed)' }));
  } catch {
    return [];
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        pages: [],
        fetched_at: new Date().toISOString(),
        known_app_ids: KNOWN_APP_IDS,
        error: 'META_PAGE_ACCESS_TOKEN not configured.',
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'max-age=60' },
      }
    );
  }

  try {
    const accountsUrl =
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts` +
      `?fields=id,name,access_token,instagram_business_account{id,username}` +
      `&limit=100&access_token=${encodeURIComponent(token)}`;
    const accountsRes = await fetch(accountsUrl, { cache: 'no-store' });
    const accountsJson = (await accountsRes.json()) as AccountsResponse;

    if (!accountsRes.ok || accountsJson.error) {
      return NextResponse.json(
        {
          pages: [],
          fetched_at: new Date().toISOString(),
          known_app_ids: KNOWN_APP_IDS,
          error:
            accountsJson.error?.message ??
            `Meta /me/accounts returned HTTP ${accountsRes.status}`,
        },
        {
          status: 200,
          headers: { 'Cache-Control': 'max-age=60' },
        }
      );
    }

    const rawPages = accountsJson.data ?? [];

    const pages: PageRow[] = await Promise.all(
      rawPages.map(async (p) => {
        const pageApps = await fetchSubscribedApps(p.id, p.access_token);

        let ig: IgChild | null = null;
        if (p.instagram_business_account?.id) {
          const igApps = await fetchSubscribedApps(
            p.instagram_business_account.id,
            p.access_token
          );
          ig = {
            id: p.instagram_business_account.id,
            username: p.instagram_business_account.username ?? '',
            subscribed_apps: igApps,
          };
        }

        return {
          id: p.id,
          name: p.name,
          subscribed_apps: pageApps,
          ig,
        };
      })
    );

    return NextResponse.json(
      {
        pages,
        fetched_at: new Date().toISOString(),
        known_app_ids: KNOWN_APP_IDS,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'max-age=60' },
      }
    );
  } catch (err) {
    return NextResponse.json(
      {
        pages: [],
        fetched_at: new Date().toISOString(),
        known_app_ids: KNOWN_APP_IDS,
        error: err instanceof Error ? err.message : 'Meta request failed.',
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'max-age=60' },
      }
    );
  }
}
