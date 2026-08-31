// lib/services/meetings/public-host-service.ts
//
// Universal Booking U4 — resolution layer for the PUBLIC surfaces
// (/meet directory + /meet/[handle] person pages + their slots/book APIs).
//
// THE D20 GATE LIVES HERE and only here: a host is publicly bookable iff
//   meeting_host_pages.is_public AND NOT auto_hidden
//   AND meeting_host_google_connections.status = 'active'
// Every public read goes through resolveBookableHost / listBookableHosts so
// the rule cannot drift between surfaces.
//
// SECURITY: callers hold a SERVICE-ROLE client (public routes, RLS would
// return nothing). Only public-safe fields ever leave this module — no
// emails, no phone numbers, no tokens (D6).
//
// Pattern: MeetingRoutingService (service-role resolution for public funnel).

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatVenueDirections } from './venue-directions';

const LOG_PREFIX = '[public-host]';

/** Raw meeting_type_locations row (migration 20260830030000). */
interface MeetingTypeLocationRow {
  id: string;
  meeting_type_id: string;
  location_mode: string | null;
  location_resource_id: string | null;
  location_text: string | null;
  sort_order: number | null;
}

/**
 * One place a meeting type can happen in.
 *
 * A type used to hold exactly one location, so two records were needed to
 * offer one purpose in two places. `PublicMeetingType.locations` is the list
 * that removes that ceiling; the single-location fields beside it are
 * unchanged and still drive every current booking surface.
 */
export interface PublicMeetingLocation {
  /**
   * meeting_type_locations.id — or `legacy:<meetingTypeId>` for the entry
   * synthesised from the legacy columns when the places table is unavailable.
   */
  id: string;
  locationMode: 'in_person' | 'phone' | 'online';
  locationText: string | null;
  /** Directions resolved from the linked room. null = custom / no room. */
  locationDetails: string | null;
  sortOrder: number;
}

export interface PublicMeetingType {
  /** uuid — passed to the slots/book APIs. */
  id: string;
  title: string;
  slug: string;
  durationMin: number;
  description: string | null;
  locationMode: 'in_person' | 'phone' | 'online';
  locationText: string | null;
  /**
   * Venue-from-resource PR1: full directions resolved from the linked
   * "Spaces & Venues" room (name + building/block/floor/room/notes), shown to
   * the booker so they can find an in-person meeting. null = custom/no room.
   */
  locationDetails: string | null;
  /**
   * Purpose grouping: types sharing a non-null value are ONE choice on the
   * public page, and this value is that choice's label — the booker picks the
   * purpose first, then the format. null = stands alone under its own title,
   * which is the pre-existing behaviour for every host that has not set it.
   *
   * This restores a concept the 2026-06-11 Calendly mirror lost: 14 types came
   * from Calendly events whose location was "in-person / online, invitee
   * chooses". The import had nowhere to put that, so it forced a single
   * location_mode and left the real meaning in free text — which is why some
   * types still show a format badge that contradicts their own description.
   */
  purposeGroup: string | null;
  /**
   * Every place this type can happen in (migration 20260830030000), in display
   * order. ADDITIVE — the locationMode / locationText / locationDetails fields
   * above are untouched and remain what every current consumer reads.
   *
   * Never empty: where the places table is unavailable (the migration ships as
   * a file and is Director-gated) or a type has no rows yet, this holds the one
   * place the legacy columns describe — the same single place as today.
   */
  locations: PublicMeetingLocation[];
}

/**
 * The host's own routing form (/r/<slug>), surfaced from their booking page so
 * a visitor who cannot pick a purpose has somewhere to go. 2026-08-13: the
 * Director's form had been live and correct since 5 August with ZERO responses
 * — nothing on any page linked to it, so nobody could find it.
 */
export interface PublicRoutingFormLink {
  slug: string;
  /**
   * How many questions the visitor will actually be asked. The link copy is
   * built from this so it can never promise "one question" on a three-question
   * form.
   */
  questionCount: number;
}

export interface PublicHost {
  hostProfileId: string;
  handle: string;
  name: string;
  designation: string | null;
  headline: string | null;
  avatarUrl: string | null;
  institutionName: string | null;
  departmentName: string | null;
  meetingTypes: PublicMeetingType[];
  /** null = this host has no active routing form; the page shows no link. */
  routingForm: PublicRoutingFormLink | null;
}

/**
 * Copy for the routing-form link on a booking page. Pure so it can be tested
 * without touching the database, and so the count and the wording can never
 * drift apart.
 */
export function routingFormLinkLabel(questionCount: number): string {
  return questionCount === 1
    ? 'Not sure which one you need? Answer one question'
    : `Not sure which one you need? Answer ${questionCount} questions`;
}

export interface DirectoryEntry {
  kind: 'person';
  handle: string;
  name: string;
  designation: string | null;
  headline: string | null;
  avatarUrl: string | null;
  institutionName: string | null;
  departmentName: string | null;
}

export interface DirectoryFunnel {
  kind: 'funnel';
  slug: string;
  displayName: string;
  institutionName: string | null;
}

export class PublicHostService {
  /** host_profile_ids with an ACTIVE Google connection (the D20 set). */
  private static async activeConnectionSet(
    supabase: SupabaseClient,
    hostIds: string[],
  ): Promise<Set<string>> {
    if (!hostIds.length) return new Set();
    const { data, error } = await supabase
      .from('meeting_host_google_connections')
      .select('host_profile_id')
      .eq('status', 'active')
      .in('host_profile_id', hostIds);
    if (error) {
      console.error(`${LOG_PREFIX} connection set load failed:`, error.message);
      return new Set(); // fail closed: no host passes D20
    }
    return new Set((data ?? []).map((r) => r.host_profile_id as string));
  }

  /**
   * One bookable host by handle, with their bookable meeting types.
   * null = not found OR not public OR auto-hidden OR no active Google
   * connection — callers render the same generic 404 for all of these
   * (no oracle about who exists).
   */
  static async resolveBookableHost(
    supabase: SupabaseClient,
    handle: string,
  ): Promise<PublicHost | null> {
    const normalized = (handle ?? '').toLowerCase().trim();
    if (!normalized) return null;

    const { data: page, error } = await supabase
      .from('meeting_host_pages')
      .select('host_profile_id, handle, headline, is_public, auto_hidden')
      .eq('handle', normalized)
      .maybeSingle();
    if (error || !page || !page.is_public || page.auto_hidden) return null;

    const active = await this.activeConnectionSet(supabase, [page.host_profile_id]);
    if (!active.has(page.host_profile_id)) return null;

    const [{ data: profile }, { data: types }] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, designation, avatar_url, institution_id, department_id')
        .eq('id', page.host_profile_id)
        .maybeSingle(),
      supabase
        .from('meeting_types')
        .select('id, title, slug, duration_min, description, location_mode, location_text, location_resource_id, purpose_group')
        .eq('host_profile_id', page.host_profile_id)
        .eq('is_active', true)
        .eq('hidden', false)
        .order('duration_min', { ascending: true }),
    ]);
    if (!profile) return null;

    // One meeting type, many places (migration 20260830030000). Batched, and
    // empty when the table is unavailable — see placesFor.
    const placesByType = await this.placesFor(
      supabase,
      (types ?? []).map((t) => t.id as string),
    );

    // Venue-from-resource PR1: resolve every linked room → a directions line so
    // the booker can find an in-person meeting. One batched lookup (service-role
    // client here, so resources are readable regardless of the booker), now
    // covering the rooms named by the places table as well as the legacy column.
    const directionsById = await this.venueDirectionsFor(supabase, [
      ...(types ?? [])
        .map((t) => t.location_resource_id as string | null)
        .filter((id): id is string => Boolean(id)),
      ...[...placesByType.values()]
        .flat()
        .map((p) => p.location_resource_id)
        .filter((id): id is string => Boolean(id)),
    ]);

    const [instName, deptName, routingForm] = await Promise.all([
      this.nameOf(supabase, 'institutions', profile.institution_id),
      this.nameOf(supabase, 'departments', profile.department_id),
      this.activeRoutingFormFor(supabase, page.host_profile_id),
    ]);

    return {
      hostProfileId: page.host_profile_id,
      handle: page.handle,
      name: (profile.full_name as string | undefined) ?? 'JKKN Staff',
      designation: (profile.designation as string | undefined) ?? null,
      headline: page.headline ?? null,
      avatarUrl: (profile.avatar_url as string | undefined) ?? null,
      institutionName: instName,
      departmentName: deptName,
      meetingTypes: (types ?? []).map((t) => {
        const locationMode =
          (t.location_mode as PublicMeetingType['locationMode']) ?? 'in_person';
        const locationDetails = t.location_resource_id
          ? directionsById.get(t.location_resource_id as string) ?? null
          : null;
        return {
          id: t.id,
          title: t.title,
          slug: t.slug,
          durationMin: t.duration_min,
          description: t.description ?? null,
          locationMode,
          locationText: t.location_text ?? null,
          locationDetails,
          // Treat an all-whitespace value as unset so a stray space in the host
          // editor cannot silently create a group of one with a blank label.
          purposeGroup: ((t.purpose_group as string | null) ?? '').trim() || null,
          locations: this.locationsFor(
            t.id as string,
            placesByType.get(t.id as string) ?? [],
            directionsById,
            { locationMode, locationText: t.location_text ?? null, locationDetails },
          ),
        };
      }),
      routingForm,
    };
  }

  /**
   * Places per meeting type (migration 20260830030000), batched by type id.
   *
   * Fails SOFT and EMPTY on purpose: this ships the migration as a file only
   * (Director-gated), so on a database where it has not been applied the table
   * does not exist and the query errors. An empty map makes every type fall
   * back to the one place its legacy location_* columns already describe — the
   * booking page then renders exactly as it does today.
   *
   * "Not applied yet" is an EXPECTED state, not an incident, and it can last
   * weeks — merging is not applying in this repo. So a missing table is handled
   * quietly and REMEMBERED: without the latch this logs an error and burns a
   * round trip on EVERY render of a public, unauthenticated page, which buries
   * real errors in noise and teaches readers to ignore this log line. Any OTHER
   * error still logs every time, because that one IS an incident.
   *
   * The latch is per server instance and resets on redeploy — which is exactly
   * when the table's existence can change — so applying the migration needs no
   * cache-busting step.
   */
  private static placesTableMissing = false;

  private static async placesFor(
    supabase: SupabaseClient,
    typeIds: string[],
  ): Promise<Map<string, MeetingTypeLocationRow[]>> {
    const byType = new Map<string, MeetingTypeLocationRow[]>();
    if (!typeIds.length || this.placesTableMissing) return byType;
    const { data, error } = await supabase
      .from('meeting_type_locations')
      .select('id, meeting_type_id, location_mode, location_resource_id, location_text, sort_order')
      .in('meeting_type_id', typeIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      // 42P01 = undefined_table (Postgres); PGRST205 = PostgREST cannot find it
      // in its schema cache. Either one means the migration is not applied yet.
      const notApplied =
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        /does not exist|could not find the table/i.test(error.message ?? '');
      if (notApplied) {
        this.placesTableMissing = true;
        console.info(
          `${LOG_PREFIX} meeting_type_locations is not present yet — using the legacy single location until migration 20260830030000 is applied`,
        );
      } else {
        console.error(`${LOG_PREFIX} meeting type places load failed:`, error.message);
      }
      return byType; // caller falls back to the legacy single location
    }
    for (const row of (data ?? []) as MeetingTypeLocationRow[]) {
      const list = byType.get(row.meeting_type_id);
      if (list) list.push(row);
      else byType.set(row.meeting_type_id, [row]);
    }
    return byType;
  }

  /**
   * The places list for one type — its own rows, or the single place its legacy
   * columns describe when it has none (migration pending, or a type created
   * after the backfill). Never empty, so a consumer can read `locations` without
   * having to know whether the migration has landed.
   */
  private static locationsFor(
    meetingTypeId: string,
    rows: MeetingTypeLocationRow[],
    directionsById: Map<string, string>,
    legacy: {
      locationMode: PublicMeetingType['locationMode'];
      locationText: string | null;
      locationDetails: string | null;
    },
  ): PublicMeetingLocation[] {
    if (!rows.length) {
      return [{ id: `legacy:${meetingTypeId}`, ...legacy, sortOrder: 0 }];
    }
    return rows.map((r) => ({
      id: r.id,
      locationMode: (r.location_mode as PublicMeetingType['locationMode']) ?? 'in_person',
      locationText: r.location_text ?? null,
      locationDetails: r.location_resource_id
        ? directionsById.get(r.location_resource_id) ?? null
        : null,
      sortOrder: r.sort_order ?? 0,
    }));
  }

  /**
   * The host's active routing form, or null when they have none.
   *
   * Fails closed on every unhappy path (error, no row, a form with nothing to
   * answer): the booking page then renders exactly what it renders today. This
   * is a helper link, so it must never be able to break the booking funnel it
   * sits on.
   *
   * Ordered oldest-first because a host may keep more than one active form:
   * picking the earliest one keeps the link on a page stable, so drafting a
   * second form never silently redirects visitors away from the form that is
   * already working.
   */
  private static async activeRoutingFormFor(
    supabase: SupabaseClient,
    hostProfileId: string,
  ): Promise<PublicRoutingFormLink | null> {
    const { data, error } = await supabase
      .from('routing_forms')
      .select('slug, fields')
      .eq('host_profile_id', hostProfileId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data?.slug) {
      if (error) console.error(`${LOG_PREFIX} routing form load failed:`, error.message);
      return null;
    }

    // Count only entries that are really a question (same shape guard the
    // public /r/[slug] page applies), so a malformed row cannot inflate the
    // number the link promises.
    const questionCount = (Array.isArray(data.fields) ? data.fields : []).filter(
      (f: unknown) =>
        !!f && typeof (f as { key?: unknown }).key === 'string' && (f as { key: string }).key !== '',
    ).length;

    // A form with nothing to answer has no honest link copy — treat it as no
    // form at all rather than inviting a visitor to answer zero questions.
    if (questionCount === 0) return null;

    return { slug: data.slug as string, questionCount };
  }

  /** Batch-resolve resource ids → a formatted directions line (id → string). */
  private static async venueDirectionsFor(
    supabase: SupabaseClient,
    resourceIds: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(resourceIds)];
    if (!unique.length) return new Map();
    const { data, error } = await supabase
      .from('resources')
      .select('id, name, building_number, block_number, floor_number, room_number, location_notes')
      .in('id', unique);
    if (error) {
      console.error(`${LOG_PREFIX} venue directions load failed:`, error.message);
      return new Map();
    }
    const map = new Map<string, string>();
    for (const r of data ?? []) {
      const directions = formatVenueDirections(r);
      if (directions) map.set(r.id as string, directions);
    }
    return map;
  }

  private static async nameOf(
    supabase: SupabaseClient,
    table: 'institutions' | 'departments',
    id: string | null | undefined,
  ): Promise<string | null> {
    if (!id) return null;
    const nameCol = table === 'departments' ? 'department_name' : 'name';
    const { data } = await supabase.from(table).select(nameCol).eq('id', id).maybeSingle();
    return ((data as Record<string, string> | null)?.[nameCol] as string | undefined) ?? null;
  }

  /** Directory: every D20-passing person + every active routed funnel (D7). */
  static async listDirectory(
    supabase: SupabaseClient,
  ): Promise<{ people: DirectoryEntry[]; funnels: DirectoryFunnel[] }> {
    const [{ data: pages }, { data: configs }] = await Promise.all([
      supabase
        .from('meeting_host_pages')
        .select('host_profile_id, handle, headline')
        .eq('is_public', true)
        .eq('auto_hidden', false)
        .order('handle'),
      supabase
        .from('meeting_routing_config')
        .select('slug, display_name, institution_id')
        .eq('is_active', true)
        .order('display_name'),
    ]);

    const hostIds = (pages ?? []).map((p) => p.host_profile_id as string);
    const active = await this.activeConnectionSet(supabase, hostIds);
    const visible = (pages ?? []).filter((p) => active.has(p.host_profile_id));

    // Profile + lookup maps in bulk (no FK-embed dependency).
    const { data: profiles } = visible.length
      ? await supabase
          .from('profiles')
          .select('id, full_name, designation, avatar_url, institution_id, department_id')
          .in('id', visible.map((p) => p.host_profile_id))
      : { data: [] as any[] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

    const instIds = new Set<string>();
    const deptIds = new Set<string>();
    for (const p of profiles ?? []) {
      if (p.institution_id) instIds.add(p.institution_id);
      if (p.department_id) deptIds.add(p.department_id);
    }
    for (const c of configs ?? []) if (c.institution_id) instIds.add(c.institution_id);

    const [instMap, deptMap] = await Promise.all([
      this.namesOf(supabase, 'institutions', [...instIds]),
      this.namesOf(supabase, 'departments', [...deptIds]),
    ]);

    const people: DirectoryEntry[] = visible
      .map((page) => {
        const profile = profileById.get(page.host_profile_id as string);
        if (!profile) return null;
        return {
          kind: 'person' as const,
          handle: page.handle as string,
          name: (profile.full_name as string | undefined) ?? 'JKKN Staff',
          designation: (profile.designation as string | undefined) ?? null,
          headline: (page.headline as string | undefined) ?? null,
          avatarUrl: (profile.avatar_url as string | undefined) ?? null,
          institutionName: instMap.get(profile.institution_id) ?? null,
          departmentName: deptMap.get(profile.department_id) ?? null,
        };
      })
      .filter((p): p is DirectoryEntry => p !== null);

    const funnels: DirectoryFunnel[] = (configs ?? []).map((c) => ({
      kind: 'funnel' as const,
      slug: c.slug as string,
      displayName: c.display_name as string,
      institutionName: instMap.get(c.institution_id) ?? null,
    }));

    return { people, funnels };
  }

  private static async namesOf(
    supabase: SupabaseClient,
    table: 'institutions' | 'departments',
    ids: string[],
  ): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const nameCol = table === 'departments' ? 'department_name' : 'name';
    const { data } = await supabase.from(table).select(`id, ${nameCol}`).in('id', ids);
    return new Map(
      ((data ?? []) as Array<Record<string, string>>).map((r) => [r.id, r[nameCol]]),
    );
  }
}
