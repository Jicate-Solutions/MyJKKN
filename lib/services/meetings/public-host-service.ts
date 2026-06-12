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

const LOG_PREFIX = '[public-host]';

export interface PublicMeetingType {
  /** uuid — passed to the slots/book APIs. */
  id: string;
  title: string;
  slug: string;
  durationMin: number;
  description: string | null;
  locationMode: 'in_person' | 'phone' | 'online';
  locationText: string | null;
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
        .select('id, title, slug, duration_min, description, location_mode, location_text')
        .eq('host_profile_id', page.host_profile_id)
        .eq('is_active', true)
        .eq('hidden', false)
        .order('duration_min', { ascending: true }),
    ]);
    if (!profile) return null;

    const [instName, deptName] = await Promise.all([
      this.nameOf(supabase, 'institutions', profile.institution_id),
      this.nameOf(supabase, 'departments', profile.department_id),
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
      meetingTypes: (types ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        slug: t.slug,
        durationMin: t.duration_min,
        description: t.description ?? null,
        locationMode: (t.location_mode as PublicMeetingType['locationMode']) ?? 'in_person',
        locationText: t.location_text ?? null,
      })),
    };
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
