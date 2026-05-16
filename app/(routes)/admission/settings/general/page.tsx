'use client';

// ============================================================================
// admission/settings/general/page.tsx
// ----------------------------------------------------------------------------
// Plan 6 / Task 4 — Admin settings page for per-institution flags. Hosts:
//   1. Institution selector (top)
//   2. <FeatureFlagCard> — use_fee_structures toggle with soft-warn
//   3. <RequiredDocsEditor> — chip-list of doc_types for status='account'
//
// House-style shell (matches assignment-rules/page.tsx):
//   AdmissionErrorBoundary > PermissionGuard > ContentLayout > Breadcrumb +
//   per-institution body.
// ----------------------------------------------------------------------------
// Spec §12.1  · Plan: 2026-05-05-admission-fees-plan-06 Task 4
// ============================================================================

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

import { FeatureFlagCard } from './_components/feature-flag-card';
import { RequiredDocsEditor } from './_components/required-docs-editor';

function GeneralSettingsPageContent() {
  const { institutions, loading: institutionsLoading } =
    useInstitutionsWithAccess({ isActive: true });

  const [pickedInstitutionId, setPickedInstitutionId] = useState<string>('');

  // Auto-pick first institution once list loads
  useEffect(() => {
    if (!pickedInstitutionId && institutions.length > 0) {
      setPickedInstitutionId(institutions[0].id);
    }
  }, [institutions, pickedInstitutionId]);

  return (
    <PermissionGuard module="admission.settings" action="view">
      <ContentLayout title="General Settings">
        <div className="p-4 sm:p-6 space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">
                  Admission
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/settings">
                  Settings
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>General</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className="text-xl font-bold">General Settings</h1>
            <p className="text-xs text-muted-foreground">
              Per-institution admission settings: feature flags and the
              required-documents checklist that gates the account transition.
            </p>
          </div>

          {/* Institution selector */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[240px] space-y-1">
                  <p className="flex items-center gap-1 text-xs font-medium">
                    <Building2 className="h-3 w-3" /> Institution
                  </p>
                  <Select
                    value={pickedInstitutionId}
                    onValueChange={setPickedInstitutionId}
                    disabled={institutionsLoading}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          institutionsLoading
                            ? 'Loading…'
                            : 'Select institution'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {institutions.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Body — only render when an institution is picked */}
          {pickedInstitutionId ? (
            <div className="space-y-4">
              <FeatureFlagCard institutionId={pickedInstitutionId} />
              <RequiredDocsEditor institutionId={pickedInstitutionId} />
            </div>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Select an institution above to manage settings.
              </CardContent>
            </Card>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function GeneralSettingsPage() {
  return (
    <AdmissionErrorBoundary>
      <GeneralSettingsPageContent />
    </AdmissionErrorBoundary>
  );
}
