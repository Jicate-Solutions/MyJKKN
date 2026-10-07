'use client';

// Searchable list of open MyJKKN jobs, shown inside a candidate card when HR
// chooses "Change job". Picking one is a correction: it is remembered as a rule
// for the next upload and credited to the person who picked it.

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { IntakeOpenJob } from '@/types/hr-intake';
import { jobLabel } from './intake-labels';

const MAX_SHOWN = 40;

export function JobPicker({
  jobs,
  currentJobId,
  cvvizJobTitle,
  disabled,
  onPick,
  onCancel,
}: {
  jobs: IntakeOpenJob[];
  currentJobId: string | null;
  cvvizJobTitle: string | null;
  disabled?: boolean;
  onPick: (job: IntakeOpenJob) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return jobs;
    return jobs.filter((j) => {
      const hay = `${j.title} ${j.institution_name ?? ''} ${j.department_name ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [jobs, query]);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-sm text-foreground">
        {cvvizJobTitle ? (
          <>
            This will be remembered for next time and credited to you: candidates who applied for
            &ldquo;{cvvizJobTitle}&rdquo; in CVViZ will be proposed for the job you pick.
          </>
        ) : (
          <>This candidate has no CVViZ job title, so this choice applies to this candidate only.</>
        )}
      </p>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          There are no open jobs in MyJKKN right now. Use &ldquo;Needs a new job&rdquo; instead.
        </p>
      ) : (
        <>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search open jobs by title, college or department"
              aria-label="Search open jobs"
              className="pl-8"
            />
          </div>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open job matches &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border bg-background">
              {matches.slice(0, MAX_SHOWN).map((job) => (
                <li key={job.id}>
                  <button
                    type="button"
                    disabled={disabled || job.id === currentJobId}
                    onClick={() => onPick(job)}
                    className="w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {jobLabel(job)}
                    {job.id === currentJobId && (
                      <span className="ml-2 text-xs text-muted-foreground">(already chosen)</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {matches.length > MAX_SHOWN && (
            <p className="text-xs text-muted-foreground">
              Showing {MAX_SHOWN} of {matches.length}. Keep typing to narrow the list.
            </p>
          )}
        </>
      )}

      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
