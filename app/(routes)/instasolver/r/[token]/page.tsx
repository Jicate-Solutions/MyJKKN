// app/(routes)/instasolver/r/[token]/page.tsx
//
// InstaSolver — the page a QR sticker opens. /instasolver/r/<qr_code_token>
//
// Director rulings (30 Sep – 1 Oct 2026): a QR sticker in every room, room and
// item already filled in, a photo, tap send — about ten seconds. The places and
// items are Resource Management's `resources`; the sticker carries
// resources.qr_code_token (printed from /resource-management/qr-stickers).
//
// Signed-in users only. Every "no" is a card that says why, never a redirect
// (rule #27): not signed in, a code that is not a sticker code, a sticker that
// no longer matches an item, and a lookup that failed are four different facts.
//
// The resource is read with the service-role client AFTER the sign-in check:
// a learner's own session cannot read `resources` under its RLS, and the only
// thing taken from the URL is the token, which is validated before any query.
// What is shown is what is printed on the sticker anyway — the item's name,
// category and place — never the caretaker's identity.

import Link from 'next/link';
import { AlertCircle, SearchX } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  NO_STICKER_LINK,
  REPEAT_BANNER_MIN,
  findRecentResourceReports,
  formatPlace,
  isValidQrToken,
  loadResourceByToken,
  type ScannedResource,
} from '@/lib/instasolver/resource-report';
import { ScanReportClient } from './_components/scan-report-client';

export const dynamic = 'force-dynamic';

const TITLE = 'Report a problem';

function Refusal({
  heading,
  body,
  icon = 'alert',
  reportLink = false,
}: {
  heading: string;
  body: string;
  icon?: 'alert' | 'search';
  reportLink?: boolean;
}) {
  const Icon = icon === 'search' ? SearchX : AlertCircle;
  // reportLink: Director ruling (1 Oct 2026) — a room without a sticker is
  // reported from the normal broken-thing form, where the room is picked.
  return (
    <ContentLayout title={TITLE}>
      <Card className="mt-6">
        <CardContent className="flex items-start gap-3 py-6">
          <Icon className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{heading}</p>
            <p className="text-sm text-muted-foreground">{body}</p>
            {reportLink ? (
              <Link
                href={NO_STICKER_LINK.href}
                className="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-4"
              >
                {NO_STICKER_LINK.label}
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

export default async function InstaSolverScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <Refusal
        heading="You are not signed in"
        body="Sign in to MyJKKN, then scan the sticker again to report a problem here."
      />
    );
  }

  if (!isValidQrToken(token)) {
    return (
      <Refusal
        icon="search"
        heading="This is not an InstaSolver sticker code"
        reportLink
        body="Scan the sticker again. If it keeps happening, report the problem from InstaSolver and type the place."
      />
    );
  }

  const admin = createServiceRoleClient();
  let resource: ScannedResource | null = null;
  try {
    resource = await loadResourceByToken(admin, token);
  } catch {
    return (
      <Refusal
        heading="Could not look up this sticker just now"
        reportLink
        body="Please try again in a moment. If it keeps failing, report the problem from InstaSolver and type the place."
      />
    );
  }
  if (!resource) {
    return (
      <Refusal
        icon="search"
        heading="This sticker is not linked to a room or item any more"
        reportLink
        body="Tell the estate office so they can print a new one. You can still report the problem from InstaSolver and type the place."
      />
    );
  }

  const recent = await findRecentResourceReports(admin, resource.id);

  return (
    <ContentLayout title={TITLE}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'InstaSolver', href: '/instasolver' },
          { label: TITLE },
        ]}
      />
      <ScanReportClient
        token={token}
        item={{
          name: resource.name,
          category: [resource.category_name, resource.subcategory_name].filter(Boolean).join(' · ') || null,
          place: formatPlace(resource) || null,
          college: resource.institution_name,
        }}
        repeat={{
          count: recent.count,
          capped: recent.capped,
          show: recent.count >= REPEAT_BANNER_MIN,
          openTaskId: recent.openTask?.id ?? null,
        }}
      />
    </ContentLayout>
  );
}
