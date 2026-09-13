/**
 * lib/services/onemark/draft-request — the client half of the AI request door
 * (Wave 3, Lane G). Pure functions; no Supabase, no React, injected fetch.
 *
 * The four things the lane spec asks these tests to pin down:
 *   - cap exhaustion is readable as a cap, not as a server fault;
 *   - a 503 contract-pending answer says nothing was queued or spent;
 *   - a filed run reports what went in AND what was rejected;
 *   - the poll's terminal states are terminal and the non-terminal ones are not.
 *
 * Plus the finding that made this lane's body shape what it is: since
 * migration 20260918150000 the live job type's input_schema is a single
 * required `prompt` field, and the route validates the REQUEST BODY against
 * it — so a body without `prompt` answers 400 "Missing: prompt".
 */
import { describe, it, expect } from 'vitest';
import {
  DRAFT_MAX_COUNT,
  JOB_NOT_FOUND,
  JOB_SIGNED_OUT,
  buildRequestBody,
  computeCaps,
  describeJob,
  describeLane,
  describeMonthlyCap,
  describeRemaining,
  istDayStart,
  istNextMidnight,
  isOpen,
  mapRequestOutcome,
  ownQueuePosition,
  readFiled,
  submitDraftRequest,
  unreadableJobView,
  validateRequest,
  type DraftJobTypeRow,
  type DraftRequestInput,
} from '@/lib/services/onemark/draft-request';

const EXAM = '11111111-1111-4111-8111-111111111111';
const TOPIC = '22222222-2222-4222-8222-222222222222';

const input: DraftRequestInput = {
  exam_definition_id: EXAM,
  exam_label: 'Physics',
  topic_id: TOPIC,
  topic_label: 'Electrostatics',
  tag_keys: ['definition_recall'],
  count: 5,
  bloom_level: 'K1',
};

const jobTypeRow: DraftJobTypeRow = {
  job_type: 'onemark.item_draft',
  title: 'OneMark drafting',
  lane: 'max',
  enabled: true,
  daily_cap_per_user: 5,
  monthly_spend_cap_inr: 5000,
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

describe('the request body', () => {
  it('carries the five domain fields AND the prompt the live input_schema requires', () => {
    const body = buildRequestBody(input);
    expect(Object.keys(body).sort()).toEqual(
      ['bloom_level', 'count', 'exam_definition_id', 'prompt', 'tag_keys', 'topic_id'].sort(),
    );
    expect(typeof body.prompt).toBe('string');
    expect(String(body.prompt)).toContain('Physics');
    expect(String(body.prompt)).toContain('Electrostatics');
  });

  it('sends a null unit rather than dropping the key', () => {
    const body = buildRequestBody({ ...input, topic_id: null, topic_label: null });
    expect(body.topic_id).toBeNull();
    expect(String(body.prompt)).toContain('no single unit');
  });

  it('de-duplicates the tag list the way the route does', () => {
    const body = buildRequestBody({ ...input, tag_keys: ['a', 'a', 'b'] });
    expect(body.tag_keys).toEqual(['a', 'b']);
  });
});

describe('what the panel refuses before the click', () => {
  it('needs a subject, a tag, a sane count and a JABT level', () => {
    expect(validateRequest(input)).toBeNull();
    expect(validateRequest({ ...input, exam_definition_id: '' })).toMatch(/subject/i);
    expect(validateRequest({ ...input, tag_keys: [] })).toMatch(/category tag/i);
    expect(validateRequest({ ...input, count: 0 })).toMatch(/between/i);
    expect(validateRequest({ ...input, count: DRAFT_MAX_COUNT + 1 })).toMatch(/between/i);
    expect(validateRequest({ ...input, bloom_level: null })).toMatch(/JABT/i);
  });
});

describe('reading the route answer', () => {
  it('202 is a queued request on the free lane', () => {
    const out = mapRequestOutcome(202, { ok: true, job_id: 'abc', lane: 'max' });
    expect(out.ok).toBe(true);
    expect(out.kind).toBe('queued');
    expect(out.jobId).toBe('abc');
    expect(out.message).toMatch(/no cost/i);
    expect(out.message).toMatch(/30 minutes/);
  });

  it('a spent daily cap arrives as a 502 carrying the enqueue text, and reads as a cap', () => {
    // fn_ai_enqueue answers {ok:false, error:'daily limit reached', cap, used};
    // the route has no branch for it and forwards only `error` at 502.
    const out = mapRequestOutcome(502, { error: 'daily limit reached' }, 5);
    expect(out.ok).toBe(false);
    expect(out.kind).toBe('cap_reached');
    expect(out.message).toContain('5');
    expect(out.message).toMatch(/midnight/i);
  });

  it('falls back to a countless sentence when the cap is not known', () => {
    const out = mapRequestOutcome(502, { error: 'daily limit reached' }, null);
    expect(out.kind).toBe('cap_reached');
    expect(out.message).toMatch(/today's requests/i);
  });

  it('503 says nothing was queued and nothing was spent', () => {
    const out = mapRequestOutcome(503, {
      error: 'contract pending',
      detail: 'The onemark.item_draft job type is not live yet.',
    });
    expect(out.kind).toBe('contract_pending');
    expect(out.message).toContain('not live yet');
  });

  it('a 503 with no detail still says nothing was spent', () => {
    expect(mapRequestOutcome(503, { error: 'contract pending' }).message).toMatch(/nothing was spent/i);
  });

  it('403 names the permission in plain words, 429 says one is already running', () => {
    expect(mapRequestOutcome(403, { error: 'Forbidden' }).kind).toBe('forbidden');
    expect(mapRequestOutcome(429, { error: 'A drafting request is already running.' }).kind).toBe(
      'already_running',
    );
  });

  it('401 is a dead session, not a refusal', () => {
    expect(mapRequestOutcome(401, { error: 'Unauthorized' }).kind).toBe('signed_out');
  });

  it('400 reaches the screen in plain words and keeps the route text for the console', () => {
    const out = mapRequestOutcome(400, { error: 'Missing: prompt' });
    expect(out.kind).toBe('invalid');
    // Lane G item 1: plain words, not job-queue words. "Missing: prompt" names
    // a field the person never filled in and cannot see.
    expect(out.message).not.toMatch(/Missing: prompt/);
    expect(out.message).toMatch(/reload the page/i);
    expect(out.detail).toBe('Missing: prompt');
  });

  it('maps the other route 400s a person could still trigger', () => {
    expect(mapRequestOutcome(400, { error: 'exam_definition_id must be a uuid' }).message).toMatch(
      /subject/i,
    );
    expect(mapRequestOutcome(400, { error: 'topic_id is not a unit of this exam' }).message).toMatch(
      /unit/i,
    );
    expect(
      mapRequestOutcome(400, { error: 'bloom_level must be one of K1, K2, K3' }).message,
    ).toMatch(/K1/);
    for (const raw of [
      'Missing: prompt',
      'exam_definition_id must be a uuid',
      'topic_id is not a unit of this exam',
      'bloom_level must be one of K1, K2, K3',
    ]) {
      expect(mapRequestOutcome(400, { error: raw }).message).not.toContain('_');
    }
  });

  it('a dead connection never throws — it comes back as a handled failure', async () => {
    const out = await submitDraftRequest(input, 5, async () => {
      throw new Error('offline');
    });
    expect(out.ok).toBe(false);
    expect(out.kind).toBe('failed');
    expect(out.message).toMatch(/never left this device/i);
  });

  it('posts the body to the drafting route and maps the answer', async () => {
    let seenUrl = '';
    let seenBody: any = null;
    const out = await submitDraftRequest(input, 5, async (url, init) => {
      seenUrl = url;
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse(202, { ok: true, job_id: 'job-1' });
    });
    expect(seenUrl).toBe('/api/foundation/onemark/draft');
    expect(seenBody.prompt).toBeTruthy();
    expect(seenBody.exam_definition_id).toBe(EXAM);
    expect(out.jobId).toBe('job-1');
  });
});

describe('caps, computed for display before the click', () => {
  const now = new Date('2026-09-07T04:00:00.000Z'); // 09:30 IST

  it('counts the day the way fn_ai_enqueue does — midnight India time', () => {
    expect(istDayStart(now).toISOString()).toBe('2026-09-06T18:30:00.000Z');
    expect(istNextMidnight(now).toISOString()).toBe('2026-09-07T18:30:00.000Z');
  });

  it('reports the remaining count and does not block while any is left', () => {
    const caps = computeCaps(jobTypeRow, 2, now);
    expect(caps.remainingToday).toBe(3);
    expect(caps.blocked).toBe(false);
    expect(caps.freeLane).toBe(true);
    expect(describeRemaining(caps)).toMatch(/3 of 5/);
    expect(describeLane(caps)).toMatch(/free lane/i);
  });

  it('blocks at zero and says when the count resets', () => {
    const caps = computeCaps(jobTypeRow, 5, now);
    expect(caps.remainingToday).toBe(0);
    expect(caps.blocked).toBe(true);
    expect(describeRemaining(caps)).toMatch(/midnight/i);
    expect(caps.resetsAt).toBe('2026-09-07T18:30:00.000Z');
  });

  it('never reports a negative remainder when the count overran the cap', () => {
    expect(computeCaps(jobTypeRow, 9, now).remainingToday).toBe(0);
  });

  it('treats an unreadable contract row as not live and blocks', () => {
    const caps = computeCaps(null, 0, now);
    expect(caps.live).toBe(false);
    expect(caps.blocked).toBe(true);
    expect(describeRemaining(caps)).toBeNull();
  });

  it('a disabled row is as good as an absent one', () => {
    expect(computeCaps({ ...jobTypeRow, enabled: false }, 0, now).live).toBe(false);
  });

  // Regression, fix round 2026-09-08. A failed read used to be indistinguishable
  // from zero usage: usedToday=0 -> "5 of 5 left today" with the button ENABLED,
  // so a Senior Learner who had spent the day discovered it from the refusal —
  // the one thing Lane G item 3 forbids.
  it('a failed read is not a full allowance — it blocks and says the count is unknown', () => {
    const caps = computeCaps(jobTypeRow, 0, now, true);
    expect(caps.readFailed).toBe(true);
    expect(caps.blocked).toBe(true);
    expect(caps.remainingToday).toBeNull();
    expect(describeRemaining(caps)).toMatch(/unknown/i);
    expect(describeRemaining(caps)).not.toMatch(/5 of 5/);
  });

  it('a failed read never claims the estate has AI switched off', () => {
    const caps = computeCaps(jobTypeRow, 0, now, true);
    expect(caps.live).toBe(false);
    // live:false is the flag the panel uses, but readFailed steers the COPY:
    // "could not read" is a claim about this fetch, "not switched on" would be
    // a claim about the estate that one network blip cannot support.
    expect(describeLane(caps)).toMatch(/could not read/i);
    expect(describeLane(caps)).not.toMatch(/not switched on/i);
  });

  // Lane G item 3 names TWO caps and both must be visible before the click.
  it('shows the estate monthly ceiling as well as the daily one', () => {
    const caps = computeCaps(jobTypeRow, 0, now);
    expect(describeMonthlyCap(caps)).toMatch(/5,000/);
    expect(describeMonthlyCap(caps)).toMatch(/paid path/i);
    expect(describeMonthlyCap(computeCaps(null, 0, now))).toBeNull();
    expect(describeMonthlyCap(computeCaps(jobTypeRow, 0, now, true))).toBeNull();
  });

  it('says the monthly ceiling DOES bite if the job type ever leaves the free lane', () => {
    const paid = computeCaps({ ...jobTypeRow, lane: 'api' }, 0, now);
    expect(paid.freeLane).toBe(false);
    expect(describeMonthlyCap(paid)).toMatch(/spends against it/i);
    expect(describeLane(paid)).toMatch(/paid lane/i);
  });

  it('a monthly ceiling never blocks the free lane (ruling 12)', () => {
    const caps = computeCaps(jobTypeRow, 0, now);
    expect(caps.monthlyCapInr).toBe(5000);
    expect(caps.blocked).toBe(false);
    expect(describeLane(caps)).toMatch(/no cost/i);
  });
});

describe('what the poll says', () => {
  it('pending and running are not terminal, and both name the collect pass', () => {
    const waiting = describeJob('pending', null, null);
    expect(waiting.phase).toBe('waiting');
    expect(waiting.terminal).toBe(false);
    expect(waiting.detail).toMatch(/9 and 39/);
    expect(describeJob('running', null, null).terminal).toBe(false);
  });

  it('done-but-unfiled is honest about the gap and stays non-terminal', () => {
    const view = describeJob('done', { answer: '{"items":[]}' }, null);
    expect(view.phase).toBe('drafted');
    expect(view.terminal).toBe(false);
  });

  it('a filed run reports what went in and what was rejected', () => {
    const view = describeJob(
      'done',
      {
        answer: 'x',
        onemark_filed: {
          inserted: 3,
          item_ids: ['a', 'b', 'c'],
          rejected: [{ index: 3, why: 'duplicate stem', stem_preview: 'What is…' }],
          shortfall_reason: 'the unit yields few one-line questions',
          error: null,
          filed_at: '2026-09-07T04:09:00.000Z',
        },
      },
      null,
    );
    expect(view.phase).toBe('filed');
    expect(view.terminal).toBe(true);
    expect(view.headline).toBe('3 added to the queue below, 1 rejected');
    expect(view.inserted).toBe(3);
    expect(view.rejected).toHaveLength(1);
    expect(view.shortfallReason).toMatch(/few one-line/);
  });

  it('a clean run says nothing about rejections', () => {
    const view = describeJob('done', { onemark_filed: { inserted: 4, rejected: [] } }, null);
    expect(view.headline).toBe('4 added to the queue below');
    expect(view.detail).toMatch(/not an approval/i);
  });

  it('a filing error is terminal and carries its reason', () => {
    const view = describeJob(
      'done',
      { onemark_filed: { inserted: 0, rejected: [], error: 'every item failed the draft contract' } },
      null,
    );
    expect(view.phase).toBe('errored');
    expect(view.terminal).toBe(true);
    expect(view.detail).toMatch(/draft contract/);
  });

  it('lane errors and cancellations are terminal', () => {
    expect(describeJob('error', null, 'the model timed out').terminal).toBe(true);
    expect(describeJob('error', null, 'the model timed out').detail).toMatch(/timed out/);
    expect(describeJob('canceled', null, null).phase).toBe('canceled');
    expect(describeJob('canceled', null, null).terminal).toBe(true);
  });

  it('an unknown status waits rather than claiming success', () => {
    const view = describeJob('something-else', null, null);
    expect(view.phase).toBe('unknown');
    expect(view.terminal).toBe(false);
  });

  // Regression, fix round 2026-09-08. Every non-ok answer from
  // /api/ai-jobs/status used to become {status:'unknown'} -> terminal:false, so
  // a dead session or a vanished job left the panel polling every 10s forever
  // on "Still checking" — a state it could never leave.
  it('a dead session is an ENDING, not waiting', () => {
    const view = describeJob(JOB_SIGNED_OUT, null, null);
    expect(view.terminal).toBe(true);
    expect(view.phase).toBe('signed out');
    expect(view.headline).toMatch(/session has ended/i);
    expect(view.detail).toMatch(/sign in again/i);
  });

  it('a vanished job is an ENDING, not waiting', () => {
    const view = describeJob(JOB_NOT_FOUND, null, null);
    expect(view.terminal).toBe(true);
    expect(view.phase).toBe('not found');
    expect(view.headline).toMatch(/could not be found/i);
  });

  it('a status read that ran out of retries is terminal and says so', () => {
    const view = unreadableJobView();
    expect(view.terminal).toBe(true);
    expect(view.phase).toBe('unreadable');
    expect(view.headline).toMatch(/could not read/i);
    // It must not imply the request itself failed — only the progress check did.
    expect(view.detail).toMatch(/unaffected/i);
  });

  it('leaves no non-terminal state that can never be left', () => {
    for (const s of [JOB_SIGNED_OUT, JOB_NOT_FOUND]) {
      expect(describeJob(s, null, null).terminal).toBe(true);
    }
    // The only remaining non-terminal states are ones the queue itself leaves.
    for (const s of ['pending', 'claimed', 'running']) {
      expect(describeJob(s, null, null).terminal).toBe(false);
    }
  });

  it('readFiled ignores a result that has no filing record', () => {
    expect(readFiled(null)).toBeNull();
    expect(readFiled({ answer: 'text' })).toBeNull();
    expect(readFiled({ onemark_filed: 'nope' })).toBeNull();
    expect(readFiled({ onemark_filed: [] })).toBeNull();
  });
});

describe('where a request sits among the caller own unfinished ones', () => {
  const rows = [
    { id: 'old', status: 'done', requested_at: '2026-09-07T01:00:00Z', completed_at: null },
    { id: 'first', status: 'pending', requested_at: '2026-09-07T02:00:00Z', completed_at: null },
    { id: 'second', status: 'claimed', requested_at: '2026-09-07T03:00:00Z', completed_at: null },
  ];

  it('counts only unfinished ones, oldest first', () => {
    expect(ownQueuePosition(rows, 'first')).toBe(1);
    expect(ownQueuePosition(rows, 'second')).toBe(2);
  });

  it('returns null for a finished or unknown request', () => {
    expect(ownQueuePosition(rows, 'old')).toBeNull();
    expect(ownQueuePosition(rows, 'nope')).toBeNull();
  });

  it('knows which statuses are still open', () => {
    expect(isOpen('pending')).toBe(true);
    expect(isOpen('claimed')).toBe(true);
    expect(isOpen('running')).toBe(true);
    expect(isOpen('done')).toBe(false);
    expect(isOpen('error')).toBe(false);
    expect(isOpen('canceled')).toBe(false);
  });
});
