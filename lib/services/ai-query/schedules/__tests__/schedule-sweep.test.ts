/**
 * The cron half of scheduled AI Assistant questions (schedule-sweep.ts) and the
 * email it sends (schedule-email.ts). The database decisions are proved in
 * schedules-sql.pg.test.ts; here the Supabase client is a recording fake, so
 * these tests pin what the sweep DOES with each answer the database gives it:
 * who is emailed, who is notified, and that one bad row never stops the rest.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/resend', () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock('@/lib/services/_shared/notifications/notify', () => ({ fanoutNotification: vi.fn() }));

import type { SupabaseClient } from '@supabase/supabase-js';
import { runScheduledReports, type ScheduleEmailMessage } from '../schedule-sweep';
import { answerToSimpleHtml, buildScheduleEmail, answerExcerpt, PRIVATE_FOOTER } from '../schedule-email';

const OWNER = '00000000-0000-4000-8000-00000000a001';

interface Claimed {
  schedule_id: string;
  owner_id: string;
  owner_email: string | null;
  title: string;
  question: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  weekday: number | null;
  day_of_month: number | null;
  time_ist: string;
  channels: ('in_app' | 'email')[];
  job_id: string | null;
  job_status: string;
  answer: string | null;
  artifacts: unknown;
  timed_out: boolean;
  consecutive_failures: number;
}

function claimed(over: Partial<Claimed> = {}): Claimed {
  return {
    schedule_id: 's1',
    owner_id: OWNER,
    owner_email: 'owner@jkkn.ac.in',
    title: 'Weekly count',
    question: 'How many learners came today?',
    cadence: 'weekly',
    weekday: 1,
    day_of_month: null,
    time_ist: '09:00:00',
    channels: ['in_app', 'email'],
    job_id: 'j1',
    job_status: 'done',
    answer: '**42** learners',
    artifacts: null,
    timed_out: false,
    consecutive_failures: 0,
    ...over,
  };
}

function fakeAdmin(opts: {
  claimed?: Claimed[];
  recordPaused?: boolean;
  recordError?: string;
  due?: { id: string; owner_id: string; title: string }[];
  enqueue?: Record<string, unknown>;
}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const admin = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === 'fn_ai_query_schedule_claim_deliveries') return { data: opts.claimed ?? [], error: null };
      if (fn === 'fn_ai_query_schedule_record_outcome') {
        if (opts.recordError) return { data: null, error: { message: opts.recordError } };
        return { data: { ok: true, paused: args.p_outcome === 'failed' && !!opts.recordPaused }, error: null };
      }
      if (fn === 'fn_ai_enqueue_scheduled') {
        if (args.p_schedule_id === 'boom') return { data: null, error: { message: 'db down' } };
        return { data: opts.enqueue ?? { ok: true, status: 'queued' }, error: null };
      }
      return { data: null, error: null };
    }),
    from: vi.fn(() => {
      const q = {
        select: () => q,
        eq: () => q,
        lte: () => q,
        order: () => q,
        limit: async () => ({ data: opts.due ?? [], error: null }),
      };
      return q;
    }),
  };
  return { admin: admin as unknown as SupabaseClient, calls };
}

function deps() {
  const emails: ScheduleEmailMessage[] = [];
  type Note = { userIds: string[]; title: string; body: string; idempotencyKey?: string; url?: string; extraColumns?: Record<string, unknown> };
  const notes: Note[] = [];
  return {
    emails,
    notes,
    deps: {
      appUrl: 'https://www.jkkn.ai',
      sendEmail: vi.fn(async (m: ScheduleEmailMessage) => {
        emails.push(m);
      }),
      notify: vi.fn(async (_a: unknown, o: Note) => {
        notes.push(o);
        return { notified: 1 };
      }),
    },
  };
}

describe('delivering a finished run', () => {
  it('emails ONLY the owner’s own address and notifies ONLY the owner, then records delivered', async () => {
    const { admin, calls } = fakeAdmin({ claimed: [claimed()] });
    const d = deps();
    const s = await runScheduledReports(admin, d.deps);
    expect(s.delivered).toBe(1);
    expect(d.emails).toHaveLength(1);
    expect(d.emails[0].to).toBe('owner@jkkn.ac.in');
    expect(d.emails[0].subject).toBe('Weekly count');
    expect(d.emails[0].html).toContain('<strong>42</strong> learners');
    expect(d.emails[0].html).toContain('https://www.jkkn.ai/ai-query?scheduled=s1');
    expect(d.emails[0].idempotencyKey).toBe('ai-schedule-j1');
    expect(d.notes).toHaveLength(1);
    expect(d.notes[0].userIds).toEqual([OWNER]);
    expect(d.notes[0].url).toBe('/ai-query?scheduled=s1');
    // leaves the bell after 8 days instead of piling up one unread row per run
    const ttl = Date.parse(String(d.notes[0].extraColumns?.expires_at)) - Date.now();
    expect(ttl).toBeGreaterThan(7 * 86_400_000);
    expect(ttl).toBeLessThanOrEqual(8 * 86_400_000);
    const rec = calls.find((c) => c.fn === 'fn_ai_query_schedule_record_outcome');
    expect(rec?.args).toEqual({ p_schedule_id: 's1', p_job_id: 'j1', p_outcome: 'delivered' });
  });

  it('respects the chosen channels', async () => {
    const d1 = deps();
    await runScheduledReports(fakeAdmin({ claimed: [claimed({ channels: ['email'] })] }).admin, d1.deps);
    expect(d1.emails).toHaveLength(1);
    expect(d1.notes).toHaveLength(0);
    const d2 = deps();
    await runScheduledReports(fakeAdmin({ claimed: [claimed({ channels: ['in_app'] })] }).admin, d2.deps);
    expect(d2.emails).toHaveLength(0);
    expect(d2.notes).toHaveLength(1);
  });

  it('with no email address on file, falls back to in-app instead of emailing anyone else', async () => {
    const d = deps();
    const s = await runScheduledReports(
      fakeAdmin({ claimed: [claimed({ channels: ['email'], owner_email: null })] }).admin,
      d.deps,
    );
    expect(d.emails).toHaveLength(0);
    expect(d.notes).toHaveLength(1);
    expect(s.delivered).toBe(1);
  });

  it('when every chosen channel fails, the run counts as failed', async () => {
    const d = deps();
    d.deps.sendEmail = vi.fn(async () => {
      throw new Error('resend down');
    });
    const { admin, calls } = fakeAdmin({ claimed: [claimed({ channels: ['email'] })] });
    const s = await runScheduledReports(admin, d.deps);
    expect(s.failed).toBe(1);
    expect(s.email_errors).toBe(1);
    expect(calls.find((c) => c.fn === 'fn_ai_query_schedule_record_outcome')?.args.p_outcome).toBe('failed');
  });

  it('NOT SILENT: email-only and the email fails → a failure, and the owner is told in-app', async () => {
    const d = deps();
    d.deps.sendEmail = vi.fn(async () => {
      throw new Error('resend down');
    });
    const s = await runScheduledReports(fakeAdmin({ claimed: [claimed({ channels: ['email'] })] }).admin, d.deps);
    expect(s.failed).toBe(1);
    expect(s.delivered).toBe(0);
    expect(d.notes).toHaveLength(1);
    expect(d.notes[0].userIds).toEqual([OWNER]);
    expect(d.notes[0].title).toBe('Scheduled answer not delivered');
    expect(d.notes[0].body).toContain('could not be delivered by email');
    expect(d.notes[0].url).toBe('/ai-query?scheduled=s1');
  });

  it('NOT SILENT: in-app only and the notification fails → the owner is emailed a short note at their own address', async () => {
    const d = deps();
    d.deps.notify = vi.fn(async () => {
      throw new Error('bell down');
    });
    const s = await runScheduledReports(fakeAdmin({ claimed: [claimed({ channels: ['in_app'] })] }).admin, d.deps);
    expect(s.failed).toBe(1);
    expect(d.emails).toHaveLength(1);
    expect(d.emails[0].to).toBe('owner@jkkn.ac.in');
    expect(d.emails[0].subject).toBe('Not delivered: Weekly count');
    expect(d.emails[0].html).toContain('could not be delivered by MyJKKN notification');
    // the note carries no part of the answer
    expect(d.emails[0].html).not.toContain('42');
  });

  it('PAUSE AFTER 3 on an undelivered answer: an email-only owner is told in-app', async () => {
    const d = deps();
    d.deps.sendEmail = vi.fn(async () => {
      throw new Error('resend down');
    });
    const s = await runScheduledReports(
      fakeAdmin({ claimed: [claimed({ channels: ['email'] })], recordPaused: true }).admin,
      d.deps,
    );
    expect(s.paused_after_failures).toBe(1);
    const pause = d.notes.find((n) => n.title === 'Scheduled question paused');
    expect(pause?.userIds).toEqual([OWNER]);
    expect(pause?.body).toContain('3 times in a row');
    expect(pause?.body).toContain('could not be delivered');
    expect(pause?.idempotencyKey).toBe('ai_schedule_paused:j1');
  });

  it('PAUSE AFTER 3 when in-app is the channel that failed: the pause notice also goes by email', async () => {
    const d = deps();
    d.deps.notify = vi.fn(async () => {
      throw new Error('bell down');
    });
    const s = await runScheduledReports(
      fakeAdmin({ claimed: [claimed({ channels: ['in_app'] })], recordPaused: true }).admin,
      d.deps,
    );
    expect(s.paused_after_failures).toBe(1);
    expect(d.emails).toHaveLength(1);
    expect(d.emails[0].subject).toBe('Paused: Weekly count');
    expect(d.emails[0].to).toBe('owner@jkkn.ac.in');
  });

  it('a failed record call is logged, not swallowed (the claim retries the run later)', async () => {
    const d = deps();
    const s = await runScheduledReports(fakeAdmin({ claimed: [claimed()], recordError: 'deadlock' }).admin, d.deps);
    expect(s.delivered).toBe(1);
    expect(s.errors).toContain('record s1: deadlock');
  });

  it('the answer email says it is for the owner only', async () => {
    const d = deps();
    await runScheduledReports(fakeAdmin({ claimed: [claimed()] }).admin, d.deps);
    expect(PRIVATE_FOOTER).toBe("From MyJKKN, sent only to you — please don't forward it.");
    expect(d.emails[0].html).toContain('From MyJKKN, sent only to you — please don&#39;t forward it.');
  });

  it('charts are linked, never embedded', async () => {
    const d = deps();
    await runScheduledReports(
      fakeAdmin({
        claimed: [claimed({ artifacts: [{ id: 'a', type: 'chart', title: 'Attendance by week' }] })],
      }).admin,
      d.deps,
    );
    const html = d.emails[0].html;
    expect(html).toContain('Attendance by week');
    expect(html).not.toMatch(/<img|<svg|<script|<iframe/i);
  });
});

describe('failed runs', () => {
  it('records a failure without telling the owner while the schedule is still running', async () => {
    const d = deps();
    const { admin, calls } = fakeAdmin({ claimed: [claimed({ job_status: 'error', answer: null })] });
    const s = await runScheduledReports(admin, d.deps);
    expect(s.failed).toBe(1);
    expect(calls.find((c) => c.fn === 'fn_ai_query_schedule_record_outcome')?.args.p_outcome).toBe('failed');
    expect(d.notes).toHaveLength(0);
    expect(d.emails).toHaveLength(0);
  });

  it('PAUSE AFTER 3: when the database pauses the schedule, the owner is told in-app and by email', async () => {
    const d = deps();
    const s = await runScheduledReports(
      fakeAdmin({ claimed: [claimed({ job_status: 'timed_out', answer: null, timed_out: true })], recordPaused: true })
        .admin,
      d.deps,
    );
    expect(s.paused_after_failures).toBe(1);
    expect(d.notes).toHaveLength(1);
    expect(d.notes[0].title).toBe('Scheduled question paused');
    expect(d.notes[0].body).toContain('3 times in a row');
    expect(d.emails).toHaveLength(1);
    expect(d.emails[0].to).toBe('owner@jkkn.ac.in');
    expect(d.emails[0].subject).toBe('Paused: Weekly count');
  });

  it('a run stuck twice while being sent pauses with the right reason', async () => {
    const d = deps();
    await runScheduledReports(
      fakeAdmin({ claimed: [claimed({ job_status: 'undelivered', answer: null })], recordPaused: true }).admin,
      d.deps,
    );
    expect(d.notes[0].body).toContain('the answer could not be delivered');
  });

  it('a run whose job row is gone is recorded as failed with no job id', async () => {
    const d = deps();
    const { admin, calls } = fakeAdmin({
      claimed: [claimed({ job_id: null, job_status: 'missing', answer: null })],
      recordPaused: true,
    });
    const s = await runScheduledReports(admin, d.deps, new Date('2026-09-23T04:00:00Z'));
    expect(s.failed).toBe(1);
    expect(calls.find((c) => c.fn === 'fn_ai_query_schedule_record_outcome')?.args).toEqual({
      p_schedule_id: 's1',
      p_job_id: null,
      p_outcome: 'failed',
    });
    expect(d.notes[0].idempotencyKey).toBe('ai_schedule_paused:s1:2026-09-23');
    expect(d.notes[0].body).toContain('no answer came back');
  });

  it('an empty answer is a failure, not a blank email', async () => {
    const d = deps();
    const s = await runScheduledReports(fakeAdmin({ claimed: [claimed({ answer: '   ' })] }).admin, d.deps);
    expect(s.failed).toBe(1);
    expect(d.emails).toHaveLength(0);
  });
});

describe('queueing due schedules', () => {
  it('asks the database to enqueue each due schedule', async () => {
    const { admin, calls } = fakeAdmin({
      due: [
        { id: 'a', owner_id: OWNER, title: 'A' },
        { id: 'b', owner_id: OWNER, title: 'B' },
      ],
    });
    const s = await runScheduledReports(admin, deps().deps);
    expect(s.enqueued).toBe(2);
    expect(calls.filter((c) => c.fn === 'fn_ai_enqueue_scheduled').map((c) => c.args.p_schedule_id)).toEqual(['a', 'b']);
  });

  it('tells the owner when the daily limit skipped a run', async () => {
    const d = deps();
    const s = await runScheduledReports(
      fakeAdmin({
        due: [{ id: 'a', owner_id: OWNER, title: 'A' }],
        enqueue: { ok: false, status: 'skipped_limit', cap: 50, used: 50, next_run_at: '2026-09-28T03:30:00Z' },
      }).admin,
      d.deps,
      new Date('2026-09-23T04:00:00Z'),
    );
    expect(s.skipped.skipped_limit).toBe(1);
    expect(d.notes).toHaveLength(1);
    expect(d.notes[0].userIds).toEqual([OWNER]);
    expect(d.notes[0].body).toContain('limit of 50');
    expect(d.notes[0].idempotencyKey).toBe('ai_schedule_limit:a:2026-09-23');
  });

  it('tells the owner when lost access paused a schedule', async () => {
    const d = deps();
    await runScheduledReports(
      fakeAdmin({ due: [{ id: 'a', owner_id: OWNER, title: 'A' }], enqueue: { ok: false, status: 'paused_no_access' } })
        .admin,
      d.deps,
    );
    expect(d.notes).toHaveLength(1);
    expect(d.notes[0].body).toContain('no longer has access');
  });

  it('stays quiet on "busy" (retried next tick) and never throws on one bad row', async () => {
    const d = deps();
    const s = await runScheduledReports(
      fakeAdmin({
        due: [
          { id: 'boom', owner_id: OWNER, title: 'X' },
          { id: 'b', owner_id: OWNER, title: 'B' },
        ],
        enqueue: { ok: false, status: 'busy' },
      }).admin,
      d.deps,
    );
    expect(s.errors.some((e) => e.includes('db down'))).toBe(true);
    expect(s.skipped.busy).toBe(1);
    expect(d.notes).toHaveLength(0);
  });
});

describe('the email body is safe', () => {
  it('escapes HTML in the answer, question and title', () => {
    const { html, subject } = buildScheduleEmail({
      scheduleId: 's1',
      title: 'Report <b>x</b>',
      question: '<img src=x onerror=alert(1)>',
      answer: '<script>alert(1)</script> and [a link](javascript:alert(1))',
      artifacts: [],
      cadenceText: 'every day at 9:00 am (IST)',
      appUrl: 'https://www.jkkn.ai/',
    });
    expect(subject).toBe('Report <b>x</b>'); // subject is plain text, not HTML
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/href="javascript:/);
    expect(html).toContain('href="https://www.jkkn.ai/ai-query?scheduled=s1"');
  });

  it('turns markdown tables, lists and headings into simple HTML', () => {
    const html = answerToSimpleHtml(
      ['## Summary', '- one', '- two', '', '| College | Present |', '|---|---:|', '| Arts | 120 |'].join('\n'),
    );
    expect(html).toContain('<h3');
    expect(html).toMatch(/<ul[^>]*><li>one<\/li><li>two<\/li><\/ul>/);
    expect(html).toContain('<th');
    expect(html).toContain('>Arts</td>');
    expect(html).not.toContain('---');
  });

  it('the in-app excerpt is short plain text', () => {
    const e = answerExcerpt(`## Title\n| a | b |\n|---|---|\n| 1 | 2 |\n${'word '.repeat(100)}`);
    expect(e.length).toBeLessThanOrEqual(180);
    expect(e).not.toMatch(/[#|*`]/);
  });
});
