// lib/services/programmes/public-programme-service.ts
//
// THE GATEKEEPER for the public programme catalogue (app/(public)/programmes).
//
// One rule, one place: a programme reaches the open web if and only if a row in
// public.public_programmes says is_published = true. Nothing else on this
// estate can put itself on that page — degree programmes, cohorts, events and
// School of Influence have no path here, by design. Director ruling 2026-08-13:
// School of Influence is for JKKN learners and senior learners only and must
// never appear in this catalogue.
//
// DEFAULT CLOSED, four ways, none of them decorative:
//   1. public_programmes.is_published defaults to false in the database.
//   2. The RLS policy only exposes published rows. The page reads with the ANON
//      key, not the service-role key, so this is a live database-side gate — an
//      unpublished row cannot reach the page even if the filter below were
//      deleted.
//   3. listPublished() filters is_published again, in front of the policy.
//   4. Columns are named explicitly, never select('*'), so a column added later
//      cannot arrive on a public page just because someone added it.
//
// FAIL CLOSED: any read error returns an empty catalogue. An outage renders the
// "nothing open right now" state, never a partial or stale list.
//
// PRIVACY: programme-level facts only. Nothing returned from this module names
// a person or counts people.
//
// Pattern: lib/services/meetings/public-host-service.ts — the proven precedent
// for a single public gatekeeper reading through a service-role client.

import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[public-programmes]';

/**
 * The exact column list a public reader may see. Adding a column to the table
 * does NOT add it here — that is the point.
 */
const PUBLIC_COLUMNS =
  'id, slug, name, summary, audience, is_free, fee_amount, fee_currency, starts_on, ends_on, apply_url, sort_order';

/** Hard ceiling on one page of the catalogue. */
const PAGE_LIMIT = 200;

/**
 * Only these may reach a rendered href on a public page: an absolute http(s)
 * URL, or a genuine in-app path.
 *
 * The second character of a path is load-bearing. '//evil.tld' is a PROTOCOL-
 * RELATIVE URL and '/\evil.tld' is normalised to the same thing by browsers —
 * both start with '/', so a bare /^\// test would hand an off-site destination
 * to a JKKN-branded link. A path must be '/' followed by something that is
 * neither '/' nor a backslash. Mirrors the CHECK constraint on the column.
 */
const SAFE_LINK = /^(?:https?:\/\/[^/]|\/[^/\\])/i;

export interface PublicProgramme {
  id: string;
  slug: string;
  /** Programme name, as the public should read it. */
  name: string;
  /** One line: what it is. */
  summary: string;
  /** Who it is for, in plain words. */
  audience: string;
  /** 'Free', a formatted amount, or 'Fee on request' when not fixed yet. */
  priceLabel: string;
  /** 'Starts 12 January 2027', '12 January – 20 February 2027', or null. */
  dateLabel: string | null;
  /** Absolute https URL or in-app path. null = no link yet. */
  applyUrl: string | null;
}

interface ProgrammeRow {
  id: string;
  slug: string;
  name: string;
  summary: string;
  audience: string;
  is_free: boolean;
  fee_amount: number | string | null;
  fee_currency: string | null;
  starts_on: string | null;
  ends_on: string | null;
  apply_url: string | null;
  sort_order: number | null;
}

/** 'YYYY-MM-DD' → '12 January 2027'. Parsed as UTC so the day never shifts. */
function formatDay(iso: string, withYear = true): string | null {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

function formatDateLabel(startsOn: string | null, endsOn: string | null): string | null {
  if (!startsOn && !endsOn) return null;
  if (startsOn && !endsOn) {
    const day = formatDay(startsOn);
    return day ? `Starts ${day}` : null;
  }
  if (!startsOn && endsOn) {
    const day = formatDay(endsOn);
    return day ? `Until ${day}` : null;
  }
  const sameYear = startsOn!.slice(0, 4) === endsOn!.slice(0, 4);
  const from = formatDay(startsOn!, !sameYear);
  const to = formatDay(endsOn!);
  if (!from || !to) return null;
  return `${from} – ${to}`;
}

function formatPriceLabel(row: ProgrammeRow): string {
  if (row.is_free) return 'Free';
  const amount = row.fee_amount === null ? null : Number(row.fee_amount);
  if (amount === null || Number.isNaN(amount)) return 'Fee on request';
  // A fee of zero IS free, whatever the flag says. Rendering "₹0" on a public
  // page reads as a mistake and invites a phone call.
  if (amount === 0) return 'Free';
  const currency = (row.fee_currency || 'INR').toUpperCase();
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    // Unknown currency code — show the number rather than crashing the page.
    return `${currency} ${amount}`;
  }
}

/** Today as 'YYYY-MM-DD' in India, which is the calendar every date here means. */
function todayInIndia(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export class PublicProgrammeService {
  /**
   * Every programme the public may see, in display order.
   *
   * Returns [] when nothing is published, when every published programme has
   * already finished, or when the read fails. The page treats all three the
   * same way, which is correct: in each case there is nothing on offer.
   */
  static async listPublished(supabase: SupabaseClient): Promise<PublicProgramme[]> {
    const { data, error } = await supabase
      .from('public_programmes')
      .select(PUBLIC_COLUMNS)
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('starts_on', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })
      // A public, force-dynamic route must not become an unbounded read as the
      // catalogue grows. Far above any plausible number of open programmes.
      .limit(PAGE_LIMIT);

    if (error) {
      console.error(`${LOG_PREFIX} catalogue read failed:`, error.message);
      return []; // fail closed
    }

    const today = todayInIndia();

    return ((data ?? []) as unknown as ProgrammeRow[])
      // A programme that has already finished is not on offer. Rows with no end
      // date stay visible until they are unpublished.
      .filter((row) => !row.ends_on || row.ends_on >= today)
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        summary: row.summary,
        audience: row.audience,
        priceLabel: formatPriceLabel(row),
        dateLabel: formatDateLabel(row.starts_on, row.ends_on),
        // Second line of defence behind the database CHECK: never hand an
        // unexpected scheme to an href.
        applyUrl: row.apply_url && SAFE_LINK.test(row.apply_url) ? row.apply_url : null,
      }));
  }
}
