// __tests__/events/event-people-fields.test.ts
//
// Cover for the in-charge / chief-guest fields, which are shared by the create
// wizard's People tab and the general-event edit dialog.
//
// The load-bearing case is mergeEventPeopleConfig. `events.config` is ONE jsonb
// column and EventBaseService.updateEvent is a raw passthrough, so writing
// `{ config: { incharges } }` from the edit dialog REPLACES the whole object —
// silently discarding `home`, `format`, `enabled_tools`, `preset_id` and `fee`,
// i.e. everything the create wizard filed the event under. Those assertions are
// the reason this file exists.

import { describe, it, expect, vi } from 'vitest';

// The helpers are pure, but the module also exports the editor, which pulls in
// MemberPickerDialog → a Supabase client built at MODULE level. Stub the client
// factory so the graph loads; nothing here touches it.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
  createAdminClient: () => ({}),
  getSupabaseClient: () => ({}),
}));

import {
  emptyChiefGuestDraft,
  mergeEventPeopleConfig,
  parseChiefGuestDrafts,
  parseIncharges,
  serializeChiefGuests,
  validatePeople,
} from '@/components/events/shared/event-people-fields';

const guest = (patch: Partial<ReturnType<typeof emptyChiefGuestDraft>> = {}) => ({
  ...emptyChiefGuestDraft(),
  ...patch,
});

describe('parseIncharges', () => {
  it('reads the shape fn_is_event_incharge matches on', () => {
    expect(
      parseIncharges({ incharges: [{ member_id: 'uid-1', name: 'A. Priya' }] }),
    ).toEqual([{ member_id: 'uid-1', name: 'A. Priya' }]);
  });

  it('returns [] for an absent, null or non-array config value', () => {
    expect(parseIncharges(null)).toEqual([]);
    expect(parseIncharges({})).toEqual([]);
    expect(parseIncharges({ incharges: 'nope' })).toEqual([]);
  });

  it('drops entries with no member_id — they grant nothing', () => {
    expect(parseIncharges({ incharges: [{ name: 'Ghost' }, { member_id: 'uid-2' }] })).toEqual(
      [{ member_id: 'uid-2', name: 'uid-2' }],
    );
  });
});

describe('parseChiefGuestDrafts', () => {
  it('reads name, designation and organization back as editable drafts', () => {
    const drafts = parseChiefGuestDrafts({
      chief_guests: [
        { name: 'Dr. R. Kalaiselvi', designation: 'Director', organization: 'Anna University' },
      ],
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      name: 'Dr. R. Kalaiselvi',
      designation: 'Director',
      organization: 'Anna University',
    });
    expect(drafts[0].key).toBeTruthy();
  });

  it('fills missing optional fields with empty strings so inputs stay controlled', () => {
    const drafts = parseChiefGuestDrafts({ chief_guests: [{ name: 'Thiru A. Kumar' }] });
    expect(drafts[0].designation).toBe('');
    expect(drafts[0].organization).toBe('');
  });

  it('returns [] for absent or malformed config', () => {
    expect(parseChiefGuestDrafts(null)).toEqual([]);
    expect(parseChiefGuestDrafts({ chief_guests: [{ designation: 'no name' }] })).toEqual([]);
  });

  it('round-trips through serialize without drift', () => {
    const original = [
      { name: 'A', designation: 'Dean', organization: 'JKKN' },
      { name: 'B' },
    ];
    expect(serializeChiefGuests(parseChiefGuestDrafts({ chief_guests: original }))).toEqual(
      original,
    );
  });
});

describe('mergeEventPeopleConfig', () => {
  const existing = {
    home: 'cdc',
    format: 'lecture-talk',
    enabled_tools: ['budget'],
    preset_id: 'preset-1',
    fee: 150,
  };

  it('PRESERVES every unrelated config key', () => {
    // The whole point: config is one jsonb column and the update is a raw
    // passthrough, so a non-merging write loses all of these.
    const merged = mergeEventPeopleConfig(existing, {
      incharges: [{ member_id: 'uid-1', name: 'A. Priya' }],
      chiefGuests: [guest({ name: 'Dr. K' })],
    });
    expect(merged).toMatchObject(existing);
  });

  it('writes in-charges in the shape fn_is_event_incharge reads', () => {
    const merged = mergeEventPeopleConfig(existing, {
      incharges: [{ member_id: 'uid-1', name: 'A. Priya' }],
      chiefGuests: [],
    });
    expect(merged.incharges).toEqual([{ member_id: 'uid-1', name: 'A. Priya' }]);
  });

  it('writes EMPTY arrays so removing the last person actually removes it', () => {
    // Unlike the create path (which omits empty keys), edit must be explicit:
    // omitting would merge into the OLD value and the removal would be a no-op.
    const merged = mergeEventPeopleConfig(
      { ...existing, incharges: [{ member_id: 'uid-1', name: 'A. Priya' }] },
      { incharges: [], chiefGuests: [] },
    );
    expect(merged.incharges).toEqual([]);
    expect(merged.chief_guests).toEqual([]);
  });

  it('drops unnamed guest rows and never ships the client-side key', () => {
    const merged = mergeEventPeopleConfig(existing, {
      incharges: [],
      chiefGuests: [guest({ name: 'Dr. K', designation: 'Dean' }), guest({})],
    });
    expect(merged.chief_guests).toEqual([{ name: 'Dr. K', designation: 'Dean' }]);
    expect(JSON.stringify(merged)).not.toContain('"key"');
  });

  it('handles an event with no config at all', () => {
    const merged = mergeEventPeopleConfig(null, { incharges: [], chiefGuests: [] });
    expect(merged).toEqual({ incharges: [], chief_guests: [] });
  });

  it('does not mutate the config object it was handed', () => {
    const before = JSON.stringify(existing);
    mergeEventPeopleConfig(existing, {
      incharges: [{ member_id: 'uid-9', name: 'Z' }],
      chiefGuests: [],
    });
    expect(JSON.stringify(existing)).toBe(before);
  });
});

describe('validatePeople', () => {
  it('passes on empty people', () => {
    expect(validatePeople({ incharges: [], chiefGuests: [] })).toBeUndefined();
  });

  it('passes on a wholly empty guest row', () => {
    expect(validatePeople({ incharges: [], chiefGuests: [guest()] })).toBeUndefined();
  });

  it('flags a guest given a designation but no name', () => {
    expect(
      validatePeople({ incharges: [], chiefGuests: [guest({ designation: 'Dean' })] }),
    ).toBeTruthy();
  });

  it('flags the same person appointed in-charge twice', () => {
    expect(
      validatePeople({
        incharges: [
          { member_id: 'uid-1', name: 'A' },
          { member_id: 'uid-1', name: 'A' },
        ],
        chiefGuests: [],
      }),
    ).toBeTruthy();
  });
});
