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
import { Info, Plus, X } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useHrInstitutionsWithAccess } from '@/hooks/hr/use-hr-institutions';
import {
  useEmploymentCategories,
  useEndShiftTimingOverride,
  useShiftTimingOverrideList,
} from '@/hooks/hr/use-shift-timings';
// The role and person pickers already built for leave approval flows — the
// same institution-scoped staff search and the same SECDEF role list an HR
// admin can read. Imported across routes rather than copied.
import { useLeaveApproverRoles } from '@/hooks/hr/use-leave-approval-flows';
import { RolePicker } from '../leave-types/_components/role-picker';
import { StaffPicker } from '../leave-types/_components/staff-picker';
import type { StaffPickerOption } from '@/types/hr-leave-assignments';
import { todayISO } from '@/lib/services/hr/attendance-recompute-service';
import { toast } from 'sonner';

import { cn, getErrorMessage } from '@/lib/utils';
import {
  APPLICABLE_GENDER_OPTIONS, DAY_OF_WEEK_OPTIONS, OVERRIDE_KIND_OPTIONS, toHHMM,
} from '@/types/hr-shift-timings';
import type {
  ShiftApplicableGender, ShiftOverrideKind, ShiftStaffScope,
} from '@/types/hr-shift-timings';

import { WeeklyTimingGrid } from './_components/weekly-timing-grid';
import { CoverageWarning } from './_components/coverage-warning';
import { RecomputeAttendanceCard } from './_components/recompute-attendance-card';

/** Radix Select cannot hold '' as a value, so "no category" needs a sentinel. */
const ALL_CATEGORIES = '__all__';

export default function ShiftTimingsPage() {
  // entityType 'all' is deliberate. The default ('institution') returns only 9
  // of the 14 entities — it would silently hide JKKN Main Office (admin_office,
  // 114 staff, all non-teaching), both schools (99 staff) and the two companies.
  const { institutions, loading: institutionsLoading } = useHrInstitutionsWithAccess({
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
  /**
   * WHAT THE OVERRIDE NARROWS BY (2026-09-21). Category is the shape every
   * override had until now and stays the default; Role and Individual are the
   * two rungs added above it in fn_shift_timing_pick's ladder.
   */
  const [overrideKind, setOverrideKind] = useState<ShiftOverrideKind>('category');
  const [roleKey, setRoleKey] = useState('');
  // A one-element array because StaffPicker is a multi-select; the change
  // handler keeps only the last click, which reads as single-select.
  const [person, setPerson] = useState<StaffPickerOption[]>([]);
  // Declared BEFORE the institution-reset block below, which calls its setter.
  // A `const` is in its temporal dead zone until its own line runs, so leaving
  // this underneath would throw on the first institution change.
  const [categoryId, setCategoryId] = useState('');
  /**
   * Whether the builder is open. Closed by default so the tab opens on the LIST
   * — the thing that was missing — rather than on a half-filled form that looks
   * like the only override the institution can have.
   *
   * Declared here, above the reset block, for the same temporal-dead-zone reason
   * as categoryId: that block calls setBuilderOpen.
   */
  const [builderOpen, setBuilderOpen] = useState(false);

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
    setOverrideKind('category');
    setRoleKey('');
    setPerson([]);
    setBuilderOpen(false);
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

  const { data: overrides = [], isLoading: overridesLoading } =
    useShiftTimingOverrideList(institutionId || null);
  const endOverride = useEndShiftTimingOverride();
  const { data: roles } = useLeaveApproverRoles();
  const roleName = (key: string | null) =>
    key ? (roles?.find((r) => r.role_key === key)?.role_name ?? key) : '';

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
  const overrideScope: ShiftStaffScope =
    overrideKind === 'role'
      ? 'role'
      : overrideKind === 'staff'
        ? 'staff'
        : categoryId
          ? 'category'
          : overrideStaffType;
  const overrideCategoryId = overrideKind === 'category' && categoryId ? categoryId : null;
  const overrideRoleKey = overrideKind === 'role' ? roleKey || null : null;
  const overrideStaffId = overrideKind === 'staff' ? (person[0]?.id ?? null) : null;
  // A person has one gender; the row stores 'all' and the RPC enforces it.
  const effectiveGender: ShiftApplicableGender =
    overrideKind === 'staff' ? 'all' : overrideGender;
  // Role and Individual need their discriminator before there is a week to
  // edit; Category is always a valid (if general) target.
  const builderReady =
    overrideKind === 'category' ||
    (overrideKind === 'role' ? Boolean(overrideRoleKey) : Boolean(overrideStaffId));
  const matchesOverride = (o: {
    staff_scope: ShiftStaffScope;
    employment_category_id: string | null;
    role_key: string | null;
    staff_id: string | null;
    applicable_gender: ShiftApplicableGender;
  }) =>
    o.staff_scope === overrideScope &&
    (o.employment_category_id ?? null) === overrideCategoryId &&
    (o.role_key ?? null) === overrideRoleKey &&
    (o.staff_id ?? null) === overrideStaffId &&
    o.applicable_gender === effectiveGender;

  /**
   * Everyone + All categories is not an override at all — it resolves to the
   * very row the Teaching / Non-teaching tab edits. Allowed (it is the same
   * row, so nothing can corrupt), but said out loud, because silently editing
   * the general week from the Override tab is how an operator ends up changing
   * hours for people they never meant to touch.
   */
  const overrideIsGeneralWeek = overrideKind === 'category' && overrideGender === 'all' && !categoryId;
  // Two role overrides at one institution can both match a person who holds
  // both roles; the newer effective_from wins. Said once, above the list.
  const roleOverrideCount = overrides.filter((o) => o.staff_scope === 'role').length;

  /**
   * Open the builder on a FRESH combination.
   *
   * Resetting matters as much as opening: after saving an override the builder
   * still held that override's three choices, so pressing Add again re-opened
   * the one just written and looked like the tab refusing a second override.
   * Female is the default because it is the case this feature was built for.
   */
  const startNewOverride = () => {
    setOverrideStaffType('teaching');
    setCatSetFor('teaching');
    setCategoryId('');
    setOverrideGender('female');
    setOverrideKind('category');
    setRoleKey('');
    setPerson([]);
    setBuilderOpen(true);
  };

  const genderLabel = (g: string) =>
    APPLICABLE_GENDER_OPTIONS.find((o) => o.value === g)?.label ?? g;
  const categoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.category_name ?? 'Category') : 'All categories';
  /** "Mon–Sat" when contiguous, else "Mon, Wed, Fri". */
  const daysLabel = (days: number[]) => {
    if (days.length === 0) return 'No working days';
    const short = (d: number) => DAY_OF_WEEK_OPTIONS.find((o) => o.value === d)?.short ?? String(d);
    const sorted = [...days].sort((a, b) => a - b);
    const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
    return contiguous && sorted.length > 2
      ? `${short(sorted[0])}–${short(sorted[sorted.length - 1])}`
      : sorted.map(short).join(', ');
  };

  const overrideLabel =
    overrideKind === 'role'
      ? ['Role', overrideRoleKey ? roleName(overrideRoleKey) : '(pick a role)', genderLabel(overrideGender)].join(' · ')
      : overrideKind === 'staff'
        ? ['Individual', person[0] ? `${person[0].name}${person[0].staff_code ? ` · ${person[0].staff_code}` : ''}` : '(pick a person)'].join(' · ')
        : [
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

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Team members assigned to a <strong>work pattern</strong> keep these hours and
                    work only the pattern&apos;s days.{' '}
                    <Link href="/hr/admin/work-patterns" className="font-medium underline underline-offset-2">
                      Manage work patterns
                    </Link>
                  </AlertDescription>
                </Alert>

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
                    {/* THE LIST COMES FIRST. The tab could always create any
                        number of overrides - the current-row unique index is per
                        (institution, scope, category, gender, weekday) - but with
                        nothing listing them an operator could not find one again
                        or tell a new combination from one configured last month,
                        which is what made the tab feel single-override. */}
                    {overridesLoading ? null : overrides.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No overrides yet. Everyone follows the general Teaching and
                        Non-teaching weeks.
                      </p>
                    ) : (
                      <div className="divide-y rounded-md border">
                        {overrides.map((o) => {
                          const isEditing = builderOpen && matchesOverride(o);
                          // The staff type of a CATEGORY override comes from the
                          // category, not the row: staff_scope is 'category' there
                          // and says nothing about teaching.
                          const cat = categories.find((c) => c.id === o.employment_category_id);
                          const staffType: 'teaching' | 'non_teaching' =
                            o.staff_scope === 'category'
                              ? (cat?.is_teaching ? 'teaching' : 'non_teaching')
                              : (o.staff_scope as 'teaching' | 'non_teaching');
                          return (
                            <div
                              key={`${o.staff_scope}|${o.employment_category_id ?? 'all'}|${o.role_key ?? ''}|${o.staff_id ?? ''}|${o.applicable_gender}`}
                              className={cn(
                                'flex flex-wrap items-center justify-between gap-2 p-3',
                                isEditing && 'bg-muted/50',
                              )}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {o.staff_scope === 'role' ? (
                                    <>
                                      Role{' \u00b7 '}{roleName(o.role_key)}
                                      {' \u00b7 '}{genderLabel(o.applicable_gender)}
                                    </>
                                  ) : o.staff_scope === 'staff' ? (
                                    <>
                                      Individual{' \u00b7 '}{o.person_name ?? 'Unnamed'}
                                      {o.person_code && (
                                        <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                                          {o.person_code}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      {staffType === 'teaching' ? 'Teaching' : 'Non-teaching'}
                                      {' \u00b7 '}
                                      {genderLabel(o.applicable_gender)}
                                      {' \u00b7 '}
                                      {categoryName(o.employment_category_id)}
                                    </>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {o.first_half_start && o.second_half_end
                                    ? `${toHHMM(o.first_half_start)}\u2013${toHHMM(o.second_half_end)} \u00b7 `
                                    : ''}
                                  {/* A JS string, not JSX text: an escape in raw
                                      JSX text renders as the literal characters. */}
                                  {daysLabel(o.working_days)}
                                  {' \u00b7 from '}
                                  {o.effective_from}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (o.staff_scope === 'role') {
                                      setOverrideKind('role');
                                      setRoleKey(o.role_key ?? '');
                                      setPerson([]);
                                      setCategoryId('');
                                      setOverrideGender(o.applicable_gender);
                                    } else if (o.staff_scope === 'staff') {
                                      setOverrideKind('staff');
                                      setRoleKey('');
                                      setCategoryId('');
                                      setPerson(
                                        o.staff_id
                                          ? [{
                                              id: o.staff_id,
                                              name: o.person_name ?? 'Unnamed',
                                              staff_code: o.person_code,
                                              department_name: null,
                                            }]
                                          : [],
                                      );
                                      setOverrideGender('all');
                                    } else {
                                      setOverrideKind('category');
                                      setRoleKey('');
                                      setPerson([]);
                                      setOverrideStaffType(staffType);
                                      // Kept in step with the staff type, or the
                                      // reset-on-change below would immediately wipe
                                      // the category we are about to select.
                                      setCatSetFor(staffType);
                                      setCategoryId(o.employment_category_id ?? '');
                                      setOverrideGender(o.applicable_gender);
                                    }
                                    setBuilderOpen(true);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  disabled={endOverride.isPending}
                                  title="Stop this override applying from today"
                                  onClick={async () => {
                                    try {
                                      const r = await endOverride.mutateAsync({
                                        institutionId,
                                        staffScope: o.staff_scope,
                                        employmentCategoryId: o.employment_category_id,
                                        roleKey: o.role_key,
                                        staffId: o.staff_id,
                                        applicableGender: o.applicable_gender,
                                      });
                                      // The override IS retired by this point, so a
                                      // failed recompute is a warning, not an error.
                                      if (r.recomputeError) {
                                        toast.warning(
                                          `Override removed, but recomputing attendance failed: ${r.recomputeError}`,
                                        );
                                      } else {
                                        toast.success(
                                          'Override removed \u2014 these staff follow the general week from today. Earlier days are unchanged.',
                                        );
                                      }
                                    } catch (err) {
                                      toast.error(getErrorMessage(err));
                                    }
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {roleOverrideCount >= 2 && (
                      <p className="text-xs text-muted-foreground">
                        {roleOverrideCount} role overrides are in force here. A team member who
                        holds more than one of those roles follows the override that became
                        effective most recently.
                      </p>
                    )}

                    {/* ALWAYS RENDERED, never swapped out for the builder.
                        Previously this button was the `false` branch of the
                        builder's ternary, so opening the builder removed the
                        only way to start another override — and saving left the
                        builder open on the row just written, with no way back to
                        the list. */}
                    <Button variant="outline" size="sm" onClick={startNewOverride}>
                      <Plus className="mr-2 h-4 w-4" />
                      {overrides.length === 0 ? 'Add override' : 'Add another override'}
                    </Button>

                    {builderOpen && (
                      <>
                        <div className="flex items-center justify-between gap-2 border-t pt-4">
                          <p className="text-sm font-medium">
                            {overrides.some(matchesOverride)
                              ? `Editing ${overrideLabel}`
                              : `New override — ${overrideLabel}`}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setBuilderOpen(false)}
                          >
                            Close
                          </Button>
                        </div>
                    {/* WHAT THIS OVERRIDE NARROWS BY. Picked first because it
                        decides which pickers below make sense: a role spans
                        categories, a person has one gender. */}
                    <div className="max-w-md">
                      <Label htmlFor="ov-kind">Override for</Label>
                      <Select
                        value={overrideKind}
                        onValueChange={(v) => {
                          const kind = v as ShiftOverrideKind;
                          setOverrideKind(kind);
                          // Never carry a discriminator across kinds: a role
                          // left set while editing a person would be sent along
                          // and refused by the RPC's shape check.
                          setRoleKey('');
                          setPerson([]);
                          setCategoryId('');
                          // A person carries no gender; leaving Individual
                          // restores the Female default the tab opens on.
                          if (kind === 'staff') setOverrideGender('all');
                          else if (overrideKind === 'staff') setOverrideGender('female');
                        }}
                      >
                        <SelectTrigger id="ov-kind" className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OVERRIDE_KIND_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {OVERRIDE_KIND_OPTIONS.find((o) => o.value === overrideKind)?.hint}
                      </p>
                    </div>

                    {overrideKind === 'role' && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label>Role</Label>
                          <RolePicker
                            roles={roles}
                            value={roleKey}
                            onChange={setRoleKey}
                            placeholder="Select a role"
                            className="mt-1"
                            aria-label="Role"
                          />
                        </div>
                        <div>
                          <Label htmlFor="ov-role-gender">Gender</Label>
                          <Select
                            value={overrideGender}
                            onValueChange={(v) => setOverrideGender(v as ShiftApplicableGender)}
                          >
                            <SelectTrigger id="ov-role-gender" className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {APPLICABLE_GENDER_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {overrideKind === 'staff' && (
                      <div className="max-w-xl">
                        <Label>Team member</Label>
                        <div className="mt-1">
                          <StaffPicker
                            institutionId={institutionId}
                            selected={person}
                            // Single-select on a multi-select control: keep
                            // only the most recent pick.
                            onChange={(next) => setPerson(next.slice(-1))}
                          />
                        </div>
                      </div>
                    )}

                    {/* Three narrowings, coarsest first. Staff type comes first
                        because it filters the category list — a category
                        carries its own is_teaching, so offering all of them
                        under either type invites a contradictory pair. */}
                    {overrideKind === 'category' && (
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
                    )}

                    <p className="text-xs text-muted-foreground">
                      Editing <strong>{overrideLabel}</strong>.{' '}
                      {overrideKind === 'category'
                        ? `An override wins over the general ${overrideStaffType === 'teaching' ? 'Teaching' : 'Non-teaching'} week for exactly these team members. A named category beats a gender rule, so set the gender on the category itself when both should apply.`
                        : 'An individual override beats a role, a role beats a category, and a category beats the general week. If someone holds two roles that both have an override, the one that became effective most recently applies.'}
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

                    {builderReady ? (
                      <WeeklyTimingGrid
                        key={`${overrideScope}|${overrideCategoryId ?? 'all'}|${overrideRoleKey ?? ''}|${overrideStaffId ?? ''}|${effectiveGender}`}
                        institutionId={institutionId}
                        staffScope={overrideScope}
                        employmentCategoryId={overrideCategoryId}
                        roleKey={overrideRoleKey}
                        staffId={overrideStaffId}
                        applicableGender={effectiveGender}
                        scopeLabel={overrideLabel}
                        effectiveFrom={effectiveFrom}
                        onEffectiveFromChange={setEffectiveFrom}
                        // Back to the list, where the override just written now
                        // appears and Add another is one click away.
                        onSaved={() => setBuilderOpen(false)}
                      />
                    ) : (
                      <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                        {overrideKind === 'role'
                          ? 'Pick a role to load its week.'
                          : 'Pick a team member to load their week.'}
                      </p>
                    )}
                      </>
                    )}
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
