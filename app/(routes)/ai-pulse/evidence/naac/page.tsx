// app/(routes)/ai-pulse/evidence/naac/page.tsx
// ============================================================================
// AI Pulse → NAAC Evidence Export (Wave C.1, spec §7).
//
// IQAC-facing page that previews Gold Standard AI Pulse publications and
// exports them as NAAC Criterion 3.3.1 (Research / Innovation Outputs) CSV.
//
// Permission gate (page-level):
//   - super_admin (always allowed)
//   - aiPulse:naac.evidence_export permission key (gated by PR #716)
//   - IQAC role (role_key contains 'iqac' — fail-soft until role-key is locked)
//
// RLS on event_submissions / event_registrations / quality_evidence_mappings
// further scopes the API responses, so a page-bypass attempt cannot exfiltrate
// cross-institution data.
// ============================================================================

'use client';

import Link from 'next/link';
import { ShieldAlert, ShieldCheck, ArrowLeft, Info } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { usePermissions } from '@/hooks/use-permissions';

import { NaacExportForm } from './_components/naac-export-form';

const PERMISSION_KEY = 'aiPulse:naac.evidence_export';

export default function NaacEvidenceExportPage() {
  const { can, isSuperAdmin, userRoles, isLoading } = usePermissions();

  const hasIqacRole = userRoles.some((r) =>
    (r.role_key ?? '').toLowerCase().includes('iqac'),
  );
  const allowed = isSuperAdmin || can(PERMISSION_KEY) || hasIqacRole;

  return (
    <ContentLayout title="NAAC Evidence Export — AI Pulse">
      <div className="space-y-6">
        {/* Header */}
        <Card className="border-2 border-indigo-200">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <ShieldCheck className="h-7 w-7 text-indigo-600" />
                  NAAC Evidence Export
                  <Badge variant="outline" className="ml-2 font-mono text-[10px]">
                    Criterion 3.3.1
                  </Badge>
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  Export Gold Standard publications from AI Pulse cycles as
                  NAAC Criterion 3.3.1 (Research / Innovation Outputs) evidence
                  rows. CSV columns match the AQAR / SSR workbook format —
                  paste-ready for IQAC submission.
                </p>
              </div>
              <Link href="/accreditation/naac">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  NAAC Dashboard
                </Button>
              </Link>
            </div>
          </CardHeader>
        </Card>

        {/* Permission gate */}
        {isLoading ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Checking access…
            </CardContent>
          </Card>
        ) : !allowed ? (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Access denied</AlertTitle>
            <AlertDescription>
              This page is restricted to IQAC coordinators, super admins, and
              users granted the <code>{PERMISSION_KEY}</code> permission. If
              you need access for AQAR / SSR preparation, ask your IQAC chair
              or super admin to enable the permission key in Role Management.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Source-of-truth note */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Source of truth</AlertTitle>
              <AlertDescription className="text-xs">
                Rows are read live from <code>event_submissions</code> joined
                to AI Pulse cycles (<code>startup_events</code> with{' '}
                <code>config-&gt;&gt;'kind' = 'ai_pulse'</code>). Gold Standard
                = <code>tier_level &gt;= 4</code>. RLS scopes results to
                institutions you can access. Featured tool + champion are
                resolved at export time from the cycle config.
              </AlertDescription>
            </Alert>

            <NaacExportForm />
          </>
        )}
      </div>
    </ContentLayout>
  );
}
