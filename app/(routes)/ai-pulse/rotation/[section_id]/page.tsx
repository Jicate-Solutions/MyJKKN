// app/(routes)/ai-pulse/rotation/[section_id]/page.tsx
// Wave B.3 — Class Incharge Section Rotation page (DRAFT — gated on PR #644 + #716 + #728).
//
// Permission contract:
//   - Page-level: super_admin OR aiPulse:attendance.mark
//   - Section-level: caller must be the active class_incharge for params.section_id
//     (verified server-side inside RotationService.assertSectionAccess)
//
// The page is a thin shell that:
//   1. unwraps the dynamic [section_id] param
//   2. checks permission state from usePermissions()
//   3. runs the section-incharge guard via RotationService
//   4. renders SectionRoster (which owns data fetch + mutation)

'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { RotationService } from '@/lib/services/ai-pulse/rotation-service';
import { SectionRoster } from './_components/section-roster';

interface RotationPageProps {
  params: Promise<{ section_id: string }>;
}

export default function RotationPage({ params }: RotationPageProps) {
  const { section_id } = use(params);

  const { isLoading, can, isSuperAdmin } = usePermissions([], {
    waitForLoad: true,
  });

  // Page-level permission gate.
  const canMark = isSuperAdmin || can('aiPulse:attendance.mark');

  // Section-level guard — must be the active class_incharge for this section.
  // We resolve this client-side via the service (which calls auth.getUser +
  // class_incharges lookup). Service short-circuits true for super_admin.
  const [accessCheck, setAccessCheck] = useState<{
    loading: boolean;
    ok: boolean;
    reason?: string;
  }>({ loading: true, ok: false });

  useEffect(() => {
    let alive = true;
    if (isLoading) return;

    // If the user can't mark at all, skip the section check — the roster
    // itself will render the read-only / denied state.
    if (!canMark) {
      setAccessCheck({ loading: false, ok: false, reason: 'Missing permission: aiPulse:attendance.mark' });
      return;
    }

    setAccessCheck({ loading: true, ok: false });
    RotationService.assertSectionAccess(section_id, isSuperAdmin)
      .then((result) => {
        if (!alive) return;
        setAccessCheck({
          loading: false,
          ok: result.ok,
          reason: result.reason,
        });
      })
      .catch((err) => {
        if (!alive) return;
        setAccessCheck({
          loading: false,
          ok: false,
          reason: err instanceof Error ? err.message : 'Access check failed.',
        });
      });

    return () => {
      alive = false;
    };
  }, [section_id, isLoading, canMark, isSuperAdmin]);

  if (isLoading || accessCheck.loading) {
    return (
      <ContentLayout title="Section Rotation">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  if (!canMark) {
    return (
      <ContentLayout title="Section Rotation">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Permission required</AlertTitle>
          <AlertDescription>
            You need the <code>aiPulse:attendance.mark</code> permission to use
            this page.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="AI Pulse · Section Rotation">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/ai-pulse">AI Pulse</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Section Rotation</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        <header>
          <h1 className="text-2xl font-bold">Section Rotation</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Mark live-session attendance for the teams in your section.
          </p>
        </header>

        <SectionRoster
          sectionId={section_id}
          canMark={canMark}
          hasSectionAccess={accessCheck.ok}
          accessDenialReason={accessCheck.reason}
        />
      </div>
    </ContentLayout>
  );
}
