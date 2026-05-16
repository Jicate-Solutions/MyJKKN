// lib/services/ai-pulse/naac-evidence-service.ts
// Created: 2026-05-08 — AI Pulse module v3 (Wave C.1 NAAC Evidence Export)
//
// Backs: app/(routes)/ai-pulse/evidence/naac/page.tsx (+ _components/*) and
//        the two API routes app/api/ai-pulse/evidence/naac/{route,export/route}.ts
// Pairs with: event_submissions + event_registrations + startup_events
//             (config->>'kind' = 'ai_pulse'). Gold Standard = tier_level >= 4
//             per spec §7.
// RLS:        Read-only. RLS on event_submissions / event_registrations
//             scopes results to institutions the caller can access. Page-level
//             permission gate at the form layer is `aiPulse:naac.evidence_export`
//             OR super_admin OR an IQAC role (role_key contains 'iqac').
//
// History: PR #741 (UI + API routes for NAAC export) merged on 2026-05-07 but
// the service file was missing — broke the main build. PR #772 originally
// shipped a stub here; this commit replaces the stub with the real
// implementation now that the substrate (#644) and adjacent services
// (#768 anomaly-service) have merged.
//
// Pattern reference: lib/services/ai-pulse/anomaly-service.ts (sibling read
// service) and the BaseService.runWithClient pattern that lets API routes
// run service methods against an auth-scoped supabase client.

import { useQuery } from '@tanstack/react-query';

import { BaseService } from '@/lib/services/base-service';

// ---------------------------------------------------------------------------
// Types — shape locked by consumer files (preview table + form summary).
// ---------------------------------------------------------------------------

export interface NaacEvidenceFilters {
  /** ISO date YYYY-MM-DD, inclusive lower bound on cycle demo_date. */
  from?: string;
  /** ISO date YYYY-MM-DD, inclusive upper bound on cycle demo_date. */
  to?: string;
  /** Optional institution scope. When omitted, all institutions in scope. */
  institution_id?: string;
}

export interface NaacEvidenceRow {
  academic_year: string;
  cycle_date: string;
  institution_name: string;
  department_name: string;
  team_name: string;
  project_name: string;
  description: string;
  github_url: string;
  live_app_url: string;
  featured_tool: string;
  champion_at_time: string;
  ig_reach: number;
  proof_urls: string;
}

export interface NaacEvidenceSummary {
  gold_standard_count: number;
  department_count: number;
  cycle_count: number;
  range_label: string;
}

export interface NaacEvidenceResponse {
  rows: NaacEvidenceRow[];
  summary: NaacEvidenceSummary;
}

// ---------------------------------------------------------------------------
// Default date range helper — returns the prior 90 days as ISO date strings.
// Used by both the form (initial state) and the API routes (default filter).
// ---------------------------------------------------------------------------

export function defaultLastQuarter(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Indian academic year for a given date string. AY rolls over on June 1.
 * Example: 2025-08-15 → "2025-26"; 2026-04-30 → "2025-26"; 2026-06-15 → "2026-27".
 */
function academicYearFor(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0=Jan, 5=Jun
  const start = m >= 5 ? y : y - 1;
  const end = String((start + 1) % 100).padStart(2, '0');
  return `${start}-${end}`;
}

function safeDate(iso: string | null | undefined): string {
  if (!iso) return '';
  // Slice ISO down to YYYY-MM-DD if it includes time component.
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

function rangeLabel(filters: NaacEvidenceFilters): string {
  const { from, to } = filters;
  if (from && to) return `${from} → ${to}`;
  if (from) return `from ${from}`;
  if (to) return `until ${to}`;
  return 'All time';
}

// ---------------------------------------------------------------------------
// Service class — invoked by API routes via BaseService.runWithClient so the
// supabase reads run under the caller's auth scope (RLS-enforced).
// ---------------------------------------------------------------------------

export class NaacEvidenceService extends BaseService {
  /**
   * Read Gold Standard rows (tier_level >= 4) from event_submissions joined
   * to event_registrations and startup_events filtered to AI Pulse cycles.
   *
   * Date range filters apply to the cycle's demo_date.
   * Institution filter applies to the registration's institution_id (which
   * mirrors the team's institution).
   */
  static async getEvidenceRows(
    filters: NaacEvidenceFilters,
  ): Promise<NaacEvidenceResponse> {
    const supabase = (this as any).supabase;

    // 1. Find AI Pulse cycle ids in range. We do this in two steps so the
    //    second query (submissions) can use a stable IN-list.
    let cyclesQuery = supabase
      .from('startup_events')
      .select('id, name, demo_date, config, host_institution_id')
      .filter('config->>kind', 'eq', 'ai_pulse');

    if (filters.from) {
      cyclesQuery = cyclesQuery.gte('demo_date', filters.from);
    }
    if (filters.to) {
      // Inclusive upper bound — demo_date is timestamptz; compare against
      // the end-of-day to capture rows with non-midnight times.
      cyclesQuery = cyclesQuery.lte('demo_date', `${filters.to}T23:59:59`);
    }

    const { data: cyclesRaw, error: cyclesErr } = await cyclesQuery;
    if (cyclesErr) {
      console.error('[ai-pulse/naac] cycles query failed:', cyclesErr);
      throw new Error(cyclesErr.message);
    }

    const cycles = (cyclesRaw ?? []) as any[];
    if (cycles.length === 0) {
      return {
        rows: [],
        summary: {
          gold_standard_count: 0,
          department_count: 0,
          cycle_count: 0,
          range_label: rangeLabel(filters),
        },
      };
    }
    const cycleIds = cycles.map((c) => c.id);

    // 2. Resolve featured_tool labels referenced by these cycles in one batch.
    const featuredToolIds = Array.from(
      new Set(
        cycles
          .map((c) => c?.config?.featured_tool_id)
          .filter(Boolean) as string[],
      ),
    );

    const featuredToolNameById = new Map<string, string>();
    if (featuredToolIds.length > 0) {
      const { data: tools } = await supabase
        .from('ai_pulse_featured_tools')
        .select('id, label_en, vendor_name')
        .in('id', featuredToolIds);

      for (const t of (tools ?? []) as any[]) {
        const label = t.vendor_name
          ? `${t.label_en} · ${t.vendor_name}`
          : t.label_en;
        featuredToolNameById.set(t.id, label);
      }
    }

    // 3. Resolve host (champion at time of cycle) labels in one batch.
    const hostUserIds = Array.from(
      new Set(
        cycles
          .map((c) => c?.config?.host_user_id)
          .filter(Boolean) as string[],
      ),
    );

    const hostNameById = new Map<string, string>();
    if (hostUserIds.length > 0) {
      const { data: hosts } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', hostUserIds);
      for (const h of (hosts ?? []) as any[]) {
        hostNameById.set(h.id, h.full_name || h.email || h.id.slice(0, 8));
      }
    }

    // 4. Resolve host_institution_id labels for each cycle.
    const institutionIds = Array.from(
      new Set(cycles.map((c) => c.host_institution_id).filter(Boolean)),
    ) as string[];

    const institutionNameById = new Map<string, string>();
    if (institutionIds.length > 0) {
      const { data: insts } = await supabase
        .from('institutions')
        .select('id, name')
        .in('id', institutionIds);
      for (const inst of (insts ?? []) as any[]) {
        institutionNameById.set(inst.id, inst.name);
      }
    }

    // 5. Fetch Gold Standard submissions for these cycles.
    let subsQuery = supabase
      .from('event_submissions')
      .select(
        'id, event_id, registration_id, app_name, github_url, live_app_url, description, problem_statement, solution_summary, tier_level, total_score, proof_urls, active_users_count',
      )
      .in('event_id', cycleIds)
      .gte('tier_level', 4);

    const { data: subsRaw, error: subsErr } = await subsQuery;
    if (subsErr) {
      console.error('[ai-pulse/naac] submissions query failed:', subsErr);
      throw new Error(subsErr.message);
    }
    const submissions = (subsRaw ?? []) as any[];

    if (submissions.length === 0) {
      return {
        rows: [],
        summary: {
          gold_standard_count: 0,
          department_count: 0,
          cycle_count: cycles.length,
          range_label: rangeLabel(filters),
        },
      };
    }

    // 6. Resolve registrations (team name + institution + owner) in one batch.
    const registrationIds = Array.from(
      new Set(submissions.map((s) => s.registration_id).filter(Boolean)),
    ) as string[];

    const registrationById = new Map<
      string,
      {
        id: string;
        team_name: string | null;
        institution_id: string | null;
        owner_id: string | null;
      }
    >();
    if (registrationIds.length > 0) {
      const { data: regsRaw } = await supabase
        .from('event_registrations')
        .select('id, team_name, institution_id, owner_id')
        .in('id', registrationIds);
      for (const r of (regsRaw ?? []) as any[]) {
        registrationById.set(r.id, {
          id: r.id,
          team_name: r.team_name ?? null,
          institution_id: r.institution_id ?? null,
          owner_id: r.owner_id ?? null,
        });
      }
    }

    // 7. Apply institution filter (post-fetch since RLS already scopes).
    const filteredSubs = filters.institution_id
      ? submissions.filter((s) => {
          const reg = registrationById.get(s.registration_id);
          return reg?.institution_id === filters.institution_id;
        })
      : submissions;

    // 8. Resolve owner (presenter / submitter) profiles + departments.
    const ownerIds = Array.from(
      new Set(
        filteredSubs
          .map((s) => registrationById.get(s.registration_id)?.owner_id)
          .filter(Boolean) as string[],
      ),
    );

    const ownerById = new Map<
      string,
      { full_name: string | null; department_id: string | null }
    >();
    if (ownerIds.length > 0) {
      const { data: ownersRaw } = await supabase
        .from('profiles')
        .select('id, full_name, department_id')
        .in('id', ownerIds);
      for (const o of (ownersRaw ?? []) as any[]) {
        ownerById.set(o.id, {
          full_name: o.full_name ?? null,
          department_id: o.department_id ?? null,
        });
      }
    }

    // Resolve any institution ids referenced via registrations that we
    // haven't already loaded.
    const regInstitutionIds = Array.from(
      new Set(
        filteredSubs
          .map((s) => registrationById.get(s.registration_id)?.institution_id)
          .filter(Boolean) as string[],
      ),
    ).filter((id) => !institutionNameById.has(id));
    if (regInstitutionIds.length > 0) {
      const { data: insts } = await supabase
        .from('institutions')
        .select('id, name')
        .in('id', regInstitutionIds);
      for (const inst of (insts ?? []) as any[]) {
        institutionNameById.set(inst.id, inst.name);
      }
    }

    // Resolve department names for owners.
    const departmentIds = Array.from(
      new Set(
        Array.from(ownerById.values())
          .map((o) => o.department_id)
          .filter(Boolean) as string[],
      ),
    );
    const departmentNameById = new Map<string, string>();
    if (departmentIds.length > 0) {
      const { data: depts } = await supabase
        .from('departments')
        .select('id, department_name, display_name')
        .in('id', departmentIds);
      for (const d of (depts ?? []) as any[]) {
        departmentNameById.set(
          d.id,
          d.display_name || d.department_name || '',
        );
      }
    }

    // 9. Build rows in the spec §7 column order.
    const cycleById = new Map<string, any>();
    for (const c of cycles) cycleById.set(c.id, c);

    const rows: NaacEvidenceRow[] = filteredSubs.map((s) => {
      const cycle = cycleById.get(s.event_id);
      const reg = registrationById.get(s.registration_id);
      const owner = reg?.owner_id ? ownerById.get(reg.owner_id) : undefined;

      const institutionName = reg?.institution_id
        ? institutionNameById.get(reg.institution_id) ?? ''
        : cycle?.host_institution_id
          ? institutionNameById.get(cycle.host_institution_id) ?? ''
          : '';
      const departmentName = owner?.department_id
        ? departmentNameById.get(owner.department_id) ?? ''
        : '';

      const featuredToolName = cycle?.config?.featured_tool_id
        ? featuredToolNameById.get(cycle.config.featured_tool_id) ?? ''
        : '';
      const championName = cycle?.config?.host_user_id
        ? hostNameById.get(cycle.config.host_user_id) ?? ''
        : '';

      const description =
        s.description ||
        s.solution_summary ||
        s.problem_statement ||
        '';

      const proofUrls = Array.isArray(s.proof_urls)
        ? (s.proof_urls as string[]).filter(Boolean).join(' | ')
        : '';

      return {
        academic_year: academicYearFor(cycle?.demo_date ?? null),
        cycle_date: safeDate(cycle?.demo_date ?? null),
        institution_name: institutionName,
        department_name: departmentName,
        team_name: reg?.team_name ?? '',
        project_name: s.app_name ?? '',
        description,
        github_url: s.github_url ?? '',
        live_app_url: s.live_app_url ?? '',
        featured_tool: featuredToolName,
        champion_at_time: championName,
        ig_reach: typeof s.active_users_count === 'number' ? s.active_users_count : 0,
        proof_urls: proofUrls,
      };
    });

    // Sort: newest cycle first, then by team name within cycle.
    rows.sort((a, b) => {
      if (a.cycle_date < b.cycle_date) return 1;
      if (a.cycle_date > b.cycle_date) return -1;
      return a.team_name.localeCompare(b.team_name);
    });

    // 10. Build summary.
    const departmentSet = new Set(
      rows.map((r) => r.department_name).filter(Boolean),
    );
    const cycleSet = new Set(
      rows.map((r) => r.cycle_date).filter(Boolean),
    );

    const summary: NaacEvidenceSummary = {
      gold_standard_count: rows.length,
      department_count: departmentSet.size,
      cycle_count: cycleSet.size,
      range_label: rangeLabel(filters),
    };

    return { rows, summary };
  }

  /**
   * Returns the API route URL the browser should navigate to for CSV download.
   * The export route runs `getEvidenceRows` server-side under the caller's
   * auth-scoped supabase client and serves a Content-Disposition: attachment.
   */
  static getCsvDownloadUrl(filters: NaacEvidenceFilters): string {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.institution_id) {
      params.set('institution_id', filters.institution_id);
    }
    const qs = params.toString();
    return qs
      ? `/api/ai-pulse/evidence/naac/export?${qs}`
      : '/api/ai-pulse/evidence/naac/export';
  }
}

// ---------------------------------------------------------------------------
// Read hook — fetches the preview JSON via the GET route so RLS scoping is
// applied server-side (cookie-based session, not client-side anon).
// ---------------------------------------------------------------------------

export function useNaacEvidence(filters: NaacEvidenceFilters) {
  return useQuery<NaacEvidenceResponse, Error>({
    queryKey: ['ai-pulse', 'naac-evidence', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.institution_id) {
        params.set('institution_id', filters.institution_id);
      }
      const url = `/api/ai-pulse/evidence/naac${
        params.toString() ? `?${params.toString()}` : ''
      }`;

      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const body = await res.json();
          message = body?.message || body?.error || message;
        } catch {
          // ignore — fall through to default message
        }
        throw new Error(message);
      }

      return (await res.json()) as NaacEvidenceResponse;
    },
    staleTime: 60_000,
  });
}
