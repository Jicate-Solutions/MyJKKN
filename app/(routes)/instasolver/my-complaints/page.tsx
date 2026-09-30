// app/(routes)/instasolver/my-complaints/page.tsx
//
// Insta Solver — "My complaints" (Director ruling, 30 Sep 2026): the signed-in
// person's own complaints, newest first, each with who is handling it, when an
// answer is due, and what was done.
//
// Read with the SERVICE-ROLE client after the session is established, because
// the handler's name comes from profiles, which RLS may hide from a learner
// (the ticket itself is readable: its SELECT policy covers the filer). The owner
// filter (raised_by_id = this user, is_anonymous = false) lives in
// lib/grievance/my-complaints.ts and is re-checked per row there.
//
// Refusals render a card on this page — never a redirect (rule #27).

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { readMyComplaints } from '@/lib/grievance/my-complaints';
import { MyComplaintsClient } from './_components/my-complaints-client';

export const dynamic = 'force-dynamic';

/** Reached from the complaint form and the tracking page, and from the menu. */
export const navMeta = {
  invokedFrom: '/instasolver/complaint',
} as const;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="My complaints">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Insta Solver', href: '/instasolver' },
          { label: 'My complaints' },
        ]}
      />
      <div className="mt-4">
        <PageHeader
          title="My complaints"
          description="Every complaint you raised with your name on it, and where each one has got to."
        />
      </div>
      {children}
    </ContentLayout>
  );
}

function Refusal({ title, detail }: { title: string; detail: React.ReactNode }) {
  return (
    <Card className="mt-4">
      <CardContent className="flex items-start gap-3 py-6">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function MyComplaintsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <Refusal title="You are not signed in" detail="Sign in to see your complaints." />
      </Shell>
    );
  }

  const result = await readMyComplaints(createServiceRoleClient(), user.id);

  if (!result.ok) {
    console.error('[instasolver/my-complaints] read failed:', result.reason);
    return (
      <Shell>
        <Refusal
          title="We couldn't load your complaints right now"
          detail="Nothing has happened to them. Try again in a minute."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <MyComplaintsClient complaints={result.complaints} />
      <p className="mt-6 text-sm text-muted-foreground">
        Filed a complaint without your name? It is not listed here. Follow it with your private
        code on{' '}
        <Link href="/instasolver/track" className="font-medium text-primary underline-offset-4 hover:underline">
          Check progress
        </Link>
        .
      </p>
    </Shell>
  );
}
