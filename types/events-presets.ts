// types/events-presets.ts
// Events Platform Promotion PR9 — the "Create an Event" flow + preset system.
//
// Decisions #9/#10 — FORMAT ≠ HOME:
//   An event has a FORMAT (how it runs) AND a HOME (which module it lives under).
//   These are independent axes. A volleyball *tournament* (format) is filed under
//   Health & Wellness sports (home); a resume *lecture-talk* (format) is filed under
//   Career/CDC (home). A lecture is NEVER filed "under tournaments".
//
// Decisions #4/#5 — PRESETS:
//   A saveable config of { enabled tools + format + rules + fees + divisions } per
//   event type. OFFICIAL presets (admin-published, scope='official') and PERSONAL
//   presets (a coordinator copies an official one and tweaks, scope='personal').
//   Persisted in the `event_presets` table (created in PR1). See event-preset-service.ts.

import { Trophy, Mic2, Timer, Music, GraduationCap, Rocket } from 'lucide-react';
import type { ComponentType } from 'react';

// ── FORMAT: how the event runs ───────────────────────────────────────────────
export type EventFormat =
  | 'tournament' // bracketed sports competition (knockout / league / divisions)
  | 'lecture-talk' // a talk, seminar, workshop, guest lecture
  | 'race' // a marathon / run / timed race
  | 'cultural' // a cultural night / fest / performance
  | 'convocation' // a graduation / convocation ceremony
  | 'induction'; // a fresher induction program (multi-day, cohort + batches)

export interface EventFormatDef {
  value: EventFormat;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * The `events.event_type` discriminator written to the DB for this format.
   * The DB column is plain text (not CHECK-constrained), so formats that the
   * shared `EventType` union does not model (lecture/convocation) still persist
   * with an honest, queryable discriminator.
   */
  eventType: string;
  /**
   * When a format has a dedicated, richer creator (divisions, registration
   * window, etc.) the wizard routes there instead of writing a bare events row.
   * `null` = create a base `events` row via EventBaseService.createEvent.
   */
  dedicatedCreatePath: string | null;
}

export const EVENT_FORMATS: EventFormatDef[] = [
  {
    value: 'tournament',
    label: 'Sports Tournament',
    description: 'A bracketed sports competition with divisions, fixtures, and a scoreboard.',
    icon: Trophy,
    eventType: 'sports_tournament',
    dedicatedCreatePath: '/events/tournament/new',
  },
  {
    value: 'race',
    label: 'Race / Marathon',
    description: 'A timed run with bib registration, live tracking, and results.',
    icon: Timer,
    eventType: 'marathon',
    dedicatedCreatePath: '/events/marathon/new',
  },
  {
    value: 'lecture-talk',
    label: 'Lecture / Talk / Workshop',
    description: 'A guest lecture, seminar, or workshop — a single session with an audience.',
    icon: Mic2,
    eventType: 'lecture',
    dedicatedCreatePath: null,
  },
  {
    value: 'cultural',
    label: 'Cultural Programme',
    description: 'A cultural night, fest, or performance with multiple acts.',
    icon: Music,
    eventType: 'cultural',
    dedicatedCreatePath: null,
  },
  {
    value: 'convocation',
    label: 'Convocation / Ceremony',
    description: 'A graduation or formal ceremony with guests and a programme.',
    icon: GraduationCap,
    eventType: 'convocation',
    dedicatedCreatePath: null,
  },
  {
    value: 'induction',
    label: 'Fresher Induction',
    description: 'A multi-day onboarding program for new students — cohort enrolment, batches, sessions, and completion tracking.',
    icon: Rocket,
    eventType: 'induction',
    dedicatedCreatePath: '/events/induction/new',
  },
];

export function getFormatDef(value: EventFormat): EventFormatDef | undefined {
  return EVENT_FORMATS.find((f) => f.value === value);
}

// ── HOME: which module the event lives under ─────────────────────────────────
// The home is stored on the created event as `config.home` (no schema change —
// `events.config` is an existing jsonb column). Module pages may later filter
// `events` by `config.home` to surface "their" events.
export type EventHome =
  | 'events' // general institutional events
  | 'health' // Health & Wellness (sports, wellness talks, drives)
  | 'cdc' // Career Development / placements (career talks, workshops)
  | 'academic' // academic department events (seminars, guest lectures)
  | 'startup-studio' // entrepreneurship / Appathon events
  | 'cultural'; // cultural committee programmes

export interface EventHomeDef {
  value: EventHome;
  label: string;
  description: string;
}

export const EVENT_HOMES: EventHomeDef[] = [
  { value: 'events', label: 'General Events', description: 'Institution-wide events with no specific module owner.' },
  { value: 'health', label: 'Health & Wellness', description: 'Sports, fitness drives, and wellness sessions.' },
  { value: 'cdc', label: 'Career / CDC', description: 'Placement talks, career workshops, recruiter visits.' },
  { value: 'academic', label: 'Academic', description: 'Department seminars, guest lectures, academic conferences.' },
  { value: 'startup-studio', label: 'Startup Studio', description: 'Entrepreneurship sessions, Appathons, demo days.' },
  { value: 'cultural', label: 'Cultural', description: 'Cultural committee programmes and performances.' },
];

/**
 * Sensible default home for each format. The user can override in the wizard —
 * format and home remain independent (a tournament can be filed under any home).
 */
export const DEFAULT_HOME_FOR_FORMAT: Record<EventFormat, EventHome> = {
  tournament: 'health',
  race: 'health',
  'lecture-talk': 'cdc',
  cultural: 'cultural',
  convocation: 'events',
  induction: 'academic',
};

// ── PRESET: a saveable event config ──────────────────────────────────────────
// The "tools" a preset can enable mirror the EventLogistics tab registry keys
// (sponsors, budget, committees, … appended by PR1-PR8). Kept as a local
// constant so the preset layer does not couple to the append-only registry file.
export const EVENT_TOOL_KEYS = [
  'sponsors',
  'budget',
  'committees',
  'volunteers',
  'incidents',
  'check-in',
  'certificates',
  'bulk-import',
  'analytics',
  'kit',
] as const;
export type EventToolKey = (typeof EVENT_TOOL_KEYS)[number];

export const EVENT_TOOL_LABELS: Record<EventToolKey, string> = {
  sponsors: 'Sponsors',
  budget: 'Budget',
  committees: 'Committees & Tasks',
  volunteers: 'Volunteers',
  incidents: 'Incidents',
  'check-in': 'Check-in & QR Passes',
  certificates: 'Certificates',
  'bulk-import': 'Bulk Import',
  analytics: 'Analytics',
  kit: 'Kit / T-shirt Distribution',
};

export type PresetScope = 'official' | 'personal';

/** The shape persisted in `event_presets.config` (jsonb). All fields optional. */
export interface PresetConfig {
  format?: EventFormat;
  home?: EventHome;
  enabled_tools?: EventToolKey[];
  /** Free-form per-type rules (e.g. tournament rules, dress code) — kept loose by design. */
  rules?: string;
  /** Default fee in INR applied to registrations (0 / undefined = free). */
  fee?: number;
  /** Division/category labels seeded for the event (e.g. ["Men", "Women", "U-19"]). */
  divisions?: string[];
}

/** A row from the `event_presets` table. */
export interface EventPreset {
  id: string;
  event_type: string;
  name: string;
  scope: PresetScope;
  owner_id: string | null;
  config: PresetConfig;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePresetDto {
  event_type: string;
  name: string;
  scope: PresetScope;
  config: PresetConfig;
  institution_id?: string | null;
}
