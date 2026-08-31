'use client';

// app/(routes)/admission/settings/fees-structure/[id]/page.tsx
//
// Detail / edit page for an existing fee structure. Two modes:
//
//   View mode (default): clean read-only summary
//     - Header with name + status badge + actions (Edit / Archive / Activate / Back)
//     - 8 matrix-dimension cards laid out 4x2 with NAMES (joined via getDetailById)
//     - Items list with category names, amounts, and grand total
//     - Notes section (if any)
//
//   Edit mode (?edit=1 query param):
//     - Same dimensions card (still read-only — dims are the matrix key)
//     - FeesStructureForm to edit name, items, status
//
// Uses FeeStructureService.getDetailById which joins all 8 dim names + each
// item's billing_category name in one query. Replaces the prior loader that
// only returned raw IDs.

import { Suspense, use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Eye,
  Archive,
  RefreshCw,
  Building2,
  GraduationCap,
  Network,
  BookOpen,
  Calendar,
  Tag,
  Users,
  Receipt,
  Hash,
  Activity,
  Plus,
  Clock,
  Trash2,
  UserCircle,
  Home,
  BedDouble,
  UtensilsCrossed,
  CalendarClock,
} from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { FeesStructureForm } from '../_components/fees-structure-form';
import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/lib/utils';
import toast from 'react-hot-toast';
import type {
  AdmissionFeeStructure,
  AdmissionFeeStructureItem,
  AdmissionFeeStructureWithItems,
  FeeItemAppliesTo,
  FeeStructureMatrixDimensions,
  FeeStructurePackageType,
} from '@/types/admission';
import { useAdmissionStatuses } from '@/hooks/admission/use-admission-statuses';
import {
  FeeItemScheduleSummary,
  summariseSchedules,
} from '../_components/fee-item-schedule-summary';

interface RouteProps {
  params: Promise<{ id: string }>;
}

type DetailRowItem = AdmissionFeeStructureItem & {
  category_name: string | null;
  category_frequency: string | null;
};

type DetailRow = AdmissionFeeStructure & {
  institution_name: string | null;
  degree_name: string | null;
  department_name: string | null;
  programme_name: string | null;
  quota_name: string | null;
  accommodation_name: string | null;
  /**
   * Declared hostel tier. Only hostel structures carry one — a DB trigger
   * rejects it on any other accommodation — so these are null by design on
   * day-scholar rows and the Hostel Categories section stays hidden there.
   */
  hostel_category_name: string | null;
  mess_category_name: string | null;
  community_name: string | null;
  admission_year_name: string | null;
  items: DetailRowItem[];
};

/** "Every year" / "First year only" / "Year 3 only" — never the raw enum. */
function appliesToLabel(
  appliesTo: FeeItemAppliesTo | undefined,
  year: number | null | undefined,
): string {
  if (appliesTo === 'first_year_only') return 'First year only';
  if (appliesTo === 'specific_year') return year != null ? `Year ${year} only` : 'Specific year';
  return 'Every year';
}

function FeeStructureDetailPageContent({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get('edit') === '1';

  const { isSuperAdmin, canPerformAll } = usePermissions();
  const canDelete = isSuperAdmin || canPerformAll('admission_fees', ['delete']);

  const [structure, setStructure] = useState<DetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionRunning, setActionRunning] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    FeeStructureService.getDetailById(id)
      .then((row) => {
        if (!row) setError('Fee structure not found.');
        else setStructure(row);
      })
      .catch((err) => setError(getErrorMessage(err) || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id, refreshTick]);

  const handleChanged = () => {
    setRefreshTick((t) => t + 1);
    // If we're in edit mode (?edit=1), drop the query and return to the
    // read-only view after a successful save. Without this the admin stays
    // in the form which is confusing — the toast already confirms the save.
    if (isEditMode) {
      router.push(`/admission/settings/fees-structure/${id}`);
    }
  };

  const handleArchive = async () => {
    if (!structure) return;
    setActionRunning(true);
    try {
      await FeeStructureService.archive(structure.id);
      toast.success('Fee structure archived');
      handleChanged();
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Archive failed');
    } finally {
      setActionRunning(false);
      setConfirmArchive(false);
    }
  };

  const handleActivate = async () => {
    if (!structure) return;
    setActionRunning(true);
    try {
      await FeeStructureService.activate(structure.id);
      toast.success('Fee structure activated');
      handleChanged();
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Activate failed');
    } finally {
      setActionRunning(false);
    }
  };

  const handleDelete = async () => {
    if (!structure) return;
    setActionRunning(true);
    try {
      await FeeStructureService.delete(structure.id);
      toast.success(`Deleted "${structure.name}"`);
      router.push('/admission/settings/fees-structure');
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Delete failed');
      setActionRunning(false);
      setConfirmDelete(false);
    }
  };

  const dims:
    | (Partial<FeeStructureMatrixDimensions> & { community_category_id?: string })
    | null = structure
    ? {
        institution_id: structure.institution_id,
        degree_id: structure.degree_id,
        department_id: structure.department_id,
        programme_id: structure.programme_id,
        quota_id: structure.quota_id,
        // Leaf-community hint: pick the first community linked to this
        // structure so the form's findByDimensions lookup resolves to this
        // exact row. The form's editor then surfaces the full community list
        // for the operator to edit.
        community_category_id: structure.community_category_ids?.[0],
        admission_year_id: structure.admission_year_id,
        gender: structure.gender ?? undefined,
        // Include accommodation so the dims-based findByDimensions path (used
        // when no structureId is supplied) can still resolve an
        // accommodation-specific structure instead of only NULL-accommodation ones.
        accommodation_type_id: structure.accommodation_type_id ?? undefined,
      }
    : null;

  const grandTotal = structure?.items.reduce((s, it) => s + Number(it.amount || 0), 0) ?? 0;

  // Billing schedule roll-up. Counts what the page previously could not show at
  // all: how many due dates this structure actually produces, and how many of
  // them move the learner up the lifecycle.
  const scheduleStats = summariseSchedules(structure?.items ?? []);

  // Lifecycle status labels straight from Stages & Statuses, so a renamed
  // status reads correctly here instead of showing the raw enum code.
  const { data: learnerStatuses } = useAdmissionStatuses('learner', { activeOnly: false });
  const statusLabels = Object.fromEntries(
    (learnerStatuses ?? []).map((st) => [st.code, st.label]),
  );

  const defaultOffsetDays = structure?.default_due_offset_days ?? 30;

  // Is this a HOSTEL structure (i.e. should the Hostel Categories section show)?
  // A set category is proof on its own — trg_fee_structure_hostel_categories_guard
  // rejects one on any non-hostel structure. The accommodation-name check covers
  // the only case where both are null yet it IS hostel: a draft awaiting its tier.
  const isHostelStructure =
    !!structure &&
    (!!structure.hostel_category_id ||
      !!structure.mess_category_id ||
      (structure.accommodation_name ?? '').toLowerCase().includes('hostel'));

  return (
    <PermissionGuard module="admission.settings" action="view">
      <ContentLayout title={structure?.name ?? 'Fee Structure'}>
        <div className="space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link href="/">Dashboard</Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link href="/admission/dashboard">Admission</Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link href="/admission/settings">Settings</Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/admission/settings/fees-structure">Fee Structures</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{structure?.name ?? 'Detail'}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="border border-destructive/50 bg-destructive/5 rounded-md p-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link href="/admission/settings/fees-structure">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back to list
                </Link>
              </Button>
            </div>
          )}

          {structure && !loading && !error && dims && (
            <>
              {/* Header — name + status + action buttons */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-bold">{structure.name}</h1>
                    <StatusBadge status={structure.status} />
                    <PackageTypeBadge packageType={structure.package_type} />
                    <EffectivePeriodBadge
                      from={structure.effective_from}
                      to={structure.effective_to}
                    />
                  </div>
                  {structure.notes && (
                    <p className="text-sm text-muted-foreground max-w-2xl">{structure.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {!isEditMode && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() =>
                        router.push(`/admission/settings/fees-structure/${id}?edit=1`)
                      }
                    >
                      <Pencil className="h-4 w-4 mr-1" /> Edit
                    </Button>
                  )}
                  {isEditMode && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/admission/settings/fees-structure/${id}`)}
                    >
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                  )}
                  {structure.status === 'archived' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleActivate}
                      disabled={actionRunning}
                    >
                      {actionRunning ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-1" />
                      )}
                      Activate
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmArchive(true)}
                      disabled={actionRunning}
                    >
                      <Archive className="h-4 w-4 mr-1" /> Archive
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                      disabled={actionRunning}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  )}
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/admission/settings/fees-structure">
                      <ArrowLeft className="h-4 w-4 mr-1" /> Back
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Matrix Dimensions — 8 cards in a 4×2 grid.
               *  Rendered ONLY in view mode; edit mode shows the editable
               *  selector inside the form to avoid two competing displays. */}
              {!isEditMode && (
              <section>
                <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  Matrix Dimensions
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <DimCard
                    icon={<Building2 className="h-4 w-4" />}
                    label="Institution"
                    name={structure.institution_name}
                    id={structure.institution_id}
                  />
                  <DimCard
                    icon={<GraduationCap className="h-4 w-4" />}
                    label="Degree"
                    name={structure.degree_name}
                    id={structure.degree_id}
                  />
                  <DimCard
                    icon={<Network className="h-4 w-4" />}
                    label="Department"
                    name={structure.department_name}
                    id={structure.department_id}
                  />
                  <DimCard
                    icon={<BookOpen className="h-4 w-4" />}
                    label="Programme"
                    name={structure.programme_name}
                    id={structure.programme_id}
                  />
                  <DimCard
                    icon={<Calendar className="h-4 w-4" />}
                    label="Admission Year"
                    name={structure.admission_year_name}
                    id={structure.admission_year_id}
                  />
                  <DimCard
                    icon={<Tag className="h-4 w-4" />}
                    label="Quota"
                    name={structure.quota_name}
                    id={structure.quota_id}
                  />
                  <DimCard
                    icon={<Users className="h-4 w-4" />}
                    label={
                      structure.community_category_ids.length > 1
                        ? `Communities (${structure.community_category_ids.length})`
                        : 'Community'
                    }
                    name={structure.community_name}
                    // Show first id when one community; for multi, omit the
                    // single-id badge and let the joined `community_name`
                    // string carry the comma-separated list.
                    id={
                      structure.community_category_ids.length === 1
                        ? structure.community_category_ids[0]
                        : ''
                    }
                  />
                  <DimCard
                    icon={<UserCircle className="h-4 w-4" />}
                    label="Gender"
                    name={structure.gender ?? 'Any Gender'}
                    id={structure.gender ? '' : 'applies to all'}
                  />
                  <DimCard
                    icon={<Home className="h-4 w-4" />}
                    label="Accommodation"
                    name={structure.accommodation_name ?? 'Any Accommodation'}
                    id={structure.accommodation_type_id ? '' : 'applies to all'}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Click <em>Edit</em> to change any dimension. The 7 dimensions plus the
                  community list form the structure&apos;s identity — saving in a way that
                  conflicts with another active structure&apos;s coverage will be rejected.
                </p>
              </section>
              )}

              {/* Hostel Categories — HOSTEL structures only.
               *  Deliberately its own section rather than two more DimCards:
               *  the tier is an attribute of the package, not a matching
               *  dimension, so it plays no part in resolving a learner to this
               *  structure (same reasoning that keeps package_type out of the
               *  grid above). It is also absent on the 125 day-scholar
               *  structures, which is why it is not a list-table column. */}
              {!isEditMode && isHostelStructure && (
              <section>
                <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  Hostel Categories
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <DimCard
                    icon={<BedDouble className="h-4 w-4" />}
                    label="Room Category"
                    name={structure.hostel_category_name}
                    id={structure.hostel_category_id ?? ''}
                  />
                  <DimCard
                    icon={<UtensilsCrossed className="h-4 w-4" />}
                    label="Mess Category"
                    name={structure.mess_category_name}
                    id={structure.mess_category_id ?? ''}
                  />
                </div>
                {(!structure.hostel_category_name || !structure.mess_category_name) && (
                  <p className="text-xs text-amber-600 mt-3">
                    Both categories are required before this structure can be
                    activated. Click <em>Edit</em> to set them.
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  The room and mess tier this package buys. Categories apply to both
                  genders — each learner resolves to their own gender&apos;s variant of
                  the tier.
                </p>
              </section>
              )}

              {/* Mode-dependent body */}
              {isEditMode ? (
                <section>
                  <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                    Edit
                  </h2>
                  <div className="border rounded-md p-4 bg-card">
                    {/* Pass the id so the form loads THIS exact structure by id
                        (incl. its accommodation + non-active status) instead of
                        re-resolving it from dims via findByDimensions, which
                        silently dropped the existing items. */}
                    <FeesStructureForm dims={dims} structureId={id} onChanged={handleChanged} />
                  </div>
                </section>
              ) : (
                <>
                  {/* Items table — view mode */}
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Fee Items
                      </h2>
                      <Badge variant="outline" className="font-normal">
                        <Hash className="h-3 w-3 mr-1" />
                        {structure.items.length} item{structure.items.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>

                    {structure.items.length === 0 ? (
                      <div className="border border-dashed rounded-md p-8 text-center text-sm text-muted-foreground">
                        No fee items configured for this structure.
                        <Button asChild variant="link" size="sm" className="ml-1">
                          <Link href={`/admission/settings/fees-structure/${id}?edit=1`}>
                            Edit to add items
                          </Link>
                        </Button>
                      </div>
                    ) : (
                      <div className="border rounded-md divide-y bg-card">
                        {structure.items.map((it) => (
                          <div key={it.id} className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <Receipt className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                <div className="min-w-0 space-y-1">
                                  <div className="text-sm font-medium truncate">
                                    {it.category_name ?? 'Unknown category'}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {it.category_frequency && (
                                      <span className="text-xs text-muted-foreground">
                                        {it.category_frequency}
                                        {it.is_optional ? ' · optional' : ''}
                                      </span>
                                    )}
                                    {/* Applicability was configurable since
                                        20260313 but never rendered here, so a
                                        first-year-only fee was indistinguishable
                                        from an every-year one. */}
                                    <Badge variant="outline" className="font-normal">
                                      {appliesToLabel(it.applies_to, it.applies_year_of_study)}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                              <div className="text-base font-semibold tabular-nums shrink-0">
                                ₹{Number(it.amount).toLocaleString('en-IN')}
                              </div>
                            </div>
                            <div className="pl-7">
                              <FeeItemScheduleSummary
                                item={it}
                                defaultOffsetDays={defaultOffsetDays}
                                statusLabels={statusLabels}
                              />
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between p-3 bg-muted/30">
                          <div className="text-sm font-medium">Total</div>
                          <div className="text-lg font-bold tabular-nums">
                            ₹{grandTotal.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Audit footer — structured cards with icons + properly cased status */}
                  <section>
                    <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                      Status & History
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      {/* Status — shown as a colored card with the same badge as the header */}
                      <div className="rounded-md border bg-card p-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Activity className="h-4 w-4" />
                          <span>Status</span>
                        </div>
                        <StatusBadge status={structure.status} />
                        <p className="text-xs text-muted-foreground">
                          {structure.status === 'active'
                            ? 'In use for new enquiry resolutions.'
                            : structure.status === 'draft'
                            ? 'Not yet used — finish configuring then activate.'
                            : 'Archived — kept for audit; not used for new resolutions.'}
                        </p>
                      </div>

                      {/* Items count — shown with hash icon and grand total */}
                      <div className="rounded-md border bg-card p-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Hash className="h-4 w-4" />
                          <span>Line items</span>
                        </div>
                        <div className="text-2xl font-bold tabular-nums">
                          {structure.items.length}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Total ₹{grandTotal.toLocaleString('en-IN')}
                        </p>
                      </div>

                      {/* Billing schedule — how many bills this structure will
                          actually raise, and how many of them move the learner
                          up the lifecycle. Neither was visible anywhere before. */}
                      <div className="rounded-md border bg-card p-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <CalendarClock className="h-4 w-4" />
                          <span>Billing schedule</span>
                        </div>
                        <div className="text-2xl font-bold tabular-nums">
                          {scheduleStats.instalments}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          due date{scheduleStats.instalments === 1 ? '' : 's'} across{' '}
                          {structure.items.length} item
                          {structure.items.length === 1 ? '' : 's'}
                          {scheduleStats.splitItems > 0
                            ? ` · ${scheduleStats.splitItems} split`
                            : ''}
                          {scheduleStats.statusRules > 0
                            ? ` · ${scheduleStats.statusRules} status rule${scheduleStats.statusRules === 1 ? '' : 's'}`
                            : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {scheduleStats.customDates === 0
                            ? `No per-item dates set — everything falls due ${defaultOffsetDays} days after admission.`
                            : `Structure default: +${defaultOffsetDays} days for items with no date of their own.`}
                        </p>
                      </div>

                      {/* Created — date only, dim subtitle for relative time */}
                      <div className="rounded-md border bg-card p-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Plus className="h-4 w-4" />
                          <span>Created</span>
                        </div>
                        <div className="text-sm font-medium">
                          {new Date(structure.created_at).toLocaleDateString('en-IN', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(structure.created_at)}
                        </p>
                      </div>

                      {/* Updated — datetime full, with relative time */}
                      <div className="rounded-md border bg-card p-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>Last updated</span>
                        </div>
                        <div
                          className="text-sm font-medium"
                          title={new Date(structure.updated_at).toLocaleString()}
                        >
                          {new Date(structure.updated_at).toLocaleDateString('en-IN', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(structure.updated_at)}
                        </p>
                      </div>
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </div>

        <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive this fee structure?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{structure?.name}</strong> will be archived and no longer used by new
                enquiry resolutions. Existing learners with snapshotted fee_items keep their
                fees. You can re-activate later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionRunning}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleArchive} disabled={actionRunning}>
                {actionRunning ? 'Archiving…' : 'Archive'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this fee structure?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes <strong>{structure?.name}</strong> and all its line
                items. Existing learners with snapshotted fee_items keep their fees, but the
                structure row itself disappears from history.{' '}
                <strong>Cannot be undone.</strong> If you only want to stop using this
                structure for new enquiries, choose <em>Archive</em> instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionRunning}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={actionRunning}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {actionRunning ? 'Deleting…' : 'Delete permanently'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ContentLayout>
    </PermissionGuard>
  );
}

/**
 * Classification badge. Renders nothing when unset — an unclassified
 * structure is the norm (every structure predating this field), so a
 * permanent "Unclassified" chip would be noise in the header cluster.
 */
function PackageTypeBadge({
  packageType,
}: {
  packageType: FeeStructurePackageType | null;
}) {
  if (!packageType) return null;
  return (
    <Badge variant={packageType === 'package' ? 'secondary' : 'outline'} className="font-normal">
      {packageType === 'package' ? 'Package' : 'Non-Package'}
    </Badge>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'active' | 'archived' }) {
  if (status === 'active') {
    return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">Active</Badge>;
  }
  if (status === 'draft') return <Badge variant="secondary">Draft</Badge>;
  return <Badge variant="outline">Archived</Badge>;
}

function EffectivePeriodBadge({
  from,
  to,
}: {
  from: string | null;
  to: string | null;
}) {
  if (!from && !to) {
    return (
      <Badge variant="outline" className="font-normal">
        <Calendar className="h-3 w-3 mr-1" /> Always applicable
      </Badge>
    );
  }
  const fmt = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString('en-IN', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '∞';
  return (
    <Badge variant="outline" className="font-normal whitespace-nowrap">
      <Calendar className="h-3 w-3 mr-1" />
      {fmt(from)} – {fmt(to)}
    </Badge>
  );
}

function DimCard({
  icon,
  label,
  name,
  id,
}: {
  icon: React.ReactNode;
  label: string;
  name: string | null;
  id: string;
}) {
  return (
    <div className="rounded-md border bg-card p-3 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-medium text-sm">
        {name ?? <span className="text-muted-foreground italic">Unknown</span>}
      </div>
      <div className="text-[10px] text-muted-foreground/70 font-mono truncate" title={id}>
        {id}
      </div>
    </div>
  );
}

/**
 * Renders an ISO timestamp as a friendly relative-time string. Falls back to
 * the absolute date if the value is far in the past (>30 days).
 */
function formatRelativeTime(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) !== 1 ? 's' : ''} ago`;
  return new Date(isoTimestamp).toLocaleDateString('en-IN');
}

export default function FeeStructureDetailPage({ params }: RouteProps) {
  const { id } = use(params);
  return (
    <AdmissionErrorBoundary>
      {/* Suspense boundary required by Next.js 15 because the inner component
          calls useSearchParams() to read the ?edit=1 mode flag. Without this
          wrapper the build errors with "useSearchParams() should be wrapped
          in a suspense boundary". */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <FeeStructureDetailPageContent id={id} />
      </Suspense>
    </AdmissionErrorBoundary>
  );
}
