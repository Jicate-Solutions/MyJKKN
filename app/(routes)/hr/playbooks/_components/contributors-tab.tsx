'use client';

/**
 * Tab 3 — who wrote the playbooks. Sorted by NAME, never by count: a credit
 * list, not a ranking.
 */

import { usePlaybookContributors } from '@/hooks/hr/use-duty-playbooks';

export function ContributorsTab() {
  const { data, isLoading, error } = usePlaybookContributors();
  if (isLoading) return <p className='text-sm text-muted-foreground'>Loading…</p>;
  if (error) {
    return (
      <p className='text-sm text-red-600 dark:text-red-400'>
        Could not load contributors: {error instanceof Error ? error.message : 'unknown error'}
      </p>
    );
  }
  if (!data || data.length === 0) {
    return <p className='text-sm text-muted-foreground'>No lines yet, so no contributors yet.</p>;
  }
  return (
    <div className='rounded-xl border bg-card px-4 shadow-sm dark:shadow-none'>
      <p className='pt-3 text-xs text-muted-foreground'>Listed by name. Thank you to everyone who wrote a line.</p>
      <ul className='divide-y divide-border'>
        {data.map((c) => (
          <li key={c.authored_by} className='flex items-center justify-between py-3'>
            <span className='text-sm text-foreground'>{(c.author_name && c.author_name.trim()) || 'A former team member'}</span>
            <span className='text-xs text-muted-foreground'>
              {c.line_count} {c.line_count === 1 ? 'line' : 'lines'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
