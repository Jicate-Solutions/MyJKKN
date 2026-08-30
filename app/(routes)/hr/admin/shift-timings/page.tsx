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
import { Info } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useEmploymentCategories } from '@/hooks/hr/use-shift-timings';
import { todayISO } from '@/lib/services/hr/attendance-recompute-service';
import { APPLICABLE_GENDER_OPTIONS } from '@/types/hr-shift-timings';
import type { ShiftApplicableGender, ShiftStaffScope } from '@/types/hr-shift-timings';

/** Radix Select cannot hold '' as a value, so "no category" needs a sentinel. */
const ALL_CATEGORIES = '__all__';

import { WeeklyTimingGrid } from './_components/weekly-timing-grid';
import { CoverageWarning } from './_components/coverage-warning';
import { RecomputeAttendanceCard } from './_components/recompute-attendance-card';

export default function ShiftTimingsPage() {
  // entityType 'all' is deliberate. The default ('institution') returns only 9
  // of the 14 entities — it would silently hide JKKN Main Office (admin_office,
  // 114 staff, all non-teaching), both schools (99 staff) and the two companies.
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({
    entityType: 'all',
  });

  const [institutionId, setInstitutionId] = useState('');

  /**
   * The effective date is one decision for the whole edit, so the page owns it
   * rather than each scope's grid -- see WeeklyTimingGridProps for the
   * half-applied change that fixes.
   *
   * It DOES reset when the institution changes. Carrying a backdate across
   * institutions would trade the bug this fixes for a worse one: silently
   * re-judging months of another institution's attendance because a date was
   * set for the previous one.
   */
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO());

  /**
   * THE OVERRIDE BUILDER'S THREE CHOICES, and they live only inside the
   * Override tab.
   *
   * A page-level "Applies to" was tried first and was wrong: it put the whole
   * screen into a gender mode, so the Teaching and Non-teaching tabs silently
   * stopped meaning "the general week". An override is a narrowing of a general
   * rule, so it belongs where the narrowing is chosen — beside the category
   * picker that was already doing exactly this job.
   *
   * The three compose into one row rather than three columns of scope:
   *   staff type + gender + ALL categories  -> staff_scope teaching|non_teaching
   *   staff type + gender + one category    -> staff_scope 'category'
   * which is precisely what hr_shift_timings_scope_category_chk requires.
   */
  const [overrideStaffType, setOverrideStaffType] =
    useState<'teaching' | 'non_teaching'>('teaching');
  const [overrideGender, setOverrideGender] = useState<ShiftApplicableGender>('female');
  // Declared BEFORE the institution-reset block below, which calls its setter.
  // A `const` is in its temporal dead zone until its own line runs, so leaving
  // this underneath would throw on the first institution change.
  const [categoryId, setCategoryId] = useState('');

  const [scopeSetFor, setScopeSetFor] = useState(institutionId);
  // Adjusted during render rather than in an effect: an effect would paint one
  // frame carrying the previous institution's backdate, and it trips
  // react-hooks/set-state-in-effect. This is React's documented way to reset
  // state when a value it derives from changes.
  if (scopeSetFor !== institutionId) {
    setScopeSetFor(institutionId);
    setEffectiveFrom(todayISO());
    // Reset alongside the date, and for the same reason: carrying an override
    // selection into another institution would edit a week the operator never
    // chose to open.
    setOverrideStaffType('teaching');
    setOverrideGender('female');
    setCategoryId('');
  }

  const { data: categories = [] } = useEmploymentCategories();

  useEffect(() => {
    if (institutionId || institutionsLoading || institutions.length === 0) return;
    setInstitutionId(institutions[0].id);
  }, [institutionId, institutionsLoading, institutions]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  );

  /**
   * Only categories matching the chosen staff type. A teaching category under
   * "Non-teaching" would write staff_scope='category' for people the operator
   * did not think they were selecting — the category carries its own
   * is_teaching, so the two choices can silently disagree.
   */
  const overrideCategories = useMemo(
    () => categories.filter((c) => c.is_teaching === (overrideStaffType === 'teaching')),
    [categories, overrideStaffType],
  );

  // Picking a staff type invalidates a category chosen under the other one.
  const [catSetFor, setCatSetFor] = useState(overrideStaffType);
  if (catSetFor !== overrideStaffType) {
    setCatSetFor(overrideStaffType);
    setCategoryId('');
  }

  /**
   * The three choices collapse into the one row the table actually stores.
   * "All categories" is not a special scope — it is the ABSENCE of a category,
   * which is exactly what staff_scope teaching/non_teaching already means.
   */
  const overrideScope: ShiftStaffScope = categoryId ? 'category' : overrideStaffType;
  const overrideCategoryId = categoryId || null;

  /**
   * Everyone + All categories is not an override at all — it resolves to the
   * very row the Teaching / Non-teaching tab edits. Allowed (it is the same
   * row, so nothing can corrupt), but said out loud, because silently editing
   * the general week from the Override tab is how an operator ends up changing
   * hours for people they never meant to touch.
   */
  const overrideIsGeneralWeek = overrideGender === 'all' && !categoryId;

  const overrideLabel = [
    overrideStaffType === 'teaching' ? 'Teaching' : 'Non-teaching',
    APPLICABLE_GENDER_OPTIONS.find((o) => o.value === overrideGender)?.label,
    selectedCategory?.category_name ?? 'All categories',
  ].join(' · ');

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
                    <TabsTrigger value="category">Override</TabsTrigger>
                  </TabsList>

                  <TabsContent value="teaching" className="pt-4">
                    <WeeklyTimingGrid
                      institutionId={institutionId}
                      staffScope="teaching"
                      scopeLabel="Teaching"
                      effectiveFrom={effectiveFrom}
                      onEffectiveFromChange={setEffectiveFrom}
                    />
                  </TabsContent>

                  <TabsContent value="non_teaching" className="pt-4">
                    <WeeklyTimingGrid
                      institutionId={institutionId}
                      staffScope="non_teaching"
                      scopeLabel="Non-teaching"
                      effectiveFrom={effectiveFrom}
                      onEffectiveFromChange={setEffectiveFrom}
                    />
                  </TabsContent>

                  <TabsContent value="category" className="space-y-4 pt-4">
                    {/* Three narrowings, coarsest first. Staff type comes first
                        because it filters the category list — a category
                        carries its own is_teaching, so offering all of them
                        under either type invites a contradictory pair. */}
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <Label htmlFor="ov-staff-type">Staff type</Label>
                        <Select
                          value={overrideStaffType}
                          onValueChange={(v) =>
                            setOverrideStaffType(v as 'teaching' | 'non_teaching')
                          }
                        >
                          <SelectTrigger id="ov-staff-type" className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="teaching">Teaching</SelectItem>
                            <SelectItem value="non_teaching">Non-teaching</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="ov-gender">Gender</Label>
                        <Select
                          value={overrideGender}
                          onValueChange={(v) => setOverrideGender(v as ShiftApplicableGender)}
                        >
                          <SelectTrigger id="ov-gender" className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {APPLICABLE_GENDER_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="ov-category">Category</Label>
                        <Select
                          value={categoryId || ALL_CATEGORIES}
                          onValueChange={(v) => setCategoryId(v === ALL_CATEGORIES ? '' : v)}
                        >
                          <SelectTrigger id="ov-category" className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto">
                            {/* A real sentinel, never '' — Radix Select treats an
                                empty string as "no selection" and would render a
                                blank trigger instead of "All categories". */}
                            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
                            {overrideCategories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Editing <strong>{overrideLabel}</strong>. An override wins over the
                      general {overrideStaffType === 'teaching' ? 'Teaching' : 'Non-teaching'}{' '}
                      week for exactly these staff. A named category beats a gender rule, so
                      set the gender on the category itself when both should apply.
                    </p>

                    {overrideIsGeneralWeek && (
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          Everyone + All categories <strong>is</strong> the general{' '}
                          {overrideStaffType === 'teaching' ? 'Teaching' : 'Non-teaching'} week —
                          the same one that tab edits. Narrow the gender or pick a category to
                          make this an override.
                        </AlertDescription>
                      </Alert>
                    )}

                    <WeeklyTimingGrid
                      key={`${overrideScope}|${overrideCategoryId ?? 'all'}|${overrideGender}`}
                      institutionId={institutionId}
                      staffScope={overrideScope}
                      employmentCategoryId={overrideCategoryId}
                      applicableGender={overrideGender}
                      scopeLabel={overrideLabel}
                      effectiveFrom={effectiveFrom}
                      onEffectiveFromChange={setEffectiveFrom}
                    />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </CardContent>
        </Card>

        {/* Backfill surface. Saving a week already recomputes that institution;
            this covers a sweep across institutions after a rule change, and
            lets an operator preview before writing. Gated on the same
            permission the API enforces (hr.attendance.override) rather than the
            page's hr.shift_timings.manage — configuring hours and rewriting
            imported attendance are different amounts of trust. */}
        <div className="mt-6">
          <PermissionGuard module="hr.attendance" action="override">
            <RecomputeAttendanceCard
              institutions={institutions}
              defaultInstitutionId={institutionId}
            />
          </PermissionGuard>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
