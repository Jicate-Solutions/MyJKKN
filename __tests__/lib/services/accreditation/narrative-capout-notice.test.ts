import { describe, it, expect } from 'vitest';
import {
  buildCapoutNotice,
  capoutIdempotencyKey,
  countUngroundedTokens,
  narrativeDeepLink,
  readUngroundedTokens,
  MAX_LISTED_TOKENS,
  type CapoutNarrativeRow,
} from '@/lib/services/accreditation/narrative-capout-notice';

// ---------------------------------------------------------------------------
// Verbatim shapes from prod (2026-07-26) — the three narratives that are
// genuinely ungrounded today and will be the first to reach the cap.
// ---------------------------------------------------------------------------

/** The GENUINE fabrication: 0.22 appears nowhere in this metric's evidence. */
const FABRICATION: CapoutNarrativeRow = {
  narrative_id: '420f9154-29ad-46ce-a73b-13881f441397',
  institution_id: '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334',
  institution_name: 'JKKN College of Pharmacy',
  metric_code: '7.3.f',
  metric_name:
    'Quality Assurance System — periodic stakeholder satisfaction survey with feedback provided (facet f)',
  period_label: 'AY 2026-27',
  attempt_count: 5,
  max_attempts: 5,
  ungrounded_tokens: ['0.22', '2'],
  recipient_kind: 'institution_queue',
  recipient_ids: ['23dee6ca-9bb3-44ac-839c-f0117f9c1f14'],
};

/** The ownerless one: its institution has no local admin account at all. */
const ORPHAN: CapoutNarrativeRow = {
  narrative_id: '46a96f8d-b90d-4fab-8393-44a706221ddd',
  institution_id: '29c221d1-b918-4c46-9d67-857273b0b553',
  institution_name: 'Nattraja Vidhyalya CBSE',
  metric_code: '7.10.1',
  metric_name: null,
  period_label: 'AY 2026-27',
  attempt_count: 5,
  max_attempts: 5,
  // The validator records every occurrence, so repeats are normal here.
  ungrounded_tokens: ['3-year', 'E1', '3-year', 'E1'],
  recipient_kind: 'platform_queue',
  recipient_ids: ['b2bcb548-6b4c-4c75-a6b3-72dd5e9a94f1'],
};

describe('capoutIdempotencyKey — one notice per narrative, forever', () => {
  it('is stable for the same narrative', () => {
    expect(capoutIdempotencyKey(FABRICATION.narrative_id)).toBe(
      capoutIdempotencyKey(FABRICATION.narrative_id),
    );
  });

  it('differs between narratives', () => {
    expect(capoutIdempotencyKey(FABRICATION.narrative_id)).not.toBe(
      capoutIdempotencyKey(ORPHAN.narrative_id),
    );
  });

  it('does not depend on attempt count, so raising the cap cannot re-fire it', () => {
    const later = { ...FABRICATION, attempt_count: 20, max_attempts: 20 };
    expect(buildCapoutNotice(later).idempotencyKey).toBe(
      buildCapoutNotice(FABRICATION).idempotencyKey,
    );
  });
});

describe('readUngroundedTokens', () => {
  it('de-duplicates repeated occurrences', () => {
    expect(readUngroundedTokens(ORPHAN.ungrounded_tokens)).toEqual(['3-year', 'E1']);
  });

  it('drops blanks and non-strings, and survives a non-array column', () => {
    expect(readUngroundedTokens(['  ', '', 7, null, ' 0.22 '])).toEqual(['0.22']);
    expect(readUngroundedTokens(null)).toEqual([]);
    expect(readUngroundedTokens({ nope: true })).toEqual([]);
  });

  it('caps the displayed list but reports the true count', () => {
    const many = Array.from({ length: 11 }, (_, i) => `tok${i}`);
    expect(readUngroundedTokens(many)).toHaveLength(MAX_LISTED_TOKENS);
    expect(countUngroundedTokens(many)).toBe(11);
  });
});

describe('buildCapoutNotice — honest content', () => {
  const notice = buildCapoutNotice(FABRICATION);

  it('names the metric and the institution in the title', () => {
    expect(notice.title).toContain('7.3.f');
    expect(notice.title).toContain('JKKN College of Pharmacy');
  });

  it('says how many times the AI tried and that it stopped', () => {
    expect(notice.body).toContain('5 times');
    expect(notice.body).toContain('stopped retrying');
  });

  it('does NOT claim the draft is wrong', () => {
    expect(notice.body).toContain('does not mean the draft is wrong');
    // The gate cannot tell a fabrication from missing evidence, so the notice
    // must offer both readings and never assert either.
    expect(notice.body).toContain('made the figure up');
    expect(notice.body).toContain('has not been filed yet');
  });

  it('never tells anyone to unblock, approve or override the draft', () => {
    const forbidden = ['unblock', 'approve it', 'override', 'ignore the check', 'force it through'];
    for (const phrase of forbidden) {
      expect(notice.body.toLowerCase()).not.toContain(phrase);
    }
  });

  it('lists what could not be traced', () => {
    expect(notice.body).toContain('Could not be traced: 0.22, 2.');
  });

  it('tells the reader what to do and that nothing moves until they do', () => {
    expect(notice.body).toContain('Open the draft');
    expect(notice.body).toContain('stays blocked');
  });

  it('deep-links to the one screen where the draft can be worked', () => {
    expect(notice.url).toBe(narrativeDeepLink(FABRICATION.narrative_id));
    expect(notice.url).toBe(`/accreditation/naac/narratives/${FABRICATION.narrative_id}`);
  });

  it('carries the facts downstream in metadata', () => {
    expect(notice.metadata).toMatchObject({
      narrative_id: FABRICATION.narrative_id,
      metric_code: '7.3.f',
      period_label: 'AY 2026-27',
      attempt_count: 5,
      recipient_kind: 'institution_queue',
      ungrounded_token_count: 2,
    });
  });
});

describe('buildCapoutNotice — says out loud why THIS person got it', () => {
  it('owner: names them as the owner', () => {
    const n = buildCapoutNotice({ ...FABRICATION, recipient_kind: 'owner' });
    expect(n.body).toContain('You are the assigned owner');
  });

  it('institution queue: says no owner is assigned and names the queue', () => {
    const n = buildCapoutNotice(FABRICATION);
    expect(n.body).toContain('No owner is assigned');
    expect(n.body).toContain('IQAC / admin queue for JKKN College of Pharmacy');
  });

  it('platform queue: explains the institution has no local admin', () => {
    const n = buildCapoutNotice(ORPHAN);
    expect(n.body).toContain('no local IQAC / admin account');
    expect(n.body).toContain('platform admin queue');
  });
});

describe('buildCapoutNotice — degrades safely on thin rows', () => {
  it('survives a missing institution name and a missing metric name', () => {
    const n = buildCapoutNotice({
      ...ORPHAN,
      institution_name: null,
      metric_name: null,
    });
    expect(n.title).toContain('this institution');
    expect(n.body).not.toContain('undefined');
    expect(n.body).not.toContain('null');
  });

  it('omits the traced-fragment line entirely when the column is empty', () => {
    const n = buildCapoutNotice({ ...FABRICATION, ungrounded_tokens: [] });
    expect(n.body).not.toContain('Could not be traced');
    expect(n.body).toContain('Open the draft');
  });

  it('uses singular wording for a single attempt', () => {
    const n = buildCapoutNotice({ ...FABRICATION, attempt_count: 1, max_attempts: 1 });
    expect(n.body).toContain('once.');
    expect(n.body).not.toContain('1 times');
  });
});
