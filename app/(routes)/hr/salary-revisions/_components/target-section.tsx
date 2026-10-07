'use client';

/**
 * Target-gated raises (rulings of 7 Oct 2026, 20271007180207) — one read-only
 * section: the annual increment and the held part, where the held part stands,
 * and each counted month's five numbers.
 *
 * Shown on the request page (whoever may see the request) and, read-only, on
 * My Pay Changes for the person themselves (default taken: the request page
 * never shows anyone their own raise). Two actions only, and the database
 * decides both:
 *   - the principal of that college may flag a month not yet counted, with a
 *     note (ruling 5);
 *   - the Director may decide a flagged month, once it is over, as met or missed;
 *   - the Director may lapse a held part still open, so a new raise can be
 *     asked for (one held raise at a time); nobody's pay changes.
 */

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  MONTH_STATUS_LABELS,
  TARGET_KEYS,
  TARGET_LABELS,
  canDecideMonth,
  canFlagMonth,
  canLapsePlan,
  longDate,
  monthName,
  planStateText,
  resultText,
  targetRule,
  type RaiseTargets,
  type TargetMonth,
  type TargetPlanState,
} from '@/lib/hr/salary-revision';
import { rupees } from './revision-bits';

const STATE_LABELS: Record<TargetPlanState, string> = {
  none: 'Nothing held',
  awaiting_measurement: 'Held: targets being set up',
  waiting: 'Held: waiting for targets',
  released: 'Held part paid',
  paused: 'Held part paused',
  back_to_director: 'Back with the Director',
  held_listed: 'Held: listed for the Director',
  lapsed: 'Lapsed',
};

const STATE_TONE: Record<TargetPlanState, string> = {
  none: 'border-border text-muted-foreground',
  awaiting_measurement: 'border-amber-500/50 text-amber-700 dark:text-amber-400',
  waiting: 'border-amber-500/50 text-amber-700 dark:text-amber-400',
  released: 'border-emerald-500/50 text-emerald-700 dark:text-emerald-400',
  paused: 'border-amber-500/50 text-amber-700 dark:text-amber-400',
  back_to_director: 'border-sky-500/50 text-sky-700 dark:text-sky-400',
  held_listed: 'border-sky-500/50 text-sky-700 dark:text-sky-400',
  lapsed: 'border-border text-muted-foreground',
};

/** How many months the table shows, newest first. */
const MONTHS_SHOWN = 6;

export interface TargetSectionProps {
  targets: RaiseTargets;
  /** Today in India, yyyy-MM-dd. */
  today: string;
  /** The principal's flag button (the database still decides). */
  canFlag?: boolean;
  /** The Director's decision on a flagged month (the database still decides). */
  canDecide?: boolean;
  busy?: boolean;
  onFlag?: (month: string, note: string) => void;
  onDecide?: (month: string, met: boolean) => void;
  onLapse?: (note: string) => void;
}

export function TargetSection({ targets, today, canFlag, canDecide, busy, onFlag, onDecide, onLapse }: TargetSectionProps) {
  const [flagging, setFlagging] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [lapsing, setLapsing] = useState(false);
  const [lapseNote, setLapseNote] = useState('');
  const { plan, flags } = targets;
  if (!plan) return null;

  const months = [...targets.months].sort((a, b) => b.month.localeCompare(a.month)).slice(0, MONTHS_SHOWN);
  const thresholds = plan.rules.targets;
  const flagFor = (m: TargetMonth) => flags.find((f) => f.month === m.month) ?? null;

  return (
    <section className='space-y-3 rounded-md border border-border p-4' data-testid='raise-targets'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='font-semibold'>Raise in two parts</h2>
        <Badge variant='outline' className={`font-normal ${STATE_TONE[plan.state]}`} data-testid='target-state'>
          {STATE_LABELS[plan.state]}
        </Badge>
      </div>

      <dl className='grid grid-cols-2 gap-3'>
        <div className='rounded-md border border-border p-3'>
          <dt className='text-xs text-muted-foreground'>Annual increment ({plan.rules.annual_increment_percent}%)</dt>
          <dd className='text-lg font-semibold tabular-nums' data-testid='increment-amount'>{rupees(plan.increment_amount)}</dd>
          <dd className='text-xs text-muted-foreground'>Starts on the start date</dd>
        </div>
        <div className='rounded-md border border-border p-3'>
          <dt className='text-xs text-muted-foreground'>Held part, a month</dt>
          <dd className='text-lg font-semibold tabular-nums' data-testid='held-amount'>{rupees(plan.held_amount)}</dd>
          <dd className='text-xs text-muted-foreground'>Paid once targets are met</dd>
        </div>
      </dl>

      <p className='text-sm' data-testid='target-state-text'>{planStateText(plan)}</p>
      {plan.run_note && (
        <p className='rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs'>{plan.run_note}</p>
      )}
      {plan.lapse_note && <p className='text-xs text-muted-foreground'>Director&apos;s note: {plan.lapse_note}</p>}

      {canDecide && onLapse && canLapsePlan(plan) && (
        lapsing ? (
          <div className='space-y-1' data-testid='lapse-held'>
            <Textarea value={lapseNote} onChange={(e) => setLapseNote(e.target.value)} maxLength={2000}
              aria-label='Why the held part lapses'
              placeholder='Why? The held part stops being checked; nobody’s pay changes.' />
            <div className='flex gap-1'>
              <Button size='sm' variant='destructive' disabled={!lapseNote.trim() || busy}
                onClick={() => { onLapse(lapseNote.trim()); setLapsing(false); }}>
                Lapse the held part
              </Button>
              <Button size='sm' variant='ghost' onClick={() => setLapsing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button size='sm' variant='outline' disabled={busy} onClick={() => { setLapsing(true); setLapseNote(''); }}>
            Lapse the held part…
          </Button>
        )
      )}

      {thresholds && (
        <ul className='space-y-1 text-xs text-muted-foreground' aria-label='The five targets'>
          {TARGET_KEYS.map((k) => (
            <li key={k}><span className='font-medium text-foreground'>{TARGET_LABELS[k]}:</span> {targetRule(k, thresholds)}</li>
          ))}
        </ul>
      )}

      {thresholds && months.length > 0 && (
        <div className='overflow-x-auto'>
          <table className='w-full min-w-[36rem] text-left text-xs' data-testid='target-months'>
            <thead className='text-muted-foreground'>
              <tr>
                <th className='py-1 pr-2 font-medium'>Month</th>
                {TARGET_KEYS.map((k) => (
                  <th key={k} className='py-1 pr-2 font-medium' title={TARGET_LABELS[k]}>{TARGET_LABELS[k]}</th>
                ))}
                <th className='py-1 font-medium'>Result</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const flag = flagFor(m);
                const showFlag = canFlag && onFlag && canFlagMonth(plan, m);
                const showDecide = canDecide && onDecide && canDecideMonth(m, today);
                return (
                  <tr key={m.month} className='border-t border-border align-top' data-testid='target-month'>
                    <td className='py-2 pr-2 font-medium'>{monthName(m.month)}</td>
                    {TARGET_KEYS.map((k) => {
                      const r = m.results.find((x) => x.target === k);
                      return (
                        <td key={k} className='py-2 pr-2 tabular-nums'>
                          {r ? (
                            <>
                              <span>{resultText(r)}</span>{' '}
                              <span className={r.met ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}>
                                {r.met ? 'met' : 'not met'}
                              </span>
                            </>
                          ) : '—'}
                        </td>
                      );
                    })}
                    <td className='space-y-1 py-2'>
                      <span className='block'>{MONTH_STATUS_LABELS[m.status]}</span>
                      {m.action && m.action !== 'none' && m.action_effective_from && (
                        <span className='block text-muted-foreground'>
                          Held part {m.action} from {longDate(m.action_effective_from)}
                        </span>
                      )}
                      {flag && (
                        <span className='block text-muted-foreground' data-testid='flag-note'>Principal: {flag.note}</span>
                      )}
                      {showFlag && flagging !== m.month && (
                        <Button size='sm' variant='outline' disabled={busy} onClick={() => { setFlagging(m.month); setNote(''); }}>
                          Flag this month…
                        </Button>
                      )}
                      {showFlag && flagging === m.month && (
                        <span className='block space-y-1'>
                          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
                            aria-label='Why this month should go to the Director'
                            placeholder='Why? The Director sees this with the numbers.' />
                          <span className='flex gap-1'>
                            <Button size='sm' disabled={!note.trim() || busy}
                              onClick={() => { onFlag(m.month, note.trim()); setFlagging(null); }}>
                              Send to the Director
                            </Button>
                            <Button size='sm' variant='ghost' onClick={() => setFlagging(null)}>Cancel</Button>
                          </span>
                        </span>
                      )}
                      {showDecide && (
                        <span className='flex flex-wrap gap-1'>
                          <Button size='sm' disabled={busy} onClick={() => onDecide(m.month, true)}>Count as met</Button>
                          <Button size='sm' variant='outline' disabled={busy} onClick={() => onDecide(m.month, false)}>
                            Count as missed
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
