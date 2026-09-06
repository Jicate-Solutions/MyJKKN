// lib/services/school-of-influence/programme-resolver.ts
//
// "Which School of Influence programme is this person here to review?" —
// answered by the platform instead of demanded from the person.
//
// WHY THIS EXISTS
//   /startup-studio/school-of-influence/admin/applications opened without
//   `?event=` used to say: "add ?event= and the programme's event id to the
//   address." The people that sentence is written for are coordinators reading a
//   notification on a phone; none of them has a uuid to hand, and the platform's
//   own coordinator-appointment notification linked to exactly that page without
//   the parameter (BUG-005799 / BUG-005800). The instruction could not be
//   followed by anybody it was shown to.
//
// SERVER-ONLY. The candidate sweep uses the service-role client because the
// cohort spine's SELECT policies require cohort.view, which an appointed
// coordinator does not hold — under their own RLS the sweep returns zero rows
// and the screen would report "no programme" to the person running one. Same
// reasoning, and the same shape, as loadBatches() in apply-service.ts.
//
// THE SERVICE ROLE ENUMERATES; IT NEVER DECIDES.
//   Step 1 collects candidate programme events with the service role — names and
//   ids, nothing about anybody.
//   Step 2 asks fn_soi_review_context() once per candidate through the CALLER's
//   own session. That SECURITY DEFINER function is the same authority the review
//   screen and every accept/reject path already obey, and it answers false for a
//   caller with no standing. Only programmes it says yes to are ever returned,
//   so this reveals nothing the caller could not already open.
//
// Fails CLOSED: any error yields an empty list, and the screen then says so in
// words rather than guessing at a programme.

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { SOI_COHORT_KIND, soiDisplayName } from '@/lib/services/school-of-influence/constants';
import { logger } from '@/lib/utils/enhanced-logger';

/** A School of Influence programme this caller may work the queue for. */
export interface SoiReviewableProgramme {
  /** events.id — the `?event=` the review screen runs on. */
  eventId: string;
  /** The programme's name, for a human to choose by. Never a raw id. */
  name: string;
}

/**
 * How many candidate programmes are probed. One live today; the cap exists so a
 * misconfigured batch table can never turn one page render into hundreds of
 * round trips.
 */
const MAX_CANDIDATE_PROGRAMMES = 25;

/** A uuid, or null. Batch config is free-form JSON and may hold anything. */
function eventIdOf(config: unknown): string | null {
  const raw = (config as { source_event_id?: unknown } | null)?.source_event_id;
  const id = typeof raw === 'string' ? raw.trim() : '';
  return id.length > 0 ? id : null;
}

/**
 * Every School of Influence programme this caller may review, newest name order
 * left as the database returns it. Empty when they may review none.
 */
export async function listReviewableSoiProgrammes(): Promise<
  SoiReviewableProgramme[]
> {
  let candidateIds: string[] = [];
  try {
    const svc = createServiceRoleClient();
    const { data, error } = await (svc as any)
      .from('cohorts')
      .select('config')
      .eq('kind', SOI_COHORT_KIND)
      .is('archived_at', null);
    if (error) throw error;
    const seen = new Set<string>();
    for (const row of (data ?? []) as Array<{ config?: unknown }>) {
      const id = eventIdOf(row.config);
      if (id && !seen.has(id)) seen.add(id);
    }
    candidateIds = Array.from(seen).slice(0, MAX_CANDIDATE_PROGRAMMES);
  } catch (error) {
    logger.error(
      'school-of-influence',
      'Could not list School of Influencer programmes',
      error
    );
    return [];
  }

  if (candidateIds.length === 0) return [];

  let authed: Awaited<ReturnType<typeof createClient>>;
  try {
    authed = await createClient();
  } catch (error) {
    logger.error('school-of-influence', 'No caller session to resolve against', error);
    return [];
  }

  const verdicts = await Promise.all(
    candidateIds.map(async (eventId) => {
      try {
        const { data, error } = await (authed as any).rpc('fn_soi_review_context', {
          p_event_id: eventId,
        });
        if (error) return null;
        const row = (data ?? [])[0] as
          | { can_review?: boolean; event_name?: string | null }
          | undefined;
        if (row?.can_review !== true) return null;
        return {
          eventId,
          name: soiDisplayName(row.event_name),
        } satisfies SoiReviewableProgramme;
      } catch {
        return null;
      }
    })
  );

  return verdicts.filter((v): v is SoiReviewableProgramme => v !== null);
}
