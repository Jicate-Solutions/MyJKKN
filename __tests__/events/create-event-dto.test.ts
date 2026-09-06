// __tests__/events/create-event-dto.test.ts
//
// Cover for the field-parity gap between the two creators that write `events`:
// `/events/create` collected nine fields, `/events/tournament/new` seventeen.
// A wizard-created lecture was therefore stored with scope NULL, visibility
// NULL, allow_external_registration unset and is_public hardcoded false, while
// a tournament carried all four.
//
// These are pure builders — no React, no Supabase, no env. The rules worth
// pinning are the ones a browser test would never catch reliably: local time →
// UTC, '' → undefined, scope → visibility, the venue CHECK fallback, and the
// empty-vs-absent distinction on config.enabled_tools.

import { describe, it, expect } from 'vitest';
import {
  applyPresetToForm,
  buildCategoryDtos,
  buildChiefGuests,
  buildCreateEventDto,
  emptyCategoryDraft,
  emptyChiefGuestDraft,
  emptyEventCreateForm,
  numOrUndef,
  orUndef,
  resolveVisibility,
  toIso,
  validateEventForm,
  type EventCreateForm,
} from '@/app/(routes)/events/create/_components/event-create-form';
import type { EventPreset } from '@/types/events-presets';

/** A filled-in form; individual tests override the field under test. */
function formWith(patch: Partial<EventCreateForm> = {}): EventCreateForm {
  return { ...emptyEventCreateForm(), name: 'Resume Workshop', ...patch };
}

function buildWith(
  patch: Partial<EventCreateForm> = {},
  overrides: Partial<Parameters<typeof buildCreateEventDto>[0]> = {},
) {
  return buildCreateEventDto({
    form: formWith(patch),
    institutionId: 'inst-1',
    eventType: 'lecture',
    slug: 'resume-workshop-2026',
    year: 2026,
    home: 'cdc',
    format: 'lecture-talk',
    offCampus: false,
    venueResourceId: 'room-1',
    ...overrides,
  });
}

describe('helpers', () => {
  it('orUndef drops blank and whitespace-only strings', () => {
    expect(orUndef('  ')).toBeUndefined();
    expect(orUndef('')).toBeUndefined();
    expect(orUndef('  Main Hall ')).toBe('Main Hall');
  });

  it('numOrUndef drops blanks and non-numeric text rather than sending NaN', () => {
    expect(numOrUndef('')).toBeUndefined();
    expect(numOrUndef('abc')).toBeUndefined();
    expect(numOrUndef('0')).toBe(0);
    expect(numOrUndef('250')).toBe(250);
  });

  it('toIso reads datetime-local as LOCAL wall time, not UTC', () => {
    const iso = toIso('2026-01-05T09:00');
    expect(iso).toBe(new Date('2026-01-05T09:00').toISOString());
    // The whole point: the raw string is NOT passed through, or Postgres would
    // read it as naive and shift it by the timezone offset.
    expect(iso).not.toBe('2026-01-05T09:00');
  });

  it('toIso returns undefined for blank and unparseable input', () => {
    expect(toIso('')).toBeUndefined();
    expect(toIso('not-a-date')).toBeUndefined();
  });
});

describe('resolveVisibility', () => {
  it('derives from scope when the organizer has not chosen one', () => {
    expect(resolveVisibility('all_jkkn', '')).toBe('all_jkkn');
    expect(resolveVisibility('institution', '')).toBe('institution');
    expect(resolveVisibility('chapter', '')).toBe('institution');
  });

  it('honours an explicit choice over the scope default', () => {
    expect(resolveVisibility('institution', 'public')).toBe('public');
    expect(resolveVisibility('all_jkkn', 'invited')).toBe('invited');
  });
});

describe('buildCreateEventDto — the fields the wizard used to drop', () => {
  it('writes scope and a derived visibility instead of leaving both NULL', () => {
    const dto = buildWith({ scope: 'all_jkkn' });
    expect(dto.scope).toBe('all_jkkn');
    expect(dto.visibility).toBe('all_jkkn');
  });

  it('carries is_public and allow_external_registration from the form', () => {
    const dto = buildWith({ is_public: true, allow_external_registration: true });
    expect(dto.is_public).toBe(true);
    expect(dto.allow_external_registration).toBe(true);
  });

  it('carries participant_org_type, capacity, NAAC tags, tagline and theme', () => {
    const dto = buildWith({
      participant_org_type: 'college',
      max_registrations: '300',
      target_registrations: '250',
      naac_criteria: ['1.1.1', '3.2.2'],
      tagline: 'Get hired',
      theme: 'Employability',
    });
    expect(dto.participant_org_type).toBe('college');
    expect(dto.max_registrations).toBe(300);
    expect(dto.target_registrations).toBe(250);
    expect(dto.naac_criteria).toEqual(['1.1.1', '3.2.2']);
    expect(dto.tagline).toBe('Get hired');
    expect(dto.theme).toBe('Employability');
  });

  it('omits untouched optional fields rather than blanking the columns', () => {
    const dto = buildWith();
    expect(dto.tagline).toBeUndefined();
    expect(dto.theme).toBeUndefined();
    expect(dto.description).toBeUndefined();
    expect(dto.max_registrations).toBeUndefined();
  });

  it('keeps the run window separate from the registration window', () => {
    const dto = buildWith(
      { registration_open: '2026-01-01T09:00', registration_close: '2026-01-20T17:00' },
      { startIso: '2026-02-01T03:30:00.000Z', endIso: '2026-02-01T11:30:00.000Z' },
    );
    expect(dto.start_date).toBe('2026-02-01T03:30:00.000Z');
    expect(dto.end_date).toBe('2026-02-01T11:30:00.000Z');
    expect(dto.registration_open_date).toBe(new Date('2026-01-01T09:00').toISOString());
    expect(dto.registration_close_date).toBe(new Date('2026-01-20T17:00').toISOString());
    expect(dto.registration_open_date).not.toBe(dto.start_date);
  });
});

describe('buildCreateEventDto — venue CHECK (events_venue_at_least_one_check)', () => {
  it('on-campus links the room resource and sets no free text', () => {
    const dto = buildWith({}, { offCampus: false, venueResourceId: 'room-9' });
    expect(dto.venue_resource_id).toBe('room-9');
    expect(dto.venue_text).toBeUndefined();
  });

  it('off-campus stores the typed place, not a room hold', () => {
    const dto = buildWith(
      { venue: 'City Convention Centre', venue_address: '12 MG Road' },
      { offCampus: true, venueResourceId: '' },
    );
    expect(dto.venue).toBe('City Convention Centre');
    expect(dto.venue_address).toBe('12 MG Road');
    expect(dto.venue_resource_id).toBeUndefined();
  });

  it('falls back to venue_text when neither a room nor a place is set', () => {
    // The form blocks this; the fallback exists so a bypass surfaces as a
    // readable "To be announced" rather than an opaque CHECK violation.
    expect(buildWith({}, { offCampus: false, venueResourceId: '' }).venue_text).toBe(
      'To be announced',
    );
    expect(buildWith({ venue: '' }, { offCampus: true, venueResourceId: '' }).venue_text).toBe(
      'To be announced',
    );
  });
});

describe('buildCreateEventDto — config', () => {
  it('records home and format so the owning module can surface the event', () => {
    const dto = buildWith({}, { home: 'health', format: 'cultural' });
    expect(dto.config).toMatchObject({ home: 'health', format: 'cultural' });
  });

  it('OMITS enabled_tools when nothing is selected — [] would mean "no tabs"', () => {
    const dto = buildWith({ enabled_tools: [] });
    expect(dto.config).not.toHaveProperty('enabled_tools');
  });

  it('writes enabled_tools when the organizer picks tools', () => {
    const dto = buildWith({ enabled_tools: ['budget', 'committees'] });
    expect(dto.config).toMatchObject({ enabled_tools: ['budget', 'committees'] });
  });

  it('records the entry fee only when one was typed', () => {
    expect(buildWith({ entry_fee: '150' }).config).toMatchObject({ fee: 150 });
    expect(buildWith({ entry_fee: '' }).config).not.toHaveProperty('fee');
    // 0 is a real answer ("free"), not an absent one.
    expect(buildWith({ entry_fee: '0' }).config).toMatchObject({ fee: 0 });
  });
});

describe('in-charges — an ACCESS GRANT, not a label', () => {
  it('writes config.incharges in the exact shape fn_is_event_incharge reads', () => {
    // The SECURITY DEFINER function matches auth.uid() against
    // config->incharges[]->>'member_id'. Any other shape grants nothing while
    // looking like it did.
    const dto = buildWith({
      incharges: [
        { member_id: 'uid-1', name: 'A. Priya' },
        { member_id: 'uid-2', name: 'K. Raman' },
      ],
    });
    expect(dto.config).toMatchObject({
      incharges: [
        { member_id: 'uid-1', name: 'A. Priya' },
        { member_id: 'uid-2', name: 'K. Raman' },
      ],
    });
  });

  it('omits the key entirely when nobody is appointed', () => {
    expect(buildWith({ incharges: [] }).config).not.toHaveProperty('incharges');
  });

  it('flags the same person appointed twice', () => {
    const errors = validateEventForm(
      formWith({
        incharges: [
          { member_id: 'uid-1', name: 'A. Priya' },
          { member_id: 'uid-1', name: 'A. Priya' },
        ],
      }),
    );
    expect(errors.people).toBeTruthy();
  });
});

describe('chief guests — display data', () => {
  const guest = (patch: Partial<ReturnType<typeof emptyChiefGuestDraft>>) => ({
    ...emptyChiefGuestDraft(),
    ...patch,
  });

  it('writes name plus optional designation and organization', () => {
    const dto = buildWith({
      chief_guests: [
        guest({ name: 'Dr. R. Kalaiselvi', designation: 'Director', organization: 'Anna University' }),
      ],
    });
    expect(dto.config).toMatchObject({
      chief_guests: [
        { name: 'Dr. R. Kalaiselvi', designation: 'Director', organization: 'Anna University' },
      ],
    });
  });

  it('omits blank designation/organization rather than writing empty strings', () => {
    const guests = buildChiefGuests(formWith({ chief_guests: [guest({ name: 'Thiru A. Kumar' })] }));
    expect(guests).toEqual([{ name: 'Thiru A. Kumar' }]);
  });

  it('never ships the client-side list key', () => {
    const guests = buildChiefGuests(formWith({ chief_guests: [guest({ name: 'X' })] }));
    expect(guests[0]).not.toHaveProperty('key');
  });

  it('drops unnamed rows and omits the key when none survive', () => {
    expect(buildWith({ chief_guests: [guest({})] }).config).not.toHaveProperty('chief_guests');
  });

  it('flags a guest given a designation but no name', () => {
    const errors = validateEventForm(
      formWith({ chief_guests: [guest({ designation: 'Chief Secretary' })] }),
    );
    expect(errors.people).toBeTruthy();
  });

  it('does NOT flag a wholly empty guest row', () => {
    expect(validateEventForm(formWith({ chief_guests: [guest({})] })).people).toBeUndefined();
  });
});

describe('applyPresetToForm', () => {
  const preset = (config: EventPreset['config']) => config;

  it('turns preset division LABELS into editable category drafts', () => {
    // Before this, config.divisions was copied into events.config and nothing
    // ever read it — applying a preset with divisions produced no categories.
    const next = applyPresetToForm(
      formWith(),
      preset({ divisions: ['Men', 'Women', 'U-19'] }),
    );
    expect(next.categories.map((c) => c.name)).toEqual(['Men', 'Women', 'U-19']);
  });

  it('seeds fee and enabled tools, and leaves the form alone when the preset is empty', () => {
    const seeded = applyPresetToForm(
      formWith(),
      preset({ fee: 200, enabled_tools: ['sponsors'] }),
    );
    expect(seeded.entry_fee).toBe('200');
    expect(seeded.enabled_tools).toEqual(['sponsors']);

    const base = formWith({ entry_fee: '50', enabled_tools: ['kit'] });
    const untouched = applyPresetToForm(base, preset({}));
    expect(untouched.entry_fee).toBe('50');
    expect(untouched.enabled_tools).toEqual(['kit']);
  });
});

describe('buildCategoryDtos', () => {
  const draft = (patch: Partial<ReturnType<typeof emptyCategoryDraft>>) => ({
    ...emptyCategoryDraft(),
    ...patch,
  });

  it('drops unnamed rows — the repeater always shows one empty row', () => {
    const rows = buildCategoryDtos(
      formWith({ categories: [draft({ name: 'Open' }), draft({})] }),
      'evt-1',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Open');
  });

  it('inherits the event-wide entry fee when a row has none of its own', () => {
    const rows = buildCategoryDtos(
      formWith({
        entry_fee: '100',
        categories: [draft({ name: 'Open' }), draft({ name: 'VIP', fee_amount: '500' })],
      }),
      'evt-1',
    );
    expect(rows[0].fee_amount).toBe(100);
    expect(rows[1].fee_amount).toBe(500);
  });

  it('defaults the fee to 0 when the event has none — fee_amount is NOT NULL', () => {
    const rows = buildCategoryDtos(formWith({ categories: [draft({ name: 'Open' })] }), 'evt-1');
    expect(rows[0].fee_amount).toBe(0);
  });

  it('puts competition fields in config (event_categories has no sport column)', () => {
    const rows = buildCategoryDtos(
      formWith({
        categories: [
          draft({ name: 'U-19 Boys', sport: 'Volleyball', level: 'intra_college', competition_format: 'knockout', gender: 'male' }),
        ],
      }),
      'evt-1',
    );
    expect(rows[0].config).toEqual({
      gender: 'male',
      sport: 'Volleyball',
      level: 'intra_college',
      format: 'knockout',
    });
  });

  it('numbers sort_order by position and stamps the event id', () => {
    const rows = buildCategoryDtos(
      formWith({ categories: [draft({ name: 'A' }), draft({ name: 'B' })] }),
      'evt-7',
    );
    expect(rows.map((r) => r.sort_order)).toEqual([0, 1]);
    expect(rows.every((r) => r.event_id === 'evt-7')).toBe(true);
  });
});

describe('validateEventForm', () => {
  it('passes a minimal valid form', () => {
    expect(validateEventForm(formWith())).toEqual({});
  });

  it('requires a name', () => {
    expect(validateEventForm(formWith({ name: '  ' })).basics).toBeTruthy();
  });

  it('rejects a registration window that closes before it opens', () => {
    const errors = validateEventForm(
      formWith({ registration_open: '2026-03-10T09:00', registration_close: '2026-03-01T09:00' }),
    );
    expect(errors.registration).toBeTruthy();
  });

  it('rejects a target above max, and negative capacity or fee', () => {
    expect(
      validateEventForm(formWith({ max_registrations: '100', target_registrations: '200' })).registration,
    ).toBeTruthy();
    expect(validateEventForm(formWith({ max_registrations: '-1' })).registration).toBeTruthy();
    expect(validateEventForm(formWith({ entry_fee: '-5' })).registration).toBeTruthy();
  });

  it('flags a half-filled category rather than silently dropping it', () => {
    const errors = validateEventForm(
      formWith({ categories: [{ ...emptyCategoryDraft(), fee_amount: '100' }] }),
    );
    expect(errors.categories).toBeTruthy();
  });

  it('does NOT flag a wholly empty category row', () => {
    expect(validateEventForm(formWith({ categories: [emptyCategoryDraft()] })).categories).toBeUndefined();
  });

  it('rejects a max age below the min age', () => {
    const errors = validateEventForm(
      formWith({ categories: [{ ...emptyCategoryDraft(), name: 'Junior', min_age: '18', max_age: '15' }] }),
    );
    expect(errors.categories).toBeTruthy();
  });
});
