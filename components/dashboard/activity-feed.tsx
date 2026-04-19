/**
 * Team Activity Feed — recent acknowledged actions across the team.
 *
 * Scrollable list: avatar + name + action + relative time.
 * Institution-scoped for non-admin, JKKN-wide for director (spec §4.4).
 *
 * Server component — data fetched at request time via getActivityFeed().
 */

import { getActivityFeed } from '@/lib/services/dashboard/streak-service';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const CATEGORY_COLORS: Record<string, string> = {
  approval: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  escalation: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  admission: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  billing: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  general: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
};

export async function ActivityFeed() {
  const items = await getActivityFeed(10);

  if (items.length === 0) {
    return (
      <div className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm p-5'>
        <h3 className='text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3'>
          Team Activity
        </h3>
        <p className='text-xs text-neutral-400 dark:text-neutral-500'>
          No recent team activity.
        </p>
      </div>
    );
  }

  return (
    <div className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm p-5'>
      <h3 className='text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3'>
        Team Activity
      </h3>
      <div className='space-y-2 max-h-80 overflow-y-auto'>
        {items.map((item, idx) => {
          const catColor =
            CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.general;
          return (
            <div
              key={`${item.created_at}-${idx}`}
              className='flex items-start gap-3 py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0'
            >
              {/* Avatar */}
              {item.avatar_url ? (
                <img
                  src={item.avatar_url}
                  alt={item.actor_name}
                  className='w-7 h-7 rounded-full object-cover flex-shrink-0'
                />
              ) : (
                <div className='w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-[10px] font-medium text-neutral-600 dark:text-neutral-300 flex-shrink-0'>
                  {getInitials(item.actor_name)}
                </div>
              )}

              {/* Content */}
              <div className='flex-1 min-w-0'>
                <p className='text-xs text-neutral-800 dark:text-neutral-200 truncate'>
                  <span className='font-medium'>{item.actor_name}</span>
                  {' '}
                  <span className='text-neutral-500 dark:text-neutral-400'>
                    {item.action_summary}
                  </span>
                </p>
                <div className='flex items-center gap-2 mt-0.5'>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${catColor}`}
                  >
                    {item.category}
                  </span>
                  <span className='text-[10px] text-neutral-400 dark:text-neutral-500'>
                    {relativeTime(item.created_at)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
