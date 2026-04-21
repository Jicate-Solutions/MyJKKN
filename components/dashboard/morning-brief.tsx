/**
 * Dashboard v2 — 8am Morning Brief Card (server)
 *
 * First-of-day greeting with yesterday closeout + today's priorities.
 * Client sub-component handles per-date dismiss via localStorage.
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §7.7
 */

import {
  MorningBrief,
  isAdmissionRole
} from '@/lib/services/dashboard/morning-brief-service';
import { MorningBriefDismissible } from './morning-brief-dismissible';
import { queueTypeEmoji } from '@/lib/services/dashboard/decision-queue-service';
import { performQueueAction } from '@/app/(routes)/dashboard/_actions/queue-actions';

type MorningBriefCardProps = {
  brief: MorningBrief;
};

function StatChip({
  label,
  value,
  accent
}: {
  label: string;
  value: number | string;
  accent: 'emerald' | 'rose' | 'amber' | 'neutral';
}) {
  const cls = {
    emerald:
      'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100 border-emerald-200/60 dark:border-emerald-900/40',
    rose: 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100 border-rose-200/60 dark:border-rose-900/40',
    amber:
      'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100 border-amber-200/60 dark:border-amber-900/40',
    neutral:
      'bg-white/70 dark:bg-neutral-900/70 text-neutral-900 dark:text-neutral-100 border-neutral-200/60 dark:border-neutral-800'
  }[accent];
  return (
    <div className={`rounded-lg border ${cls} px-3 py-2 text-center min-w-[80px]`}>
      <div className='text-lg font-bold tabular-nums leading-none'>{value}</div>
      <div className='mt-1 text-[10px] uppercase tracking-wider opacity-75'>
        {label}
      </div>
    </div>
  );
}

export function MorningBriefCard({ brief }: MorningBriefCardProps) {
  // Compose summary line
  const yesterdayLine =
    brief.yesterday.closed === 0 && brief.yesterday.rescues_claimed === 0
      ? 'Yesterday was quiet — nothing needed your action.'
      : [
          brief.yesterday.closed > 0
            ? `closed ${brief.yesterday.closed} item${brief.yesterday.closed === 1 ? '' : 's'}`
            : null,
          brief.yesterday.rescues_claimed > 0
            ? `claimed ${brief.yesterday.rescues_claimed} rescue${brief.yesterday.rescues_claimed === 1 ? '' : 's'}`
            : null,
          brief.yesterday.auto_escalated > 0
            ? `${brief.yesterday.auto_escalated} auto-escalated`
            : null
        ]
          .filter(Boolean)
          .join(', ');

  return (
    <MorningBriefDismissible dateKey={brief.date_ist}>
      <article className='relative rounded-2xl border border-indigo-200/60 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/80 dark:from-indigo-950/30 dark:via-neutral-950/40 dark:to-sky-950/30 p-5 sm:p-6 overflow-hidden animate-in fade-in duration-500'>
        {/* Soft background accent */}
        <div className='absolute top-0 right-0 w-32 h-32 bg-indigo-300/20 dark:bg-indigo-500/10 rounded-full blur-3xl pointer-events-none' aria-hidden />

        <div className='relative flex flex-col gap-4'>
          <header className='flex items-start justify-between gap-3'>
            <div>
              <h2 className='text-lg sm:text-xl font-bold text-neutral-900 dark:text-neutral-100 leading-tight'>
                {brief.greeting}, {brief.name.split(' ')[0]} ☀️
              </h2>
              <p className='mt-1 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed'>
                {yesterdayLine}
              </p>
            </div>
          </header>

          {/* Today's at-a-glance — chips are role-aware.
              Cold leads is an admission-funnel metric that only renders
              for admission-adjacent roles (counselor, admission, admin,
              super_admin, administrator, principal). Students, faculty,
              HODs, and accounts see only Urgent / High / Carried over. */}
          <div className='flex flex-wrap gap-2'>
            <StatChip
              label='Urgent'
              value={brief.today.pending_urgent}
              accent={brief.today.pending_urgent > 0 ? 'rose' : 'neutral'}
            />
            <StatChip
              label='High'
              value={brief.today.pending_high}
              accent={brief.today.pending_high > 0 ? 'amber' : 'neutral'}
            />
            {isAdmissionRole(brief.role) && (
              <StatChip
                label='Cold leads'
                value={brief.today.cold_leads}
                accent={brief.today.cold_leads > 0 ? 'rose' : 'emerald'}
              />
            )}
            <StatChip
              label='Carried over'
              value={brief.today.carried_over}
              accent={brief.today.carried_over > 0 ? 'amber' : 'neutral'}
            />
          </div>

          {/* Top 3 priorities */}
          {brief.top_priorities.length > 0 ? (
            <div>
              <div className='text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2'>
                Start here ·{' '}
                <span className='text-neutral-400 font-normal normal-case'>
                  top {brief.top_priorities.length} priorities
                </span>
              </div>
              <ol className='space-y-1.5'>
                {brief.top_priorities.map((p, i) => (
                  <li
                    key={p.user_notification_id}
                    className='flex items-center gap-3 rounded-lg bg-white/60 dark:bg-neutral-900/50 border border-white/60 dark:border-neutral-800/60 px-3 py-2'
                  >
                    <span className='inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-bold'>
                      {i + 1}
                    </span>
                    <span className='text-base' aria-hidden>
                      {queueTypeEmoji(p.queue_type)}
                    </span>
                    <span className='flex-1 text-sm text-neutral-900 dark:text-neutral-100 font-medium truncate'>
                      {p.title}
                    </span>
                    <span
                      className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
                        p.priority === 'urgent'
                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          : p.priority === 'high'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      {p.priority ?? 'normal'}
                    </span>
                  </li>
                ))}
              </ol>
              <div className='mt-3 flex items-center justify-end'>
                <a
                  href='#decision-queue'
                  className='inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md transition-all duration-200'
                >
                  Start my day →
                </a>
              </div>
            </div>
          ) : (
            <div className='rounded-lg bg-white/60 dark:bg-neutral-900/50 border border-white/60 dark:border-neutral-800/60 px-4 py-6 text-center'>
              <div className='text-2xl mb-2'>✨</div>
              <div className='text-sm font-medium text-neutral-900 dark:text-neutral-100'>
                Inbox zero — you&apos;re ahead of the queue
              </div>
              <div className='mt-1 text-xs text-neutral-500'>
                Nothing urgent needs your decision right now. New items will
                surface here as they arrive.
              </div>
            </div>
          )}
        </div>
      </article>
    </MorningBriefDismissible>
  );
}
