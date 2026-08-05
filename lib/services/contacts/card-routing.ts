// lib/services/contacts/card-routing.ts
//
// "Ask once, route everywhere" (Director decision 17).
//
// One plain question on the review screen — "Who is this?" — and the save writes
// BOTH the shared contact book AND that module's own table. This file is the
// whole map: adding a tenth destination is a data change here, not new code.
//
// Three schema facts shaped this, all measured on production 2026-08-05:
//
//  1. Every destination has DIFFERENT column names for the same human. A person's
//     phone is `primary_contact_phone` (cdc_recruiters), `contact_phone`
//     (industry_partners, event_sponsors, sh_prospects), `phone` (ims_suppliers,
//     ss_mentors, meeting_contacts) or `mobile` (internship_*). There is no
//     shared convention to lean on, so each destination maps explicitly.
//
//  2. Three destinations require a PARENT a business card cannot carry:
//     event_sponsors needs `event_id`, internship_preceptors and
//     internship_site_contacts need `site_id`. These are NOT NULL with no
//     default — the insert is impossible, not merely incomplete. Director
//     decision 2026-08-05: ask for it right there, but ALWAYS allow Skip; on
//     skip the contact still saves and a to-do is recorded for the module owner
//     (decision 18 — never block a scan on something nobody has at a stall).
//
//  3. Two destinations require a generated identifier the card has no notion of
//     (`ims_suppliers.code`, `sh_prospects.prospect_code`). Those are derived
//     here rather than asked for.
//
// Decision 17 locked SEVEN options. Nine module tables exist, so two of them
// (`internship_preceptors`, `ss_mentors`) and `sh_prospects` hang off a
// follow-up sub-choice under an existing option rather than a new top-level one
// — a refinement, not a re-opening of a locked decision.

import type { SupabaseClient } from '@supabase/supabase-js';

/** The confirmed card, as the review screen hands it over. */
export interface CardPerson {
  name: string;
  organization?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  website?: string | null;
  city?: string | null;
  pincode?: string | null;
  note?: string | null;
}

export interface RouteContext {
  institutionId: string | null;
  scannedByProfileId: string;
  scannedByEmail: string | null;
  /** Chosen in the picker when a destination needs a parent. */
  eventId?: string | null;
  siteId?: string | null;
  /** Free-text event/place label the capture screen recorded. */
  eventLabel?: string | null;
}

/** What the caller must still supply before the module row can exist. */
export type ParentKind = 'event' | 'site' | null;

export interface Destination {
  /** Human label, shown in the "needs completion" to-do. */
  label: string;
  table: string;
  /** A parent row a card cannot name; null when the card is self-sufficient. */
  requiresParent: ParentKind;
  /** Columns that carry real value but that a card often lacks. */
  softFields: string[];
  /**
   * Columns the DATABASE requires non-empty for the row to be legitimate.
   * NOT NULL alone is not enough to lean on: an empty string satisfies NOT NULL,
   * so writing `?? ''` would insert a contact whose mobile is "" — a required
   * field that LOOKS filled and is worse than an honest refusal. When one of
   * these is blank the card is reported unroutable instead.
   */
  hardFields?: string[];
  build: (p: CardPerson, ctx: RouteContext) => Record<string, unknown>;
}

const phoneOf = (p: CardPerson) => p.mobile ?? p.phone ?? null;

/**
 * A stable, readable code derived from the company name plus a short hash of
 * the person, for the two tables that demand one. Deliberately deterministic:
 * re-running a save must not mint a second code for the same card.
 */
function derivedCode(prefix: string, p: CardPerson): string {
  const base = (p.organization ?? p.name)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  let h = 0;
  const seed = `${p.name}|${p.organization ?? ''}|${p.email ?? ''}`;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `${prefix}-${base || 'CARD'}-${h.toString(36).toUpperCase().slice(0, 4)}`;
}

/**
 * Keys are the EXACT strings the review screen sends. `sub` values are the
 * follow-up choice where one option serves two tables.
 */
export const DESTINATIONS: Record<string, Destination> = {
  'Parent / student': {
    label: 'Admission lead',
    table: 'admission_leads',
    requiresParent: null,
    softFields: ['email', 'phone'],
    build: (p, ctx) => ({
      full_name: p.name,
      email: p.email ?? null,
      phone: phoneOf(p),
      institution_id: ctx.institutionId,
      source: 'card_scan',
      notes: p.note ?? null,
    }),
  },

  'Employer / recruiter': {
    label: 'CDC recruiter',
    table: 'cdc_recruiters',
    requiresParent: null,
    softFields: ['website', 'hq_city'],
    build: (p, ctx) => ({
      name: p.organization ?? p.name,
      website: p.website ?? null,
      hq_city: p.city ?? null,
      primary_contact_name: p.name,
      primary_contact_email: p.email ?? null,
      primary_contact_phone: phoneOf(p),
      internal_institution_id: ctx.institutionId,
      notes: p.note ?? null,
    }),
  },

  // Sub-choice: an office contact vs the doctor who actually supervises interns.
  // A card cannot tell them apart, and they are different tables, so the screen
  // asks. Both need site_id.
  'Hospital / internship site': {
    label: 'Internship site contact',
    table: 'internship_site_contacts',
    requiresParent: 'site',
    softFields: ['email', 'designation'],
    hardFields: ['mobile', 'institution_id'],
    build: (p, ctx) => ({
      institution_id: ctx.institutionId,
      site_id: ctx.siteId,
      contact_name: p.name,
      designation: p.role ?? null,
      mobile: phoneOf(p),
      email: p.email ?? null,
    }),
  },
  'Hospital / internship site::preceptor': {
    label: 'Internship preceptor',
    table: 'internship_preceptors',
    requiresParent: 'site',
    softFields: ['email', 'designation'],
    hardFields: ['institution_id'],
    build: (p, ctx) => ({
      institution_id: ctx.institutionId,
      site_id: ctx.siteId,
      full_name: p.name,
      designation: p.role ?? null,
      mobile: phoneOf(p),
      email: p.email ?? null,
    }),
  },

  'Industry partner': {
    label: 'Industry partner',
    table: 'industry_partners',
    requiresParent: null,
    softFields: ['company_website', 'city'],
    hardFields: ['institution_id'],
    build: (p, ctx) => ({
      institution_id: ctx.institutionId,
      company_name: p.organization ?? p.name,
      company_website: p.website ?? null,
      contact_person: p.name,
      contact_designation: p.role ?? null,
      contact_email: p.email ?? null,
      contact_phone: phoneOf(p),
      city: p.city ?? null,
      pincode: p.pincode ?? null,
    }),
  },
  'Industry partner::mentor': {
    label: 'Student-support mentor',
    table: 'ss_mentors',
    requiresParent: null,
    softFields: ['email', 'phone'],
    build: (p, ctx) => ({
      name: p.name,
      email: p.email ?? null,
      phone: phoneOf(p),
      designation: p.role ?? null,
      organization: p.organization ?? null,
      source: 'card_scan',
      institution_id: ctx.institutionId,
    }),
  },

  'Event sponsor': {
    label: 'Event sponsor',
    table: 'event_sponsors',
    requiresParent: 'event',
    softFields: ['website'],
    build: (p, ctx) => ({
      event_id: ctx.eventId,
      company_name: p.organization ?? p.name,
      contact_person: p.name,
      contact_email: p.email ?? null,
      contact_phone: phoneOf(p),
      website: p.website ?? null,
      institution_id: ctx.institutionId,
      notes: p.note ?? null,
    }),
  },

  Vendor: {
    label: 'Supplier',
    table: 'ims_suppliers',
    requiresParent: null,
    softFields: ['email'],
    build: (p, ctx) => ({
      code: derivedCode('SUP', p),
      name: p.organization ?? p.name,
      contact_person: p.name,
      phone: phoneOf(p),
      email: p.email ?? null,
      institution_id: ctx.institutionId,
    }),
  },

  // Solutions-Hub prospect: a business lead rather than a hiring or teaching
  // relationship. Offered as a follow-up under the two commercial options.
  'Employer / recruiter::prospect': {
    label: 'Solutions prospect',
    table: 'sh_prospects',
    requiresParent: null,
    softFields: ['contact_email'],
    hardFields: ['contact_phone'],
    build: (p) => ({
      prospect_code: derivedCode('PRO', p),
      company_name: p.organization ?? p.name,
      contact_person: p.name,
      contact_email: p.email ?? null,
      contact_phone: phoneOf(p),
      source_type: 'card_scan',
      source_detail: 'Business card scanned in MyJKKN',
      notes: p.note ?? null,
    }),
  },
};

/** Alias so the commercial sub-choice is reachable from either parent option. */
DESTINATIONS['Industry partner::prospect'] = DESTINATIONS['Employer / recruiter::prospect'];

/**
 * `meeting_contacts` is deliberately NOT in the map above: it is not a "type of
 * person", it is the scheduling address book, and every scanned contact with an
 * email belongs in it regardless of which option was chosen. It is written
 * separately by `routeCard` below.
 */

export interface RouteOutcome {
  routed: boolean;
  table: string | null;
  rowId: string | null;
  /** Set when the destination needed a parent the user skipped. */
  pendingParent: ParentKind;
  /** Soft columns the card could not fill — decision 18's "N fields missing". */
  missingFields: string[];
  error: string | null;
  /** True when the scheduling address book also got a row. */
  meetingContactWritten: boolean;
}

/**
 * Write the module's own row for a confirmed card.
 *
 * NEVER throws and never blocks the save: the contact book write has already
 * succeeded by the time this runs, and decision 18 is explicit that a
 * half-filled or unroutable record must not cost the user their scan. Every
 * failure comes back as data for the caller to record and surface.
 */
export async function routeCard(
  db: SupabaseClient,
  routedTo: string | null | undefined,
  person: CardPerson,
  ctx: RouteContext,
): Promise<RouteOutcome> {
  const base: RouteOutcome = {
    routed: false,
    table: null,
    rowId: null,
    pendingParent: null,
    missingFields: [],
    error: null,
    meetingContactWritten: false,
  };

  // The scheduling address book takes anyone with an email, whatever they are.
  if (person.email) {
    const { error } = await db.from('meeting_contacts').insert({
      host_profile_id: ctx.scannedByProfileId,
      email: person.email,
      name: person.name,
      phone: phoneOf(person),
      notes: ctx.eventLabel ? `Met at ${ctx.eventLabel}` : null,
    });
    // A duplicate here is success, not failure — one person, one row.
    base.meetingContactWritten = !error || error.code === '23505';
  }

  if (!routedTo || routedTo === 'Just a contact') return base;

  const dest = DESTINATIONS[routedTo];
  if (!dest) {
    return { ...base, error: `No destination is wired for "${routedTo}".` };
  }

  base.table = dest.table;

  // Parent required but not chosen → record the to-do, do NOT write a row that
  // the database would reject anyway.
  if (dest.requiresParent === 'event' && !ctx.eventId) {
    return { ...base, pendingParent: 'event' };
  }
  if (dest.requiresParent === 'site' && !ctx.siteId) {
    return { ...base, pendingParent: 'site' };
  }

  const row = dest.build(person, ctx);
  const blank = (f: string) => {
    const v = row[f];
    return v === null || v === undefined || v === '';
  };

  base.missingFields = dest.softFields.filter(blank);

  // A hard field the card cannot supply means this row would either be rejected
  // by the database or, worse, accepted with an empty string in a required
  // column. Refuse honestly and let the module owner finish it (decision 18).
  const missingHard = (dest.hardFields ?? []).filter(blank);
  if (missingHard.length > 0) {
    return {
      ...base,
      missingFields: [...base.missingFields, ...missingHard],
      error: `Cannot add to ${dest.label}: ${missingHard.join(', ')} required but not on the card.`,
    };
  }

  const { data, error } = await db.from(dest.table).insert(row).select('id').single();

  if (error) {
    // 23505 = this person is already in that module. Not an error worth showing:
    // one person stays one person (decision 24).
    if (error.code === '23505') {
      return { ...base, routed: true, error: null };
    }
    return { ...base, error: error.message };
  }

  return { ...base, routed: true, rowId: (data as { id: string } | null)?.id ?? null };
}
