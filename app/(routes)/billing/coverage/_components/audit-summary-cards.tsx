'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';
import type {
  DuplicateYearAuditSummary,
  MissingYearAuditSummary
} from '@/types/billing-coverage';

const nf = new Intl.NumberFormat('en-IN');

interface Tile {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}

function TileGrid({
  tiles,
  isLoading,
  notes
}: {
  tiles: Tile[];
  isLoading: boolean;
  notes: (string | null)[];
}) {
  // Driven by tile count rather than hardcoded: the two sub-tabs carry
  // different numbers of KPIs, and a fixed 4-column grid would orphan the
  // fifth tile on its own row.
  const cols = tiles.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4';

  if (isLoading) {
    return (
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cols}`}>
        {Array.from({ length: tiles.length }).map((_, i) => (
          <Skeleton key={i} className='h-24 w-full' />
        ))}
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cols}`}>
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className='p-4'>
              <p className='text-sm text-muted-foreground'>{t.label}</p>
              <p className={`text-2xl font-bold ${t.tone ?? 'text-foreground'}`}>
                {t.value}
              </p>
              {t.hint && (
                <p className='text-[11px] text-muted-foreground'>{t.hint}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {notes.filter(Boolean).map((n) => (
        <p key={n} className='text-xs text-muted-foreground'>
          {n}
        </p>
      ))}
    </div>
  );
}

/**
 * Missing-year KPIs.
 *
 * "Learners With Gap" and "Bills To Raise" are deliberately two separate tiles
 * rather than one number: they are counted in different units and always differ
 * (1,193 learners owe 3,026 bills group-wide). Showing only the learner count
 * understates the work by more than half.
 */
export function MissingYearSummaryCards({
  summary,
  isLoading
}: {
  summary: MissingYearAuditSummary | undefined;
  isLoading: boolean;
}) {
  const tiles: Tile[] = [
    {
      label: 'Learners Audited',
      value: nf.format(summary?.in_scope ?? 0),
      hint: `${nf.format(summary?.complete ?? 0)} complete`
    },
    {
      label: 'Learners With Gap',
      value: nf.format(summary?.gap ?? 0),
      tone: 'text-orange-600 dark:text-orange-500'
    },
    {
      label: 'Bills To Raise',
      value: nf.format(summary?.missing_slots ?? 0),
      hint: 'missing learner · year pairs',
      tone: 'text-orange-600 dark:text-orange-500'
    },
    {
      // The reported symptom, and the subset most likely to be a generation bug
      // rather than a learner who simply joined mid-programme. "Latest expected"
      // rather than "current": for a cohort that has finished, the last year of
      // their course is the last year they were ever owed a bill for.
      label: 'Backlog Only',
      value: nf.format(summary?.backlog_only ?? 0),
      hint: 'latest expected year billed, earlier one missing',
      tone: 'text-amber-600 dark:text-amber-500'
    }
  ];

  const notes = [
    (summary?.no_tuition_at_all ?? 0) > 0
      ? `${nf.format(summary!.no_tuition_at_all)} of the gap learners have no tuition bill in any audited year.`
      : null,
    // The audited window is capped at the programme's end year. Without a
    // duration there is no cap, so those learners are still measured all the
    // way to the current year and any tail they show is unproven.
    (summary?.duration_not_set ?? 0) > 0
      ? `${nf.format(summary!.duration_not_set)} learner${
          summary!.duration_not_set === 1 ? '' : 's'
        } belong to a programme with no duration configured, so their window runs to the current academic year rather than to the end of their course. Set Programme Duration (Yrs) on those programmes to bound them.`
      : null,
    (summary?.excluded_institutions ?? 0) > 0
      ? `${nf.format(summary!.excluded_institutions)} institution${
          summary!.excluded_institutions === 1 ? '' : 's'
        } hidden — never raised a tuition or tuition-equivalent bill (${nf.format(
          summary!.excluded_learners
        )} learner${summary!.excluded_learners === 1 ? '' : 's'}). Use the toggle to include them.`
      : null,
    (summary?.cannot_evaluate ?? 0) > 0
      ? `${nf.format(summary!.cannot_evaluate)} learner${
          summary!.cannot_evaluate === 1 ? ' has' : 's have'
        } no admission year on file, so no window can be audited for them. Switch "Show" to Cannot evaluate to see them.`
      : null
  ];

  return <TileGrid tiles={tiles} isLoading={isLoading} notes={notes} />;
}

/**
 * Duplicate-year KPIs.
 *
 * "Extra Bills" is the actionable number — every bill past the first in a year.
 * "Combos" counts the learner·year pairs those bills sit in, which is always
 * smaller, so both are shown rather than one standing in for the other.
 */
export function DuplicateYearSummaryCards({
  summary,
  isLoading
}: {
  summary: DuplicateYearAuditSummary | undefined;
  isLoading: boolean;
}) {
  const tiles: Tile[] = [
    {
      label: 'Learner · Year Combos',
      value: nf.format(summary?.combos ?? 0),
      hint: `${nf.format(summary?.learners ?? 0)} learner${
        (summary?.learners ?? 0) === 1 ? '' : 's'
      }`,
      tone:
        (summary?.combos ?? 0) > 0
          ? 'text-orange-600 dark:text-orange-500'
          : 'text-green-600 dark:text-green-500'
    },
    {
      label: 'Extra Bills',
      value: nf.format(summary?.extra_bills ?? 0),
      hint: `of ${nf.format(summary?.bills ?? 0)} involved`,
      tone: 'text-orange-600 dark:text-orange-500'
    },
    {
      label: 'Total Billed',
      value: formatCurrency(summary?.total_billed ?? 0),
      hint: `${formatCurrency(summary?.outstanding ?? 0)} outstanding`
    },
    {
      // Same-day creation with due dates in different calendar years: the
      // multi-year fee plan stamping every instalment with the year current at
      // generation time. Distinguishes a generator artefact from a real
      // double-charge without opening each bill.
      label: 'Generator Artefact',
      value: nf.format(summary?.generator_signature ?? 0),
      hint: 'one run, due dates years apart',
      tone: 'text-muted-foreground'
    },
    {
      // The inverse of the missing-year finding: tuition raised for a year the
      // learner is no longer enrolled in. Counted over ALL tuition bills in
      // scope, not only the duplicated ones, so it is a genuine second check
      // sharing this tab rather than a facet of the duplicates above.
      //
      // The ONE tile on this page that does not use the widened category set:
      // program_duration_yrs counts taught years, so the CRRI and AHS
      // internship fees land after the course ends by design. Including them
      // would add 37 correct bills here as anomalies.
      label: 'Billed Past Programme End',
      value: nf.format(summary?.past_end_bills ?? 0),
      hint:
        (summary?.past_end_bills ?? 0) > 0
          ? `${nf.format(summary!.past_end_learners)} learner${
              summary!.past_end_learners === 1 ? '' : 's'
            } · ${formatCurrency(summary!.past_end_outstanding)} outstanding`
          : 'no tuition billed beyond a course end',
      tone:
        (summary?.past_end_bills ?? 0) > 0
          ? 'text-orange-600 dark:text-orange-500'
          : 'text-green-600 dark:text-green-500'
    }
  ];

  const notes = [
    (summary?.combos ?? 0) === 0 && !isLoading
      ? 'No learner holds more than one tuition bill in the same academic year under these filters.'
      : null,
    (summary?.unassigned_tuition_bills ?? 0) > 0
      ? `${nf.format(summary!.unassigned_tuition_bills)} live tuition bill${
          summary!.unassigned_tuition_bills === 1 ? ' carries' : 's carry'
        } no academic year, so this check cannot see ${
          summary!.unassigned_tuition_bills === 1 ? 'it' : 'them'
        } under any filter.`
      : null
  ];

  return <TileGrid tiles={tiles} isLoading={isLoading} notes={notes} />;
}
