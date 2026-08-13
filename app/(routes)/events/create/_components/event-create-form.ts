// app/(routes)/events/create/_components/event-create-form.ts
//
// The state shape and DTO builders behind the "Create an Event" wizard's
// details step.
//
// WHY THIS FILE EXISTS. `/events/create` collected nine fields while
// `/events/tournament/new` collected seventeen — both writing the same `events`
// table. So a wizard-created lecture was stored with `scope` NULL, `visibility`
// NULL, `allow_external_registration` unset and `is_public` hardcoded false,
// while a tournament created minutes later carried all four. `CreateEventDto`
// already declared every one of those columns (types/events.ts); the wizard
// simply never asked for them. Nothing here needs a migration — it is the
// missing half of the form, plus one place to serialize it.
//
// Keeping the serialization OUT of page.tsx is deliberate: it is the part with
// real rules (local time → UTC, '' → undefined, scope → visibility, the venue
// CHECK) and the only part worth testing without a browser.

import type {
  CreateEventDto,
  EventCategory,
  EventScope,
  EventType,
  EventVisibility,
  ParticipantOrgType,
} from '@/types/events';
import type {
  EventFormat,
  EventHome,
  EventPreset,
  EventToolKey,
  PresetConfig,
} from '@/types/events-presets';
// In-charge and chief-guest shapes are defined ONCE, next to the editor that
// BOTH the create wizard and the edit dialog render — shipping them on create
// only is exactly how they went missing from Edit.
import type {
  ChiefGuestDraft,
  EventInchargeDraft,
} from '@/components/events/shared/event-people-fields';
import {
  serializeChiefGuests,
  validatePeople,
} from '@/components/events/shared/event-people-fields';

export type { ChiefGuestDraft, EventInchargeDraft };
export { emptyChiefGuestDraft } from '@/components/events/shared/event-people-fields';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * datetime-local → ISO. `new Date('2026-01-05T09:00')` parses as LOCAL time —
 * what the organizer typed — and toISOString converts to UTC for storage.
 * Sending the raw string would hand Postgres a naive timestamp and shift it by
 * the timezone offset (a 5:30h drift in this deployment).
 */
export function toIso(local: string): string | undefined {
  if (!local.trim()) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** '' → undefined so an untouched optional field is omitted, not written blank. */
export const orUndef = (v: string): string | undefined =>
  v.trim() ? v.trim() : undefined;

/** '' → undefined; a non-numeric string is dropped rather than sent as NaN. */
export function numOrUndef(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Visibility defaults from scope when the organizer hasn't chosen one —
 * the same rule TournamentEventService.createTournament applies, so an event
 * and a tournament with the same scope end up equally visible. Leaving it NULL
 * (what this wizard did) is what made wizard events behave differently from
 * tournaments under the same audience rules.
 */
export function resolveVisibility(
  scope: EventScope,
  chosen: EventVisibility | '',
): EventVisibility {
  if (chosen) return chosen;
  return scope === 'all_jkkn' ? 'all_jkkn' : 'institution';
}

// ── Form state ──────────────────────────────────────────────────────────────

/**
 * One row of the Categories tab. Competition-only fields (sport / level /
 * competition_format) are collected but rendered only for competition-shaped
 * formats — see CategoriesTab. They land in `event_categories.config` rather
 * than in columns, because `event_categories` has no sport column and the
 * tournament module models divisions in its own table.
 */
export interface EventCategoryDraft {
  /** Client-side list key only — never sent. */
  key: string;
  name: string;
  fee_amount: string;
  max_participants: string;
  min_age: string;
  max_age: string;
  gender: string;
  sport: string;
  level: string;
  competition_format: string;
}

let categorySeq = 0;
export function emptyCategoryDraft(): EventCategoryDraft {
  categorySeq += 1;
  return {
    key: `cat-${categorySeq}`,
    name: '',
    fee_amount: '',
    max_participants: '',
    min_age: '',
    max_age: '',
    gender: '',
    sport: '',
    level: '',
    competition_format: '',
  };
}

export interface EventCreateForm {
  // Basics
  name: string;
  tagline: string;
  theme: string;
  description: string;
  scope: EventScope;
  /** '' means "derive from scope" — see resolveVisibility. */
  visibility: EventVisibility | '';
  participant_org_type: ParticipantOrgType;
  // Schedule — the day(s) and hours the programme is actually conducted.
  // These are what the room is held for.
  event_date: string;
  last_day: string;
  start_time: string;
  end_time: string;
  // Venue
  venue: string;
  venue_address: string;
  // Registration — when people may sign up. Deliberately its own pair: these
  // used to have nowhere to go on this page, so organizers typed the
  // registration window into the room's start/end and held the room for weeks.
  registration_open: string;
  registration_close: string;
  max_registrations: string;
  target_registrations: string;
  entry_fee: string;
  is_public: boolean;
  allow_external_registration: boolean;
  // People
  incharges: EventInchargeDraft[];
  chief_guests: ChiefGuestDraft[];
  // Tools + evidence
  enabled_tools: EventToolKey[];
  naac_criteria: string[];
  // Categories
  categories: EventCategoryDraft[];
}

export function emptyEventCreateForm(): EventCreateForm {
  return {
    name: '',
    tagline: '',
    theme: '',
    description: '',
    scope: 'institution',
    visibility: '',
    participant_org_type: 'school',
    event_date: '',
    last_day: '',
    start_time: '',
    end_time: '',
    venue: '',
    venue_address: '',
    registration_open: '',
    registration_close: '',
    max_registrations: '',
    target_registrations: '',
    entry_fee: '',
    is_public: false,
    allow_external_registration: false,
    incharges: [],
    chief_guests: [],
    enabled_tools: [],
    naac_criteria: [],
    categories: [],
  };
}

/**
 * Seed the form from an applied preset. A preset's `divisions` are plain labels
 * (["Men", "Women", "U-19"]) — before this they were copied into `events.config`
 * and nothing ever read them, so applying a preset with divisions produced no
 * categories at all. Here they become real Category drafts the organizer can
 * edit before saving.
 */
export function applyPresetToForm(
  form: EventCreateForm,
  config: PresetConfig,
): EventCreateForm {
  const divisions = config.divisions ?? [];
  return {
    ...form,
    entry_fee: config.fee != null ? String(config.fee) : form.entry_fee,
    enabled_tools: config.enabled_tools?.length
      ? config.enabled_tools
      : form.enabled_tools,
    categories: divisions.length
      ? divisions.map((label) => ({ ...emptyCategoryDraft(), name: label }))
      : form.categories,
  };
}

// ── Serialization ───────────────────────────────────────────────────────────

/**
 * Chief-guest drafts → the shape stored in `events.config.chief_guests`.
 * Unnamed rows are dropped (the repeater starts empty, so a blank row means the
 * organizer opened it and changed their mind); the client-side `key` never ships.
 */
export function buildChiefGuests(form: EventCreateForm) {
  return serializeChiefGuests(form.chief_guests);
}

export interface BuildEventDtoInput {
  form: EventCreateForm;
  institutionId: string;
  eventType: string;
  slug: string;
  year: number;
  home: EventHome | null;
  format: EventFormat | null;
  preset?: { preset: EventPreset; config: PresetConfig } | null;
  /** Run window derived from the conduct schedule (first day start → last day end). */
  startIso?: string;
  endIso?: string;
  offCampus: boolean;
  venueResourceId: string;
}

/**
 * The single place the form becomes a row. Every field the tournament creator
 * writes is written here too; the venue CHECK
 * (events_venue_at_least_one_check: venue_resource_id OR venue_text OR venue)
 * is satisfied defensively even though the form validates it first, because a
 * violation surfaces as an opaque Postgres error rather than a usable message.
 */
export function buildCreateEventDto(input: BuildEventDtoInput): CreateEventDto {
  const {
    form,
    institutionId,
    eventType,
    slug,
    year,
    home,
    format,
    preset,
    startIso,
    endIso,
    offCampus,
    venueResourceId,
  } = input;

  const venueFields: Partial<CreateEventDto> = offCampus
    ? {
        venue: orUndef(form.venue),
        venue_address: orUndef(form.venue_address),
        // Off-campus with a blank place would trip the venue CHECK. The form
        // requires it, so this only ever catches a bypass.
        ...(orUndef(form.venue) ? {} : { venue_text: 'To be announced' }),
      }
    : venueResourceId
      ? { venue_resource_id: venueResourceId }
      : { venue_text: 'To be announced' };

  return {
    institution_id: institutionId,
    // DB column is plain text; cast covers formats the shared union doesn't model.
    event_type: eventType as EventType,
    name: form.name.trim(),
    slug,
    description: orUndef(form.description),
    tagline: orUndef(form.tagline),
    theme: orUndef(form.theme),
    // Conduct schedule.
    event_date: orUndef(form.event_date),
    start_time: orUndef(form.start_time),
    end_time: orUndef(form.end_time),
    // Run window, derived from the schedule (never hand-typed — that is what
    // let it drift into being used as a registration window).
    start_date: startIso,
    end_date: endIso,
    // Registration window — a SEPARATE pair of columns.
    registration_open_date: toIso(form.registration_open),
    registration_close_date: toIso(form.registration_close),
    max_registrations: numOrUndef(form.max_registrations),
    target_registrations: numOrUndef(form.target_registrations),
    ...venueFields,
    year,
    // Audience. All four were previously unset or hardcoded on this page.
    scope: form.scope,
    visibility: resolveVisibility(form.scope, form.visibility),
    is_public: form.is_public,
    allow_external_registration: form.allow_external_registration,
    participant_org_type: form.participant_org_type,
    naac_criteria: form.naac_criteria,
    config: {
      // FORMAT ≠ HOME: the module home is recorded here so the owning module
      // can surface this event. No schema change — `events.config` already exists.
      home,
      format,
      // Which Event Logistics tabs this event uses. An EMPTY selection is
      // omitted, not written as [], because EventLogistics reads "no key" as
      // "show everything" — writing [] would mean "show nothing".
      ...(form.enabled_tools.length ? { enabled_tools: form.enabled_tools } : {}),
      // In-charges. This grants ACCESS, not a title: fn_is_event_incharge()
      // matches auth.uid() against member_id here, so the shape is load-bearing.
      // Names are carried alongside so the console can label the grant without a
      // profile lookup (same convention as the tournament in-charge panel).
      ...(form.incharges.length
        ? {
            incharges: form.incharges.map((i) => ({
              member_id: i.member_id,
              name: i.name,
            })),
          }
        : {}),
      // Chief guests — display data only, no access implication.
      ...(buildChiefGuests(form).length
        ? { chief_guests: buildChiefGuests(form) }
        : {}),
      ...(numOrUndef(form.entry_fee) != null
        ? { fee: numOrUndef(form.entry_fee) }
        : {}),
      ...(preset
        ? {
            preset_id: preset.preset.id,
            rules: preset.config.rules,
          }
        : {}),
    },
  };
}

/**
 * Category drafts → `event_categories` rows. Unnamed rows are dropped rather
 * than inserted blank: the repeater always shows at least one empty row, and an
 * organizer who never touches it means "no categories", not "one nameless one".
 *
 * A row with no fee of its own inherits the event-wide entry fee, so the common
 * case (one fee, several categories) is typed once.
 */
export function buildCategoryDtos(
  form: EventCreateForm,
  eventId: string,
): Partial<EventCategory>[] {
  const defaultFee = numOrUndef(form.entry_fee) ?? 0;

  return form.categories
    .filter((c) => c.name.trim())
    .map((c, i) => {
      const config: Record<string, unknown> = {};
      if (c.gender) config.gender = c.gender;
      if (c.sport) config.sport = c.sport;
      if (c.level) config.level = c.level;
      if (c.competition_format) config.format = c.competition_format;

      return {
        event_id: eventId,
        name: c.name.trim(),
        fee_amount: numOrUndef(c.fee_amount) ?? defaultFee,
        max_participants: numOrUndef(c.max_participants) ?? null,
        min_age: numOrUndef(c.min_age) ?? null,
        max_age: numOrUndef(c.max_age) ?? null,
        config,
        sort_order: i,
        is_active: true,
      } satisfies Partial<EventCategory>;
    });
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Field-level problems, keyed by the tab that owns them, so the tab strip can
 * badge the offending tab. Schedule/venue clash rules stay in the page — they
 * depend on the live booking-spine lookup, not on the form alone.
 */
export type FormTabKey =
  | 'basics'
  | 'schedule'
  | 'venue'
  | 'people'
  | 'registration'
  | 'categories'
  | 'evidence';

export function validateEventForm(form: EventCreateForm): Partial<Record<FormTabKey, string>> {
  const errors: Partial<Record<FormTabKey, string>> = {};

  if (!form.name.trim()) errors.basics = 'Event name is required.';

  const regOpen = toIso(form.registration_open);
  const regClose = toIso(form.registration_close);
  if (regOpen && regClose && new Date(regClose) < new Date(regOpen)) {
    errors.registration = 'Registration must close on or after it opens.';
  }

  const max = numOrUndef(form.max_registrations);
  const target = numOrUndef(form.target_registrations);
  if (max != null && max < 0) errors.registration = 'Max registrations cannot be negative.';
  if (target != null && target < 0) errors.registration = 'Target cannot be negative.';
  if (max != null && target != null && target > max) {
    errors.registration = 'Target cannot exceed max registrations.';
  }
  const fee = numOrUndef(form.entry_fee);
  if (fee != null && fee < 0) errors.registration = 'Entry fee cannot be negative.';

  // People rules live with the shared editor so create and edit agree.
  const peopleError = validatePeople({
    incharges: form.incharges,
    chiefGuests: form.chief_guests,
  });
  if (peopleError) errors.people = peopleError;

  // A category with a fee/age but no name would be silently dropped by
  // buildCategoryDtos — say so rather than losing the organizer's typing.
  const halfFilled = form.categories.find(
    (c) =>
      !c.name.trim() &&
      (c.fee_amount.trim() ||
        c.max_participants.trim() ||
        c.min_age.trim() ||
        c.max_age.trim() ||
        c.gender ||
        c.sport),
  );
  if (halfFilled) errors.categories = 'Every category needs a name.';

  const badAges = form.categories.find((c) => {
    const lo = numOrUndef(c.min_age);
    const hi = numOrUndef(c.max_age);
    return lo != null && hi != null && hi < lo;
  });
  if (badAges) errors.categories = 'Max age must be at or above min age.';

  return errors;
}
