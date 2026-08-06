/**
 * Outbound learner participation — the read behind the broadened sports and
 * cultural evidence on the Cluster Academic Council page.
 *
 * The rules worth locking here are the ones that would silently corrupt the
 * metric rather than break it:
 *
 *   - intra_college is never outbound, because it is already a hosted event and
 *     counting it twice would inflate participation with the same activity;
 *   - every other level that exists IS outbound, so a level added to the domain
 *     type cannot slip through unclassified;
 *   - verified and unverified are counted apart and never summed into one
 *     figure, because an unverified row is a learner's claim, not evidence;
 *   - distinct learners are counted, not rows — ten awards to one learner is not
 *     ten learners participating;
 *   - a failed read is reported as failed, never as an empty result. A denied
 *     row-level read on this table returns 200 with no rows, so an empty array
 *     that reached a screen as "none recorded" would invent a measured-empty
 *     claim out of a missing permission.
 */

import { describe, it, expect } from 'vitest';
import {
  OUTBOUND_EVENT_LEVELS,
  INTERNAL_EVENT_LEVEL,
  OUTBOUND_OBSERVED_ON,
  isOutboundLevel,
  normaliseAchievementRows,
  summariseOutboundParticipation,
  outboundFor,
  describeOutboundParticipation,
  readOutboundParticipation,
  type OutboundAchievementSource,
} from '@/lib/services/accreditation/outbound-participation';
import { SPORT_LEVELS } from '@/types/health-sports';

describe('which levels count as outbound', () => {
  it('excludes the only level that is inside the institution', () => {
    expect(OUTBOUND_EVENT_LEVELS).not.toContain(INTERNAL_EVENT_LEVEL);
    expect(isOutboundLevel(INTERNAL_EVENT_LEVEL)).toBe(false);
  });

  it('classifies every level the domain defines, so a new one cannot slip past', () => {
    // If someone adds a level to SportLevel this fails until they decide whether
    // it is outbound — which is the point. An unclassified level would otherwise
    // be silently dropped from the metric.
    const domain = SPORT_LEVELS.map((l) => l.value);
    const unclassified = domain.filter(
      (l) => l !== INTERNAL_EVENT_LEVEL && !isOutboundLevel(l),
    );
    expect(unclassified).toEqual([]);
  });

  it('counts a district meet as outbound', () => {
    // A district tournament is somewhere the learner travelled to. Leaving it
    // out is exactly the invisibility this read exists to remove.
    expect(isOutboundLevel('district')).toBe(true);
  });

  it('tolerates case and stray whitespace, and refuses anything unknown', () => {
    expect(isOutboundLevel('  State ')).toBe(true);
    expect(isOutboundLevel('INTERNATIONAL')).toBe(true);
    expect(isOutboundLevel('galactic')).toBe(false);
    expect(isOutboundLevel('')).toBe(false);
    expect(isOutboundLevel(null)).toBe(false);
    expect(isOutboundLevel(undefined)).toBe(false);
  });

  it('stamps the date the source was counted by hand', () => {
    expect(OUTBOUND_OBSERVED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('shaping raw rows', () => {
  it('reads the institution from an embedded object and from an array', () => {
    // PostgREST returns a to-one embed as an object, and the same relationship
    // as an array when it cannot prove the cardinality. Guessing one shape
    // drops every row without an error.
    const rows = normaliseAchievementRows([
      {
        learner_id: 'l1',
        event_level: 'state',
        category: 'sports',
        verified: true,
        learners_profiles: { institution_id: 'inst-a' },
      },
      {
        learner_id: 'l2',
        event_level: 'national',
        category: 'sports',
        verified: false,
        learners_profiles: [{ institution_id: 'inst-b' }],
      },
    ]);
    expect(rows.map((r) => r.institutionId)).toEqual(['inst-a', 'inst-b']);
  });

  it('keeps a row whose learner has no institution rather than dropping it', () => {
    const rows = normaliseAchievementRows([
      { learner_id: 'l1', event_level: 'state', verified: true, learners_profiles: null },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].institutionId).toBeNull();
  });

  it('drops intra-college rows and rows with no learner', () => {
    const rows = normaliseAchievementRows([
      { learner_id: 'l1', event_level: 'intra_college', verified: true },
      { learner_id: null, event_level: 'state', verified: true },
      {},
      null,
    ]);
    expect(rows).toEqual([]);
  });

  it('defaults a missing category to sports, matching the column default', () => {
    const rows = normaliseAchievementRows([
      { learner_id: 'l1', event_level: 'state', verified: true },
    ]);
    expect(rows[0].category).toBe('sports');
  });

  it('treats anything other than true as not verified', () => {
    const rows = normaliseAchievementRows([
      { learner_id: 'l1', event_level: 'state', verified: null },
      { learner_id: 'l2', event_level: 'state' },
    ]);
    expect(rows.every((r) => r.verified === false)).toBe(true);
  });
});

describe('summarising participation', () => {
  const rows = normaliseAchievementRows([
    { learner_id: 'l1', event_level: 'state', category: 'sports', verified: true, learners_profiles: { institution_id: 'A' } },
    { learner_id: 'l1', event_level: 'national', category: 'sports', verified: true, learners_profiles: { institution_id: 'A' } },
    { learner_id: 'l2', event_level: 'inter_college', category: 'sports', verified: false, learners_profiles: { institution_id: 'A' } },
    { learner_id: 'l3', event_level: 'district', category: 'cultural', verified: false, learners_profiles: { institution_id: 'A' } },
    { learner_id: 'l4', event_level: 'international', category: 'sports', verified: true, learners_profiles: { institution_id: 'B' } },
  ]);
  const summaries = summariseOutboundParticipation(rows);

  it('keeps verified and unverified apart instead of summing them', () => {
    const sports = outboundFor(summaries, 'A', 'sports')!;
    expect(sports.verified).toBe(2);
    expect(sports.awaitingVerification).toBe(1);
    expect(sports).not.toHaveProperty('total');
  });

  it('counts distinct learners, not rows', () => {
    // l1 holds two awards. Two awards is not two people participating.
    expect(outboundFor(summaries, 'A', 'sports')!.learners).toBe(2);
  });

  it('separates the two CEO metrics by the row category', () => {
    expect(outboundFor(summaries, 'A', 'cultural')!.awaitingVerification).toBe(1);
    expect(outboundFor(summaries, 'A', 'cultural')!.verified).toBe(0);
    expect(outboundFor(summaries, 'B', 'cultural')).toBeUndefined();
  });

  it('reports levels in the declared order, not arrival order', () => {
    expect(outboundFor(summaries, 'A', 'sports')!.levels).toEqual([
      'inter_college',
      'state',
      'national',
    ]);
  });

  it('groups rows with no institution on their own instead of losing them', () => {
    const orphaned = summariseOutboundParticipation(
      normaliseAchievementRows([
        { learner_id: 'l9', event_level: 'state', category: 'sports', verified: true },
      ]),
    );
    expect(orphaned.size).toBe(1);
    expect([...orphaned.values()][0].institutionId).toBeNull();
  });
});

describe('the line a screen may print', () => {
  it('says nothing at all when there is nothing to say', () => {
    // Not "0 outbound". An absent summary can mean the reader lacked the
    // permission, and a zero would report that as a measured result.
    expect(describeOutboundParticipation(undefined)).toBeNull();
  });

  it('names both states when both are present', () => {
    const summaries = summariseOutboundParticipation(
      normaliseAchievementRows([
        { learner_id: 'l1', event_level: 'state', category: 'sports', verified: true, learners_profiles: { institution_id: 'A' } },
        { learner_id: 'l2', event_level: 'state', category: 'sports', verified: false, learners_profiles: { institution_id: 'A' } },
      ]),
    );
    const line = describeOutboundParticipation(outboundFor(summaries, 'A', 'sports'))!;
    expect(line).toContain('2 outbound (2 learners)');
    expect(line).toContain('1 verified');
    expect(line).toContain('1 awaiting verification');
  });

  it('does not claim a verification that has not happened', () => {
    const summaries = summariseOutboundParticipation(
      normaliseAchievementRows([
        { learner_id: 'l1', event_level: 'inter_college', category: 'sports', verified: false, learners_profiles: { institution_id: 'A' } },
      ]),
    );
    const line = describeOutboundParticipation(outboundFor(summaries, 'A', 'sports'))!;
    expect(line).toContain('1 awaiting verification');
    expect(line).not.toContain('verified ·');
    expect(line).toContain('1 learner)');
  });
});

describe('reading the source', () => {
  function fakeSource(
    result: { data: unknown[] | null; error: { message: string } | null },
    spy?: (table: string, columns: string, column: string, values: readonly string[]) => void,
  ): OutboundAchievementSource {
    return {
      from: (table) => ({
        select: (columns) => ({
          in: (column, values) => {
            spy?.(table, columns, column, values);
            return Promise.resolve(result);
          },
        }),
      }),
    };
  }

  it('filters to outbound levels in the query, not after it', async () => {
    const seen: string[][] = [];
    await readOutboundParticipation(
      fakeSource({ data: [], error: null }, (table, columns, column, values) => {
        seen.push([table, columns, column, values.join(',')]);
      }),
    );
    expect(seen[0][0]).toBe('health_sports_achievements');
    expect(seen[0][2]).toBe('event_level');
    expect(seen[0][3]).toBe(OUTBOUND_EVENT_LEVELS.join(','));
    expect(seen[0][3]).not.toContain(INTERNAL_EVENT_LEVEL);
  });

  it('never selects anything that identifies the learner', async () => {
    const seen: string[] = [];
    await readOutboundParticipation(
      fakeSource({ data: [], error: null }, (_t, columns) => seen.push(columns)),
    );
    for (const forbidden of ['first_name', 'last_name', 'email', 'roll', 'phone']) {
      expect(seen[0]).not.toContain(forbidden);
    }
  });

  it('reports a failed read as failed rather than as no participation', async () => {
    const result = await readOutboundParticipation(
      fakeSource({ data: null, error: { message: 'permission denied' } }),
    );
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ message: 'permission denied' });
  });

  it('returns shaped rows on success, and tolerates a null payload', async () => {
    const ok = await readOutboundParticipation(
      fakeSource({
        data: [
          { learner_id: 'l1', event_level: 'state', category: 'sports', verified: true, learners_profiles: { institution_id: 'A' } },
        ],
        error: null,
      }),
    );
    expect(ok).toEqual({
      ok: true,
      rows: [
        {
          learnerId: 'l1',
          eventLevel: 'state',
          category: 'sports',
          verified: true,
          institutionId: 'A',
        },
      ],
    });

    const empty = await readOutboundParticipation(
      fakeSource({ data: null, error: null }),
    );
    expect(empty).toEqual({ ok: true, rows: [] });
  });
});
