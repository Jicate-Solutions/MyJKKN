// app/(routes)/ai-pulse/dept/page.tsx
// ============================================================================
// AI Pulse → Department Heatmap (Pulse-to-Practice SOP §4 — HOD oversight).
//
// Per-department weekly compliance grid across recent AI Pulse cycles:
//   - engagement % (4-AND gate over ai_pulse_live_attendance signals)
//   - Domain-Sync submitted yes/no (event_submissions per dept per cycle)
//   - IG publication present yes/no (proof_urls containing instagram.com)
// Rows are colored by the consequence_tier_thresholds policy (read at
// runtime from ai_pulse_policies — never hardcoded).
//
// Permission gate (page-level, explicit 403 — never a silent redirect):
//   - super_admin (always allowed)
//   - aiPulse:dept.heatmap (seeded to hod / principal roles, migration 20260611)
// "Intervene" buttons additionally require aiPulse:dept.intervene.
//
// Pattern reference: app/(routes)/ai-pulse/evidence/naac/page.tsx (gate shape).
// ============================================================================

'use client';

import Link from 'next/link';
import { ArrowLeft, Grid3X3, Info, ShieldAlert } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { usePermissions } from '@/hooks/use-permissions';

import { DeptHeatmapGrid } from './_components/dept-heatmap-grid';

const PERMISSION_KEY = 'aiPulse:dept.heatmap';

export default function DeptHeatmapPage() {
  const { can, isSuperAdmin, isLoading } = usePermissions();

  const allowed = isSuperAdmin || can(PERMISSION_KEY);

  return (
    <ContentLayout title="Department Heatmap — AI Pulse">
      <div className="space-y-6">
        {/* Header */}
        <Card className="border-2 border-emerald-200">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Grid3X3 className="h-7 w-7 text-emerald-600" />
                  Department Heatmap
                  <Badge variant="outline" className="ml-2 font-mono text-[10px]">
                    SOP §4 Governance
                  </Badge>
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  Weekly AI Pulse compliance per department: live-session
                  engagement, Domain-Sync submission, and Instagram
                  publication. Missed weeks accumulate toward a nudge, an HOD
                  chat, and finally an academic flag — thresholds come from
                  the AI Pulse policy table and can be tuned by a super admin.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href="/ai-pulse/guide">
                  <Button variant="outline" size="sm">
                    <Info className="mr-2 h-4 w-4" />
                    How this works
                  </Button>
                </Link>
                <Link href="/ai-pulse">
                  <Button variant="outline" size="sm">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    AI Pulse Home
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Permission gate — explicit deny, never a silent redirect */}
        {isLoading ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Checking access…
            </CardContent>
          </Card>
        ) : !allowed ? (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>You don&apos;t have access</AlertTitle>
            <AlertDescription>
              This page is restricted to HODs, principals, super admins, and
              users granted the <code>{PERMISSION_KEY}</code> permission. If
              you believe you should see your department&apos;s AI Pulse
              compliance, contact your principal or a super admin to enable
              the permission key in Role Management.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>How a week counts as missed</AlertTitle>
              <AlertDescription className="text-xs">
                A department misses a week when it has no engaged learner in
                the live session, no Domain-Sync submission, and no Instagram
                publication for that cycle. Engagement uses the same 4-part
                gate as the live session page (joined on time, 3+ polls,
                stayed to the end, quiz passed).
              </AlertDescription>
            </Alert>

            <DeptHeatmapGrid />
          </>
        )}
      </div>
    </ContentLayout>
  );
}
