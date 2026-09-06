/**
 * LiveAgencyCard — server wrapper that mounts the existing learn AgencyIndexCard
 * on the senior + admin-staff dashboards (AI Agency Score, Part 5 · S2).
 *
 * Reuses app/(routes)/learn/_components/agency-index-card.tsx UNCHANGED (imported,
 * not copied). That card's `learnerId` prop is a PROFILE id, not a learner-table id:
 * pde_agency_index.learner_id and pde_demonstrations.learner_id both REFERENCE
 * profiles(id) — the column is only NAMED learner_id; the physical key is the
 * auth/profile id (auth.users.id = profiles.id). So we hand it the authenticated
 * user's own auth.uid() (= profiles.id). GET /api/pde/agency 403s any learnerId
 * that isn't the caller's, so a staff/admin user can only ever see their OWN score.
 *
 * Empty state is EXPECTED and correct: the card degrades to overall-only, then to
 * its "no agency data yet" empty state, until a separate policy flip enables the
 * AI-Pulse → agency bridge. An absent score is NOT a 0 — do not read one that way.
 */

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { AgencyIndexCard } from '@/app/(routes)/learn/_components/agency-index-card';

export async function LiveAgencyCard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // user.id === profiles.id === pde_agency_index.learner_id (name-only). The card
  // self-fetches /api/pde/agency, which serves only the authenticated user's score.
  return <AgencyIndexCard learnerId={user.id} />;
}
