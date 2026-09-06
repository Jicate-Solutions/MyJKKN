/**
 * MBA case studies — server entry.
 *
 * Auth is checked HERE and nothing else is. The permission gate, the no-access
 * panel and every data read live in the client component, mirroring the sibling
 * dashboard and data-gaps routes.
 *
 * A signed-out visitor gets a plain sentence, never a redirect: a silent bounce
 * to another page is indistinguishable from the page being broken, and this
 * codebase has already paid for that once (CLAUDE.md rule 27).
 */

import { createClient } from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { CaseStudiesClient } from './_components/case-studies-client';

export const dynamic = 'force-dynamic';

export default async function CaseStudiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Please sign in to read or write improvement case studies.
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
    <ContentLayout title="Case Studies">
      <CaseStudiesClient
        currentUserId={user.id}
        currentUserName={profile?.full_name || 'You'}
      />
    </ContentLayout>
  );
}
