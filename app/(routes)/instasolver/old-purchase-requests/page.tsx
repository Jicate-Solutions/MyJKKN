// app/(routes)/instasolver/old-purchase-requests/page.tsx
//
// Old InstaSolver purchase requests — the Director's approve / reject screen.
//
// Ruling, 30 Sep 2026: the old site (instasolver.jkkn.ac.in) left 168 purchase
// requests at 'Pending MD Approval'. They get ONE screen where the Director taps
// approve or reject on each; an approved one becomes a Procurement purchase
// request. The rows are loaded into legacy_instasolver_requirements by
// scripts/instasolver/import-old-site.ts.
//
// SUPER ADMIN ONLY. Anyone else gets an explicit refusal card (rule #27) — no
// silent redirect. The requester's name is shown here and nowhere else.

import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { PENDING_MD_STATUS } from '@/lib/instasolver/old-purchase-requests';
import {
  OldPurchaseRequestsClient,
  type OldRequestView,
} from './_components/old-purchase-requests-client';

export const dynamic = 'force-dynamic';

const TITLE = 'Old InstaSolver purchase requests';

function Refusal({ heading, text }: { heading: string; text: string }) {
  return (
    <ContentLayout title={TITLE}>
      <Card className="mt-6">
        <CardContent className="flex items-start gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{heading}</p>
            <p className="text-sm text-muted-foreground">{text}</p>
          </div>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

export default async function OldPurchaseRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <Refusal heading="You are not signed in" text="Sign in to see this page." />;
  }

  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (meError) {
    return <Refusal heading="Could not check your access" text="Please refresh the page in a moment." />;
  }
  if (me?.is_super_admin !== true) {
    return (
      <Refusal
        heading="You don't have access to this page"
        text="Only the Director (super admin) decides the old InstaSolver purchase requests. Contact the Director's office if you need one looked at."
      />
    );
  }

  // Read with the Director's own session — the table's read rule lets a super
  // admin see every row. Oldest first.
  const { data, error } = await supabase
    .from('legacy_instasolver_requirements')
    .select(
      `legacy_id, details, clean_category, clean_site, clean_area, legacy_location, priority,
       photo_url, requested_at, requested_at_is_bulk_load, reporter_name, reporter_profile_id, decision,
       institution:institutions(name),
       reporter:profiles!reporter_profile_id(full_name)`
    )
    .eq('legacy_status', PENDING_MD_STATUS)
    .or('decision.is.null,decision.eq.approving')
    .order('requested_at', { ascending: true, nullsFirst: true })
    .order('legacy_id', { ascending: true });

  if (error) {
    return (
      <Refusal
        heading="The old requests could not be loaded"
        text="If this keeps happening, the old-site history may not have been imported yet."
      />
    );
  }

  // legacy_* tables are not in the generated Database type yet.
  const rows: OldRequestView[] = (data ?? []).map((r: any) => ({
    legacyId: r.legacy_id as number,
    details: (r.details as string | null) ?? null,
    category: (r.clean_category as string | null) ?? null,
    place:
      [r.clean_site, r.clean_area].filter((p: string | null) => p && p !== 'Unspecified').join(' — ') ||
      ((r.legacy_location as string | null) ?? null),
    priority: (r.priority as string | null) ?? null,
    photoUrl: (r.photo_url as string | null) ?? null,
    requestedAt: (r.requested_at as string | null) ?? null,
    bulkLoaded: Boolean(r.requested_at_is_bulk_load),
    college: (Array.isArray(r.institution) ? r.institution[0]?.name : r.institution?.name) ?? null,
    askedBy:
      (Array.isArray(r.reporter) ? r.reporter[0]?.full_name : r.reporter?.full_name) ??
      (r.reporter_name as string | null) ??
      null,
    requesterMatched: Boolean(r.reporter_profile_id),
    inProgress: r.decision === 'approving',
  }));

  return (
    <ContentLayout title={TITLE}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'InstaSolver', href: '/instasolver' },
          { label: 'Old purchase requests' },
        ]}
      />
      <div className="mt-4">
        <PageHeader
          title={TITLE}
          description="Requests the old InstaSolver site left waiting for your approval. Approve sends one to Procurement; reject closes it and tells the person who asked."
        />
      </div>
      <OldPurchaseRequestsClient initialRows={rows} />
    </ContentLayout>
  );
}
