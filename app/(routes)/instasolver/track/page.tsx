// app/(routes)/instasolver/track/page.tsx
//
// Insta Solver — the hub of the tracking lane: where somebody who has a private
// code but not the link types it in (decision I7, Director 2026-09-14).
//
// WHY THIS FILE HAS TO EXIST. /instasolver/track/[token]/page.tsx makes
// /instasolver/track/<code> a real URL, which makes /instasolver/track a real
// URL a person will reach — by deleting the last segment, by a stale bookmark,
// or by being sent the path without the code. Next.js App Router 404s a
// directory with routable children and no page.tsx of its own; that is the
// hub-page-404 class the "Hub Page Reachability" gate exists to stop, and this
// PR was failing it.
//
// It is a FORM, not a redirect. A redirect from here would have nowhere useful
// to go — the code is the whole input — so the page asks for it explicitly.
//
// Behind the proxy.ts login gate, like the rest of /instasolver/*: proxy.ts
// (Next 16's middleware) lists no public path for it and a live probe answers
// 307 to /auth/login.

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { TrackForm } from './_components/track-form';

export const dynamic = 'force-dynamic';

export default function TrackLandingPage() {
  return (
    <ContentLayout title="Check progress">
      <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Check progress' }]} />
      <div className="mt-4">
        <PageHeader
          title="Check progress"
          description="Have a tracking code? Type it in to see where your complaint has got to."
        />
      </div>
      <TrackForm />
    </ContentLayout>
  );
}
