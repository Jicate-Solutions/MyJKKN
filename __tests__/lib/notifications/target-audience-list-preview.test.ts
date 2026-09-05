/**
 * Notifications — the audience label on the LIST surfaces.
 *
 * PR #3128 fixed the detail page. The same misreport survived on every list:
 * the admin list card showed no audience at all (a one-person message and a
 * blast to eight colleges looked identical), and the sent outbox recognised
 * only `target_roles` and `user_ids`, so the other three person-targeting keys
 * — `user_id` (3,192 rows), `target_users` (4) and the `roles` alias (295) —
 * fell out the bottom as the placeholder 'targeting set'.
 *
 * The tests below pin the two things a list needs that a detail page does not:
 * name resolution that is batched for a whole page rather than per row, and a
 * graceful degradation to a plain count when a name cannot be resolved. A
 * count is still honest about blast radius; 'All Users' is not.
 *
 * Every targeting shape is a real one from production 2026-08-25 (298,874
 * notifications, largest real recipient list 273).
 */
import { describe, it, expect } from 'vitest';
import {
  describeTargetAudience,
  TARGET_NAME_PREVIEW_LIMIT
} from '@/lib/notifications/target-audience';
import {
  collectRecipientNamePreviews,
  pickPreviewNames,
  LIST_NAME_LOOKUP_CAP,
  type RecipientProfile
} from '@/lib/notifications/target-audience-preview';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = (n: number) => Array.from({ length: n }, (_, i) => id(i));

/** The two halves the API route runs, wired together the way the route does. */
function labelPage(
  targetings: Array<Record<string, unknown> | null>,
  profiles: RecipientProfile[]
): string[] {
  const { perRow, lookupIds } = collectRecipientNamePreviews(targetings);
  const visible = new Set(lookupIds);
  const profilesById = new Map<string, RecipientProfile>(
    profiles
      .filter((p) => typeof p.id === 'string' && visible.has(p.id as string))
      .map((p) => [p.id as string, p])
  );
  return targetings.map((targeting, index) => {
    const names = pickPreviewNames(perRow[index], profilesById);
    return describeTargetAudience(
      targeting ? { ...targeting, user_names: names } : targeting
    );
  });
}

describe('collectRecipientNamePreviews — one query for a whole page', () => {
  it('takes only the preview ids from each row, never the whole list', () => {
    const { perRow, lookupIds } = collectRecipientNamePreviews([
      { user_ids: ids(273) }
    ]);
    expect(perRow[0]).toHaveLength(TARGET_NAME_PREVIEW_LIMIT);
    // 273 recipients still costs exactly TARGET_NAME_PREVIEW_LIMIT lookups.
    expect(lookupIds).toHaveLength(TARGET_NAME_PREVIEW_LIMIT);
  });

  it('recognises all five person-targeting keys, not just user_ids', () => {
    const { perRow } = collectRecipientNamePreviews([
      { user_ids: [id(1)] },
      { user_id: id(2) },
      { target_users: [id(3)] },
      { roles: ['hod'] },
      { target_roles: ['faculty'] }
    ]);
    expect(perRow[0]).toEqual([id(1)]);
    // `user_id` is a SINGLE id, not an array — 3,192 rows carry it.
    expect(perRow[1]).toEqual([id(2)]);
    expect(perRow[2]).toEqual([id(3)]);
    // Role targeting names no people, so it costs no lookups.
    expect(perRow[3]).toEqual([]);
    expect(perRow[4]).toEqual([]);
  });

  it('de-duplicates ids shared across rows into one lookup', () => {
    const { lookupIds } = collectRecipientNamePreviews([
      { user_ids: [id(1), id(2)] },
      { user_ids: [id(1), id(2)] },
      { user_id: id(1) }
    ]);
    expect(lookupIds).toEqual([id(1), id(2)]);
  });

  it('preserves each row order so names line up with the ids they came from', () => {
    const { perRow } = collectRecipientNamePreviews([
      { user_ids: [id(9), id(4), id(7)] }
    ]);
    expect(perRow[0]).toEqual([id(9), id(4)]);
  });

  it('caps the lookup so a full page cannot overflow the request URL', () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({
      user_ids: [id(i * 2), id(i * 2 + 1)]
    }));
    const { lookupIds } = collectRecipientNamePreviews(page);
    expect(lookupIds).toHaveLength(LIST_NAME_LOOKUP_CAP);
    expect(new Set(lookupIds).size).toBe(LIST_NAME_LOOKUP_CAP);
  });

  it('survives empty, null and missing targeting', () => {
    const { perRow, lookupIds } = collectRecipientNamePreviews([
      null,
      undefined,
      {},
      { user_ids: [] },
      { user_id: '   ' }
    ]);
    expect(perRow).toEqual([[], [], [], [], []]);
    expect(lookupIds).toEqual([]);
  });
});

describe('pickPreviewNames — resolving the handful that get displayed', () => {
  const profilesById = new Map<string, RecipientProfile>([
    [id(1), { id: id(1), full_name: 'Priya R.', email: 'priya@jkkn.ac.in' }],
    [id(2), { id: id(2), full_name: '   ', email: 'arun@jkkn.ac.in' }],
    [id(3), { id: id(3), full_name: null, email: null }]
  ]);

  it('returns names in the ids own order, not the lookup order', () => {
    expect(pickPreviewNames([id(2), id(1)], profilesById)).toEqual([
      'arun@jkkn.ac.in',
      'Priya R.'
    ]);
  });

  it('falls back to email when full_name is blank', () => {
    expect(pickPreviewNames([id(2)], profilesById)).toEqual(['arun@jkkn.ac.in']);
  });

  it('drops a profile with nothing usable rather than emitting a blank name', () => {
    expect(pickPreviewNames([id(1), id(3)], profilesById)).toEqual(['Priya R.']);
  });

  it('returns nothing for an unresolved id, a null map or no ids', () => {
    expect(pickPreviewNames([id(99)], profilesById)).toEqual([]);
    expect(pickPreviewNames([id(1)], null)).toEqual([]);
    expect(pickPreviewNames([], profilesById)).toEqual([]);
    expect(pickPreviewNames(null, profilesById)).toEqual([]);
  });
});

describe('the label a list card actually renders', () => {
  const profiles: RecipientProfile[] = [
    { id: id(0), full_name: 'Priya R.' },
    { id: id(1), full_name: 'Arun K.' },
    { id: id(2), full_name: 'Meena S.' }
  ];

  it('a message to one person names that person', () => {
    expect(labelPage([{ user_ids: [id(0)] }], profiles)).toEqual(['Priya R.']);
  });

  it('the singular user_id key names its person too', () => {
    expect(labelPage([{ user_id: id(1) }], profiles)).toEqual(['Arun K.']);
  });

  it('the legacy target_users key names its people too', () => {
    expect(labelPage([{ target_users: [id(0), id(1)] }], profiles)).toEqual([
      'Priya R. and Arun K.'
    ]);
  });

  it('the largest real list truncates to two names and a count', () => {
    expect(labelPage([{ user_ids: ids(273) }], profiles)).toEqual([
      'Priya R., Arun K. and 271 others'
    ]);
  });

  it('degrades to a plain count when no name resolves — never to "All Users"', () => {
    const [label] = labelPage([{ user_ids: ids(273) }], []);
    expect(label).toBe('273 people');
    expect(label).not.toBe('All Users');
  });

  it('degrades to a singular count for one unresolvable recipient', () => {
    expect(labelPage([{ user_id: id(500) }], [])).toEqual(['1 person']);
  });

  it('rows past the lookup cap still report their size honestly', () => {
    const page = Array.from({ length: LIST_NAME_LOOKUP_CAP + 5 }, (_, i) => ({
      user_ids: [id(1000 + i)]
    }));
    const labels = labelPage(page, profiles);
    expect(labels[labels.length - 1]).toBe('1 person');
    expect(labels).not.toContain('All Users');
  });

  it('the roles alias reads as role targeting, not as a broadcast', () => {
    expect(labelPage([{ roles: ['hod'] }], profiles)).toEqual(['Roles']);
  });

  it('"All Users" survives only for genuinely empty targeting', () => {
    expect(labelPage([{}], profiles)).toEqual(['All Users']);
  });
});
