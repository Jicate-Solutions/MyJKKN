// app/(routes)/whats-new/highlights/page.tsx
//
// The human gate. This is the screen where the week's picked changes get their
// plain-English write-up and are approved — and it is the reason this feature
// is not another "object built, entry point never wired".
//
// THE WALK, end to end, so it can be checked rather than assumed:
//   sidebar → What's New → Write highlights   (lib/sidebarMenuLink.ts, gated on
//                                              whats_new.highlights.manage)
//     → this page
//       → the queue (GET /api/whats-new/highlights?queue=1)
//         → edit + Approve (PUT /api/whats-new/highlights)
//           → the strip on /whats-new, above the plain list.
//
// Selection is automatic and deterministic (lib/changelog/highlights.ts); the
// writing and the approval are a person's. That split is the Director's ruling
// of 2026-09-12: he rejected "AI rewrites everything, nobody checks" because on
// a page people trust to learn the system, a confident wrong claim is worse than
// a terse accurate one.
//
// Gate: whats_new.highlights.manage. A denial renders an explicit refusal that
// says what is missing — never a silent redirect (CLAUDE.md #27).

'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { PermissionError } from '@/components/errors/permission-error';
import { Skeleton } from '@/components/ui/skeleton';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageHeader } from '@/components/page-header';
import { HighlightQueue } from './_components/highlight-queue';

export default function WhatsNewHighlightsPage() {
  const { isLoading, canAccess } = usePermissions();

  if (isLoading) {
    return (
      <ContentLayout title="Write highlights">
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </ContentLayout>
    );
  }

  if (!canAccess('whats_new', 'highlights.manage')) {
    return (
      <ContentLayout title="Write highlights">
        <div className="mx-auto w-full max-w-3xl py-10">
          <PermissionError
            message="Only someone who manages What’s New highlights can open this page."
            requiredPermission="whats_new.highlights.manage"
          />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Write highlights">
      <PageHeader
        title="Write highlights"
        description="The changes picked for this week. Write each one in plain English — what it means for the reader and what they can now do — then approve it. Only approved highlights appear on What's New."
      />
      <HighlightQueue />
    </ContentLayout>
  );
}
