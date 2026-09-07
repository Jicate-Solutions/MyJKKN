'use client';
// ============================================
// LEARNER EXPORT DIALOG
// ============================================
// Created: 2026-05-27
// Purpose: Column-selective Excel export for learner profiles with active filter summary
// Features: Grouped column checkboxes, Select All/None per group, filter badges,
//           loading state, auto-column-width, client-side xlsx generation
// ============================================

import { useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { DownloadIcon, Loader2 } from 'lucide-react';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import type { LifecycleStatus } from '@/types/learner-profile';
import type { ProfilesSearchParams } from './data-table-schema';

// ============================================
// COLUMN GROUP DEFINITIONS
// ============================================

interface ExportColumn {
  key: string;
  header: string;
}

interface ExportColumnGroup {
  label: string;
  columns: ExportColumn[];
}

const EXPORT_COLUMN_GROUPS: ExportColumnGroup[] = [
  {
    label: 'Basic Details',
    columns: [
      { key: 'first_name', header: 'First Name' },
      { key: 'last_name', header: 'Last Name' },
      { key: 'first_name_tamil', header: 'First Name (Tamil)' },
      { key: 'last_name_tamil', header: 'Last Name (Tamil)' },
      { key: 'date_of_birth', header: 'Date of Birth' },
      { key: 'gender', header: 'Gender' },
      { key: 'religion', header: 'Religion' },
      { key: 'community', header: 'Community' },
      { key: 'caste', header: 'Caste' },
      { key: 'aadhar_number', header: 'Aadhar Number' },
      { key: 'blood_group', header: 'Blood Group' },
      { key: 'abc_id', header: 'ABC ID' },
      { key: 'emis', header: 'EMIS Number' },
      { key: 'umis', header: 'UMIS Number' },
    ],
  },
  {
    label: 'Family Information',
    columns: [
      { key: 'father_name', header: 'Father Name' },
      { key: 'father_occupation', header: 'Father Occupation' },
      { key: 'father_mobile', header: 'Father Mobile' },
      { key: 'mother_name', header: 'Mother Name' },
      { key: 'mother_occupation', header: 'Mother Occupation' },
      { key: 'mother_mobile', header: 'Mother Mobile' },
      { key: 'annual_income', header: 'Annual Income' },
    ],
  },
  {
    label: 'Course Selection',
    columns: [
      { key: 'institution_name', header: 'Institution' },
      { key: 'degree_name', header: 'Degree' },
      { key: 'department_name', header: 'Department' },
      { key: 'program_name', header: 'Program' },
      { key: 'semester_name', header: 'Semester' },
      { key: 'section_name', header: 'Section' },
      { key: 'academic_year_name', header: 'Academic Year' },
      { key: 'admission_year_name', header: 'Admission Year' },
      { key: 'entry_type', header: 'Entry Type' },
      { key: 'regulation_name', header: 'Regulation' },
      { key: 'batch_name', header: 'Batch' },
      { key: 'quota', header: 'Quota' },
    ],
  },
  {
    label: 'Contact Details',
    columns: [
      { key: 'student_mobile', header: 'Student Mobile' },
      { key: 'college_email', header: 'College Email' },
      { key: 'student_email', header: 'Personal Email' },
      { key: 'permanent_address_street', header: 'Street Address' },
      { key: 'permanent_address_taluk', header: 'Taluk' },
      { key: 'permanent_address_district', header: 'District' },
      { key: 'permanent_address_state', header: 'State' },
      { key: 'permanent_address_pin_code', header: 'PIN Code' },
    ],
  },
  {
    label: 'Academic History',
    columns: [
      { key: 'last_school', header: 'Last School' },
      { key: 'board_of_study', header: 'Board of Study' },
      { key: 'tenth_percentage', header: '10th Percentage' },
      { key: 'twelfth_group', header: '12th Group' },
      { key: 'twelfth_percentage', header: '12th Percentage' },
      { key: 'neet_score', header: 'NEET Score' },
      { key: 'medical_cutoff_marks', header: 'Medical Cutoff' },
      { key: 'engineering_cutoff_marks', header: 'Engineering Cutoff' },
      { key: 'scholarship_type', header: 'Scholarship Type' },
    ],
  },
  {
    label: 'Accommodation',
    columns: [
      { key: 'accommodation_type', header: 'Accommodation Type' },
      { key: 'bus_required', header: 'Bus Required' },
    ],
  },
  {
    label: 'System',
    columns: [
      { key: 'roll_number', header: 'Roll Number' },
      { key: 'register_number', header: 'Register Number' },
      { key: 'lifecycle_status', header: 'Status' },
      { key: 'is_profile_complete', header: 'Profile Complete' },
      { key: 'created_at', header: 'Created At' },
    ],
  },
];

const ALL_COLUMNS = EXPORT_COLUMN_GROUPS.flatMap((g) => g.columns);
const TOTAL_COLUMNS = ALL_COLUMNS.length;

// ============================================
// TRANSFORM FUNCTION
// ============================================

function transformLearnerForExport(learner: any): Record<string, any> {
  return {
    // Basic Details
    first_name: learner.first_name || '',
    last_name: learner.last_name || '',
    // Nullable columns — '' rather than null so a blank cell exports blank
    // instead of the literal string "null".
    first_name_tamil: learner.first_name_tamil || '',
    last_name_tamil: learner.last_name_tamil || '',
    date_of_birth: learner.date_of_birth || '',
    gender: learner.gender || '',
    religion: learner.religion || '',
    community: learner.community_ref?.code || '',
    caste: learner.caste_ref?.name || '',
    aadhar_number: learner.aadhar_number || '',
    blood_group: learner.blood_group || '',
    abc_id: learner.abc_id || '',
    emis: learner.emis || '',
    umis: learner.umis || '',
    // Family
    father_name: learner.father_name || '',
    father_occupation: learner.father_occupation || '',
    father_mobile: learner.father_mobile || '',
    mother_name: learner.mother_name || '',
    mother_occupation: learner.mother_occupation || '',
    mother_mobile: learner.mother_mobile || '',
    annual_income: learner.annual_income || '',
    // Course Selection — resolve FK joins
    institution_name: learner.institution?.name || '',
    degree_name: learner.degree?.degree_name || '',
    department_name: learner.department?.department_name || '',
    program_name: learner.program?.program_name || '',
    semester_name: learner.semester?.semester_name || '',
    section_name: learner.section?.section_name || '',
    academic_year_name: learner.academic_year?.academic_year_name || '',
    // Resolved from the joined cohort row, never from admission_year_id — the
    // FK was being written into this column verbatim, so every export carried a
    // UUID under the "Admission Year" header.
    admission_year_name: learner.admission_year_obj?.admission_year_name || '',
    entry_type: learner.entry_type || '',
    regulation_name: learner.regulation
      ? `${learner.regulation.regulation_code} (${learner.regulation.regulation_year})`
      : '',
    batch_name: learner.batch?.batch_name || '',
    quota: learner.quota_ref?.name || '',
    // Contact
    student_mobile: learner.student_mobile || '',
    college_email: learner.college_email || '',
    student_email: learner.student_email || '',
    permanent_address_street: learner.permanent_address_street || '',
    permanent_address_taluk: learner.permanent_address_taluk || '',
    permanent_address_district: learner.permanent_address_district || '',
    permanent_address_state: learner.permanent_address_state || '',
    permanent_address_pin_code: learner.permanent_address_pin_code || '',
    // Academic History — flatten JSONB
    last_school: learner.last_school || '',
    board_of_study: learner.board_of_study || '',
    tenth_percentage: learner.tenth_marks?.percentage || '',
    twelfth_group: learner.twelfth_marks?.group || '',
    twelfth_percentage: learner.twelfth_marks?.percentage || '',
    neet_score: learner.neet_score || '',
    medical_cutoff_marks: learner.medical_cutoff_marks || '',
    engineering_cutoff_marks: learner.engineering_cutoff_marks || '',
    scholarship_type: learner.scholarship_type || '',
    // Accommodation — accommodation_type TEXT retired; read the FK's name.
    accommodation_type: learner.accommodation_ref?.name || '',
    bus_required: learner.bus_required === true ? 'Yes' : learner.bus_required === false ? 'No' : '',
    // System
    roll_number: learner.roll_number || '',
    register_number: learner.register_number || '',
    lifecycle_status: learner.lifecycle_status || '',
    is_profile_complete: learner.is_profile_complete ? 'Yes' : 'No',
    created_at: learner.created_at
      ? new Date(learner.created_at).toLocaleDateString('en-IN')
      : '',
  };
}

// ============================================
// EXCEL DOWNLOAD HELPER
// ============================================

function downloadExcel(
  data: Record<string, any>[],
  selectedColumns: ExportColumn[],
  filename: string
) {
  const wsData = data.map((row) => {
    const obj: Record<string, any> = {};
    selectedColumns.forEach((c) => {
      obj[c.header] = row[c.key] ?? '';
    });
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(wsData);

  // Auto-size columns — min 15, max 40 chars
  ws['!cols'] = selectedColumns.map((c) => ({
    wch: Math.min(40, Math.max(c.header.length + 2, 15)),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Learners');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ============================================
// FILTER BADGE HELPERS
// ============================================

interface FilterBadge {
  label: string;
  value: string;
}

function buildFilterBadges(
  filters: ProfilesSearchParams,
  statusFilter?: LifecycleStatus | LifecycleStatus[]
): FilterBadge[] {
  const badges: FilterBadge[] = [];

  const effectiveStatus = statusFilter || filters.lifecycle_status;
  if (effectiveStatus)
    badges.push({
      label: 'Status',
      // The "All Statuses" tab passes its whole set. Naming the members keeps
      // the badge honest about what the download will contain.
      value: Array.isArray(effectiveStatus)
        ? effectiveStatus.join(', ')
        : effectiveStatus,
    });
  if (filters.institution_id) badges.push({ label: 'Institution', value: 'Filtered' });
  if (filters.degree_id) badges.push({ label: 'Degree', value: 'Filtered' });
  if (filters.department_id) badges.push({ label: 'Department', value: 'Filtered' });
  if (filters.program_id) badges.push({ label: 'Program', value: 'Filtered' });
  if (filters.semester_id) badges.push({ label: 'Semester', value: 'Filtered' });
  if (filters.section_id) badges.push({ label: 'Section', value: 'Filtered' });
  if (filters.academic_year_id) badges.push({ label: 'Academic Year', value: 'Filtered' });
  if (filters.gender) badges.push({ label: 'Gender', value: filters.gender });
  // 'Filtered' rather than the name: this builder is pure and synchronous, and
  // the id→name lookup is an async query. Matches how every other id-valued
  // filter above reports itself.
  if (filters.accommodation_type_id)
    badges.push({ label: 'Accommodation', value: 'Filtered' });
  if (filters.is_profile_complete !== undefined && filters.is_profile_complete !== '')
    badges.push({
      label: 'Profile Complete',
      value: filters.is_profile_complete === 'true' ? 'Yes' : 'No',
    });
  if (filters.search) badges.push({ label: 'Search', value: filters.search });

  return badges;
}

// ============================================
// COMPONENT PROPS
// ============================================

interface LearnerExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ProfilesSearchParams;
  /**
   * Passed from the parent to lock lifecycle_status to the selected tab.
   * Typed as the full LifecycleStatus union rather than a hand-listed subset —
   * the old three-value copy silently excluded 'reserved' and 'admitted' once
   * those became tabs, and it feeds straight into `.eq('lifecycle_status', …)`.
   *
   * An ARRAY on the "All Statuses" tab: the parent maps that tab to the five
   * statuses the page lists (LearnerProfileService applies it with `.in()`),
   * so the download matches the rows on screen instead of every enum label.
   */
  statusFilter?: LifecycleStatus | LifecycleStatus[];
}

// ============================================
// MAIN COMPONENT
// ============================================

export function LearnerExportDialog({
  open,
  onOpenChange,
  filters,
  statusFilter,
}: LearnerExportDialogProps) {
  // All columns selected by default; stored as a Set of column keys
  const allKeys = useMemo(() => new Set(ALL_COLUMNS.map((c) => c.key)), []);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(allKeys);
  const [isExporting, setIsExporting] = useState(false);

  // Reset selections to all-checked whenever dialog reopens
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setSelectedKeys(new Set(ALL_COLUMNS.map((c) => c.key)));
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  // ---- Selection helpers ----

  const toggleColumn = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectGroup = (group: ExportColumnGroup) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      group.columns.forEach((c) => next.add(c.key));
      return next;
    });
  };

  const deselectGroup = (group: ExportColumnGroup) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      group.columns.forEach((c) => next.delete(c.key));
      return next;
    });
  };

  const selectAll = () => setSelectedKeys(new Set(ALL_COLUMNS.map((c) => c.key)));
  const deselectAll = () => setSelectedKeys(new Set());

  // ---- Derived values ----

  const selectedCount = selectedKeys.size;
  const filterBadges = useMemo(
    () => buildFilterBadges(filters, statusFilter),
    [filters, statusFilter]
  );

  // Ordered list of selected columns preserving group/column definition order
  const orderedSelectedColumns = useMemo(
    () => ALL_COLUMNS.filter((c) => selectedKeys.has(c.key)),
    [selectedKeys]
  );

  // ---- Export action ----

  const handleExport = async () => {
    if (selectedCount === 0) {
      toast.error('Please select at least one column to export.');
      return;
    }

    setIsExporting(true);
    const toastId = toast.loading('Fetching data...');

    try {
      const result = await LearnerProfileService.getLearnerProfiles({
        page: 1,
        limit: 10000,
        // The advanced search term the table is currently narrowed by. It was
        // omitted here while every other predicate was forwarded, so exporting
        // during a search silently returned the whole unsearched result set —
        // more rows than the table on screen was showing.
        search: filters.search,
        // Forwarded with the term, never defaulted — see LearnerProfileFilters.
        // The URL carries these as strings; the service takes real booleans.
        search_case_sensitive: filters.search_case_sensitive === 'true',
        search_exact_match: filters.search_exact_match === 'true',
        search_fields: filters.search_fields
          ? filters.search_fields.split(',').map((f) => f.trim()).filter(Boolean)
          : undefined,
        lifecycle_status: (statusFilter ||
          filters.lifecycle_status ||
          undefined) as LifecycleStatus | LifecycleStatus[] | undefined,
        institution_id: filters.institution_id,
        degree_id: filters.degree_id,
        department_id: filters.department_id,
        program_id: filters.program_id,
        semester_id: filters.semester_id,
        section_id: filters.section_id,
        academic_year_id: filters.academic_year_id,
        admission_year: filters.admission_year,
        gender: filters.gender,
        accommodation_type_id: filters.accommodation_type_id,
        is_profile_complete:
          filters.is_profile_complete !== undefined && filters.is_profile_complete !== ''
            ? filters.is_profile_complete === 'true'
            : undefined,
      });

      const rawData = result.data ?? [];

      if (rawData.length === 0) {
        toast.dismiss(toastId);
        toast.error('No learner records found for the current filters.');
        return;
      }

      toast.loading(`Generating Excel for ${rawData.length} records...`, { id: toastId });

      const transformed = rawData.map(transformLearnerForExport);
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `learners-export-${timestamp}`;

      downloadExcel(transformed, orderedSelectedColumns, filename);

      toast.success(
        `Exported ${rawData.length} learner${rawData.length !== 1 ? 's' : ''} (${selectedCount} column${selectedCount !== 1 ? 's' : ''})`,
        { id: toastId }
      );

      onOpenChange(false);
    } catch (error) {
      console.error('[LearnerExportDialog] Export failed:', error);
      toast.error('Export failed. Please try again.', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">
        {/* ---- Header ---- */}
        <DialogHeader className="shrink-0 px-6 pb-3 pt-6">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <DownloadIcon className="h-5 w-5 text-muted-foreground" />
            Export Learner Data
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Select the columns you want to include in the Excel download. Active filters will be
            applied automatically.
          </DialogDescription>
        </DialogHeader>

        <Separator className="shrink-0" />

        {/* ---- Scrollable body ---- */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 px-6 py-4">
            {/* Active Filters Summary */}
            {filterBadges.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Active Filters ({filterBadges.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {filterBadges.map((badge) => (
                    <Badge key={badge.label} variant="secondary" className="text-xs">
                      {badge.label}: {badge.value}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Global select/deselect + counter */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{selectedCount}</span> of{' '}
                <span className="font-semibold text-foreground">{TOTAL_COLUMNS}</span> columns
                selected
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={selectAll}
                  disabled={isExporting}
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={deselectAll}
                  disabled={isExporting}
                >
                  Deselect All
                </Button>
              </div>
            </div>

            <Separator />

            {/* Column Groups */}
            <div className="space-y-5">
              {EXPORT_COLUMN_GROUPS.map((group) => {
                const groupKeys = group.columns.map((c) => c.key);
                const checkedInGroup = groupKeys.filter((k) => selectedKeys.has(k)).length;
                const allGroupChecked = checkedInGroup === group.columns.length;
                const noneGroupChecked = checkedInGroup === 0;

                return (
                  <div key={group.label} className="space-y-2.5">
                    {/* Group header row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{group.label}</span>
                        <Badge
                          variant={allGroupChecked ? 'default' : noneGroupChecked ? 'outline' : 'secondary'}
                          className="h-5 px-1.5 text-xs"
                        >
                          {checkedInGroup}/{group.columns.length}
                        </Badge>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => selectGroup(group)}
                          disabled={isExporting || allGroupChecked}
                          className="text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          All
                        </button>
                        <span className="text-xs text-muted-foreground">/</span>
                        <button
                          type="button"
                          onClick={() => deselectGroup(group)}
                          disabled={isExporting || noneGroupChecked}
                          className="text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          None
                        </button>
                      </div>
                    </div>

                    {/* 2-column checkbox grid */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      {group.columns.map((col) => (
                        <label
                          key={col.key}
                          className="flex cursor-pointer items-center gap-2 text-sm leading-none"
                        >
                          <Checkbox
                            checked={selectedKeys.has(col.key)}
                            onCheckedChange={() => toggleColumn(col.key)}
                            disabled={isExporting}
                            id={`col-${col.key}`}
                            className="h-4 w-4"
                          />
                          <span className="select-none text-sm text-foreground">
                            {col.header}
                          </span>
                        </label>
                      ))}
                    </div>

                    <Separator className="mt-1" />
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollArea>

        {/* ---- Footer ---- */}
        <div className="shrink-0 border-t bg-background px-6 py-4">
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isExporting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting || selectedCount === 0}
              className="min-w-[200px]"
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <DownloadIcon className="mr-2 h-4 w-4" />
                  Download Excel ({selectedCount} col{selectedCount !== 1 ? 's' : ''})
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
