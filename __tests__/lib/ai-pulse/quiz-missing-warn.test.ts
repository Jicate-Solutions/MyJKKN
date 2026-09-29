/**
 * Guard: the "this cycle has no quiz" check must keep looking in the ONE place
 * the quiz actually lives, and must keep telling somebody.
 *
 * WHY THIS EXISTS
 *   On 2026-09-17 the AI Pulse session ran with 437 attendees and ZERO quiz
 *   submissions, against 198 and 195 the two cycles before. No quiz had been
 *   authored for that cycle and nothing anywhere said so. The fix is
 *   app/api/cron/ai-pulse-quiz-missing-warn.
 *
 *   That fix has exactly one silent failure mode: read config.ai_pulse.quiz
 *   instead of config.quiz and it flags EVERY cycle forever (which reads as
 *   noise and gets switched off); read some other shape and it flags none
 *   (which reads as "all clear" and is indistinguishable from working). Either
 *   way the run still answers HTTP 200. So the config path is pinned here
 *   against the REAL production shapes rather than left to review.
 *
 * WHAT THESE ASSERTIONS ARE ANCHORED TO
 *   Two different things, on purpose — the same split the sibling
 *   __tests__/ci/ai-pulse-notification-ttl-guard.test.ts makes. The detection
 *   assertions RUN the helper against config objects copied off production on
 *   2026-09-17. The route assertions read the SOURCE FILE off disk, because a
 *   test that re-derives the rule it is checking proves only that it agrees
 *   with itself.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_WARN_DAYS,
  MAX_WARN_DAYS,
  QUIZ_AUTHOR_PERMISSION,
  WARN_DAYS_KEY,
  WARN_ENABLED_KEY,
  daysBetweenDateKeys,
  istDateKey,
  prettyDay,
  quizGapReason,
  warnBody,
  warnTitle,
} from '@/lib/services/ai-pulse/quiz-missing-warn';
import { AI_ROUTINES } from '@/lib/ai-routines/registry';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const ROUTE = 'app/api/cron/ai-pulse-quiz-missing-warn/route.ts';
const MIGRATION = 'supabase/migrations/20260917175510_ai_pulse_quiz_missing_warn.sql';

/**
 * Config shapes read off production on 2026-09-17. `working` is what a cycle
 * with an authored quiz looks like (2026-09-10 and 2026-09-03, 5 questions
 * each); `silent` is the one that cost the session (2026-09-17).
 */
const PROD_WORKING_CONFIG = {
  kind: 'ai_pulse',
  ai_pulse: { session_start_time: '18:55', session_end_time: '19:30' },
  quiz: {
    questions: [
      { id: 'q1', question_en: 'a', question_ta: 'a', options: [] },
      { id: 'q2', question_en: 'b', question_ta: 'b', options: [] },
      { id: 'q3', question_en: 'c', question_ta: 'c', options: [] },
      { id: 'q4', question_en: 'd', question_ta: 'd', options: [] },
      { id: 'q5', question_en: 'e', question_ta: 'e', options: [] },
    ],
    pass_threshold_live: 50,
    pass_threshold_async: 60,
    schedule_publication: false,
  },
};

const PROD_SILENT_CONFIG = {
  kind: 'ai_pulse',
  ai_pulse: { session_start_time: '18:55', session_end_time: '19:30' },
};

describe('quizGapReason — where the quiz actually lives', () => {
  it('passes a production cycle that HAS an authored quiz', () => {
    expect(quizGapReason(PROD_WORKING_CONFIG)).toEqual({ reason: null, questionCount: 5 });
  });

  it('flags the 2026-09-17 shape that ran with 437 attendees and no quiz', () => {
    expect(quizGapReason(PROD_SILENT_CONFIG)).toEqual({
      reason: 'no_quiz_key',
      questionCount: 0,
    });
  });

  it('reads config.quiz, NOT config.ai_pulse.quiz', () => {
    // The whole guard turns on this one path. A quiz nested under ai_pulse is
    // not where QuizService.saveQuiz writes it, so it must NOT count as found —
    // otherwise a future refactor that moves the read one level down would let
    // every real gap through while the suite stayed green.
    const nested = {
      kind: 'ai_pulse',
      ai_pulse: { quiz: { questions: [{ id: 'q1' }, { id: 'q2' }] } },
    };
    expect(quizGapReason(nested).reason).toBe('no_quiz_key');

    // And the inverse: a top-level quiz counts even when ai_pulse has none.
    expect(quizGapReason({ kind: 'ai_pulse', quiz: { questions: [{ id: 'q1' }] } })).toEqual({
      reason: null,
      questionCount: 1,
    });
  });

  it('separates "nobody opened the editor" from "somebody saved an empty one"', () => {
    // Different messages to whoever reads the bell card, so they are different
    // reasons rather than one collapsed "missing".
    expect(quizGapReason({ quiz: { questions: [] } }).reason).toBe('no_questions');
    expect(quizGapReason({ quiz: { pass_threshold_live: 50 } }).reason).toBe('no_questions');
    expect(quizGapReason({}).reason).toBe('no_quiz_key');
  });

  it('treats a non-object quiz as missing rather than throwing', () => {
    for (const bad of [null, undefined, 'quiz', 42, [], true]) {
      expect(quizGapReason({ quiz: bad }).reason).toBe('no_quiz_key');
    }
    expect(quizGapReason(null).reason).toBe('no_quiz_key');
    expect(quizGapReason(undefined).reason).toBe('no_quiz_key');
  });
});

describe('the window arithmetic', () => {
  it('reads today in IST, not UTC', () => {
    // 2026-09-17T20:00Z is already the 18th in Salem (IST = UTC+5:30). Reading
    // this in UTC would call a session on the 18th "tomorrow" when it is today.
    expect(istDateKey(new Date('2026-09-17T20:00:00Z'))).toBe('2026-09-18');
    expect(istDateKey(new Date('2026-09-17T18:29:00Z'))).toBe('2026-09-17');
    // And the IST day rolls at 18:30Z exactly.
    expect(istDateKey(new Date('2026-09-17T18:30:00Z'))).toBe('2026-09-18');
  });

  it('counts whole days between two date keys', () => {
    expect(daysBetweenDateKeys('2026-09-17', '2026-09-17')).toBe(0);
    expect(daysBetweenDateKeys('2026-09-14', '2026-09-17')).toBe(3);
    expect(daysBetweenDateKeys('2026-09-18', '2026-09-17')).toBe(-1);
    // Across a month boundary, which is where naive arithmetic breaks.
    expect(daysBetweenDateKeys('2026-08-30', '2026-09-02')).toBe(3);
  });

  it('returns null for an unparseable date instead of guessing zero', () => {
    // A null demo_date read as "0 days away" would flag it every single day.
    expect(daysBetweenDateKeys('2026-09-17', '')).toBeNull();
    expect(daysBetweenDateKeys('2026-09-17', 'not-a-date')).toBeNull();
    expect(daysBetweenDateKeys('', '2026-09-17')).toBeNull();
  });

  it('would have caught the 2026-09-17 cycle on each of the three mornings before', () => {
    // The actual claim this PR makes. demo_date 2026-09-17, warn window 3 days.
    for (const day of ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17']) {
      const daysOut = daysBetweenDateKeys(day, '2026-09-17');
      expect(daysOut).not.toBeNull();
      expect(daysOut as number).toBeGreaterThanOrEqual(0);
      expect(daysOut as number).toBeLessThanOrEqual(DEFAULT_WARN_DAYS);
    }
    // Four days out is outside the window; the day after is behind it.
    expect(daysBetweenDateKeys('2026-09-13', '2026-09-17')).toBeGreaterThan(DEFAULT_WARN_DAYS);
    expect(daysBetweenDateKeys('2026-09-18', '2026-09-17')).toBeLessThan(0);
  });

  it('keeps the knobs at the documented defaults', () => {
    expect(DEFAULT_WARN_DAYS).toBe(3);
    expect(MAX_WARN_DAYS).toBe(30);
    expect(WARN_ENABLED_KEY).toBe('quiz_missing_warning_enabled');
    expect(WARN_DAYS_KEY).toBe('quiz_missing_warning_days');
    expect(QUIZ_AUTHOR_PERMISSION).toBe('aiPulse:quiz.author');
  });
});

describe('the copy a human actually reads', () => {
  it('says when the session is, in words', () => {
    expect(warnTitle('2026-09-17', 0)).toMatch(/tonight/i);
    expect(warnTitle('2026-09-18', 1)).toContain('18 Sep 2026');
    expect(warnBody('2026-09-18', 1, 'no_quiz_key', 0)).toContain('is tomorrow');
    expect(warnBody('2026-09-20', 3, 'no_quiz_key', 0)).toContain('is in 3 days');
    expect(warnBody('2026-09-17', 0, 'no_quiz_key', 0)).toContain('is today');
  });

  it('names the consequence with the real number, not the rule', () => {
    expect(warnBody('2026-09-20', 3, 'no_quiz_key', 0)).toContain('437');
  });

  it('distinguishes an empty saved quiz from no quiz at all', () => {
    expect(warnBody('2026-09-20', 3, 'no_questions', 0)).toMatch(/no questions in it/);
    expect(warnBody('2026-09-20', 3, 'no_quiz_key', 0)).toMatch(/no quiz has been authored/);
  });

  it('formats the day the way a person reads it', () => {
    expect(prettyDay('2026-09-17')).toBe('17 Sep 2026');
    expect(prettyDay('nonsense')).toBe('nonsense');
  });
});

describe('the route keeps the properties that make it a guard', () => {
  const src = read(ROUTE);

  it('authorises with CRON_SECRET in both accepted forms', () => {
    expect(src).toMatch(/Bearer \$\{cronSecret\}/);
    expect(src).toMatch(/searchParams\.get\('secret'\)/);
  });

  it('records a run row so a failing guard cannot fail invisibly', () => {
    // withCronRun is the only thing that makes a 500 from this route visible;
    // exporting a bare handler would put it back in the class of crons that
    // died for two weeks in 2026-08 with nothing going red.
    expect(src).toMatch(/withCronRun\('ai-pulse-quiz-missing-warn',\s*handler\)/);
  });

  it('stamps a cycle-derived expires_at rather than a literal', () => {
    expect(src).toMatch(/@\/lib\/services\/ai-pulse\/cycle-window/);
    expect(src).toMatch(/const expiresAt = cycleNotificationExpiresAt\(/);
    expect(src).not.toMatch(/expiresAt\s*=\s*new Date\(/);
  });

  it('never retroactively expires or deletes an existing notification', () => {
    // 1,005 ai_pulse rows already sit unexpired on production. Clearing them is
    // a separate Director decision a generator must never take by implication.
    expect(src).not.toMatch(/from\('notifications'\)[\s\S]{0,120}\.update\(/);
    expect(src).not.toMatch(/from\('notifications'\)[\s\S]{0,120}\.delete\(/);
  });

  it('keys idempotency per cycle PER DAY, so it re-nudges while the gap is open', () => {
    // A once-ever key would fire on the Monday and then let Thursday arrive in
    // silence — the exact failure this route was written for.
    expect(src).toMatch(/ai_pulse_quiz_missing_warn:\$\{cycleId\}:\$\{today\}/);
  });

  it('writes the user_notifications link row, not just the notification', () => {
    // The bell reads `user_notifications !inner notifications` filtered by
    // user_id. A notifications row carrying only targeting.user_ids renders to
    // nobody — the card exists, the alarm is silent, and the run still says 200.
    expect(src).toMatch(/from\('notifications'\)/);
    expect(src).toMatch(/from\('user_notifications'\)/);
    expect(src).toMatch(/notification_id: notificationId, user_id: uid/);
  });

  it('counts insert failures top-level instead of burying them in a 200', () => {
    expect(src).toMatch(/insert_errors: errors\.length/);
  });

  it('does not drag the meetings service (and googleapis) into a daily guard', () => {
    // createBellNotification does exactly what insertBellCard does, but it
    // lives in meeting-trigger-service, which imports GoogleCalendarService at
    // module scope. A once-a-day JSONB presence check should not pay for that.
    expect(src).not.toMatch(/meetings\/meeting-trigger-service/);
  });

  it('resolves recipients from the permission, not a hardcoded role key', () => {
    expect(src).toMatch(/QUIZ_AUTHOR_PERMISSION/);
    expect(src).not.toMatch(/'ai_pulse_champion'/);
  });

  it('refuses to answer 200 when it flagged a cycle with nobody to tell', () => {
    expect(src).toMatch(/no holder of aiPulse:quiz\.author and no super admin/);
    expect(src).toMatch(/\{ status: 500 \}/);
  });

  it('defaults the enable switch ON (an alarm that ships dark is the same bug)', () => {
    // Every sibling in this family reads `=== true` and is dark by default.
    // This one must read `=== false`, so an ABSENT policy row leaves it live.
    expect(src).toMatch(/enabledRaw === false/);
    expect(src).not.toMatch(/enabledRaw === true/);
  });

  it('reports top-level counters the dispatcher summary can actually print', () => {
    // summarizeRoutineResult prints HEADLINE_KEYS even at zero; anything nested
    // under a `summary` object is invisible and reads as a bare "HTTP 200".
    for (const key of ['processed:', 'flagged:', 'sent,', 'skipped,']) {
      expect(src).toContain(key);
    }
  });
});

describe('the wiring — a guard nobody schedules is not a guard', () => {
  it('is registered in the AI routine registry under its real trigger path', () => {
    const routine = AI_ROUTINES.find((r) => r.id === 'ai-pulse-quiz-missing-warn');
    expect(routine).toBeDefined();
    expect(routine?.triggerPath).toBe('/api/cron/ai-pulse-quiz-missing-warn');
    expect(routine?.type).toBe('cron');
    expect(routine?.category).toBe('ai-pulse');
    expect(routine?.callsClaude).toBe(false);
  });

  it('seeds the dispatcher schedule row the registry entry is resolved against', () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/INSERT INTO public\.ai_routine_schedules/);
    expect(sql).toMatch(/'ai-pulse-quiz-missing-warn'/);
    // Daily — a weekly warning gets one shot and can land on the one morning
    // nobody looked.
    expect(sql).toMatch(/ARRAY\[0,1,2,3,4,5,6\]::smallint\[\]/);
  });

  it('seeds both config knobs, with the enable switch defaulting true', () => {
    const sql = read(MIGRATION);
    expect(sql).toContain(WARN_ENABLED_KEY);
    expect(sql).toContain(WARN_DAYS_KEY);
    expect(sql).toMatch(/'true'::jsonb, 'bool'/);
    expect(sql).toMatch(/'3'::jsonb, 'int'/);
  });

  it('proves its end state with RAISE EXCEPTION, never RAISE NOTICE', () => {
    const sql = read(MIGRATION);
    // Strip -- comments first. The migration DISCUSSES the notice-reads-as-
    // success trap in its own header, and matching that prose would make this
    // assertion fail on a file that is correct — the same self-agreement bug
    // the sibling guards warn about, just inverted.
    const statements = sql.replace(/--[^\n]*/g, '');
    expect(statements).toMatch(/RAISE EXCEPTION/);
    expect(statements).not.toMatch(/RAISE NOTICE/);
    expect(statements).toMatch(/NOTIFY pgrst, 'reload schema';/);
  });
});
