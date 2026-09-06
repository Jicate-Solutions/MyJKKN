/**
 * Dashboard — Daily Intel card (server component)
 *
 * Surfaces the most recent LIVE `category='daily-intel'` notification addressed
 * to the viewer. Those rows are written by an external daily-intelligence
 * pipeline through POST /api/cdc/bulletin/ingest — nothing in-platform emits
 * them, so until that ingest is activated this card renders nothing at all.
 *
 * Read pattern mirrors lib/services/notification/notification-service.ts:
 *   - cookie-scoped client (RLS decides which user_notifications rows are
 *     visible — this component never uses the service role);
 *   - `!inner` join on the notifications FK so a row whose parent is gone or
 *     lapsed drops out entirely;
 *   - liveNotificationOrFilter() applies the same expires_at rule the bell and
 *     the inbox use, so an expired brief disappears here at the same moment.
 *
 * NEVER THROWS. Every failure path returns null — a dashboard must not break
 * because an optional card could not read a row.
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { liveNotificationOrFilter } from '@/lib/services/notification/notification-service';

type IntelRow = {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
};

/**
 * The URL arrives from an external pusher, so only an in-app path or an
 * http(s) link is ever rendered — `javascript:` and friends are dropped.
 */
function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const href = value.trim();
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  if (/^https?:\/\//i.test(href)) return href;
  return null;
}

async function getLatestIntel(): Promise<IntelRow | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_notifications')
      .select(
        'id, created_at, notification:notifications!user_notifications_notification_id_fkey!inner(id, title, body, url, category, created_at)'
      )
      .eq('user_id', user.id)
      .eq('notification.category', 'daily-intel')
      .or(liveNotificationOrFilter(), { foreignTable: 'notification' })
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('[dashboard/daily-intel] read failed:', error.message);
      return null;
    }

    const row = (data ?? [])[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    // Supabase types an embedded to-one join as an array; it is an object at
    // runtime. Handle both rather than trusting either.
    const embedded = (
      Array.isArray(row.notification) ? row.notification[0] : row.notification
    ) as Record<string, unknown> | undefined;
    if (!embedded?.title) return null;

    return {
      id: String(embedded.id ?? row.id),
      title: String(embedded.title),
      body: typeof embedded.body === 'string' ? embedded.body : null,
      url: safeHref(embedded.url),
      created_at: String(embedded.created_at ?? row.created_at ?? '')
    };
  } catch (err) {
    console.warn('[dashboard/daily-intel] unexpected error:', err);
    return null;
  }
}

export async function DailyIntelCard() {
  const intel = await getLatestIntel();
  if (!intel) return null;

  return (
    <article className='relative rounded-2xl border border-amber-200/60 dark:border-amber-900/40 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/80 dark:from-amber-950/30 dark:via-neutral-950/40 dark:to-orange-950/30 p-5 sm:p-6 overflow-hidden animate-in fade-in duration-500'>
      {/* Soft background accent */}
      <div
        className='absolute top-0 right-0 w-32 h-32 bg-amber-300/20 dark:bg-amber-500/10 rounded-full blur-3xl pointer-events-none'
        aria-hidden
      />

      <div className='relative flex flex-col gap-3'>
        <header className='flex items-start justify-between gap-3'>
          <div>
            <div className='text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300'>
              Daily intel
            </div>
            <h2 className='mt-1 text-lg sm:text-xl font-bold text-neutral-900 dark:text-neutral-100 leading-tight'>
              {intel.title}
            </h2>
          </div>
        </header>

        {intel.body && (
          <p className='text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-line'>
            {intel.body}
          </p>
        )}

        {intel.url && (
          <div className='flex items-center justify-end'>
            <Link
              href={intel.url}
              className='inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 hover:shadow-md transition-all duration-200'
            >
              Read the full brief →
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
