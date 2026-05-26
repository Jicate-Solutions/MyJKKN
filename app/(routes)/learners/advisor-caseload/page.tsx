'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { useAuth } from '@/hooks/use-auth';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useSections } from '@/hooks/organization/use-sections';
import {
  useRiskAssessments,
  useRiskSummary,
} from '@/hooks/learners/use-learner-risk';
import type { RiskTier, LearnerRiskWithProfile } from '@/services/learner-risk-service';

import { RiskSummaryBar } from './_components/risk-summary-bar';
import { RiskFilters } from './_components/risk-filters';
import { RiskCard } from './_components/risk-card';

// ── Tier grouping order ─────────────────────────────────
const TIER_ORDER: RiskTier[] = [
  'critical',
  'high',
  'moderate',
  'low',
  'healthy',
];

const TIER_LABELS: Record<RiskTier, string> = {
  critical: 'Critical Risk',
  high: 'High Risk',
  moderate: 'Moderate Risk',
  low: 'Low Risk',
  healthy: 'Doing Well',
};

export default function AdvisorCaseloadPage() {
  const { profile, isLoading: authLoading } = useAuth();

  // ── Role-based scoping ──────────────────────────────
  // Director / super_admin: sees all, can filter by department
  // HOD: scoped to their department, can filter by section
  // Faculty / Counselor: scoped to their department (no section_id on profile)
  const isSuperAdmin = profile?.is_super_admin;
  const isDirector = profile?.role === 'principal' || isSuperAdmin;
  const isHod = profile?.role === 'hod';

  const institutionId = profile?.institution_id ?? '';

  // If HOD or faculty, lock to their department
  const lockedDepartmentId =
    !isDirector && profile?.department_id ? profile.department_id : undefined;

  // ── Filter state ────────────────────────────────────
  const [selectedDepartment, setSelectedDepartment] = useState<
    string | undefined
  >(undefined);
  const [selectedSection, setSelectedSection] = useState<string | undefined>(
    undefined
  );
  const [selectedTier, setSelectedTier] = useState<RiskTier | 'all'>('all');

  // Effective department: locked or user-selected
  const effectiveDepartment = lockedDepartmentId ?? selectedDepartment;

  // ── Fetch departments (for Director filter) ─────────
  const { data: deptData } = useDepartments(
    { institution_id: institutionId, limit: 200 },
  );
  const departments = useMemo(
    () =>
      (deptData?.data ?? []).map((d) => ({
        id: d.id,
        name: d.display_name || d.department_name,
      })),
    [deptData]
  );

  // ── Fetch sections (scoped to effectiveDepartment) ──
  const { data: sectionData } = useSections(
    {
      institution_id: institutionId,
      department_id: effectiveDepartment,
      limit: 200,
    },
    { enabled: !!institutionId }
  );
  const sections = useMemo(
    () =>
      (sectionData?.data ?? []).map((s) => ({
        id: s.id,
        name: s.section_name,
      })),
    [sectionData]
  );

  // ── Risk summary ───────────────────────────────────
  const {
    data: summary,
    isLoading: summaryLoading,
  } = useRiskSummary(
    institutionId,
    effectiveDepartment,
    selectedSection,
    !!institutionId
  );

  // ── Risk assessments ───────────────────────────────
  const tierFilter: RiskTier[] | undefined =
    selectedTier === 'all' ? undefined : [selectedTier];

  const {
    data: assessmentsData,
    isLoading: assessmentsLoading,
    error: assessmentsError,
  } = useRiskAssessments({
    institution_id: institutionId,
    department_id: effectiveDepartment,
    section_id: selectedSection,
    risk_tier: tierFilter,
    enabled: !!institutionId,
  });

  const assessments = assessmentsData?.data ?? [];

  // ── Group assessments by tier ──────────────────────
  const groupedByTier = useMemo(() => {
    const groups: Record<RiskTier, LearnerRiskWithProfile[]> = {
      critical: [],
      high: [],
      moderate: [],
      low: [],
      healthy: [],
    };
    for (const a of assessments) {
      if (a.risk_tier in groups) {
        groups[a.risk_tier].push(a);
      }
    }
    return groups;
  }, [assessments]);

  // ── Loading state ──────────────────────────────────
  if (authLoading) {
    return (
      <ContentLayout title="Advisor Caseload">
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-64" />
          <div className="flex gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 flex-1" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!profile || !institutionId) {
    return (
      <ContentLayout title="Advisor Caseload">
        <Alert variant="destructive" className="m-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Unable to determine your institution. Please contact an
            administrator.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="My Students - Risk Overview">
      <PageBreadcrumb
        items={[
          { label: 'Learners', href: '/learners' },
          { label: 'Advisor Caseload' },
        ]}
      />

      <div className="space-y-6 p-6">
        {/* Header + Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-red-600" />
            <h1 className="text-2xl font-bold tracking-tight">
              My Students &mdash; Risk Overview
            </h1>
          </div>
          <RiskFilters
            departments={departments}
            sections={sections}
            selectedDepartment={selectedDepartment}
            selectedSection={selectedSection}
            selectedTier={selectedTier}
            onDepartmentChange={setSelectedDepartment}
            onSectionChange={setSelectedSection}
            onTierChange={setSelectedTier}
            showDepartmentFilter={!!isDirector}
          />
        </div>

        {/* Summary bar */}
        <RiskSummaryBar summary={summary} isLoading={summaryLoading} />

        {/* Error state */}
        {assessmentsError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {assessmentsError.message || 'Failed to load risk assessments.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Assessments loading skeleton */}
        {assessmentsLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* Grouped student cards */}
        {!assessmentsLoading &&
          TIER_ORDER.map((tier) => {
            const group = groupedByTier[tier];
            if (group.length === 0) return null;

            // "Doing Well" section collapsed by default
            const isHealthy = tier === 'healthy';

            return (
              <Card key={tier}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {TIER_LABELS[tier]}
                    <span className="text-sm font-normal text-muted-foreground">
                      ({group.length})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isHealthy ? (
                    <details>
                      <summary className="cursor-pointer text-sm text-muted-foreground mb-3">
                        Show {group.length} students doing well
                      </summary>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {group.map((a) => (
                          <RiskCard key={a.id} assessment={a} />
                        ))}
                      </div>
                    </details>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {group.map((a) => (
                        <RiskCard key={a.id} assessment={a} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

        {/* Empty state */}
        {!assessmentsLoading && assessments.length === 0 && !assessmentsError && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No risk assessments found for today. Assessments are generated
                daily by the risk engine.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
