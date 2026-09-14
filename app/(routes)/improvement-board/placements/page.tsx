/**
 * Placement observations — server entry.
 *
 * 20260816060000 added the record, the consent gate and the promotion path,
 * and nothing could write to any of it. That is the same condition the gemba
 * route was built to end — a backend live with zero rows in it because there
 * was nowhere to record from — so this route is deliberately its twin.
 *
 * Auth and institution are resolved here; the permission gate and every data
 * read live in the client component, mirroring the sibling gemba route.
 *
 * A signed-out visitor, or one with no institution on their profile, gets a
 * plain message saying so. Never a redirect: a silent bounce is exactly the
 * failure CLAUDE.md rule 27 forbids, and "I click it and land back on the
 * dashboard" is undiagnosable from the outside.
 */

import { createClient } from '@/lib/supabase/server';
import { PlacementsClient } from './_components/placements-client';

export const dynamic = 'force-dynamic';

export default async function PlacementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Please sign in to record and read placement observations.
        </p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, institution_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.institution_id) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <p className="mb-2 font-medium">No institution on your profile</p>
        <p className="text-muted-foreground text-sm">
          A placement observation is recorded against an institution, and yours
          is not set. Ask an administrator to add it to your profile — nothing
          on this page can work until they do.
        </p>
      </div>
    );
  }

  return (
    <PlacementsClient
      currentUserId={user.id}
      currentUserName={profile.full_name || 'You'}
      institutionId={profile.institution_id}
    />
  );
}
