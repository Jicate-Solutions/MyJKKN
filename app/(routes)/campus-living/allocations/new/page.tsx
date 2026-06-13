'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useCreateHostelAllocation } from '@/hooks/campus-living/use-hostel-allocations';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import { useRoomsByBlock } from '@/hooks/campus-living/use-hostel-rooms';
import { useBedsByRoom } from '@/hooks/campus-living/use-hostel-beds';
import { useLearnerHostelites } from '@/hooks/campus-living/use-learner-hostelites';
import { useActiveMessCategories } from '@/hooks/campus-living/use-mess-categories';
import { useCurrentHostelYear } from '@/hooks/campus-living/use-hostel-years';
import { usePackageForLearner } from '@/hooks/campus-living/use-admission-packages';
import {
  useEffectiveRoomCategories,
  useEffectiveMessCategories,
  useFeeQuote,
} from '@/hooks/campus-living/use-allocation-eligibility';
import {
  ArrowLeft,
  Save,
  Loader2,
  Search,
  User,
  Building2,
  BedDouble,
  Phone,
  Plus,
  Heart,
  Info,
  Receipt,
  Package,
} from 'lucide-react';


/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/campus-living/allocations',
} as const;

export default function NewAllocationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState({
    learner_id: '',
    student_name: '',
    block_id: searchParams.get('block') ?? '',
    room_id: searchParams.get('room') ?? '',
    bed_id: searchParams.get('bed') ?? '',
    mess_category_id: '',
    allocation_type: 'fresh',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relation: '',
    medical_conditions: '',
    food_preference: 'vegetarian',
  });

  const createAllocation = useCreateHostelAllocation();
  const { data: blocksResult } = useHostelBlocks(profile?.institution_id ?? '');
  const blocks = blocksResult?.data;
  const { data: rooms } = useRoomsByBlock(formData.block_id);
  const { data: beds } = useBedsByRoom(formData.room_id);

  // ── PR γ: allocation-time eligibility filter + upfront fee preview ──
  // Resolve the chosen learner's program, then ask β's resolver which room /
  // mess categories that program may pick. Empty set ⇒ no eligibility
  // configured ⇒ fail OPEN (show everything + a subtle hint), never block.
  const { data: eligibleRoomCategoryIds } = useEffectiveRoomCategories(
    formData.learner_id || null,
  );
  const { data: eligibleMessCategoryIds } = useEffectiveMessCategories(
    formData.learner_id || null,
  );
  const { messCategories } = useActiveMessCategories();
  const { currentYear } = useCurrentHostelYear();

  // ── PR ε handoff: resolve the learner's admission package (read-only) ──
  // When the selected learner has a package for the current year, surface it
  // as a hint and pre-fill the mess select from their package-time choice.
  // Returns null when the learner has no package — fail-open, never blocks.
  const { data: learnerPackage } = usePackageForLearner(
    formData.learner_id || null,
    currentYear?.id ?? null,
  );

  // Fail-open gates: only narrow when the resolver returned a non-empty set.
  const roomFilterActive = (eligibleRoomCategoryIds?.length ?? 0) > 0;
  const messFilterActive = (eligibleMessCategoryIds?.length ?? 0) > 0;

  // Rooms whose category the learner's program may occupy. When no eligibility
  // is configured we show all rooms (fail-open) so allocation is never blocked.
  const visibleRooms = roomFilterActive
    ? (rooms ?? []).filter(
        (r) => r.category_id && eligibleRoomCategoryIds!.includes(r.category_id),
      )
    : rooms ?? [];

  // Mess categories the program may pick (fail-open to all active categories).
  const visibleMessCategories = messFilterActive
    ? messCategories.filter((m) => eligibleMessCategoryIds!.includes(m.id))
    : messCategories;

  const selectedRoom = (rooms ?? []).find((r) => r.id === formData.room_id) ?? null;

  // Read-only upfront fee quote (δ's /api/campus-living/fee-quote). Estimate at
  // full occupancy (per-bed rate): activeOccupants = room capacity. PREVIEW
  // only — it never binds or charges. Disabled until inputs are present.
  const { data: feeQuote, isLoading: feeLoading, error: feeError } = useFeeQuote(
    selectedRoom?.category_id && currentYear?.id
      ? {
          roomId: formData.room_id,
          roomCategoryId: selectedRoom.category_id,
          activeOccupants: Math.max(1, selectedRoom.capacity ?? 1),
          messCategoryId: formData.mess_category_id || null,
          hostelYearId: currentYear.id,
        }
      : null,
  );
  const inr = (n: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(n);

  // Resolve a mess category id → display name (from the active categories the
  // page already loads) for the package hint card.
  const messName = (id: string | null): string | null =>
    id ? messCategories.find((m) => m.id === id)?.name ?? null : null;

  // Visual pre-fill: seed the mess select from the package's chosen mess, but
  // only when the warden hasn't already picked one (never clobber a manual
  // choice). The hint card below always shows the package's mess regardless,
  // so the truth is visible even if this guard skips the auto-fill.
  const packageMessId = learnerPackage?.chosen_mess_category_id ?? null;
  useEffect(() => {
    if (packageMessId) {
      setFormData((prev) =>
        prev.mess_category_id
          ? prev
          : { ...prev, mess_category_id: packageMessId },
      );
    }
  }, [packageMessId]);

  // Resident search — pulls from `learners_profiles.accommodation_type='HOSTEL'`
  // (the same cohort visible on /campus-living/residents). Previously used the
  // billing-side `useSearchStudentsByQuery` which returned every active learner
  // including day scholars (BUG-003895 — "not pulling data from residents data").
  // Mirrors the institution scoping convention from /residents learners-tab:
  // super_admin → undefined (no filter), otherwise scope to the user's institution.
  const residentInstitutionId: string | undefined = isSuperAdmin
    ? undefined
    : profile?.institution_id ?? undefined;
  const trimmedSearch = studentSearch.trim();
  const { data: searchResultsResp, isLoading: studentsLoading } = useLearnerHostelites(
    residentInstitutionId,
    trimmedSearch.length >= 2 ? { search: trimmedSearch } : undefined,
    { enabled: trimmedSearch.length >= 2 },
  );
  const searchResults = searchResultsResp?.data?.slice(0, 10);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await createAllocation.mutateAsync({
        institution_id: profile?.institution_id ?? '',
        learner_id: formData.learner_id,
        block_id: formData.block_id,
        room_id: formData.room_id,
        bed_id: formData.bed_id,
        mess_category_id: formData.mess_category_id || null,
        allocation_type: formData.allocation_type,
        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_phone: formData.emergency_contact_phone,
        emergency_contact_relation: formData.emergency_contact_relation,
        medical_conditions: formData.medical_conditions,
        food_preference: formData.food_preference,
      } as any);
      router.push('/campus-living/allocations');
    } catch (error) {
      // Error is handled by the mutation hook via toast
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title="New Allocation">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: 'New Allocation' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Allocate Bed</h1>
            <p className="text-sm text-muted-foreground">
              Assign a student to a hostel bed
            </p>
          </div>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center gap-2">
          {[
            { num: 1, label: 'Student', icon: User },
            { num: 2, label: 'Room & Bed', icon: Building2 },
            { num: 3, label: 'Emergency Contact', icon: Phone },
          ].map((s, idx) => (
            <div key={s.num} className="flex items-center">
              <button
                onClick={() => setStep(s.num)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  step === s.num
                    ? 'bg-primary text-primary-foreground'
                    : step > s.num
                    ? 'bg-green-100 text-green-800'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <s.icon className="h-4 w-4" />
                {s.label}
              </button>
              {idx < 2 && <div className="w-8 h-px bg-border mx-1" />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Student Selection */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Select Student
                </CardTitle>
                <CardDescription>Search and select the student to allocate</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, roll number, or phone..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Search Results — wired to real learner-search (BUG-003865) */}
                <div className="space-y-2">
                  {studentsLoading && studentSearch.length >= 2 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Searching…
                    </p>
                  )}
                  {searchResults?.map((student) => {
                    const fullName = `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim() || '—';
                    const subline = [student.roll_number, student.student_email ?? student.college_email]
                      .filter(Boolean)
                      .join(' · ') || '—';
                    return (
                      <div
                        key={student.id}
                        onClick={() => {
                          handleChange('learner_id', student.id);
                          handleChange('student_name', fullName);
                        }}
                        className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                          formData.learner_id === student.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">{fullName}</p>
                            <p className="text-sm text-muted-foreground">{subline}</p>
                          </div>
                        </div>
                        {formData.learner_id === student.id && (
                          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {studentSearch.length > 0 && studentSearch.length < 2 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Type at least 2 characters to search
                    </p>
                  )}
                  {studentSearch.length >= 2 && !studentsLoading && (searchResults?.length ?? 0) === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No students found matching &quot;{studentSearch}&quot;
                    </p>
                  )}
                </div>

                {/* PR ε handoff: admission-package hint. Shows the package the
                    student was assigned at admission — bundled room category,
                    flat price, and the mess they chose (pre-filled below).
                    Appears only when a package is on file; never blocks. */}
                {formData.learner_id && learnerPackage && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">Admission package on file</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      <p className="text-muted-foreground">
                        Package:{' '}
                        <span className="text-foreground font-medium">
                          {learnerPackage.pkg.name}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Bundled mess:{' '}
                        <span className="text-foreground">
                          {learnerPackage.pkg.mess_category_name ?? 'Not specified'}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Bundled room:{' '}
                        <span className="text-foreground">
                          {learnerPackage.pkg.room_category_name || '—'}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Chosen mess:{' '}
                        <span className="text-foreground">
                          {messName(learnerPackage.chosen_mess_category_id) || 'Not chosen'}
                        </span>
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Pre-filled from the student&apos;s admission package. You can
                      still change the room, bed, and mess below.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Allocation Type</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.allocation_type}
                      onChange={(e) => handleChange('allocation_type', e.target.value)}
                    >
                      <option value="fresh">Fresh Allocation</option>
                      <option value="renewal">Renewal</option>
                      <option value="transfer">Transfer</option>
                      <option value="temporary">Temporary</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Food Preference</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.food_preference}
                      onChange={(e) => handleChange('food_preference', e.target.value)}
                    >
                      <option value="vegetarian">Vegetarian</option>
                      <option value="non_vegetarian">Non-Vegetarian</option>
                      <option value="vegan">Vegan</option>
                      <option value="jain">Jain</option>
                      <option value="eggetarian">Eggetarian</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="button" onClick={() => setStep(2)} disabled={!formData.learner_id}>
                    Next: Select Room
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Room & Bed Selection */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Select Room & Bed
                </CardTitle>
                <CardDescription>Choose the hostel block, room, and bed</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Hostel Block *</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.block_id}
                      onChange={(e) => {
                        handleChange('block_id', e.target.value);
                        handleChange('room_id', '');
                        handleChange('bed_id', '');
                      }}
                      required
                    >
                      <option value="">Select Block</option>
                      {blocks?.map((b) => (
                        <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Room *</Label>
                      {formData.block_id && (
                        <Link
                          href={`/campus-living/blocks/${formData.block_id}/rooms`}
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          target="_blank"
                          rel="noopener"
                        >
                          <Plus className="h-3 w-3" />
                          Manage rooms
                        </Link>
                      )}
                    </div>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.room_id}
                      onChange={(e) => {
                        handleChange('room_id', e.target.value);
                        handleChange('bed_id', '');
                      }}
                      required
                    >
                      <option value="">Select Room</option>
                      {visibleRooms.map((r) => (
                        <option key={r.id} value={r.id}>{r.room_number} ({r.room_type}, capacity {r.capacity})</option>
                      ))}
                    </select>
                    {/* PR γ: eligibility-filter status. When β returned an
                        eligible set we narrowed the room list to that program's
                        room categories. When nothing is configured we fail open
                        and surface a subtle (non-blocking) hint. */}
                    {formData.block_id && roomFilterActive && (
                      <p className="text-xs text-muted-foreground">
                        Showing rooms eligible for this student&apos;s program.
                      </p>
                    )}
                    {formData.block_id && !roomFilterActive && rooms && rooms.length > 0 && (
                      <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        No room eligibility configured — showing all rooms.
                      </p>
                    )}
                    {/* Empty-state hint — wardens used to hit a dead end here when
                        the selected block had no rooms (BUG-003894 — "no interface
                        to add rooms"). The Manage rooms link above is the path. */}
                    {formData.block_id && rooms && rooms.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No rooms in this block yet. Use{' '}
                        <Link
                          href={`/campus-living/blocks/${formData.block_id}/rooms`}
                          className="text-primary hover:underline"
                          target="_blank"
                          rel="noopener"
                        >
                          Manage rooms
                        </Link>{' '}
                        to add one.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Bed *</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.bed_id}
                      onChange={(e) => handleChange('bed_id', e.target.value)}
                      required
                    >
                      <option value="">Select Bed</option>
                      {beds?.map((b) => (
                        <option key={b.id} value={b.id}>Bed {b.bed_number} ({b.bed_type})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* PR γ: Mess category — filtered to the program's eligible set
                    (β), fail-open to all active categories. Optional; drives the
                    flat mess line in the fee preview below. */}
                <div className="space-y-2 md:max-w-sm">
                  <Label>Mess Category</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={formData.mess_category_id}
                    onChange={(e) => handleChange('mess_category_id', e.target.value)}
                  >
                    <option value="">No mess / decide later</option>
                    {visibleMessCategories.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  {formData.learner_id && messFilterActive && (
                    <p className="text-xs text-muted-foreground">
                      Showing mess plans eligible for this student&apos;s program.
                    </p>
                  )}
                  {formData.learner_id && !messFilterActive && messCategories.length > 0 && (
                    <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      No mess eligibility configured — showing all plans.
                    </p>
                  )}
                  {packageMessId && formData.mess_category_id === packageMessId && (
                    <p className="text-xs text-primary inline-flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      Pre-filled from the student&apos;s admission package.
                    </p>
                  )}
                </div>

                {/* PR γ: read-only upfront fee preview (δ's fee-quote API).
                    Estimate at full occupancy; PREVIEW only — does NOT bind or
                    charge. Appears once a room with a category is chosen. */}
                {formData.room_id && selectedRoom?.category_id && (
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium">
                        Estimated upfront fee{currentYear?.name ? ` (${currentYear.name})` : ''}
                      </p>
                    </div>

                    {!currentYear?.id && (
                      <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        No current hostel year set — fee preview unavailable.
                      </p>
                    )}

                    {currentYear?.id && feeLoading && (
                      <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Calculating estimate…
                      </p>
                    )}

                    {currentYear?.id && !feeLoading && feeError && (
                      <p className="text-xs text-amber-700 inline-flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        {feeError instanceof Error ? feeError.message : 'Could not compute an estimate for this selection.'}
                      </p>
                    )}

                    {currentYear?.id && !feeLoading && !feeError && feeQuote && (
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Room base share</span>
                          <span>{inr(feeQuote.breakdown.base_share)}</span>
                        </div>
                        {feeQuote.breakdown.ac_share > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">AC share</span>
                            <span>{inr(feeQuote.breakdown.ac_share)}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Mess fee</span>
                          <span>{inr(feeQuote.breakdown.mess_fee)}</span>
                        </div>
                        <div className="flex items-center justify-between border-t pt-2 font-medium">
                          <span>Total (annual)</span>
                          <span>{inr(feeQuote.breakdown.total_annual)}</span>
                        </div>
                        {feeQuote.prorata && (
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>Pro-rata ({feeQuote.prorata.remaining_months} mo remaining)</span>
                            <span>{inr(feeQuote.prorata.prorated_total)}</span>
                          </div>
                        )}
                        {feeQuote.breakdown.basis.length > 0 && (
                          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground list-disc pl-4">
                            {feeQuote.breakdown.basis.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        )}
                        <p className="text-xs text-muted-foreground pt-1">
                          Estimate at full occupancy. Preview only — this does not bill or reserve the bed.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="medical">Medical Conditions (if any)</Label>
                  <Textarea
                    id="medical"
                    placeholder="Allergies, medications, health conditions..."
                    value={formData.medical_conditions}
                    onChange={(e) => handleChange('medical_conditions', e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button type="button" onClick={() => setStep(3)} disabled={!formData.block_id || !formData.room_id || !formData.bed_id}>
                    Next: Emergency Contact
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Emergency Contact */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Emergency Contact
                </CardTitle>
                <CardDescription>Required emergency contact information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ec_name">Contact Name *</Label>
                    <Input
                      id="ec_name"
                      placeholder="Parent/Guardian name"
                      value={formData.emergency_contact_name}
                      onChange={(e) => handleChange('emergency_contact_name', e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ec_phone">Contact Phone *</Label>
                    <Input
                      id="ec_phone"
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={formData.emergency_contact_phone}
                      onChange={(e) => handleChange('emergency_contact_phone', e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ec_relation">Relation *</Label>
                    <select
                      id="ec_relation"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.emergency_contact_relation}
                      onChange={(e) => handleChange('emergency_contact_relation', e.target.value)}
                      required
                    >
                      <option value="">Select Relation</option>
                      <option value="father">Father</option>
                      <option value="mother">Mother</option>
                      <option value="guardian">Guardian</option>
                      <option value="sibling">Sibling</option>
                      <option value="spouse">Spouse</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-muted/50 rounded-lg p-4 mt-4">
                  <p className="text-sm font-medium mb-2">Allocation Summary</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <p className="text-muted-foreground">Student: <span className="text-foreground">{formData.student_name || 'Not selected'}</span></p>
                    <p className="text-muted-foreground">Type: <span className="text-foreground capitalize">{formData.allocation_type}</span></p>
                    <p className="text-muted-foreground">Block: <span className="text-foreground">{blocks?.find((b) => b.id === formData.block_id)?.name || 'Not selected'}</span></p>
                    <p className="text-muted-foreground">Room: <span className="text-foreground">{rooms?.find((r) => r.id === formData.room_id)?.room_number || 'Not selected'}</span></p>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || !formData.emergency_contact_name || !formData.emergency_contact_phone || !formData.emergency_contact_relation}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Allocating...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Confirm Allocation
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </form>
      </div>
    </ContentLayout>
  );
}
