'use client';

/**
 * One cell on the cycle page: who, if anyone, has been asked for a blind
 * second rating of this appraisal — and a way for HR to ask someone.
 *
 * The database refuses the person appraised, their own head, and a draft
 * appraisal, so this does not try to pre-filter them; it shows the refusal.
 */

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AppraisalSecondRatingService,
  type HRSecondRating,
  type RaterCandidate,
} from '@/lib/services/hr/appraisal-second-rating-service';
import type { HRPerformanceReview } from '@/lib/services/hr/performance-review-service';

export function SecondRaterCell({
  supabase,
  review,
  secondRating,
  raterName,
  onChanged,
}: {
  supabase: SupabaseClient;
  review: HRPerformanceReview;
  secondRating: HRSecondRating | undefined;
  raterName: string | undefined;
  onChanged: (next: HRSecondRating | null, name?: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RaterCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(0);

  async function runSearch() {
    const found = await AppraisalSecondRatingService.searchRaters(supabase, query, review.staff_id);
    setResults(found.candidates);
    setHidden(found.hidden);
  }

  if (secondRating) {
    return (
      <div className="space-y-1 text-xs">
        <div className="font-medium">{raterName ?? 'Asked'}</div>
        <div className="text-muted-foreground">
          {secondRating.submitted_at ? 'Second rating in' : 'Waiting for their rating'}
        </div>
        {!secondRating.submitted_at && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await AppraisalSecondRatingService.withdraw(supabase, secondRating.id);
                onChanged(null);
                toast.success('Request withdrawn.');
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Could not withdraw.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Withdraw
          </Button>
        )}
      </div>
    );
  }

  if (review.status === 'draft') {
    return <span className="text-xs text-muted-foreground">Not submitted yet</span>;
  }

  if (!picking) {
    return (
      <Button size="sm" variant="outline" onClick={() => setPicking(true)}>
        Ask a second rater
      </Button>
    );
  }

  return (
    <div className="w-56 space-y-2">
      <div className="flex gap-1">
        <Input
          aria-label="Search by name"
          className="h-8 text-xs"
          value={query}
          placeholder="Search this college by name"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            try {
              await runSearch();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Search failed.');
            }
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={async () => {
            try {
              await runSearch();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Search failed.');
            }
          }}
        >
          Find
        </Button>
      </div>
      {results.length > 0 && (
        <ul className="max-h-40 overflow-auto rounded-md border border-border">
          {results.map((c) => (
            <li key={c.profileId}>
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-60"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const row = await AppraisalSecondRatingService.assign(
                      supabase,
                      review.id,
                      c.profileId,
                    );
                    onChanged(row, c.name);
                    setPicking(false);
                    toast.success(`Asked ${c.name} for a blind second rating.`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Could not ask them.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <span className="font-medium">{c.name}</span>
                {c.designation && (
                  <span className="ml-1 text-muted-foreground">· {c.designation}</span>
                )}
                <span className="block text-muted-foreground">
                  {c.institutionName ?? 'Same college'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          {hidden === 1 ? '1 match is' : `${hidden} matches are`} not shown: they can read every
          appraisal (HR or an admin), so they would see the head&rsquo;s rating.
        </p>
      )}
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setPicking(false)}>
        Cancel
      </Button>
    </div>
  );
}
