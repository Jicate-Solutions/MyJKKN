import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { POLICY_KEYS } from '@/lib/policies/keys';

/**
 * Campus Walk scoreboard landing — redirects to the default board configured in
 * platform_policies (key `nav.campus_walk.scoreboard.default_landing`).
 *
 * WHY A REDIRECT AND NOT A HUB. Guardrail G2 forbids the two scoreboards ever
 * appearing side by side — a combined view turns a maintenance tool into a
 * public ranking ("hunters and hunted"). So this level must never RENDER; it
 * only forwards. /campus-walk/scoreboard would otherwise 404, because the three
 * boards are children (fixes / coverage / split) with no parent route.
 *
 * Config-driven per the standing rule that a policy decision is a config row a
 * super_admin edits with zero deploy. The hardcoded fallback is preserved and
 * used both as p_default and post-RPC, so behaviour is identical at deploy and
 * the page still works if the policy row is missing or the RPC errors.
 */
export default async function CampusWalkScoreboardIndex() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc('fn_get_policy_text', {
    p_key: POLICY_KEYS.NAV_CAMPUS_WALK_SCOREBOARD_DEFAULT_LANDING,
    p_default: '/campus-walk/scoreboard/fixes',
    p_scope_id: null,
  });
  redirect(data ?? '/campus-walk/scoreboard/fixes');
}
