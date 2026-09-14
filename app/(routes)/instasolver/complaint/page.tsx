// app/(routes)/instasolver/complaint/page.tsx
//
// Insta Solver — the complaint door, open to every login (decision I1,
// Director 2026-09-14). Gating pattern follows app/(routes)/campus-walk/page.tsx:
// establish the person, and where they may not proceed, say so on the page.
// Never a silent redirect (rule #27).
//
// There is no role check here on purpose. The only two things that can stop
// somebody are not having a profile and not being attached to a college —
// because without a college there is nowhere to send the complaint. The API
// route re-checks both; this page is the fast version of the same answer.
//
// WHO CAN REACH THIS URL TODAY — checked, not assumed. Until the menu entry
// ships in its own change (PR #3743) this path is not in MENU_PERMISSIONS, and
// an UNMAPPED path is OPEN, not closed: lib/auth/route-matcher.ts:313 returns
// true when it finds no config for a path. So every authenticated staff-flow
// role can open this page right now — which is decision I1's intent anyway, so
// the gap is safe rather than merely unfinished. It is written down here
// because the opposite ("unmapped means super-admin only") is the natural
// assumption and it is wrong.

import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { readComplaintCategories } from '@/lib/instasolver/complaint';
import { ComplaintClient } from './_components/complaint-client';

export const dynamic = 'force-dynamic';

function Refusal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ContentLayout title="Raise a complaint">
      <Card className="mt-6">
        <CardContent className="flex items-start gap-3 py-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{children}</p>
          </div>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

export default async function InstaSolverComplaintPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Refusal title="You are not signed in">
        Sign in to raise a complaint.
      </Refusal>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, institution_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return (
      <Refusal title="Your account has no profile yet">
        You are signed in, but this platform has no profile for your account, so a complaint
        cannot be filed against your name. Contact the IT helpdesk.
      </Refusal>
    );
  }

  if (!profile.institution_id) {
    return (
      <Refusal title="Your account is not linked to a college">
        A complaint needs a college to go to, and your profile does not name one yet. Contact
        the IT helpdesk to have it set.
      </Refusal>
    );
  }

  // Read with the SERVICE-ROLE client, the same way app/api/instasolver/
  // complaint/route.ts reads it. The page and the API have to agree on this
  // list: if the page read it under RLS and the API read it elevated, an RLS
  // policy that hid a category would render a form missing an option the API
  // would happily have accepted — or, worse, an empty form on a college that
  // has categories. The list is not a secret (it is the set of things the
  // college invites complaints about), so reading it elevated costs no
  // confidentiality. Read-only, in a server component.
  const categoryResult = await readComplaintCategories(
    createServiceRoleClient(),
    profile.institution_id
  );

  return (
    <ContentLayout title="Raise a complaint">
      <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Raise a complaint' }]} />
      <div className="mt-4">
        <PageHeader
          title="Raise a complaint"
          description="Tell us what is wrong. You will get a number to follow it with."
        />
      </div>
      <ComplaintClient
        categories={categoryResult.ok ? categoryResult.categories : []}
        anonymousAvailable={categoryResult.ok ? categoryResult.anonymousColumnPresent : false}
        loadFailure={categoryResult.ok ? null : categoryResult.reason}
      />
    </ContentLayout>
  );
}
