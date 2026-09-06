/**
 * Gemba visits — server entry.
 *
 * The Improvement Board holds 42 playbook documents describing how 14
 * departments work, and the backend that turns one of them official — a
 * recorded visit by a named person — has been live and applied for a day with
 * zero rows in it, because there was nowhere to record a visit from. This route
 * is that missing screen.
 *
 * Auth is checked here and nothing else: the permission gate
 * (improvement.ideas.view) and every data read live in the client component,
 * mirroring the sibling dashboard route. A signed-out visitor gets a plain
 * message, never a redirect — a silent bounce is exactly the failure CLAUDE.md
 * rule 27 forbids.
 */

import { createClient } from '@/lib/supabase/server';
import { GembaClient } from './_components/gemba-client';

export const dynamic = 'force-dynamic';

export default async function GembaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Please sign in to record and read gemba visits.
        </p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <GembaClient
      currentUserId={user.id}
      currentUserName={profile?.full_name || 'You'}
    />
  );
}
