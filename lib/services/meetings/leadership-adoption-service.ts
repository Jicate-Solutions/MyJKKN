// lib/services/meetings/leadership-adoption-service.ts
//
// W2-B — Leadership Booking-Page Adoption Scoreboard.
//
// Reads ALL principals & HODs across institutions to compute their booking-page
// adoption status. Uses a service-role client because the query spans all
// institutions (RLS would restrict reads to the caller's own institution, which
// would leave every other college invisible in the scoreboard).
//
// D20 GATE (borrowed from public-host-service): a leader's page is "live" iff
//   meeting_host_pages: exists AND is_public AND NOT auto_hidden
//   AND meeting_host_google_connections.status = 'active'
//
// Exclusion list (mirrors the provisioning script filter — must stay in sync):
//   - full_name is empty
//   - full_name matches /\btest\b/i
//   - full_name equals (case-insensitive) 'hod', 'hod jkkn', or 'principal'
//   - institution name matches /testing/i

import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[leadership-adoption]';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export type AdoptionStatus = 'live' | 'page_not_live' | 'no_page';

export interface LeaderStatus {
  id: string;
  name: string;
  role: 'principal' | 'hod';
  status: AdoptionStatus;
  /** Present when a meeting_host_pages row exists. */
  handle?: string;
}

export interface InstitutionRollup {
  institutionId: string;
  institutionName: string;
  totalPrincipals: number;
  totalHods: number;
  live: number;
  pageNotLive: number;
  noPage: number;
  leaders: LeaderStatus[];
}

export interface AdoptionSummary {
  totalLeaders: number;
  live: number;
  pageNotLive: number;
  noPage: number;
  institutions: InstitutionRollup[];
}

// -----------------------------------------------------------------------
// Exclusion helpers
// -----------------------------------------------------------------------

const JUNK_NAMES = new Set(['hod', 'hod jkkn', 'principal']);

function isJunk(name: string | null | undefined, institutionName: string | null | undefined): boolean {
  if (!name || name.trim() === '') return true;
  const lower = name.trim().toLowerCase();
  if (JUNK_NAMES.has(lower)) return true;
  if (/\btest\b/i.test(lower)) return true;
  if (institutionName && /testing/i.test(institutionName)) return true;
  return false;
}

// -----------------------------------------------------------------------
// Main service function
// -----------------------------------------------------------------------

export async function getLeadershipAdoptionData(
  supabase: SupabaseClient,
): Promise<AdoptionSummary> {
  // Cast to untyped — meeting_host_* tables are not in the generated types file.
  const db = supabase as unknown as SupabaseClient;

  // 1. Fetch all principals and HODs with their institution name.
  //    profiles has TWO FKs to institutions; disambiguate with !institution_id.
  const { data: leaders, error: leadersError } = await db
    .from('profiles')
    .select('id, full_name, role, institution_id, institutions!institution_id(id, name)')
    .in('role', ['principal', 'hod'])
    .order('full_name', { ascending: true });

  if (leadersError) {
    console.error(`${LOG_PREFIX} profiles query failed:`, leadersError.message);
    return { totalLeaders: 0, live: 0, pageNotLive: 0, noPage: 0, institutions: [] };
  }

  const allLeaders = (leaders ?? []) as Array<{
    id: string;
    full_name: string | null;
    role: string;
    institution_id: string | null;
    institutions: { id: string; name: string } | null;
  }>;

  // 2. Filter out junk records (test accounts, empty names, testing institutions).
  const filtered = allLeaders.filter((l) => {
    const instName = (l.institutions as { name: string } | null)?.name ?? null;
    return !isJunk(l.full_name, instName);
  });

  if (!filtered.length) {
    return { totalLeaders: 0, live: 0, pageNotLive: 0, noPage: 0, institutions: [] };
  }

  const leaderIds = filtered.map((l) => l.id);

  // 3. Fetch meeting_host_pages for these leaders (left-join: some won't have a row).
  const { data: pages, error: pagesError } = await db
    .from('meeting_host_pages')
    .select('host_profile_id, handle, is_public, auto_hidden')
    .in('host_profile_id', leaderIds);

  if (pagesError) {
    console.error(`${LOG_PREFIX} meeting_host_pages query failed:`, pagesError.message);
  }

  const pageByProfileId = new Map(
    ((pages ?? []) as Array<{
      host_profile_id: string;
      handle: string;
      is_public: boolean;
      auto_hidden: boolean;
    }>).map((p) => [p.host_profile_id, p]),
  );

  // 4. Fetch Google connection statuses for those with a page row.
  const profilesWithPage = (pages ?? []).map((p) => (p as any).host_profile_id as string);
  const { data: connections, error: connError } = profilesWithPage.length
    ? await db
        .from('meeting_host_google_connections')
        .select('host_profile_id, status')
        .in('host_profile_id', profilesWithPage)
    : { data: [], error: null };

  if (connError) {
    console.error(`${LOG_PREFIX} google_connections query failed:`, connError.message);
  }

  const activeConnections = new Set(
    ((connections ?? []) as Array<{ host_profile_id: string; status: string }>)
      .filter((c) => c.status === 'active')
      .map((c) => c.host_profile_id),
  );

  // 5. Compute per-leader status.
  function computeStatus(profileId: string): AdoptionStatus {
    const page = pageByProfileId.get(profileId);
    if (!page) return 'no_page';
    const isLive = page.is_public && !page.auto_hidden && activeConnections.has(profileId);
    return isLive ? 'live' : 'page_not_live';
  }

  // 6. Group by institution.
  const byInstitution = new Map<string, { name: string; leaders: typeof filtered }>();

  for (const leader of filtered) {
    const instId = leader.institution_id ?? 'unknown';
    const instName = (leader.institutions as { name: string } | null)?.name ?? 'Unknown Institution';
    if (!byInstitution.has(instId)) {
      byInstitution.set(instId, { name: instName, leaders: [] });
    }
    byInstitution.get(instId)!.leaders.push(leader);
  }

  // 7. Build rollups, sorted by institution name.
  const institutions: InstitutionRollup[] = Array.from(byInstitution.entries())
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([instId, { name, leaders: grp }]) => {
      const leaderStatuses: LeaderStatus[] = grp.map((l) => {
        const status = computeStatus(l.id);
        const page = pageByProfileId.get(l.id);
        return {
          id: l.id,
          name: l.full_name?.trim() ?? 'Unknown',
          role: l.role as 'principal' | 'hod',
          status,
          handle: page?.handle,
        };
      });

      const rollup = leaderStatuses.reduce(
        (acc, l) => {
          if (l.role === 'principal') acc.totalPrincipals++;
          else acc.totalHods++;
          if (l.status === 'live') acc.live++;
          else if (l.status === 'page_not_live') acc.pageNotLive++;
          else acc.noPage++;
          return acc;
        },
        { totalPrincipals: 0, totalHods: 0, live: 0, pageNotLive: 0, noPage: 0 },
      );

      return {
        institutionId: instId,
        institutionName: name,
        ...rollup,
        leaders: leaderStatuses,
      };
    });

  // 8. Overall totals.
  const totals = institutions.reduce(
    (acc, inst) => {
      acc.totalLeaders += inst.totalPrincipals + inst.totalHods;
      acc.live += inst.live;
      acc.pageNotLive += inst.pageNotLive;
      acc.noPage += inst.noPage;
      return acc;
    },
    { totalLeaders: 0, live: 0, pageNotLive: 0, noPage: 0 },
  );

  return { ...totals, institutions };
}
