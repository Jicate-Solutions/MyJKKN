'use client';

/**
 * /hr/admin/work-patterns — institution-scoped named working weeks.
 * Created: 2026-09-04.
 *
 * Shell follows /hr/admin/shift-timings/page.tsx: same institution picker
 * (entityType 'all' — see that page for why), same PermissionGuard key.
 * A work pattern is an alternative week (its own hours, days-per-leave-type)
 * that EXCLUSIVELY overrides the institution week for whoever is assigned to
 * it — see types/hr-work-patterns.ts.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useWorkPatterns } from '@/hooks/hr/use-work-patterns';

import { WorkPatternList } from './_components/work-pattern-list';
import { WorkPatternDetail } from './_components/work-pattern-detail';

const ALL_INSTITUTIONS = '__all__';

export default function WorkPatternsPage() {
  // entityType 'all', same reason as shift-timings: the default
  // ('institution') hides admin_office, both schools and the two companies.
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({
    entityType: 'all',
  });

  // No auto-selection of the first institution, same as shift-timings: a
  // multi-institution HR user picks the one they mean, and nothing is fetched
  // or shown for an institution they did not choose. ALL_INSTITUTIONS is a
  // real sentinel because Radix Select reads '' as "no selection".
  const [institutionId, setInstitutionId] = useState('');
  const isAll = institutionId === ALL_INSTITUTIONS;

  // "All" = every institution this user can reach, passed as ids — never a
  // super-admin branch, which would strip a scope='all' secondary role.
  const institutionIds = useMemo<string[] | null>(() => {
    if (isAll) return institutions.map((i) => i.id);
    return institutionId ? [institutionId] : null;
  }, [isAll, institutionId, institutions]);

  const { data: patterns = [], isLoading } = useWorkPatterns(institutionIds);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Reset the selection during render when the institution changes, rather
  // than in an effect — an effect would paint one frame showing the previous
  // institution's pattern detail. Same idiom as shift-timings page's
  // scopeSetFor reset.
  const [scopeSetFor, setScopeSetFor] = useState(institutionId);
  if (scopeSetFor !== institutionId) {
    setScopeSetFor(institutionId);
    setSelectedId(null);
  }

  const selectedPattern = selectedId ? (patterns.find((p) => p.id === selectedId) ?? null) : null;

  return (
    <PermissionGuard module="hr.shift_timings" action="manage">
      <ContentLayout title="Work Patterns">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link href="/hr/admin">Admin</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Work Patterns</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="mt-4">
          <CardContent className="space-y-6 p-6">
            <div className="max-w-md">
              <Label htmlFor="institution">Institution</Label>
              <Select
                value={institutionId || undefined}
                onValueChange={setInstitutionId}
                disabled={institutionsLoading || institutions.length === 0}
              >
                <SelectTrigger id="institution" className="mt-1">
                  <SelectValue
                    placeholder={
                      institutionsLoading
                        ? 'Loading institutions…'
                        : institutions.length === 0
                          ? 'No accessible institutions'
                          : 'Select an institution'
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  <SelectItem value={ALL_INSTITUTIONS}>All institutions</SelectItem>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {institutionId && (
              <>
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Staff on a work pattern follow the pattern&apos;s week, hours and
                    leave figures instead of the institution&apos;s. Everyone else is
                    unaffected.
                  </AlertDescription>
                </Alert>

                {selectedId ? (
                  selectedPattern ? (
                    <WorkPatternDetail
                      pattern={selectedPattern}
                      // The pattern's own institution, not the filter: under
                      // "All institutions" the filter names none.
                      institutionId={selectedPattern.institution_id}
                      onBack={() => setSelectedId(null)}
                    />
                  ) : (
                    <Skeleton className="h-64 w-full" />
                  )
                ) : (
                  <WorkPatternList
                    institutionId={isAll ? null : institutionId}
                    institutions={institutions}
                    showInstitution={isAll}
                    patterns={patterns}
                    isLoading={isLoading}
                    onSelect={setSelectedId}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
      </ContentLayout>
    </PermissionGuard>
  );
}
