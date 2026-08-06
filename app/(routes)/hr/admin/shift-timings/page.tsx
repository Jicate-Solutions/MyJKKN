'use client';

/**
 * /hr/admin/shift-timings — institution-wise shift timing configuration.
 * Created: 2026-08-06.
 * Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md
 *
 * Replaces the legacy shift module (hr_shift_templates / hr_shift_assignments),
 * which had no weekday dimension, no half-day split and no grace period.
 *
 * Page shape follows /hr/admin/leave-types, NOT the old
 * /hr/admin/shift-templates — that one gated on hardcoded system roles and
 * asked admins to paste raw institution UUIDs into a text box.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useEmploymentCategories } from '@/hooks/hr/use-shift-timings';

import { WeeklyTimingGrid } from './_components/weekly-timing-grid';
import { CoverageWarning } from './_components/coverage-warning';

export default function ShiftTimingsPage() {
  // entityType 'all' is deliberate. The default ('institution') returns only 9
  // of the 14 entities — it would silently hide JKKN Main Office (admin_office,
  // 114 staff, all non-teaching), both schools (99 staff) and the two companies.
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({
    entityType: 'all',
  });

  const [institutionId, setInstitutionId] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const { data: categories = [] } = useEmploymentCategories();

  useEffect(() => {
    if (institutionId || institutionsLoading || institutions.length === 0) return;
    setInstitutionId(institutions[0].id);
  }, [institutionId, institutionsLoading, institutions]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  );

  return (
    <PermissionGuard module="hr.shift_timings" action="manage">
      <ContentLayout title="Shift Timings">
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
            <BreadcrumbItem><BreadcrumbPage>Shift Timings</BreadcrumbPage></BreadcrumbItem>
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
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {institutionId && (
              <>
                <CoverageWarning institutionId={institutionId} />

                <Tabs defaultValue="teaching">
                  <TabsList>
                    <TabsTrigger value="teaching">Teaching</TabsTrigger>
                    <TabsTrigger value="non_teaching">Non-teaching</TabsTrigger>
                    <TabsTrigger value="category">Category override</TabsTrigger>
                  </TabsList>

                  <TabsContent value="teaching" className="pt-4">
                    <WeeklyTimingGrid
                      institutionId={institutionId}
                      staffScope="teaching"
                      scopeLabel="Teaching"
                    />
                  </TabsContent>

                  <TabsContent value="non_teaching" className="pt-4">
                    <WeeklyTimingGrid
                      institutionId={institutionId}
                      staffScope="non_teaching"
                      scopeLabel="Non-teaching"
                    />
                  </TabsContent>

                  <TabsContent value="category" className="space-y-4 pt-4">
                    <div className="max-w-md">
                      <Label htmlFor="category">Employment category</Label>
                      <Select value={categoryId || undefined} onValueChange={setCategoryId}>
                        <SelectTrigger id="category" className="mt-1">
                          <SelectValue placeholder="Select a category to override" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.category_name} · {c.is_teaching ? 'Teaching' : 'Non-teaching'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-2 text-xs text-muted-foreground">
                        An override wins over the Teaching / Non-teaching timing for
                        staff in this category. Use it where a group genuinely differs
                        — Security or Drivers starting before office hours, say.
                      </p>
                    </div>

                    {selectedCategory && (
                      <WeeklyTimingGrid
                        key={selectedCategory.id}
                        institutionId={institutionId}
                        staffScope="category"
                        employmentCategoryId={selectedCategory.id}
                        scopeLabel={selectedCategory.category_name}
                      />
                    )}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </CardContent>
        </Card>
      </ContentLayout>
    </PermissionGuard>
  );
}
