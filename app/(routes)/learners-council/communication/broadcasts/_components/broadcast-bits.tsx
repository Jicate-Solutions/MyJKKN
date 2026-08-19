'use client';

/**
 * The pieces both broadcast screens render identically.
 *
 * The approver and the sender look at the same row and must be told the same
 * story about it — the same deadline, the same reach. Keeping these in one
 * place is what stops the two screens drifting into two different accounts of
 * one message.
 */

import { useSyncExternalStore } from 'react';
import { Users, Building2 } from 'lucide-react';
import { describeAutoSend, describeReach, formatMoment } from '@/lib/learners-council/broadcast-reach';
import type { BroadcastRequestView } from '@/lib/learners-council/broadcast-server';

const MINUTE_MS = 60_000;

/** Notify React once a minute so a countdown on screen keeps counting down. */
function subscribeToMinutes(onChange: () => void): () => void {
  const timer = setInterval(onChange, MINUTE_MS);
  return () => clearInterval(timer);
}

/**
 * The wall clock, rounded down to the minute.
 *
 * The rounding is what makes this safe to use as an external-store snapshot:
 * React compares snapshots by identity, so returning a raw Date.now() on every
 * read would look like a change on every render and loop forever. Rounding
 * gives one stable value per minute, which is exactly the resolution the
 * countdown is displayed at.
 */
let cachedMinute = 0;
function readMinute(): number {
  const minute = Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
  if (minute !== cachedMinute) cachedMinute = minute;
  return cachedMinute;
}

/** On the server there is no clock to read — say so rather than guessing one. */
function noClockOnServer(): null {
  return null;
}

/**
 * The current time, but only once the browser is running.
 *
 * The server and the first client render both get null, so the markup matches
 * and hydration is clean; the real time arrives immediately afterwards. A clock
 * read during rendering would differ between server and browser and corrupt the
 * hydrated tree.
 */
export function useLiveClock(): number | null {
  return useSyncExternalStore(subscribeToMinutes, readMinute, noClockOnServer);
}

/** The deadline as a sentence, refreshed every minute in the browser. */
export function CountdownLine({
  autoSendAt,
  nowMs,
  voice,
}: {
  autoSendAt: string;
  nowMs: number | null;
  voice: 'approver' | 'sender';
}) {
  const passed = nowMs !== null && new Date(autoSendAt).getTime() <= nowMs;

  return (
    <div
      className={
        passed
          ? 'rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
          : 'rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
      }
    >
      {nowMs === null
        ? `Sends itself on ${formatMoment(autoSendAt)} if nothing is decided.`
        : describeAutoSend(autoSendAt, nowMs, voice)}
      <span className="ml-1 font-normal opacity-80">(deadline {formatMoment(autoSendAt)})</span>
    </div>
  );
}

/**
 * Who this message lands on.
 *
 * The colleges come straight off the stored payload and are exact. The
 * headcount is counted through the viewer's own visibility and can fail, so it
 * appears only when it actually worked — a missing count is stated as missing
 * rather than shown as a reassuring zero.
 */
export function ReachLines({ request }: { request: BroadcastRequestView }) {
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex items-start gap-1.5">
        <Building2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <span>
          <span className="text-muted-foreground">Goes to: </span>
          {request.targetingRecognised ? (
            <>
              <span className="font-medium">
                {request.colleges.length > 0
                  ? request.colleges.join(', ')
                  : 'colleges named by identifier only'}
              </span>
              {request.unnamedCollegeCount > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  (+{request.unnamedCollegeCount} whose name could not be read)
                </span>
              )}
              <span className="text-muted-foreground"> — {describeReach(request.reach)}</span>
            </>
          ) : (
            <span className="font-medium text-red-700 dark:text-red-300">
              this message&apos;s audience is stored in a form this page cannot read — check with the
              Learners Council office before acting on it
            </span>
          )}
        </span>
      </div>

      <div className="flex items-start gap-1.5">
        <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <span>
          {request.headcount === null ? (
            <span className="text-muted-foreground">
              How many learners that is could not be counted here — judge the reach from the colleges
              above, not from a missing number.
            </span>
          ) : request.headcountIsCeiling ? (
            <>
              <span className="font-medium">
                At most {request.headcount.toLocaleString('en-IN')} learners
              </span>
              <span className="text-muted-foreground">
                {' '}
                — the message narrows further than college level, so the real number is lower.
              </span>
            </>
          ) : (
            <>
              <span className="font-medium">
                About {request.headcount.toLocaleString('en-IN')} learners
              </span>
              <span className="text-muted-foreground"> will receive this.</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
