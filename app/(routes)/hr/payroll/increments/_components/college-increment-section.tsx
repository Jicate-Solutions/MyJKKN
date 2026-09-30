'use client';

/**
 * One college's increment picture.
 *
 * A college with no rules recorded gets the SAME panel with an explicit banner
 * and its people still listed, each saying why nothing can be worked out. It is
 * deliberately not an empty list: an empty table reads as "nobody is due", and
 * seven of the nine colleges are in exactly that position.
 */

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

import type {
  CollegeIncrementReport,
  IncrementProposal,
  IncrementVerdict,
} from '@/lib/hr/increment-engine';
import { IncrementVerdictBadge, VERDICT_LABELS } from './increment-verdict-badge';

function formatMoney(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });
}

const VERDICT_ORDER: IncrementVerdict[] = [
  'due',
  'withheld',
  'cannot_tell',
  'not_due',
  'no_rules',
];

/** Due first, then the blocked, then the unknown, then the merely early. */
function sortProposals(proposals: IncrementProposal[]): IncrementProposal[] {
  return [...proposals].sort((a, b) => {
    const rank = VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict);
    if (rank !== 0) return rank;
    return a.staffName.localeCompare(b.staffName);
  });
}

function CountPill({ verdict, count }: { verdict: IncrementVerdict; count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <IncrementVerdictBadge verdict={verdict} />
      {count}
    </span>
  );
}

export function CollegeIncrementSection({ college }: { college: CollegeIncrementReport }) {
  const [open, setOpen] = useState(!college.hasRules || college.counts.due > 0);
  const rows = sortProposals(college.proposals);
  // Due people whose department has no amount set carry no figure, so the
  // college total is only the sum of the ones that do. Say so rather than
  // calling a partial sum "in total" (blind review, 1 Oct).
  const unpricedDue = college.proposals.filter(
    (p) => p.verdict === 'due' && p.proposedMonthlyIncrease === null,
  ).length;

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm dark:shadow-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 rounded-xl p-4 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-foreground">
            {college.institutionName}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {college.staffCount} {college.staffCount === 1 ? 'person' : 'people'} on the
            active team list
            {college.totalMonthlyIncrease !== null && (
              <>
                {' · '}
                {formatMoney(college.totalMonthlyIncrease)} a month proposed
                {unpricedDue > 0
                  ? ` for ${college.counts.due - unpricedDue} of the ${college.counts.due} people who are due; ${unpricedDue} ${unpricedDue === 1 ? 'has' : 'have'} no amount set`
                  : ' in total'}
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {VERDICT_ORDER.map((v) => (
              <CountPill key={v} verdict={v} count={college.counts[v]} />
            ))}
          </div>
        </div>
        {open ? (
          <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {!college.hasRules && (
        <div className="mx-4 mb-4 flex gap-3 rounded-xl border border-border bg-muted p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              No increment rules are recorded for this college.
            </p>
            <p className="mt-1 text-muted-foreground">
              Until somebody records them, nobody here can be assessed. This is not the
              same as nobody being due.
            </p>
          </div>
        </div>
      )}

      {college.rulesProblems.length > 0 && (
        <div className="mx-4 mb-4 rounded-xl border border-border bg-muted p-4 text-sm">
          <p className="font-medium text-foreground">
            Things the saved rules do not answer
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {college.rulesProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {open && (
        <div className="border-t border-border">
          {rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              There are no active team members recorded against this college.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Person</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="whitespace-nowrap px-4 py-2 text-right font-medium">
                      Pay now
                    </th>
                    <th className="whitespace-nowrap px-4 py-2 text-right font-medium">
                      Proposed rise
                    </th>
                    <th className="px-4 py-2 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((p) => (
                    <tr key={p.staffId} className="align-top">
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{p.staffName}</span>
                        {p.designation && (
                          <span className="block text-xs text-muted-foreground">
                            {p.designation}
                          </span>
                        )}
                        {p.scale && p.scale.basicPay !== null && (
                          <span className="block text-xs text-muted-foreground">
                            Reference scale {formatMoney(p.scale.basicPay)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <IncrementVerdictBadge verdict={p.verdict} />
                        {p.approver && p.verdict === 'due' && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {p.approver} approves
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {formatMoney(p.currentMonthlyGross)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {p.proposedMonthlyIncrease === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <>
                            <span className="font-semibold text-foreground">
                              {formatMoney(p.proposedMonthlyIncrease)}
                            </span>
                            {p.proposedNewMonthlyGross !== null && (
                              <span className="block text-xs text-muted-foreground">
                                would become {formatMoney(p.proposedNewMonthlyGross)}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      {/*
                        For "cannot tell" the bullets ARE the answer, one per
                        missing thing. `reason` concatenates the same sentences
                        into one paragraph for an API caller, so printing both
                        would say everything twice.
                      */}
                      <td className="max-w-md px-4 py-3 text-muted-foreground">
                        {p.verdict === 'cannot_tell' ? (
                          <>
                            <span>Cannot tell. The rules ask for things nobody has recorded:</span>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                              {p.checks
                                .filter((c) => c.status === 'unknown')
                                .map((c) => (
                                  <li key={c.id}>
                                    <span className="text-foreground">{c.label}:</span>{' '}
                                    {c.detail}
                                  </li>
                                ))}
                            </ul>
                          </>
                        ) : (
                          p.reason
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export { VERDICT_LABELS };
