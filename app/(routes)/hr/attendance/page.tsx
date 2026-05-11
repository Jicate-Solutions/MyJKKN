// ============================================================================
// HR — Attendance (hub page)
// Created: 2026-05-11.
//
// Why this page exists:
//   The HR nav-config (PR #857) registered `/hr/attendance` as a top-level
//   section with children Regularize + Regularize Approvals. The two children
//   each have their own page.tsx, but the parent route had no page → 404 for
//   any authenticated user clicking "Attendance" in the sidebar. This page
//   delivers a small audience-aware hub so the nav promise resolves.
//
// What's here:
//   Two action cards:
//   - "Regularize Attendance" → /hr/attendance/regularize  (employee-facing)
//   - "Regularize Approvals"  → /hr/attendance/regularize/approvals  (HR-facing)
//
// Audience gating:
//   Both cards render for any authenticated user; the destination pages
//   already enforce their own auth/role gates (Regularize needs a linked
//   hr_employees row; Approvals needs HR officer / super_admin). Keeping
//   the hub permissive avoids re-encoding gates in two places.
// ============================================================================

import Link from 'next/link';
import { ArrowRight, ClipboardCheck, ShieldCheck } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function HRAttendancePage() {
  return (
    <ContentLayout title="Attendance">
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Self-service attendance corrections and the HR review queue. Pick a
            flow below.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <ActionCard
            href="/hr/attendance/regularize"
            icon={ClipboardCheck}
            title="Regularize Attendance"
            description="File a correction for a missed punch, device failure, or off-site work. HR will review your request."
            audience="For employees"
          />
          <ActionCard
            href="/hr/attendance/regularize/approvals"
            icon={ShieldCheck}
            title="Regularize Approvals"
            description="Review queue for HR officers. Approve, reject, or request more info on pending regularization requests."
            audience="For HR officers"
          />
        </div>
      </div>
    </ContentLayout>
  );
}

function ActionCard({
  href,
  icon: Icon,
  title,
  description,
  audience,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  audience: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="transition-colors hover:border-primary hover:bg-muted/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">{description}</p>
          <p className="mt-2 text-xs">
            <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
              {audience}
            </span>
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
