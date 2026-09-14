// app/(routes)/instasolver/page.tsx
//
// InstaSolver — the chooser. The ONE front door for "something is wrong here".
//
// Spec: specs/instasolver-2026-09-14.md.
//   I1  everyone with a login can file — the sidebar row and this page are
//       gated on instasolver.view, granted to every role by migration
//       20261212120000.
//   I2  the name is InstaSolver — the name every college already knows.
//   I3  ONE button whose first screen asks "what kind?". This page IS that
//       screen. It writes nothing; it only hands the filer to the lane that
//       already owns the work.
//
// Three lanes, three owners:
//   something is broken -> /instasolver/broken    (Campus Walk's task engine)
//   I have a complaint  -> /instasolver/complaint (the grievance spine)
//   we need to buy      -> /procurement/requests/new, and ONLY for the roles
//                          that hold procurement.request_create. Purchases are
//                          not an InstaSolver lane (I3) — Procurement already
//                          owns that journey end to end.
//
// The purchase branch is resolved HERE, server-side, and passed down as a
// boolean: the client never sees a permission check it could be tricked into
// re-deciding. When the viewer cannot raise one, the card still renders with an
// explicit next step rather than vanishing or dead-ending (rule #27 — a refusal
// is spoken, never silent).
//
// This is a fast UI-level gate, not the enforcement boundary: /procurement and
// each lane re-check their own keys server-side when the filer arrives.

import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { ChooserClient } from './_components/chooser-client';

export const dynamic = 'force-dynamic';

export default async function InstaSolverPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ContentLayout title="InstaSolver">
        <Card className="mt-6">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">You are not signed in</p>
              <p className="text-sm text-muted-foreground">
                Sign in to raise an issue with InstaSolver.
              </p>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  // Purchase branch. A failed RPC is treated as "cannot raise" — fail closed,
  // and the card then shows the ask-your-HOD line, which is a true statement
  // either way.
  const { data: canRaisePurchase } = await supabase.rpc('user_has_permission', {
    permission_name: 'procurement.request_create'
  });

  return (
    <ContentLayout title="InstaSolver">
      <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'InstaSolver' }]} />
      <div className="mt-4">
        <PageHeader
          title="InstaSolver"
          description="Tell us what's wrong. It goes to the right person."
        />
      </div>
      <ChooserClient canRaisePurchase={canRaisePurchase === true} />
    </ContentLayout>
  );
}
