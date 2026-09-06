'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  BookOpen,
  Check,
  X,
  User,
  AlertTriangle,
  Loader2,
  Search,
  UserCheck,
  UserX,
  GraduationCap,
  Building2,
  MapPin
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useAttendanceRoster,
  useConsolidatedAttendance
} from '@/hooks/academic/use-attendance';
import { AttendanceService } from '@/lib/services/academic/attendance-service';
import { CycleCalculationService } from '@/lib/services/academic/cycle-calculation-service';
import { LeaveCalendarService } from '@/lib/services/academic/leave-calendar-service';
import type { LeaveBlockInfo } from '@/types/leaves';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  verifySectionInTimetableScope,
  resolveAttendanceSaveScope
} from '@/lib/utils/academic/attendance-section-scope';
import { narrowRosterToPracticalBatch } from '@/lib/utils/academic/practical-batch-roster';
import type { PracticalBatchRosterResult } from '@/lib/utils/academic/practical-batch-roster';
import { AttendanceSummaryModal } from './components/attendance-summary-modal';
import { FacultySyncIndicator } from '../_components/faculty-sync-indicator';
import { SubdividedAttendanceGrid } from './_components/subdivided-attendance-grid';
import { PracticalAttendanceSelector } from './_components/practical-attendance-selector';
import type { SubdivisionGroup, PeriodMode, PracticalConfig } from '@/types/academics';
import type { AttendanceEditDiff } from '@/types/attendance';
import { cn } from '@/lib/utils';
// Updated: 2026-01-29 - Leave/OnDuty attendance integration
import { LeaveOndutyAttendanceCheckService } from '@/lib/services/academic/leave-onduty-attendance-check-service';
import { StudentLeaveIndicatorCompact } from './_components/student-leave-indicator';
import { ProvisionalLearnerIndicatorCompact } from './_components/provisional-learner-indicator';
import { isProvisionalAttendanceStatus } from '@/lib/constants/provisional-access';
import type { ApprovedLeaveInfo } from '@/lib/services/academic/leave-onduty-attendance-check-service';

export default function AttendanceMarkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const { userProfile, isSuperAdmin } = usePermissions();

  // Get parameters from URL
  const periodId = searchParams.get('periodId');
  const timetableId = searchParams.get('timetableId');
  const sectionId = searchParams.get('sectionId');
  const date = searchParams.get('date');
  const periodName = searchParams.get('periodName');
  const courseName = searchParams.get('courseName');
  const startTime = searchParams.get('startTime');
  const endTime = searchParams.get('endTime');

  // Updated: 2025-10-13 - Get subdivision group parameters from URL
  const isSubdividedFromUrl = searchParams.get('isSubdivided') === 'true';
  const subdivisionGroupOrder = searchParams.get('subdivisionGroupOrder');
  const subdivisionGroupName = searchParams.get('subdivisionGroupName');
  const subdivisionStudentIds = searchParams.get('subdivisionStudentIds');
  const subdivisionStaffIds = searchParams.get('subdivisionStaffIds');
  const subdivisionLabRoom = searchParams.get('subdivisionLabRoom');

  const [students, setStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [attendanceData, setAttendanceData] = useState<
    Record<string, 'Present' | 'Absent'>
  >({});
  const [contextData, setContextData] = useState<any>(null);
  const [loadingContext, setLoadingContext] = useState(true);

  // HOD edit-gate variables (Added: 2026-03-20 — extend edit to dept-scoped HOD)
  const isHOD = profile?.role === 'hod'
  const isHODDepartmentMatch =
    isHOD &&
    !!profile?.department_id &&
    profile.department_id === contextData?.department_id &&
    profile.institution_id === contextData?.institution_id
  const canEditAttendance = isSuperAdmin || isHODDepartmentMatch

  const [existingAttendance, setExistingAttendance] = useState<any>(null);
  const [loadingExistingAttendance, setLoadingExistingAttendance] =
    useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  // Snapshot of attendance state at the moment edit mode is entered (Added: 2026-03-20)
  const initialEditSnapshot = useRef<Record<string, string>>({})
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  // Computed diff passed to summary modal for edit confirmation (Added: 2026-03-20)
  const [editDiff, setEditDiff] = useState<AttendanceEditDiff[]>([]);
  const [assignedStaff, setAssignedStaff] = useState<any[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  // State for subdivided slot detection (Updated: 2025-10-11)
  const [isSubdividedSlot, setIsSubdividedSlot] = useState(false);
  const [subdivisionGroups, setSubdivisionGroups] = useState<
    SubdivisionGroup[]
  >([]);
  const [subdivisionType, setSubdivisionType] = useState<string>('practical');

  // NEW: Dual-Mode Period System state (Updated: 2025-10-25)
  const [periodMode, setPeriodMode] = useState<PeriodMode>('standard');
  const [practicalConfig, setPracticalConfig] = useState<PracticalConfig | null>(null);
  const [practicalSelection, setPracticalSelection] = useState<{
    batch_id: string;
    batch_name: string;
    course_id: string;
    course_name: string;
    course_code?: string;
    section_ids: string[];
    // Added: 2026-08-17 (BUG-005826) - learners named by the batch, when it is
    // a subset of a section (allied / generic elective) rather than whole
    // sections. Empty for section-assigned batches.
    student_ids?: string[];
    staff?: { id: string; first_name: string; last_name: string; email?: string }[];
  } | null>(null);

  // Updated: 2025-01-16 - Leave block checking state
  const [leaveBlockInfo, setLeaveBlockInfo] = useState<LeaveBlockInfo | null>(null);
  const [checkingLeave, setCheckingLeave] = useState(false);

  // Updated: 2026-01-29 - Approved leave/onduty checking state
  const [approvedLeaveMap, setApprovedLeaveMap] = useState<Map<string, ApprovedLeaveInfo>>(new Map());
  const [loadingApprovedLeave, setLoadingApprovedLeave] = useState(false);

  const { saveConsolidatedAttendance } = useConsolidatedAttendance();

  // Filter students based on search
  const filteredStudents = useMemo(() => {
    if (!searchTerm) return students;

    const term = searchTerm.toLowerCase();
    return students.filter(
      (student) =>
        student.first_name?.toLowerCase().includes(term) ||
        student.last_name?.toLowerCase().includes(term) ||
        student.roll_number?.toLowerCase().includes(term) ||
        student.student_email?.toLowerCase().includes(term)
    );
  }, [students, searchTerm]);

  // Updated: 2026-03-13 - Filter subdivision groups to only show the faculty's assigned group
  // When navigating for a specific group (e.g., _group_1), only show that group
  // Admins/HODs viewing all groups will not have subdivisionGroupOrder set
  const activeSubdivisionGroups = useMemo(() => {
    if (!isSubdividedFromUrl || !subdivisionGroupOrder) {
      return subdivisionGroups;
    }
    const targetOrder = parseInt(subdivisionGroupOrder, 10);
    const filtered = subdivisionGroups.filter(
      (g) => g.group_order === targetOrder
    );
    return filtered.length > 0 ? filtered : subdivisionGroups;
  }, [subdivisionGroups, isSubdividedFromUrl, subdivisionGroupOrder]);

  // Calculate stats
  const presentCount = Object.values(attendanceData).filter(
    (status) => status === 'Present'
  ).length;
  const absentCount = Object.values(attendanceData).filter(
    (status) => status === 'Absent'
  ).length;
  const attendancePercentage =
    students.length > 0
      ? Math.round((presentCount / students.length) * 100)
      : 0;

  // Load context data from timetable and resolve all hierarchy
  useEffect(() => {
    const loadContextData = async () => {
      if (!timetableId) {
        setLoadingContext(false);
        toast.error('Missing required parameter: timetable ID');
        return;
      }

      // For non-super admins, we need institution_id from profile
      if (!isSuperAdmin && !profile?.institution_id) {
        // Don't set loading to false here, let the effect retry
        return;
      }

      try {
        setLoadingContext(true);
        const { createClientSupabaseClient } = await import(
          '@/lib/supabase/client'
        );
        const supabase = createClientSupabaseClient();

        // Build query
        // Updated: 2025-10-09 - Added timetable_format to query for batch timetable support
        // Updated: 2026-03-10 - Include semesters join to eliminate separate semester query
        const query = supabase
          .from('timetables')
          .select(
            `
            id,
            timetable_name,
            timetable_type,
            timetable_format,
            institution_id,
            academic_year_id,
            degree_id,
            program_id,
            department_id,
            semester_id,
            section_id,
            timetable_data,
            academic_years(id, academic_year_name),
            degrees(id, degree_name),
            programs(id, program_name),
            departments(id, department_name),
            semesters(id, semester_name)
          `
          )
          .eq('id', timetableId);

        // Updated: 2026-07-06 (cross-institution teaching) - Do NOT filter the
        // timetable load by profile.institution_id. A visiting staff (assigned
        // via staff planning to a sister institution's timetable) belongs to a
        // DIFFERENT institution than the timetable, and this filter made the
        // load fail with "Failed to load class information". Row access is
        // still gated by timetables RLS, and save authorization is enforced
        // separately by validateStaffAssignment.

        // Fetch timetable data with all related information
        const { data: timetableData, error: timetableError } =
          await query.single();

        if (timetableError || !timetableData) {
          logger.error('academic/attendance/mark', 'Failed to fetch timetable data', timetableError);
          toast.error(
            timetableError?.message || 'Failed to load class information'
          );
          setLoadingContext(false);
          return;
        }

        // Type assertion for timetableData to ensure TypeScript knows the shape
        const timetable = timetableData as {
          id: string;
          institution_id: string;
          section_id: string | null;
          semester_id: string | null;
          timetable_type: string;
          timetable_data: unknown;
          academic_year_id: string | null;
          degree_id: string | null;
          program_id: string | null;
          department_id: string | null;
          [key: string]: unknown;
        };

        // Extract section information from timetable data
        // Updated: 2025-10-08 - Fixed priority to use URL sectionId first for multi-section support
        let resolvedSectionId = sectionId;
        let sectionData: { id: string; section_name: string; degree_id: string; program_id: string; department_id: string; semester_id: string } | null = null;

        // Priority 1: Use sectionId from URL (user's selection when clicking "Mark Attendance")
        // This is CRITICAL for multi-section slots where user selects which section to mark
        if (resolvedSectionId) {
          // Check if provided section ID is a UUID or name
          const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

          if (uuidRegex.test(resolvedSectionId)) {
            // It's already a UUID, fetch section data
            const { data: sections, error: sectionError } = await supabase
              .from('sections')
              .select(
                'id, section_name, degree_id, program_id, department_id, semester_id'
              )
              .eq('id', resolvedSectionId)
              .single();

            if (!sectionError && sections) {
              sectionData = sections;
            } else {
              // Added: BUG-003163 - A URL sectionId that doesn't resolve to a real
              // `sections` row (stale/deleted section, or one from an unrelated
              // search context) used to be kept verbatim in `resolvedSectionId`
              // and sent straight to fn_attendance_roster as the roster scope,
              // matching zero rows and rendering "No students found" with no
              // indication of why. Resetting it lets the Priority 2 fallback
              // (timetable.section_id) or the slot's own section_ids take over.
              logger.error('academic/attendance/mark', 'Failed to fetch section data for URL UUID', sectionError);
              resolvedSectionId = null;
            }
          } else {
            // It's a name, resolve to UUID
            const { data: sections, error: sectionError } = await supabase
              .from('sections')
              .select(
                'id, section_name, degree_id, program_id, department_id, semester_id'
              )
              .eq('institution_id', timetable.institution_id)
              .eq('section_name', resolvedSectionId)
              .eq('is_active', true)
              .maybeSingle();

            if (!sectionError && sections) {
              const sectionResult = sections as { id: string; section_name: string; degree_id: string; program_id: string; department_id: string; semester_id: string };
              resolvedSectionId = sectionResult.id;
              sectionData = sectionResult;
            } else {
              logger.error('academic/attendance/mark', 'Failed to resolve section name from URL', sectionError);
            }
          }
        }

        // Added: 2026-08-06 - Refuse a URL section that belongs to a different
        // semester than the timetable being marked. The `sectionId` query param
        // is chosen upstream by the filter panel (attendance/page.tsx prefers
        // searchContext.section_id over the slot's own sections), so when a slot
        // carries no section of its own — as every practical slot in "II ECE
        // 2026" did — whatever the user last had selected became the roster
        // scope unchallenged. That is how a Semester V section listed the third
        // years on a Semester III SDC lab. It cannot be caught downstream:
        // fn_attendance_roster treats section as authoritative and ignores the
        // semester param entirely once section ids are supplied, so the wrong
        // section yields a complete, plausible, wrong roster. Dropping it here
        // lets the slot's own section_ids (or the timetable's semester scope)
        // take over, which is the answer the timetable actually encodes.
        if (sectionData) {
          const verdict = verifySectionInTimetableScope(sectionData, timetable);
          if (!verdict.accepted) {
            logger.error(
              'academic/attendance/mark',
              'Discarding out-of-scope section from URL',
              {
                reason: verdict.reason,
                sectionId: sectionData.id,
                sectionSemesterId: sectionData.semester_id,
                timetableId,
                timetableSemesterId: timetable.semester_id
              }
            );
            toast.error(
              'The selected section belongs to a different semester than this timetable and was ignored.'
            );
            sectionData = null;
            resolvedSectionId = null;
          }
        }

        // Priority 2: Fallback to timetable.section_id (ONLY for section-level timetables)
        // Updated: 2025-10-08 - Don't use timetable.section_id for semester-level timetables
        if (
          !sectionData &&
          timetable.section_id &&
          timetable.timetable_type === 'section'
        ) {
          // Fetch section data using the UUID directly
          const { data: sectionFromDb, error: countError } = await supabase
            .from('sections')
            .select(
              'id, section_name, degree_id, program_id, department_id, semester_id'
            )
            .eq('id', timetable.section_id)
            .single();

          if (!countError && sectionFromDb) {
            resolvedSectionId = timetable.section_id;
            sectionData = sectionFromDb;
          } else {
            logger.error('academic/attendance/mark', 'Failed to fetch section data from timetable fallback', countError);
          }
        } else if (
          !sectionData &&
          timetable.timetable_type === 'semester'
        ) {
        }

        // Updated: 2025-10-08 - For semester-level multi-section slots, resolvedSectionId may be undefined
        // This is OK - we'll use section_ids from the slot instead
        if (!resolvedSectionId && timetable.timetable_type === 'section') {
          logger.error('academic/attendance/mark', 'Unable to resolve section information for section-level timetable');
          toast.error(
            `Unable to resolve section information. Section ID: ${
              timetable.section_id || sectionId || 'Unknown'
            }`
          );
          setLoadingContext(false);
          return;
        }

        // Updated: 2026-03-10 - Semester name now comes from timetable join (no separate query)
        const semesterId = sectionData?.semester_id || timetable.semester_id;
        let semesterName: string | null = (timetableData as any).semesters?.semester_name || null;

        // If section has a different semester_id than the timetable, we may need a separate fetch
        if (!semesterName && sectionData?.semester_id && sectionData.semester_id !== timetable.semester_id) {
          try {
            const { data: semData } = await supabase
              .from('semesters')
              .select('semester_name')
              .eq('id', sectionData.semester_id)
              .single();
            if (semData) semesterName = semData.semester_name;
          } catch {
            // Non-critical - continue with null
          }
        }

        if (!semesterName && !semesterId) {
          logger.warn('academic/attendance/mark', 'No semester_id found in section or timetable data');
        }

        // Updated: 2025-10-08 - Extract section_ids from timetable slot for multi-section support
        // Check if this is a multi-section slot by looking at the timetable_data
        let slotSectionIds: string[] = [];
        let slotSections: any[] = [];

        if (periodId && timetable.timetable_data) {
          // Parse timetable_data to find the specific period's section_ids
          const timetableSlots = timetable.timetable_data as Record<string, Record<string, any>>;

          // Updated: 2025-10-08 - The periodId is the slot_id, not the key in timetable_data
          // Updated: 2026-03-10 - Strip _group_X suffix for subdivided periods (matches logic at line ~927)
          // Subdivision periods have IDs like "original-slot-id_group_1"
          let searchPeriodId = periodId;
          if (periodId && periodId.includes('_group_')) {
            searchPeriodId = periodId.split('_group_')[0];
          }

          // We need to search through all slots to find where slot.slot_id matches
          for (const day in timetableSlots) {
            const daySlots = timetableSlots[day];
            if (daySlots) {
              // Search through all period keys in this day
              for (const periodKey in daySlots) {
                const slot = daySlots[periodKey];
                // Match by slot_id - try both original and grouped periodId
                if (slot && (slot.slot_id === periodId || slot.slot_id === searchPeriodId)) {
                  // NEW: Check if this is a subdivided slot (Updated: 2025-10-11)
                  // Updated: 2026-03-13 - Also detect combined slots (is_combined=true) with sub_slots
                  // even when is_subdivided is false, since the real data lives in sub_slots
                  const hasSubSlots = slot.sub_slots && Array.isArray(slot.sub_slots) && slot.sub_slots.length > 0;
                  if (
                    hasSubSlots &&
                    (slot.is_subdivided || slot.is_combined || isSubdividedFromUrl)
                  ) {
                    // Extract subdivision groups from sub_slots
                    const groups: SubdivisionGroup[] = slot.sub_slots.map(
                      (subSlot: any) => ({
                        group_order: subSlot.sub_slot_order || 1,
                        group_name:
                          subSlot.group_name ||
                          `Group ${subSlot.sub_slot_order}`,
                        course_id: subSlot.course_id || slot.course_id,
                        staff_ids: subSlot.staff_ids || [],
                        student_ids: subSlot.student_ids || [],
                        lab_room: subSlot.lab_room,
                        max_capacity: subSlot.max_capacity
                      })
                    );

                    setIsSubdividedSlot(true);
                    setSubdivisionGroups(groups);
                    setSubdivisionType(slot.subdivision_type || 'practical');
                  } else {
                    setIsSubdividedSlot(false);
                    setSubdivisionGroups([]);
                  }

                  // NEW: Check if this is a practical period (Updated: 2025-10-25)
                  // Updated: 2026-02-06 - Enrich practical_config with course details from DB
                  if (slot.period_mode === 'practical' && slot.practical_config) {
                    setPeriodMode('practical');

                    // Enrich available_courses with full course details (raw data may only have IDs)
                    const config = { ...slot.practical_config };
                    if (config.available_courses && Array.isArray(config.available_courses)) {
                      const courseIds = config.available_courses
                        .map((c: any) => typeof c === 'string' ? c : c.course_id)
                        .filter(Boolean);

                      if (courseIds.length > 0) {
                        const needsEnrichment = config.available_courses.some(
                          (c: any) => typeof c === 'string' || !c.course_name
                        );

                        if (needsEnrichment) {
                          try {
                            const { data: coursesData } = await supabase
                              .from('courses')
                              .select('id, course_name, course_code')
                              .in('id', courseIds);

                            if (coursesData && coursesData.length > 0) {
                              const coursesMap = new Map(
                                coursesData.map((c: any) => [c.id, c])
                              );
                              config.available_courses = courseIds.map((id: string) => {
                                const course = coursesMap.get(id);
                                return course
                                  ? { course_id: id, course_name: course.course_name, course_code: course.course_code }
                                  : { course_id: id, course_name: id, course_code: '' };
                              });
                            }
                          } catch (enrichError) {
                            logger.warn('academic/attendance/mark', 'Could not enrich practical courses', enrichError);
                          }
                        }
                      }
                    }

                    setPracticalConfig(config);
                  } else {
                    setPeriodMode('standard');
                    setPracticalConfig(null);
                  }

                  // Updated: 2026-03-13 - Extract section_ids from parent slot OR from sub_slots
                  // Combined/subdivided slots often have empty parent section_ids but populated sub_slot section_ids
                  // Updated: 2026-08-02 (BUG-003160) - Only fall back to a sub_slot's section_ids when the
                  // slot is ACTUALLY subdivided/combined (same gate as isSubdividedSlot above). A slot that
                  // still carries a stale sub_slots array from a past edit but is no longer flagged
                  // is_subdivided/is_combined was having its roster silently narrowed to one sub_slot's
                  // (e.g. group 1's) small section instead of the real ~100-student section — the page
                  // rendered as a normal (non-grouped) roster but showed only that sub_slot's few students.
                  let foundSectionIds: string[] = [];

                  if (slot.section_ids && Array.isArray(slot.section_ids) && slot.section_ids.length > 0) {
                    foundSectionIds = slot.section_ids;
                  } else if (hasSubSlots && (slot.is_subdivided || slot.is_combined || isSubdividedFromUrl)) {
                    // Fallback: get section_ids from the matching sub_slot (by group order) or first sub_slot
                    const targetGroupOrder = subdivisionGroupOrder ? parseInt(subdivisionGroupOrder, 10) : 1;
                    const matchedSubSlot = slot.sub_slots.find(
                      (ss: any) => ss.sub_slot_order === targetGroupOrder
                    ) || slot.sub_slots[0];

                    if (matchedSubSlot?.section_ids && Array.isArray(matchedSubSlot.section_ids) && matchedSubSlot.section_ids.length > 0) {
                      foundSectionIds = matchedSubSlot.section_ids;
                    }
                  }

                  if (foundSectionIds.length > 0) {
                    slotSectionIds = foundSectionIds;

                    // Fetch all section details for display
                    const { data: sectionsData, error: sectionsError } =
                      await supabase
                        .from('sections')
                        .select('id, section_name')
                        .in('id', slotSectionIds)
                        .order('section_name');

                    if (!sectionsError && sectionsData) {
                      slotSections = sectionsData;
                    } else {
                      logger.error('academic/attendance/mark', 'Failed to load section details', sectionsError);
                    }
                    break;
                  } else {
                    logger.warn('academic/attendance/mark', 'Slot has no section_ids in parent or sub_slots', { slotId: slot.slot_id });
                  }
                }
              }
            }
            // Break outer loop if found
            if (slotSectionIds.length > 0) break;
          }

          if (slotSectionIds.length === 0) {
            logger.warn('academic/attendance/mark', 'No section_ids found in any slot for period', { periodId });
          }
        }

        // Build complete context similar to search classes
        // Use timetable's institution_id for consistency
        const context = {
          institution_id:
            timetable.institution_id || profile?.institution_id,
          academic_year_id: timetable.academic_year_id,
          // Updated: 2026-07-22 - Prefer the resolved section's own degree_id/program_id
          // (like semester_id already does below), not the parent timetable's. A section
          // whose degree/program has since diverged from its timetable's stored values
          // matched on section_id but was filtered to zero students by fn_attendance_roster's
          // hard degree_id/program_id AND filters (BUG-004166, BUG-004167).
          degree_id: sectionData?.degree_id || timetable.degree_id,
          program_id: sectionData?.program_id || timetable.program_id,
          department_id: timetable.department_id,
          semester_id: sectionData?.semester_id || timetable.semester_id,
          section_id: resolvedSectionId,
          // Updated: 2025-10-08 - Properly handle section_ids for multi-section slots
          section_ids:
            slotSectionIds.length > 0
              ? slotSectionIds
              : resolvedSectionId
              ? [resolvedSectionId]
              : [], // Empty array for multi-section slots without resolved section
          timetable_id: timetableId,
          timetable_data: timetableData,
          timetable_type: timetable.timetable_type || 'section', // Track timetable type
          section_data: sectionData,
          slot_sections: slotSections, // All sections for this slot
          academic_year_name: (timetableData as any).academic_years
            ?.academic_year_name,
          degree_name: (timetableData as any).degrees?.degree_name,
          program_name: (timetableData as any).programs?.program_name,
          department_name: (timetableData as any).departments?.department_name,
          section_name:
            sectionData?.section_name ||
            (slotSections.length > 0
              ? `${slotSections.length} Sections`
              : 'Unknown Section'),
          semester_name: semesterName || 'Unknown Semester'
        };

        setContextData(context);
      } catch (error) {
        logger.error('academic/attendance/mark', 'Error loading context data', error);
        toast.error(
          error instanceof Error
            ? `Failed to load class context: ${error.message}`
            : 'Failed to load class context'
        );
      } finally {
        setLoadingContext(false);
      }
    };

    loadContextData();
  }, [
    timetableId,
    profile?.institution_id,
    profile,
    sectionId,
    isSuperAdmin,
    periodId
  ]);

  // Updated: 2026-03-10 - Parallelized: leave block check + existing attendance + staff loading
  // These 3 operations all depend on contextData but are independent of each other
  useEffect(() => {
    if (!contextData || !date) return;

    const checkLeaveBlock = async () => {
      if (!contextData.institution_id) {
        setLeaveBlockInfo(null);
        return;
      }
      try {
        setCheckingLeave(true);
        const result = await LeaveCalendarService.checkLeaveBlockForAttendance({
          institution_id: contextData.institution_id,
          date,
          department_id: contextData.department_id || undefined,
          semester_id: contextData.semester_id || undefined,
          section_id: contextData.section_id || undefined
        });
        if (!result.allowed && result.leave) {
          setLeaveBlockInfo(result.leave);
        } else {
          setLeaveBlockInfo(null);
        }
      } catch (error) {
        logger.error('academic/attendance/mark', 'Error checking leave block', error);
        setLeaveBlockInfo(null);
      } finally {
        setCheckingLeave(false);
      }
    };

    const checkExisting = async () => {
      if (!timetableId) return;
      try {
        setLoadingExistingAttendance(true);
        const existingRecord = await AttendanceService.getConsolidatedAttendance(
          timetableId,
          contextData.section_id,
          date,
          periodId || undefined
        );
        if (existingRecord) {
          setExistingAttendance(existingRecord);
          if (isSuperAdmin || profile?.role === 'hod') {
            toast('Attendance already marked. Use the Edit Attendance button below to make changes.', { icon: 'ℹ️' });
          } else {
            toast.error('Attendance was already marked for this class. This record is read-only.');
          }
          if (existingRecord.attendance_data) {
            const existingData: Record<string, 'Present' | 'Absent'> = {};
            Object.values(existingRecord.attendance_data).forEach((periodData: any) => {
              if (periodData.students && Array.isArray(periodData.students)) {
                periodData.students.forEach((student: any) => {
                  if (student.student_id && student.status) {
                    existingData[student.student_id] = student.status;
                  }
                });
              }
            });
            setAttendanceData(existingData);
          }
        } else {
          setExistingAttendance(null);
        }
      } catch (error) {
        logger.error('academic/attendance/mark', 'Error checking existing attendance', error);
      } finally {
        setLoadingExistingAttendance(false);
      }
    };

    const loadStaff = async () => {
      if (!contextData?.timetable_data || !periodId) return;
      try {
        setLoadingStaff(true);
        let actualTimetableData = contextData.timetable_data?.timetable_data;
        if (!actualTimetableData && contextData.timetable_data) {
          const hasDirectDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
            .some((day) => contextData.timetable_data[day]);
          if (hasDirectDays) actualTimetableData = contextData.timetable_data;
        }
        if (!actualTimetableData) return;

        const timetableFormat = contextData.timetable_data?.timetable_format || 'regular';
        let dayKey: string;
        if (timetableFormat === 'batch') {
          const timetableKeys = Object.keys(actualTimetableData);
          let foundKey: string | null = null;
          for (const dateKey of timetableKeys) {
            const daySlots = actualTimetableData[dateKey];
            if (daySlots && typeof daySlots === 'object') {
              if (daySlots[periodId] || Object.values(daySlots).some((slot: any) => slot?.slot_id === periodId)) {
                foundKey = dateKey;
                break;
              }
            }
          }
          dayKey = foundKey || date;
        } else if (timetableFormat === 'cycle') {
          // Added: 2026-06-17 - Cycle timetables key timetable_data by "cycle-N"
          // (e.g. "cycle-3"), NOT by weekday. Without this the assigned-faculty
          // lookup fell through to the WEDNESDAY key, found nothing, and showed
          // "No faculty assigned to this timetable slot". Resolve the active
          // cycle for the date via the canonical RPC (working-day counting,
          // Sunday/holiday skipping) used by the timetable grid's "Today" badge.
          const cycleNum =
            timetableId && date
              ? await CycleCalculationService.getCycleForDate(timetableId, date)
              : null;
          if (!cycleNum) {
            logger.warn('academic/attendance/mark', 'No active cycle for date', { date, timetableId });
            return;
          }
          dayKey = `cycle-${cycleNum}`;
        } else {
          // Updated: 2026-07-30 - Parse date as local calendar components, not via
          // `new Date(dateString)` which treats "YYYY-MM-DD" as UTC midnight. In
          // timezones behind UTC that shifts the computed weekday back a day (e.g.
          // 2026-03-23 a Monday resolved to SUNDAY), so the day key never matched
          // the timetable's stored days and staff lookup silently returned nothing
          // (BUG-003151).
          const [dateYear, dateMonth, dateDay] = date.split('-').map(Number);
          dayKey = new Date(dateYear, dateMonth - 1, dateDay)
            .toLocaleDateString('en-US', { weekday: 'long' })
            .toUpperCase();
        }

        const dayData = actualTimetableData[dayKey];
        if (!dayData) {
          logger.warn('academic/attendance/mark', 'No day data found in timetable', {
            dayKey, availableKeys: Object.keys(actualTimetableData || {}),
          });
          return;
        }

        let searchSlotId = periodId;
        if (periodId && periodId.includes('_group_')) {
          searchSlotId = periodId.split('_group_')[0];
        }

        let periodSlot = dayData[periodId] || dayData[searchSlotId];
        if (!periodSlot) {
          for (const [, slot] of Object.entries(dayData)) {
            if (slot && typeof slot === 'object' && 'slot_id' in slot) {
              if ((slot as any).slot_id === periodId || (slot as any).slot_id === searchSlotId) {
                periodSlot = slot as any;
                break;
              }
            }
          }
        }
        if (!periodSlot) {
          logger.warn('academic/attendance/mark', 'Period slot not found in day data', {
            periodId, searchSlotId, availableSlots: Object.keys(dayData || {}),
          });
          return;
        }

        const staffIds: string[] = [];
        let primaryStaffId: string | null = null;
        if (isSubdividedFromUrl && subdivisionStaffIds) {
          const groupStaffIds = subdivisionStaffIds.split(',');
          staffIds.push(...groupStaffIds);
          primaryStaffId = groupStaffIds[0] || null;
        } else {
          if (periodSlot.primary_staff_id && typeof periodSlot.primary_staff_id === 'string') {
            primaryStaffId = periodSlot.primary_staff_id;
            staffIds.push(periodSlot.primary_staff_id);
          }
          // Handle both array and object formats for staff_ids
          if (periodSlot.staff_ids) {
            if (Array.isArray(periodSlot.staff_ids)) {
              periodSlot.staff_ids.forEach((id: string) => {
                if (id && !staffIds.includes(id)) staffIds.push(id);
              });
            } else if (typeof periodSlot.staff_ids === 'object') {
              // Object format: {uuid: true} or {uuid: {...data}}
              Object.keys(periodSlot.staff_ids).forEach((id: string) => {
                if (id && !staffIds.includes(id)) staffIds.push(id);
              });
            }
          }

          // Updated: 2026-03-13 - Fallback: extract staff_ids from sub_slots for combined/subdivided periods
          // Parent slot often has empty staff_ids; real data lives in sub_slots
          if (staffIds.length === 0 && periodSlot.sub_slots && Array.isArray(periodSlot.sub_slots) && periodSlot.sub_slots.length > 0) {
            const targetGroupOrder = subdivisionGroupOrder ? parseInt(subdivisionGroupOrder, 10) : 1;
            const matchedSubSlot = periodSlot.sub_slots.find(
              (ss: any) => ss.sub_slot_order === targetGroupOrder
            ) || periodSlot.sub_slots[0];

            if (matchedSubSlot) {
              if (matchedSubSlot.primary_staff_id && typeof matchedSubSlot.primary_staff_id === 'string') {
                primaryStaffId = matchedSubSlot.primary_staff_id;
                staffIds.push(matchedSubSlot.primary_staff_id);
              }
              if (matchedSubSlot.staff_ids) {
                if (Array.isArray(matchedSubSlot.staff_ids)) {
                  matchedSubSlot.staff_ids.forEach((id: string) => {
                    if (id && !staffIds.includes(id)) staffIds.push(id);
                  });
                } else if (typeof matchedSubSlot.staff_ids === 'object') {
                  Object.keys(matchedSubSlot.staff_ids).forEach((id: string) => {
                    if (id && !staffIds.includes(id)) staffIds.push(id);
                  });
                }
              }
            }
          }
        }

        // Updated: 2026-08-06 - Third fallback: practical periods. A practical slot
        // keeps its real assignment inside practical_config.batches[], leaving the
        // top-level primary_staff_id/staff_ids empty and sub_slots absent — so both
        // branches above find nothing and every lab period showed "no faculty".
        // Prefer the batch the user actually selected; otherwise union every batch,
        // which is the honest answer before a batch is chosen.
        if (staffIds.length === 0 && practicalConfig?.batches?.length) {
          const batches = practicalSelection
            ? practicalConfig.batches.filter((b: any) => b.batch_id === practicalSelection.batch_id)
            : practicalConfig.batches;

          for (const batch of batches) {
            const mapping = batch?.staff_mapping || practicalConfig.staff_mapping;
            if (!mapping || typeof mapping !== 'object') continue;

            // staff_mapping is { course_id: [staff_id, ...] }. Narrow to the batch's
            // own course when it declares one, else take every course's staff.
            const courseId = batch?.assigned_courses?.[0];
            const lists = courseId && mapping[courseId]
              ? [mapping[courseId]]
              : Object.values(mapping);

            for (const list of lists) {
              for (const id of (Array.isArray(list) ? list : [])) {
                if (id && !staffIds.includes(id)) staffIds.push(id);
              }
            }
          }

          // No primary is recorded on a batch; the first mapped teacher leads it.
          if (!primaryStaffId && staffIds.length > 0) primaryStaffId = staffIds[0];
        }

        if (staffIds.length === 0) {
          logger.warn('academic/attendance/mark', 'No staff IDs found in period slot, sub_slots or practical batches', {
            periodId, primary_staff_id: periodSlot.primary_staff_id,
            staff_ids: periodSlot.staff_ids, staff_ids_type: typeof periodSlot.staff_ids,
            has_sub_slots: !!(periodSlot.sub_slots?.length),
            has_practical_batches: !!practicalConfig?.batches?.length,
          });
          setAssignedStaff([]);
          return;
        }

        const { createClientSupabaseClient } = await import('@/lib/supabase/client');
        const sb = createClientSupabaseClient();
        const { data: staffData, error: staffError } = await sb
          .from('staff')
          .select('id, first_name, last_name, email, institution_email, staff_id, phone')
          .in('id', staffIds);

        if (staffError) {
          logger.error('academic/attendance/mark', 'Error fetching staff data', staffError);
          setAssignedStaff([]);
          return;
        }

        if (staffData) {
          const enrichedStaffData = staffData
            .map((staff: any) => ({
              ...staff,
              is_primary: staff.id === primaryStaffId,
              full_name: `${staff.first_name || ''} ${staff.last_name || ''}`.trim()
            }))
            .sort((a, b) => {
              if (a.is_primary && !b.is_primary) return -1;
              if (!a.is_primary && b.is_primary) return 1;
              return a.full_name.localeCompare(b.full_name);
            });
          setAssignedStaff(enrichedStaffData);
        } else {
          setAssignedStaff([]);
        }
      } catch (error) {
        logger.error('academic/attendance/mark', 'Error loading assigned staff', error);
        setAssignedStaff([]);
      } finally {
        setLoadingStaff(false);
      }
    };

    // Run all three in parallel — they're independent of each other
    Promise.allSettled([checkLeaveBlock(), checkExisting(), loadStaff()]);
    // practicalConfig/practicalSelection added 2026-08-06: loadStaff now reads the
    // practical batches, and both land AFTER this effect's first run (config is set
    // while resolving context, selection only when the user picks a batch). Without
    // them the practical fallback would evaluate against nulls once and never retry.
  }, [contextData, date, timetableId, periodId, isSuperAdmin, isSubdividedFromUrl, subdivisionStaffIds, subdivisionGroupOrder, practicalConfig, practicalSelection]);

  // Load students using the resolved context
  useEffect(() => {
    const loadStudents = async () => {
      // Updated: 2025-10-08 - Allow loading without section_id for multi-section slots
      if (!contextData) {
        return;
      }

      // NEW: For practical periods, wait for batch/lab selection (Updated: 2025-10-25)
      if (periodMode === 'practical' && !practicalSelection) {
        setLoadingStudents(false);
        return;
      }

      // For practical periods, use section_ids from practical selection
      // For standard periods, use section_ids from context
      const effectiveSectionIds = practicalSelection
        ? practicalSelection.section_ids
        : contextData.section_ids;

      // Updated: 2026-08-06 - Do NOT bail out when no section resolves. This used
      // to `return` silently (no log at all), which is how a practical period whose
      // practical_config.batches[].section_ids were never filled in produced a
      // permanently blank roster with nothing in the console to explain it. The
      // roster RPC already handles a missing section: fn_attendance_roster falls
      // back to degree/program/semester when p_section_ids IS NULL. Bailing here
      // blocked the very fallback built for this case. Log the degraded scope and
      // let the call through — a wider-than-ideal roster beats an empty screen.
      if (
        !contextData.section_id &&
        (!effectiveSectionIds || effectiveSectionIds.length === 0)
      ) {
        logger.warn(
          'academic/attendance/mark',
          'No section on this slot - falling back to programme/semester scope',
          {
            periodId,
            timetableId,
            periodMode,
            batchId: practicalSelection?.batch_id ?? null,
            programId: contextData.program_id,
            semesterId: contextData.semester_id
          }
        );
      }

      try {
        setLoadingStudents(true);

        // Updated: 2025-10-25 - Support for practical periods with batch selection
        // Use effective section_ids (from practical selection or context)
        const hasMultipleSections =
          effectiveSectionIds && effectiveSectionIds.length > 0;

        const studentsData = await AttendanceService.getStudentsForAttendance({
          institution_id: contextData.institution_id,
          degree_id: contextData.degree_id,
          program_id: contextData.program_id,
          department_id: contextData.department_id,
          semester_id: contextData.semester_id,
          // Added: 2026-08-20 - Cohort scope. Unlike degree/program/semester this is
          // not a redundant copy of something the section already implies: `sections`
          // has no academic-year column, so without this the next intake sharing the
          // same section row appears alongside the cohort actually being taught
          // (JKKN AHS fresher report). NULL-safe — a timetable with no academic year
          // keeps today's roster exactly.
          academic_year_id: contextData.academic_year_id,
          // Updated: Use effective section_ids (practical or context)
          ...(hasMultipleSections
            ? { section_ids: effectiveSectionIds }
            : { section_id: contextData.section_id })
        });

        // Updated: 2026-08-06 - Say what actually happened. This used to read
        // "check RLS policy", which is misleading: getStudentsForAttendance goes
        // through fn_attendance_roster, a SECURITY DEFINER RPC that RAISEs 42501
        // on an authorization failure. A permission problem therefore arrives as
        // a thrown error, never as an empty array. Zero rows here means the scope
        // matched no learners — a data problem — and the old wording cost real
        // time hunting permissions for a mis-assigned cohort.
        if (studentsData.length === 0) {
          logger.warn('academic/attendance/mark', 'No learners match this scope (not a permission error)', {
            institutionId: contextData.institution_id,
            sectionId: contextData.section_id,
            sectionIds: hasMultipleSections ? effectiveSectionIds : null,
            programId: contextData.program_id,
            semesterId: contextData.semester_id
          });
        }

        // Updated: 2025-10-13 - Filter students by subdivision group if applicable
        let filteredStudents = studentsData;
        if (isSubdividedFromUrl && subdivisionStudentIds) {
          const groupStudentIds = subdivisionStudentIds.split(',');
          filteredStudents = studentsData.filter((student: any) =>
            groupStudentIds.includes(student.id)
          );
        }

        // Updated: 2026-08-17 (BUG-005826) - Narrow to the learners the selected
        // practical batch names. Section scope alone cannot express an allied or
        // generic-elective split, because that division happens per learner
        // INSIDE a section: the Zoology allied batch pointed at the only section
        // I B.Sc Chemistry has, so all 19 loaded for a 9-learner lab. A batch
        // that names nobody is left alone, so section-assigned batches and every
        // batch authored before `student_ids` existed behave exactly as before.
        let batchRoster: PracticalBatchRosterResult<any> | null = null;
        if (practicalSelection?.student_ids?.length) {
          batchRoster = narrowRosterToPracticalBatch(
            filteredStudents as any[],
            practicalSelection.student_ids
          );
          filteredStudents = batchRoster.learners;

          if (batchRoster.unmatchedIds.length > 0) {
            // The batch and the enrolment data disagree. Report it rather than
            // widening back to the full roster — silently showing everyone is
            // the bug this fixes, and it survived two reports by looking like
            // "no configuration" instead of "stale configuration".
            logger.warn(
              'academic/attendance/mark',
              'Practical batch names learners who are not on the roster',
              {
                periodId,
                timetableId,
                batchId: practicalSelection.batch_id,
                batchName: practicalSelection.batch_name,
                configuredCount: practicalSelection.student_ids.length,
                loadedCount: filteredStudents.length,
                unmatchedIds: batchRoster.unmatchedIds
              }
            );
          }
        }

        // Initialize attendance data (all present by default)
        const initialAttendance: Record<string, 'Present' | 'Absent'> = {};
        filteredStudents.forEach((student: any) => {
          initialAttendance[student.id] = 'Present';
        });

        setStudents(filteredStudents);
        setAttendanceData(initialAttendance);

        if (filteredStudents.length === 0) {
          if (batchRoster?.source === 'batch_students') {
            // Updated: 2026-08-17 - Name the batch and the cause. "No students
            // found for this section" would send the faculty hunting a section
            // problem when the real one is that none of the batch's learners
            // are enrolled in the scope this period loads.
            toast.error(
              `None of the ${batchRoster.unmatchedIds.length} learners assigned to ${
                practicalSelection?.batch_name || 'this batch'
              } are enrolled in this class. Please check the batch in the timetable.`
            );
          } else if (isSubdividedFromUrl) {
            toast.error(
              `No students assigned to ${subdivisionGroupName || 'this group'}`
            );
          } else {
            toast.error('No students found for this section');
          }
        } else {
          // No toast here — student list is visible in the UI
        }
      } catch (error) {
        logger.error('academic/attendance/mark', 'Error fetching students for attendance', error);

        if (error instanceof Error) {
          if (error.message.includes('invalid input syntax for type uuid')) {
            toast.error(
              'Invalid section ID format. Please check the class information.'
            );
          } else {
            toast.error(`Failed to load students: ${error.message}`);
          }
        } else {
          toast.error('Failed to load students. Please try again.');
        }
      } finally {
        setLoadingStudents(false);
      }
    };

    loadStudents();
  }, [
    contextData,
    isSubdividedFromUrl,
    subdivisionStudentIds,
    subdivisionGroupName,
    periodMode,
    practicalSelection,
    // Added 2026-08-06: read by the no-section diagnostic above. Both are URL
    // params and change only on navigation, so this adds no refetch churn.
    periodId,
    timetableId
  ]);

  // Updated: 2026-01-29 - Check for approved leave/onduty applications
  useEffect(() => {
    const loadApprovedLeave = async () => {
      // Wait for required parameters
      if (!sectionId || !date || !periodId || students.length === 0) {
        return;
      }

      try {
        setLoadingApprovedLeave(true);

        logger.dev('academic/attendance/mark', 'Checking approved leave', {
          sectionId,
          date,
          periodId
        });

        const approvedLeave = await LeaveOndutyAttendanceCheckService
          .getApprovedLeaveForAttendance(
            sectionId,
            date,
            [periodId]
          );

        // Create map for quick lookup
        const leaveMap = new Map<string, ApprovedLeaveInfo>();
        for (const leave of approvedLeave) {
          leaveMap.set(leave.learner_id, leave);
        }

        setApprovedLeaveMap(leaveMap);

        logger.info('academic/attendance/mark', 'Loaded approved leave', {
          count: approvedLeave.length,
          students: Array.from(leaveMap.keys())
        });

        // Pre-fill attendance status based on approved leave
        if (leaveMap.size > 0 && !existingAttendance) {
          setAttendanceData((prev) => {
            const updated = { ...prev };
            for (const [studentId, leaveInfo] of leaveMap.entries()) {
              // Only update if student hasn't been manually marked yet
              if (updated[studentId] === 'Present') {
                updated[studentId] = leaveInfo.category === 'leave' ? 'Absent' : 'Present';
              }
            }
            return updated;
          });

          // Leave pre-fill is a background convenience — no toast needed
        }
      } catch (error) {
        logger.error('academic/attendance/mark', 'Error loading approved leave', error);
        // Don't show error toast - this is optional functionality
      } finally {
        setLoadingApprovedLeave(false);
      }
    };

    loadApprovedLeave();
  }, [sectionId, date, periodId, students, existingAttendance]);

  // NOTE: Existing attendance check and staff loading have been merged into the
  // parallelized useEffect above (2026-03-10 optimization)

  // Early return for missing auth data - but allow super admins without institution_id
  if (!isSuperAdmin && !profile?.institution_id) {
    return (
      <ContentLayout title='Mark Attendance'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <div className='text-center space-y-4'>
            <Loader2 className='h-8 w-8 animate-spin mx-auto' />
            <p className='text-muted-foreground'>Loading user profile...</p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  // Validate required URL parameters (now only timetableId is critical)
  if (!periodId || !timetableId || !date) {
    return (
      <ContentLayout title='Mark Attendance'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <div className='text-center space-y-4'>
            <AlertTriangle className='h-12 w-12 text-red-500 mx-auto' />
            <div>
              <h3 className='text-lg font-semibold'>
                Missing Required Parameters
              </h3>
              <p className='text-muted-foreground'>
                This page requires valid period, timetable, and date parameters.
                Section information will be resolved from the timetable.
              </p>
              <Button
                onClick={() => router.push('/academic/attendance')}
                className='mt-4'
                variant='outline'
              >
                <ArrowLeft className='h-4 w-4 mr-2' />
                Back to Attendance
              </Button>
            </div>
          </div>
        </div>
      </ContentLayout>
    );
  }

  // Show loading state while context is being resolved
  if (loadingContext) {
    return (
      <ContentLayout title='Mark Attendance'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <div className='text-center space-y-4'>
            <Loader2 className='h-8 w-8 animate-spin mx-auto' />
            <p className='text-muted-foreground'>
              Loading class information...
            </p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  // Toggle attendance status
  // Updated: 2026-01-29 - Check approved leave before toggling
  const toggleAttendance = (studentId: string) => {
    // OnDuty is leave-system controlled — never allow manual toggle
    // Cast needed: attendanceData type is 'Present'|'Absent' but DB may contain 'OnDuty' at runtime
    if ((attendanceData[studentId] as string) === 'OnDuty') return
    const newStatus = attendanceData[studentId] === 'Present' ? 'Absent' : 'Present';
    const leaveInfo = approvedLeaveMap.get(studentId);

    if (leaveInfo) {
      const suggestedStatus = leaveInfo.category === 'leave' ? 'Absent' : 'Present';

      if (newStatus !== suggestedStatus) {
        const confirmed = window.confirm(
          `⚠️ Warning: This student has approved ${leaveInfo.category} (${leaveInfo.subcategory}).\n\n` +
          `Suggested status: ${suggestedStatus}\n` +
          `You're trying to mark as: ${newStatus}\n\n` +
          `Are you sure you want to override the approved ${leaveInfo.category}?`
        );

        if (!confirmed) {
          return; // Don't change status
        }
      }
    }

    setAttendanceData((prev) => ({
      ...prev,
      [studentId]: newStatus
    }));
  };

  // Mark all as present/absent — skips OnDuty students (leave-system controlled)
  const markAll = (status: 'Present' | 'Absent') => {
    const newData: Record<string, 'Present' | 'Absent'> = {};
    students.forEach((student) => {
      if ((attendanceData[student.id] as string) === 'OnDuty') return;
      newData[student.id] = status;
    });
    setAttendanceData((prev) => ({ ...prev, ...newData }));
  };

  // Show summary modal before saving
  const handleSaveAttendance = async () => {
    // Basic validation first
    if (!profile?.id) {
      toast.error('User profile not loaded. Please refresh the page.');
      return;
    }

    // For non-super admins, we need institution_id
    if (!isSuperAdmin && !profile?.institution_id) {
      toast.error(
        'Institution information not found. Please refresh the page.'
      );
      return;
    }

    // Validate required parameters
    if (!timetableId) {
      toast.error('Missing timetable information. Please try again.');
      return;
    }

    // Updated: 2025-10-09 - Allow semester-level timetables to proceed without specific section
    // For multi-section periods, we'll use the first section from section_ids array
    // Updated: 2026-07-20 - For practical periods the batch selection is the authoritative
    // section source: the parent slot carries no section_id/section_ids, so mirror the
    // student-load path (see loadStudents) and the section_ids save param below — otherwise
    // saving a practical batch fails with "Missing section information".
    // Updated: 2026-08-16 (BUG-005824) - Extracted to resolveAttendanceSaveScope, which
    // adds a final tier: the roster already on screen. loadStudents deliberately falls
    // back to programme/semester scope for a slot with no section (569 such slots across
    // 34 active timetables), so the faculty marks a full roster and only then hit this
    // guard — losing the work, and told to "select a section" on a screen with no such
    // control. The learners themselves carry the section; read it instead of refusing.
    const saveScope = resolveAttendanceSaveScope({
      practicalSectionIds: practicalSelection?.section_ids,
      contextSectionId: contextData?.section_id,
      urlSectionId: sectionId,
      contextSectionIds: contextData?.section_ids,
      rosterSectionIds: students.map((student) => student.section_id)
    });
    const effectiveSectionId = saveScope.sectionId;

    if (!effectiveSectionId) {
      // Genuinely unresolvable: neither the slot, the timetable, the URL nor a
      // single learner on screen names a section. Name the slot so the timetable
      // can be repaired, rather than pointing at a control that does not exist.
      logger.error('academic/attendance/mark', 'No section on the slot or the roster', {
        periodId,
        timetableId,
        periodMode,
        rosterSize: students.length
      });
      toast.error(
        'This period has no section assigned in the timetable, so attendance cannot be saved. Please ask your timetable coordinator to set the section for this period.'
      );
      return;
    }

    if (saveScope.source === 'roster') {
      logger.warn(
        'academic/attendance/mark',
        'Slot carries no section - saving against the section on the roster',
        { periodId, timetableId, sectionIds: saveScope.sectionIds }
      );
    }

    if (!date) {
      toast.error('Missing attendance date. Please try again.');
      return;
    }

    const institutionId =
      contextData?.institution_id || profile?.institution_id;
    if (!institutionId) {
      toast.error('Missing institution information. Please try again.');
      return;
    }

    // Compute edit diff before opening modal (Added: 2026-03-20)
    const computedDiff: AttendanceEditDiff[] = isEditMode
      ? students
          .filter(
            (s: any) =>
              initialEditSnapshot.current[s.id] !== attendanceData[s.id] &&
              (attendanceData[s.id] as string) !== 'OnDuty'
          )
          .map((s: any) => ({
            studentId: s.id,
            studentName:
              `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
            oldStatus: initialEditSnapshot.current[s.id] as
              | 'Present'
              | 'Absent',
            newStatus: attendanceData[s.id] as 'Present' | 'Absent',
          }))
      : []
    setEditDiff(computedDiff)

    // Show summary modal
    setShowSummaryModal(true);
  };

  // Actual save logic
  const performSaveAttendance = async () => {
    const institutionId =
      contextData?.institution_id || profile?.institution_id;

    try {
      setSavingAttendance(true);

      // Get current user's information for marker details
      let markerName = profile?.full_name || 'Unknown User';
      let markerEmail = profile?.email || null;

      // Try to get better name from staff table if user is faculty
      if (profile?.role === 'faculty' && profile?.id) {
        try {
          const { createClientSupabaseClient } = await import(
            '@/lib/supabase/client'
          );
          const supabase = createClientSupabaseClient();

          const { data: staffData } = await supabase
            .from('staff')
            .select('first_name, last_name, email, institution_email')
            .eq('profile_id', profile.id)
            .eq('is_active', true)
            .single();

          if (staffData) {
            const staff = staffData as { first_name: string; last_name: string; email: string; institution_email: string };
            markerName =
              `${staff.first_name || ''} ${
                staff.last_name || ''
              }`.trim() || markerName;
            // institution_email first: it is the auth/login identity every
            // downstream email-join (feedback, SCF notes, verdict card,
            // Facilitator Pulse) keys on; staff.email is a personal contact.
            markerEmail =
              staff.institution_email || staff.email || markerEmail;
          }
        } catch (error) {
          logger.warn('academic/attendance/mark', 'Could not fetch staff details, using profile data', error);
        }
      }

      // Updated: 2025-09-09 - Extract course info from timetable_data JSON structure
      // The periodId is actually the slot_id from the timetable_data
      let slotData = null;
      let courseId = null;

      // Search through all days to find the slot with matching slot_id
      if (contextData?.timetable_data?.timetable_data && periodId) {
        const timetableJsonData = contextData.timetable_data.timetable_data;

        // Search through each day
        for (const day of Object.keys(timetableJsonData)) {
          for (const periodKey of Object.keys(timetableJsonData[day])) {
            const slot = timetableJsonData[day][periodKey];
            if (slot.slot_id === periodId) {
              slotData = slot;
              courseId = slot.course_id;
              break;
            }
          }
          if (slotData) break;
        }
      }

      // Fetch course details if we have a course_id
      let courseDetails: { id: string; course_name: string; course_code: string } | null = null;
      if (courseId) {
        try {
          const { createClientSupabaseClient } = await import(
            '@/lib/supabase/client'
          );
          const supabase = createClientSupabaseClient();

          const { data: course } = await supabase
            .from('courses')
            .select('id, course_name, course_code')
            .eq('id', courseId)
            .single();

          if (course) {
            courseDetails = course as { id: string; course_name: string; course_code: string };
          }
        } catch (error) {
          logger.warn('academic/attendance/mark', 'Failed to fetch course details', error);
        }
      }

      // NEW: For practical periods, use course from practical selection (Updated: 2025-10-25)
      const correctCourseInfo = practicalSelection
        ? {
            course_id: practicalSelection.course_id || '',
            course_name: practicalSelection.course_name || 'Unknown Course',
            course_code: practicalSelection.course_code || 'N/A'
          }
        : {
            course_id: courseDetails?.id || courseId || '',
            course_name:
              courseDetails?.course_name || courseName || 'Unknown Course',
            course_code: courseDetails?.course_code || 'N/A'
          };

      // Updated: 2025-10-09 - Allow semester-level timetables with multi-section support
      // Use first section from section_ids array for multi-section periods
      // Updated: 2026-07-20 - Practical periods derive their section from the selected batch
      // (practicalSelection), matching loadStudents and the section_ids save param below.
      // Updated: 2026-08-16 (BUG-005824) - Shares resolveAttendanceSaveScope with the
      // pre-flight check in handleSaveAttendance. These two blocks were duplicated and had
      // already drifted apart in their error text; a single resolver keeps them from
      // disagreeing about whether a save is possible.
      const saveScope = resolveAttendanceSaveScope({
        practicalSectionIds: practicalSelection?.section_ids,
        contextSectionId: contextData?.section_id,
        urlSectionId: sectionId,
        contextSectionIds: contextData?.section_ids,
        rosterSectionIds: students.map((student) => student.section_id)
      });
      const effectiveSectionId = saveScope.sectionId;

      if (!effectiveSectionId) {
        logger.error('academic/attendance/mark', 'No section on the slot or the roster', {
          periodId,
          timetableId,
          rosterSize: students.length
        });
        toast.error(
          'This period has no section assigned in the timetable, so attendance cannot be saved. Please ask your timetable coordinator to set the section for this period.'
        );
        return;
      }

      // Prepare faculty data - store all assigned faculty if multiple
      let assignedFacultyData;
      if (assignedStaff.length > 1) {
        // Multiple faculty - store as array
        assignedFacultyData = assignedStaff.map((staff) => ({
          faculty_id: staff.id,
          faculty_name:
            staff.full_name ||
            `${staff.first_name || ''} ${staff.last_name || ''}`.trim(),
          faculty_email: staff.institution_email || staff.email || '',
          is_primary: staff.is_primary || false
        }));
      } else if (assignedStaff.length === 1) {
        // Single faculty - store as object for backward compatibility
        const faculty = assignedStaff[0];
        assignedFacultyData = {
          faculty_id: faculty.id,
          faculty_name:
            faculty.full_name ||
            `${faculty.first_name || ''} ${faculty.last_name || ''}`.trim(),
          faculty_email: faculty.institution_email || faculty.email || ''
        };
      }

      // Updated: 2026-07-25 - Build the subdivided (lab) group rosters ONCE, so the
      // top-level roster below can mirror them instead of shipping empty.
      const subdivisionGroups = isSubdividedSlot
        ? activeSubdivisionGroups.map((group) => ({
            group_order: group.group_order,
            group_name: group.group_name,
            lab_room: group.lab_room,
            max_capacity: group.max_capacity,
            staff_ids: group.staff_ids,
            // Updated: 2026-03-13 - Combined periods have empty student_ids; use all students
            students: students
              .filter((student) =>
                group.student_ids.length > 0
                  ? group.student_ids.includes(student.id)
                  : true
              )
              .map((student) => ({
                student_id: student.id,
                section_id:
                  student.section_id ||
                  contextData?.section_id ||
                  effectiveSectionId ||
                  '',
                status: attendanceData[student.id] || 'Present',
                marked_at: new Date().toISOString()
              }))
          }))
        : [];

      // Updated: 2026-07-25 - The union of every group's roster, deduplicated by
      // learner. A COMBINED period leaves `student_ids` empty on a group, which puts
      // every learner into every such group, so a naive flatten would list a learner
      // twice. One learner carries one status here (statuses are keyed per learner,
      // not per group), so keeping the first entry is lossless.
      const subdivisionRosterMirror = (() => {
        const seenLearnerIds = new Set<string>();
        return subdivisionGroups.flatMap((group) =>
          group.students.filter((entry) => {
            if (seenLearnerIds.has(entry.student_id)) return false;
            seenLearnerIds.add(entry.student_id);
            return true;
          })
        );
      })();

      // Prepare attendance data with proper structure
      // Updated: 2025-10-11 - Add subdivision support
      const attendancePayload = {
        [periodId || 'default']: {
          period_id: periodId || 'default',
          period_name: periodName || 'Unknown Period',
          course_id: correctCourseInfo.course_id,
          course_name: correctCourseInfo.course_name,
          course_code: correctCourseInfo.course_code,
          start_time: startTime || '',
          end_time: endTime || '',

          // NEW: Add subdivision metadata if applicable (Updated: 2025-10-11)
          ...(isSubdividedSlot && {
            is_subdivided: true,
            subdivision_type: subdivisionType,
            groups: subdivisionGroups
          }),

          // NEW: Add practical period metadata if applicable (Updated: 2025-10-25)
          ...(periodMode === 'practical' && practicalSelection && {
            period_mode: 'practical',
            batch_selected: {
              batch_id: practicalSelection.batch_id,
              batch_name: practicalSelection.batch_name
            },
            course_selected: practicalSelection.course_id
          }),

          // Add all assigned faculty information
          assigned_faculty: assignedFacultyData,
          // Add marker details - always use profile ID for consistency across all user types
          marked_by_details: {
            marker_id: profile?.id || '',
            marker_name: markerName,
            marker_role: profile?.role || 'faculty',
            marker_email: markerEmail || profile?.email || '',
            marked_at: new Date().toISOString() // Add timestamp when period is marked
          },
          // Updated: 2026-07-25 - A subdivided slot used to ship `students: []` here,
          // so every consumer reading the top-level roster saw an EMPTY practical:
          // the session-feedback path, exam-eligibility aggregation, the attendance
          // dashboards and the CARRE/CRS/DHS/TES scorers all counted zero learners.
          // Publish the union of the group rosters instead. Readers that already
          // understand both shapes (fn_attendance_slot_students in SQL, slotStudents()
          // in attendance-report-service) PREFER a non-empty top-level array over
          // flattening groups[], so this is read INSTEAD of the flatten, never in
          // addition to it — it cannot double-count.
          students: isSubdividedSlot
            ? subdivisionRosterMirror
            : students.map((student) => ({
                student_id: student.id,
                section_id:
                  student.section_id ||
                  contextData?.section_id ||
                  effectiveSectionId ||
                  '', // Updated: 2025-10-09 - Ensure section_id is always provided
                status: attendanceData[student.id] || 'Present',
                marked_at: new Date().toISOString()
              }))
        }
      };

      // Guard: never silently save a period with zero students recorded. Without
      // this, a roster that failed to load (RLS/timing/network race) or a
      // subdivided group whose student_ids no longer match the loaded roster
      // still produces a "saved successfully" toast plus a permanently empty
      // report (0 Total/Present/Absent, red 0.0%) that reads as a false
      // low-attendance alert right after a successful save.
      const periodEntry = attendancePayload[periodId || 'default'];
      const savedStudentCount =
        periodEntry.students.length > 0
          ? periodEntry.students.length
          : (periodEntry.groups || []).reduce(
              (sum: number, group: any) => sum + (group.students?.length || 0),
              0
            );

      if (savedStudentCount === 0) {
        toast.error(
          'No learners found for this class. Attendance was not saved — please refresh and try again.'
        );
        return;
      }

      // Debug: Log the payload being sent

      // Updated: 2025-10-25 - Add practical period support with batch section_ids
      // Save attendance - use validated institution_id
      const result = await saveConsolidatedAttendance({
        timetable_id: timetableId,
        section_id: effectiveSectionId,
        // Updated: 2026-08-16 (BUG-005824) - Sourced from the same resolver as
        // section_id above so the two cannot describe different scopes. Rule is
        // unchanged: send the list only for a practical batch or a genuinely
        // multi-section slot, otherwise section_id alone carries the scope.
        section_ids:
          saveScope.source === 'practical_batch' || saveScope.sectionIds.length > 1
            ? saveScope.sectionIds
            : undefined,
        attendance_date: date,
        attendance_data: attendancePayload,
        marked_by: profile?.id || '',
        institution_id: institutionId,
        // department_id must be forwarded: the service's HOD edit-scope check
        // compares the timetable's department_id against this field, and an
        // undefined value here always fails that comparison (BUG-003149).
        department_id: contextData?.department_id,
        // Audit trail fields (Added: 2026-03-20)
        is_edit_mode: isEditMode && !!existingAttendance,
        period_id_being_edited: isEditMode ? (periodId ?? undefined) : undefined,
        editor_profile:
          isEditMode && profile
            ? {
                id: profile.id,
                full_name: profile.full_name || 'Unknown',
                role: profile.role || 'unknown',
              }
            : undefined,
      });

      if (result) {
        const successMessage = existingAttendance
          ? 'Attendance updated successfully!'
          : 'Attendance saved successfully!';
        toast.success(successMessage);

        // Close the summary modal
        setShowSummaryModal(false);

        // Redirect to report details page after delay
        setTimeout(() => {
          // Redirect to report details page using the attendance record ID.
          // Updated: 2026-07-21 - Land on the period we just marked/edited. The record
          // holds every period marked that day, so without ?period= the report opened on
          // period_details[0] — after editing period 6 you were shown period 1, which
          // reads as "my edit went to the wrong period".
          if (result.id) {
            const reportUrl = periodId
              ? `/academic/attendance/reports/${result.id}?period=${encodeURIComponent(periodId)}`
              : `/academic/attendance/reports/${result.id}`;
            router.push(reportUrl);
          } else {
            // Fallback to reports list page if no ID is available
            const params = new URLSearchParams({
              marked: 'true',
              date: date || new Date().toISOString().split('T')[0],
              section: contextData?.section_name || sectionId || ''
            });
            router.push(`/academic/attendance/reports?${params.toString()}`);
          }
        }, 1500);
      } else {
        logger.error('academic/attendance/mark', 'Save result was null/undefined');
        toast.error('Failed to save attendance - no result returned');
      }
    } catch (error) {
      logger.error('academic/attendance/mark', 'Error saving attendance', error);
      toast.error(
        `Failed to save attendance: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    } finally {
      setSavingAttendance(false);
    }
  };

  return (
    <ContentLayout title='Mark Attendance'>
      <div className='space-y-6'>
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/'>Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/academic'>Academic</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/academic/attendance'>Attendance</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Mark Attendance</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Updated: 2025-01-16 - Leave Block Alert */}
        {leaveBlockInfo && leaveBlockInfo.is_blocked && (
          <Alert variant='destructive'>
            <AlertTriangle className='h-5 w-5' />
            <AlertDescription>
              <div className='flex flex-col gap-2'>
                <div className='font-semibold text-base'>
                  🚫 Attendance Cannot Be Marked - Holiday
                </div>
                <div>
                  <strong>{leaveBlockInfo.leave_name}</strong>
                  {leaveBlockInfo.leave_type_name && (
                    <span className='ml-1'>({leaveBlockInfo.leave_type_name})</span>
                  )}
                </div>
                <div className='text-sm'>
                  This date is blocked by an approved institution leave. Attendance marking is not allowed.
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Existing Attendance Alert */}
        {existingAttendance && (
          <Alert
            className={
              isEditMode
                ? 'border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800'
                : isSuperAdmin
                ? 'border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800'
                : 'border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800'
            }
          >
            <AlertTriangle
              className={`h-4 w-4 ${
                isEditMode
                  ? 'text-blue-600 dark:text-blue-500'
                  : isSuperAdmin
                  ? 'text-amber-600 dark:text-amber-500'
                  : 'text-red-600 dark:text-red-500'
              }`}
            />
            <AlertDescription
              className={
                isEditMode
                  ? 'text-blue-800 dark:text-blue-300'
                  : isSuperAdmin
                  ? 'text-amber-800 dark:text-amber-300'
                  : 'text-red-800 dark:text-red-300'
              }
            >
              <div className='flex flex-col gap-3'>
                <div className='font-medium'>
                  {isEditMode
                    ? '✏️ Edit Mode - Attendance Update'
                    : isSuperAdmin
                    ? '⚠️ Attendance Already Marked'
                    : '🔒 Attendance Already Marked - Read Only'}
                </div>
                <div className='text-sm'>
                  Attendance for this class was previously marked on{' '}
                  {format(
                    new Date(existingAttendance.created_at),
                    'dd MMM yyyy, h:mm a'
                  )}{' '}
                  by{' '}
                  {existingAttendance.marked_by_profile?.full_name || 'Unknown'}
                  {isEditMode
                    ? '. You are now editing the attendance record.'
                    : isSuperAdmin
                    ? '. As a super admin, you can edit this record if needed.'
                    : '. This record is read-only. Contact an administrator if changes are needed.'}
                </div>
                {!isEditMode && (
                  <div className='flex gap-2'>
                    {canEditAttendance ? (
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => {
                          initialEditSnapshot.current = { ...attendanceData }
                          setIsEditMode(true)
                        }}
                        className='bg-white dark:bg-gray-800'
                      >
                        ✏️ Edit Attendance
                      </Button>
                    ) : (
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => router.push('/academic/attendance')}
                        className='bg-white dark:bg-gray-800'
                      >
                        ← Back to Attendance
                      </Button>
                    )}
                  </div>
                )}
                {isEditMode && (
                  <div className='flex gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setIsEditMode(false)}
                      className='bg-white dark:bg-gray-800'
                    >
                      👁️ View Only
                    </Button>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* The timetable's team-member assignment can change after attendance was marked
            (e.g. a substitution); this lets the marker sync the record to match. */}
        {existingAttendance && periodId && (
          <FacultySyncIndicator
            attendanceId={existingAttendance.id}
            periodId={periodId}
            currentFaculty={existingAttendance.attendance_data?.[periodId]?.assigned_faculty}
          />
        )}

        {/* Updated: 2026-02-06 - Practical Batch Selector moved to TOP for practical periods */}
        {periodMode === 'practical' && practicalConfig && !practicalSelection && (
          <PracticalAttendanceSelector
            practicalConfig={practicalConfig}
            periodId={periodId || ''}
            date={date || ''}
            timetableId={timetableId || ''}
            onSelectionComplete={(selection) => {
              setPracticalSelection(selection);
            }}
            onConflictCheck={(params) => AttendanceService.checkPracticalConflict(params)}
          />
        )}

        {/* Status Indicator - hide for practical periods until batch is selected */}
        {(periodMode !== 'practical' || practicalSelection) && (
        <div className='flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-950 dark:border-blue-800/50'>
          <div className='flex-shrink-0'>
            {loadingStudents || loadingExistingAttendance ? (
              <Loader2 className='h-5 w-5 text-blue-600 dark:text-blue-500 animate-spin' />
            ) : students.length > 0 ? (
              <Check className='h-5 w-5 text-green-600 dark:text-green-500' />
            ) : (
              <AlertTriangle className='h-5 w-5 text-orange-600 dark:text-orange-500' />
            )}
          </div>
          <span className='text-blue-800 dark:text-blue-300 font-medium'>
            {loadingStudents || loadingExistingAttendance
              ? loadingExistingAttendance
                ? 'Checking existing attendance...'
                : 'Loading student roster...'
              : students.length > 0
              ? existingAttendance
                ? isEditMode
                  ? `Editing attendance for ${students.length} students`
                  : `Viewing attendance for ${students.length} students (Read Only)`
                : `Ready to mark attendance for ${students.length} students`
              : 'No students found for this section'}
          </span>
          {students.length > 0 &&
            !loadingStudents &&
            !loadingExistingAttendance && (
              <div className='ml-auto text-blue-600 dark:text-blue-400 text-sm'>
                {presentCount}/{students.length} present ({attendancePercentage}
                %)
              </div>
            )}
        </div>
        )}

        {/* Modern Header with Gradient Background - hide for practical periods until batch is selected */}
        {(periodMode !== 'practical' || practicalSelection) && (<>
        <div className='relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 p-6 text-white shadow-lg'>
          <div className='absolute inset-0 bg-black/20'></div>
          <div className='relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4'>
            <div className='flex items-center gap-4'>
              <Button
                variant='secondary'
                size='sm'
                onClick={() => {
                  if (practicalSelection) {
                    // Go back to batch selection instead of leaving the page
                    setPracticalSelection(null);
                    setStudents([]);
                    setAttendanceData({});
                    setExistingAttendance(null);
                    setAssignedStaff([]);
                  } else {
                    router.push('/academic/attendance');
                  }
                }}
                className='bg-white/20 hover:bg-white/30 text-white border-white/30'
              >
                <ArrowLeft className='h-4 w-4' />
              </Button>

              <div className='flex flex-col'>
                <h1 className='text-xl lg:text-2xl font-bold flex items-center gap-2'>
                  <GraduationCap className='h-6 w-6' />
                  Mark Attendance
                </h1>
                <p className='text-blue-100 text-sm'>
                  {practicalSelection?.course_name || courseName || 'Unknown Course'} • {periodName}
                </p>
              </div>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              <Badge className='bg-white/20 text-white border-white/30 hover:bg-white/30'>
                <Calendar className='h-3 w-3 mr-1' />
                {date ? format(new Date(date), 'dd MMM yyyy') : 'No date'}
              </Badge>
              <Badge className='bg-white/20 text-white border-white/30 hover:bg-white/30'>
                <Clock className='h-3 w-3 mr-1' />
                {startTime} - {endTime}
              </Badge>
              {/* Updated: 2026-02-06 - Show batch name for practical periods */}
              {practicalSelection ? (
                <Badge className='bg-purple-500/30 text-white border-purple-300/50 hover:bg-purple-500/40'>
                  <Users className='h-3 w-3 mr-1' />
                  Batch: {practicalSelection.batch_name}
                </Badge>
              ) : contextData?.slot_sections &&
              contextData.slot_sections.length > 0 ? (
                <Badge className='bg-green-500/30 text-white border-green-300/50 hover:bg-green-500/40'>
                  <Users className='h-3 w-3 mr-1' />
                  {contextData.slot_sections.length === 1
                    ? `Section ${contextData.slot_sections[0].section_name}`
                    : `${
                        contextData.slot_sections.length
                      } Sections: ${contextData.slot_sections
                        .map((s: any) => s.section_name)
                        .join(', ')}`}
                </Badge>
              ) : (
                <Badge className='bg-white/20 text-white border-white/30 hover:bg-white/30'>
                  <Building2 className='h-3 w-3 mr-1' />
                  Section {contextData?.section_name || sectionId || 'Unknown'}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Context Information Card */}
        {contextData && (
          <Card className='mb-6'>
            <CardContent className='p-4'>
              <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2'>
                <Users className='h-5 w-5 text-blue-600 dark:text-blue-500' />
                Class Details
              </h3>

              {/* Timetable and Semester Information */}
              {(contextData?.timetable_data?.timetable_name ||
                contextData?.timetable_data?.semester ||
                contextData?.degree_name) && (
                <div className='mb-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden'>
                  {/* Header with gradient background */}
                  <div className='px-6 py-4 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 dark:from-blue-500/20 dark:via-indigo-500/20 dark:to-purple-500/20 border-b border-gray-200 dark:border-gray-800'>
                    <div className='flex items-center gap-3'>
                      <div className='p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm'>
                        <BookOpen className='h-5 w-5 text-blue-600 dark:text-blue-400' />
                      </div>
                      <h4 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                        Timetable Information
                      </h4>
                    </div>
                  </div>

                  {/* Content with better spacing */}
                  <div className='p-6 space-y-6'>
                    {/* Basic Info Grid */}
                    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
                      {contextData?.timetable_data?.timetable_name && (
                        <div className='bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
                          <span className='text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold'>
                            Timetable
                          </span>
                          <p className='text-sm font-bold text-gray-900 dark:text-gray-100 mt-1'>
                            {contextData.timetable_data.timetable_name}
                          </p>
                        </div>
                      )}

                      {contextData?.semester_name && (
                        <div className='bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
                          <span className='text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold'>
                            Semester
                          </span>
                          <p className='text-sm font-bold text-gray-900 dark:text-gray-100 mt-1'>
                            {contextData.semester_name}
                          </p>
                        </div>
                      )}

                      {/* Updated: 2026-02-06 - Show batch name for practical periods */}
                      {practicalSelection ? (
                        <div className='bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-700'>
                          <span className='text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold'>
                            Batch
                          </span>
                          <p className='text-sm font-bold text-purple-700 dark:text-purple-300 mt-1'>
                            {practicalSelection.batch_name}
                          </p>
                        </div>
                      ) : (contextData?.slot_sections &&
                        contextData.slot_sections.length > 0) ||
                      contextData?.section_name ? (
                        <div
                          className={cn(
                            'rounded-lg p-4 border',
                            contextData.slot_sections &&
                              contextData.slot_sections.length > 1
                              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                              : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                          )}
                        >
                          <span className='text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold'>
                            Section
                            {contextData.slot_sections &&
                            contextData.slot_sections.length > 1
                              ? 's'
                              : ''}
                          </span>
                          <p
                            className={cn(
                              'text-sm font-bold mt-1',
                              contextData.slot_sections &&
                                contextData.slot_sections.length > 1
                                ? 'text-green-700 dark:text-green-300'
                                : 'text-gray-900 dark:text-gray-100'
                            )}
                          >
                            {contextData.slot_sections &&
                            contextData.slot_sections.length > 0
                              ? contextData.slot_sections.length === 1
                                ? `Section ${contextData.slot_sections[0].section_name}`
                                : `${
                                    contextData.slot_sections.length
                                  } Sections: ${contextData.slot_sections
                                    .map((s: any) => s.section_name)
                                    .join(', ')}`
                              : `Section ${contextData.section_name}`}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {/* Assigned Staff Section - Improved Layout */}
                    <div className='border-t border-gray-200 dark:border-gray-700 pt-6'>
                      <div className='flex items-center gap-2 mb-4'>
                        <User className='h-4 w-4 text-gray-500 dark:text-gray-400' />
                        <span className='text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider'>
                          Assigned Faculty
                        </span>
                      </div>

                      {/* Updated: 2026-02-06 - Show practical selection staff when available */}
                      {practicalSelection?.staff && practicalSelection.staff.length > 0 ? (
                        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
                          {practicalSelection.staff.map((staff) => (
                            <div
                              key={staff.id}
                              className='flex items-center gap-3 p-3 rounded-lg border-2 transition-all bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            >
                              <div className='p-2 rounded-full bg-purple-100 dark:bg-purple-800'>
                                <User className='h-4 w-4 text-purple-600 dark:text-purple-400' />
                              </div>
                              <div className='flex-1 min-w-0'>
                                <p className='text-sm font-semibold text-gray-900 dark:text-gray-100 truncate'>
                                  {`${staff.first_name} ${staff.last_name}`.trim()}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : loadingStaff ? (
                        <div className='flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg'>
                          <div className='animate-spin h-5 w-5 border-3 border-blue-600 border-t-transparent rounded-full'></div>
                          <span className='text-gray-600 dark:text-gray-400 text-sm'>
                            Loading faculty information...
                          </span>
                        </div>
                      ) : assignedStaff.length > 0 ? (
                        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
                          {assignedStaff.map((staff, index) => (
                            <div
                              key={staff.id}
                              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                                staff.is_primary
                                  ? 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-300 dark:border-blue-700'
                                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                              }`}
                            >
                              <div
                                className={`p-2 rounded-full ${
                                  staff.is_primary
                                    ? 'bg-blue-100 dark:bg-blue-800'
                                    : 'bg-gray-100 dark:bg-gray-700'
                                }`}
                              >
                                <User
                                  className={`h-4 w-4 ${
                                    staff.is_primary
                                      ? 'text-blue-600 dark:text-blue-400'
                                      : 'text-gray-600 dark:text-gray-400'
                                  }`}
                                />
                              </div>
                              <div className='flex-1 min-w-0'>
                                <p className='text-sm font-semibold text-gray-900 dark:text-gray-100 truncate'>
                                  {staff.full_name}
                                </p>
                                <div className='flex items-center gap-2 mt-1'>
                                  {staff.is_primary && (
                                    <span className='inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200'>
                                      Primary
                                    </span>
                                  )}
                                  {staff.staff_id && (
                                    <span className='text-xs text-gray-500 dark:text-gray-400'>
                                      ID: {staff.staff_id}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className='p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800'>
                          <span className='text-yellow-800 dark:text-yellow-200 text-sm'>
                            No faculty assigned to this timetable slot
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm'>
                <div className='flex flex-col items-start gap-2'>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    Course:
                  </span>
                  <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                    {practicalSelection?.course_code ? `${practicalSelection.course_code} - ` : ''}{practicalSelection?.course_name || courseName || 'N/A'}
                  </span>
                </div>
                <div className='flex flex-col items-start gap-2'>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    Period:
                  </span>
                  <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                    {periodName || 'N/A'}
                  </span>
                </div>
                <div className='flex flex-col items-start gap-2'>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    Time:
                  </span>
                  <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                    {startTime && endTime ? `${startTime} - ${endTime}` : 'N/A'}
                  </span>
                </div>
                <div className='flex flex-col items-start gap-2'>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    Academic Year:
                  </span>
                  <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                    {contextData.academic_year_name || 'N/A'}
                  </span>
                </div>
                <div className='flex flex-col items-start gap-2'>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    Degree:
                  </span>
                  <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                    {contextData.degree_name || 'N/A'}
                  </span>
                </div>
                <div className='flex flex-col items-start gap-2'>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    Program:
                  </span>
                  <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                    {contextData.program_name || 'N/A'}
                  </span>
                </div>
                <div className='flex flex-col items-start gap-2'>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    Department:
                  </span>
                  <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                    {contextData.department_name || 'N/A'}
                  </span>
                </div>
                <div className='flex flex-col items-start gap-2'>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    Semester:
                  </span>
                  <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                    {contextData.semester_name || 'N/A'}
                  </span>
                </div>
                <div className='flex flex-col items-start gap-2'>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    {practicalSelection ? 'Batch:' : 'Section:'}
                  </span>
                  <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                    {practicalSelection ? practicalSelection.batch_name : (contextData.section_name || 'N/A')}
                  </span>
                </div>
                <div className='flex flex-col items-start gap-2'>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    Date:
                  </span>
                  <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                    {date ? format(new Date(date), 'dd-MMM-yyyy') : 'N/A'}
                  </span>
                </div>
                <div className='flex flex-col items-start gap-2'>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    Total Students:
                  </span>
                  <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                    {students.length}
                  </span>
                </div>
                <div className='flex flex-col items-start gap-2'>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    Present:
                  </span>
                  <span className='text-green-600 dark:text-green-500 font-semibold'>
                    {presentCount}
                  </span>
                </div>
                <div className='flex flex-col items-start gap-2'>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    Absent:
                  </span>
                  <span className='text-red-600 dark:text-red-500 font-semibold'>
                    {absentCount}
                  </span>
                </div>
                <div className='flex flex-col items-start gap-2'>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    Attendance Rate:
                  </span>
                  <span className='text-blue-600 dark:text-blue-500 font-semibold'>
                    {attendancePercentage}%
                  </span>
                </div>
                {existingAttendance && (
                  <div className='flex flex-col items-start gap-2'>
                    <span className='text-gray-600 dark:text-gray-400 font-medium'>
                      Status:
                    </span>
                    <span
                      className={`font-semibold ${
                        isEditMode
                          ? 'text-blue-600 dark:text-blue-500'
                          : isSuperAdmin
                          ? 'text-amber-600 dark:text-amber-500'
                          : 'text-red-600 dark:text-red-500'
                      }`}
                    >
                      {isEditMode
                        ? 'Editing Previous Record'
                        : isSuperAdmin
                        ? 'Previous Record (Can Edit)'
                        : 'Previous Record (Read Only)'}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Subdivision Info Alert (Updated: 2025-10-11) */}
        {isSubdividedSlot && (
          <Alert className='border-purple-200 bg-purple-50 dark:bg-purple-900/20'>
            <Users className='h-4 w-4 text-purple-600 dark:text-purple-500' />
            <AlertDescription className='text-purple-800 dark:text-purple-200'>
              ℹ️ This is a subdivided {subdivisionType} session with{' '}
              {activeSubdivisionGroups.length} group{activeSubdivisionGroups.length !== 1 ? 's' : ''}. Students are organized by their
              assigned group{activeSubdivisionGroups.length !== 1 ? 's' : ''} below.
            </AlertDescription>
          </Alert>
        )}

        {/* Colorful Stats Cards */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
          <Card className='border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white'>
            <CardContent className='p-6'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-blue-100 text-sm font-medium'>
                    Total Students
                  </p>
                  <p className='text-3xl font-bold mt-1'>{students.length}</p>
                </div>
                <div className='bg-white/20 p-3 rounded-full'>
                  <Users className='h-6 w-6' />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className='border-0 shadow-lg bg-gradient-to-br from-green-500 to-green-600 text-white'>
            <CardContent className='p-6'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-green-100 text-sm font-medium'>Present</p>
                  <p className='text-3xl font-bold mt-1'>{presentCount}</p>
                </div>
                <div className='bg-white/20 p-3 rounded-full'>
                  <UserCheck className='h-6 w-6' />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className='border-0 shadow-lg bg-gradient-to-br from-red-500 to-red-600 text-white'>
            <CardContent className='p-6'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-red-100 text-sm font-medium'>Absent</p>
                  <p className='text-3xl font-bold mt-1'>{absentCount}</p>
                </div>
                <div className='bg-white/20 p-3 rounded-full'>
                  <UserX className='h-6 w-6' />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={cn(
              'border-0 shadow-lg text-white',
              attendancePercentage >= 75
                ? 'bg-gradient-to-br from-emerald-500 to-emerald-600'
                : attendancePercentage >= 50
                ? 'bg-gradient-to-br from-yellow-500 to-orange-500'
                : 'bg-gradient-to-br from-red-500 to-red-600'
            )}
          >
            <CardContent className='p-6'>
              <div className='flex items-center justify-between'>
                <div>
                  <p
                    className={cn(
                      'text-sm font-medium',
                      attendancePercentage >= 75
                        ? 'text-emerald-100'
                        : attendancePercentage >= 50
                        ? 'text-yellow-100'
                        : 'text-red-100'
                    )}
                  >
                    Attendance Rate
                  </p>
                  <p className='text-3xl font-bold mt-1'>
                    {attendancePercentage}%
                  </p>
                </div>
                <div className='bg-white/20 p-3 rounded-full'>
                  <div
                    className={cn(
                      'h-6 w-6 rounded-full border-2 border-white flex items-center justify-center',
                      attendancePercentage >= 75
                        ? 'bg-white text-emerald-600'
                        : 'bg-transparent'
                    )}
                  >
                    {attendancePercentage >= 75 && (
                      <Check className='h-4 w-4' />
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        </>)}

        {/* Show only after practical selection is made (if practical period) or always (if standard period) */}
        {(periodMode === 'standard' || practicalSelection) && (
          <>
            {/* Modern Actions Bar */}
            <Card className='border-0 shadow-lg bg-gradient-to-r from-slate-50 to-gray-50 dark:from-gray-800 dark:to-gray-900'>
              <CardContent className='p-6'>
            <div className='flex flex-col lg:flex-row gap-4 items-center justify-between'>
              <div className='relative w-full lg:w-96'>
                <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4' />
                <Input
                  placeholder='Search by name, roll number, or email...'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className='pl-10 h-12 border-0 bg-white dark:bg-gray-800 shadow-md focus:ring-2 focus:ring-blue-500'
                />
              </div>

              <div className='flex gap-3 w-full lg:w-auto'>
                <Button
                  variant='outline'
                  onClick={() => markAll('Present')}
                  className='flex-1 lg:flex-initial h-12 bg-green-50 hover:bg-green-100 text-green-700 border-green-200 hover:border-green-300 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30'
                  disabled={existingAttendance && !isEditMode}
                >
                  <UserCheck className='h-4 w-4 mr-2' />
                  Mark All Present
                </Button>
                <Button
                  variant='outline'
                  onClick={() => markAll('Absent')}
                  className='flex-1 lg:flex-initial h-12 bg-red-50 hover:bg-red-100 text-red-700 border-red-200 hover:border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/30'
                  disabled={existingAttendance && !isEditMode}
                >
                  <UserX className='h-4 w-4 mr-2' />
                  Mark All Absent
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Student Grid - Conditional Rendering for Subdivided Slots (Updated: 2025-10-11) */}
        <div className='space-y-6'>
          <div className='flex items-center justify-between'>
            <h2 className='text-xl font-semibold flex items-center gap-2'>
              {isSubdividedSlot ? (
                <>
                  <Users className='h-5 w-5 text-purple-600 dark:text-purple-400' />
                  Subdivided{' '}
                  {subdivisionType.charAt(0).toUpperCase() +
                    subdivisionType.slice(1)}{' '}
                  Groups
                  <Badge
                    variant='secondary'
                    className='ml-2 bg-purple-100 text-purple-800'
                  >
                    {activeSubdivisionGroups.length} Group{activeSubdivisionGroups.length !== 1 ? 's' : ''}
                  </Badge>
                </>
              ) : (
                <>
                  <Users className='h-5 w-5 text-blue-600 dark:text-blue-400' />
                  Student Roster
                  <Badge variant='secondary' className='ml-2'>
                    {filteredStudents.length}{' '}
                    {filteredStudents.length === 1 ? 'Student' : 'Students'}
                  </Badge>
                </>
              )}
            </h2>
          </div>

          {loadingStudents ? (
            <Card className='border-0 shadow-lg'>
              <CardContent className='p-12'>
                <div className='flex flex-col items-center justify-center space-y-4'>
                  <div className='relative'>
                    <div className='animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600'></div>
                  </div>
                  <div className='text-center'>
                    <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                      Loading Students
                    </h3>
                    <p className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
                      Please wait while we fetch the student roster for this
                      section...
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : isSubdividedSlot && activeSubdivisionGroups.length > 0 ? (
            // NEW: Subdivided Attendance Grid (Updated: 2025-10-11)
            // Updated: 2026-03-13 - Use activeSubdivisionGroups (filtered to faculty's assigned group)
            <SubdividedAttendanceGrid
              groups={activeSubdivisionGroups}
              allStudents={students}
              availableStaff={assignedStaff}
              attendanceData={attendanceData}
              onAttendanceChange={(studentId, status) => {
                setAttendanceData((prev) => ({
                  ...prev,
                  [studentId]: status
                }));
              }}
              onMarkAllGroupPresent={(groupOrder) => {
                const group = activeSubdivisionGroups.find(
                  (g) => g.group_order === groupOrder
                );
                if (group) {
                  const newData = { ...attendanceData };
                  // Updated: 2026-03-13 - Combined periods have empty student_ids; use all students
                  const targetIds = group.student_ids.length > 0
                    ? group.student_ids
                    : students.map((s) => s.id);
                  targetIds.forEach((studentId) => {
                    newData[studentId] = 'Present';
                  });
                  setAttendanceData(newData);
                }
              }}
              onMarkAllGroupAbsent={(groupOrder) => {
                const group = activeSubdivisionGroups.find(
                  (g) => g.group_order === groupOrder
                );
                if (group) {
                  const newData = { ...attendanceData };
                  // Updated: 2026-03-13 - Combined periods have empty student_ids; use all students
                  const targetIds = group.student_ids.length > 0
                    ? group.student_ids
                    : students.map((s) => s.id);
                  targetIds.forEach((studentId) => {
                    newData[studentId] = 'Absent';
                  });
                  setAttendanceData(newData);
                }
              }}
              readOnly={existingAttendance && !isEditMode}
              searchTerm={searchTerm}
              subdivisionType={subdivisionType}
            />
          ) : filteredStudents.length === 0 ? (
            <Card className='border-0 shadow-lg border-l-4 border-l-amber-500'>
              <CardContent className='p-8'>
                <div className='flex items-center space-x-4'>
                  <div className='bg-amber-100 dark:bg-amber-900/30 p-3 rounded-full'>
                    <AlertTriangle className='h-6 w-6 text-amber-600 dark:text-amber-400' />
                  </div>
                  <div>
                    <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                      {searchTerm
                        ? 'No Matching Students'
                        : 'No Students Found'}
                    </h3>
                    <p className='text-gray-600 dark:text-gray-400'>
                      {searchTerm
                        ? 'Try adjusting your search terms to find students.'
                        : 'No students are enrolled in this section yet.'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
              {filteredStudents.map((student) => (
                <Card
                  key={student.id}
                  className={cn(
                    'border-0 shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-1 cursor-pointer',
                    attendanceData[student.id] === 'Present'
                      ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-l-4 border-l-green-500 dark:from-green-900/20 dark:to-emerald-900/20'
                      : 'bg-gradient-to-br from-red-50 to-rose-50 border-l-4 border-l-red-500 dark:from-red-900/20 dark:to-rose-900/20'
                  )}
                  onClick={() =>
                    !existingAttendance || isEditMode
                      ? toggleAttendance(student.id)
                      : null
                  }
                >
                  <CardContent className='p-4'>
                    <div className='flex flex-col items-center text-center space-y-3'>
                      {/* Student Image */}
                      <div className='relative'>
                        <Avatar className='h-16 w-16 ring-4 ring-white shadow-lg'>
                          <AvatarImage
                            src={student.avatar_url}
                            alt={`${student.first_name} ${student.last_name}`}
                          />
                          <AvatarFallback className='bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold text-lg'>
                            {student.first_name?.[0]?.toUpperCase()}
                            {student.last_name?.[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {/* Status Indicator */}
                        <div
                          className={cn(
                            'absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center shadow-md',
                            attendanceData[student.id] === 'Present'
                              ? 'bg-green-500'
                              : 'bg-red-500'
                          )}
                        >
                          {attendanceData[student.id] === 'Present' ? (
                            <Check className='h-3 w-3 text-white' />
                          ) : (
                            <X className='h-3 w-3 text-white' />
                          )}
                        </div>
                      </div>

                      {/* Student Info */}
                      <div className='w-full'>
                        <div className='flex items-center justify-center gap-2'>
                          <h3 className='font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight'>
                            {student.first_name} {student.last_name}
                          </h3>
                          {/* Updated: 2026-01-29 - Show leave indicator if student has approved leave */}
                          {approvedLeaveMap.has(student.id) && (
                            <StudentLeaveIndicatorCompact
                              leaveInfo={approvedLeaveMap.get(student.id)!}
                            />
                          )}
                          {/* Updated: 2026-08-08 - fn_attendance_roster now returns
                              current-intake learners whose fees are still pending.
                              Mark the row so the widening does not swap one silent
                              behaviour for another. lifecycle_status already rides
                              along on the roster row. */}
                          {isProvisionalAttendanceStatus(
                            student.lifecycle_status
                          ) && <ProvisionalLearnerIndicatorCompact />}
                        </div>
                        <p className='text-xs text-gray-600 dark:text-gray-400 mt-1 font-medium'>
                          Roll: {student.roll_number || 'N/A'}
                        </p>
                        {/* Updated: 2025-10-08 - Show section badge for multi-section slots */}
                        {contextData?.slot_sections &&
                          contextData.slot_sections.length > 1 &&
                          student.section_name && (
                            <Badge
                              variant='outline'
                              className='text-xs mt-1 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700'
                            >
                              {student.section_name}
                            </Badge>
                          )}
                      </div>

                      {/* Attendance Status */}
                      <Button
                        variant={
                          attendanceData[student.id] === 'Present'
                            ? 'default'
                            : 'destructive'
                        }
                        size='sm'
                        className={cn(
                          'w-full h-8 text-xs font-medium transition-all duration-200',
                          attendanceData[student.id] === 'Present'
                            ? 'bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200'
                            : 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200',
                          existingAttendance &&
                            !isEditMode &&
                            'opacity-60 cursor-not-allowed'
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!existingAttendance || isEditMode) {
                            toggleAttendance(student.id);
                          }
                        }}
                        disabled={existingAttendance && !isEditMode}
                      >
                        {attendanceData[student.id] === 'Present' ? (
                          <>
                            <UserCheck className='h-3 w-3 mr-1' />
                            Present
                          </>
                        ) : (
                          <>
                            <UserX className='h-3 w-3 mr-1' />
                            Absent
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Modern Save Actions */}
        {(!existingAttendance || isEditMode) && (
          <Card className='border-0 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20'>
            <CardContent className='p-6'>
              <div className='flex flex-col sm:flex-row justify-between items-center gap-4'>
                <div className='flex items-center gap-3'>
                  <div className='bg-blue-100 dark:bg-blue-900/50 p-2 rounded-full'>
                    <Check className='h-5 w-5 text-blue-600 dark:text-blue-400' />
                  </div>
                  <div>
                    <h3 className='font-semibold text-gray-900 dark:text-gray-100'>
                      {existingAttendance
                        ? 'Update Attendance'
                        : 'Save Attendance'}
                    </h3>
                    <p className='text-sm text-gray-600 dark:text-gray-400'>
                      {existingAttendance
                        ? 'Save changes to the attendance record'
                        : `Mark attendance for ${students.length} students`}
                    </p>
                  </div>
                </div>

                <div className='flex gap-3 w-full sm:w-auto'>
                  <Button
                    variant='outline'
                    onClick={() => {
                      if (isEditMode) {
                        setIsEditMode(false);
                      } else {
                        router.push('/academic/attendance');
                      }
                    }}
                    disabled={savingAttendance}
                    className='flex-1 sm:flex-initial h-11 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
                  >
                    {isEditMode ? 'Cancel Edit' : 'Cancel'}
                  </Button>
                  <Button
                    onClick={handleSaveAttendance}
                    disabled={savingAttendance || students.length === 0 || leaveBlockInfo?.is_blocked === true}
                    className='flex-1 sm:flex-initial h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200 dark:shadow-blue-900/50'
                  >
                    {savingAttendance ? (
                      <>
                        <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                        {existingAttendance ? 'Updating...' : 'Saving...'}
                      </>
                    ) : (
                      <>
                        <Check className='h-4 w-4 mr-2' />
                        {existingAttendance
                          ? 'Update Attendance'
                          : 'Save Attendance'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Modern Read-only Message */}
        {existingAttendance && !isEditMode && !isSuperAdmin && (
          <Card className='border-0 shadow-lg bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-800 dark:to-gray-900'>
            <CardContent className='p-8'>
              <div className='flex flex-col items-center text-center space-y-4'>
                <div className='bg-gray-100 dark:bg-gray-700 p-4 rounded-full'>
                  <AlertTriangle className='h-8 w-8 text-gray-600 dark:text-gray-400' />
                </div>
                <div>
                  <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2'>
                    📋 View-Only Mode
                  </h3>
                  <p className='text-gray-600 dark:text-gray-400 mb-4'>
                    This attendance record has already been marked and is in
                    read-only mode. Contact an administrator if changes are
                    needed.
                  </p>
                  <Button
                    variant='outline'
                    onClick={() => router.push('/academic/attendance')}
                    className='bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
                  >
                    <ArrowLeft className='h-4 w-4 mr-2' />
                    Back to Attendance
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        </>
        )}

        {/* Attendance Summary Modal */}
        <AttendanceSummaryModal
          open={showSummaryModal}
          onOpenChange={setShowSummaryModal}
          onConfirm={performSaveAttendance}
          loading={savingAttendance}
          students={students}
          attendanceData={attendanceData}
          contextData={contextData}
          courseName={practicalSelection?.course_name || courseName || undefined}
          batchName={practicalSelection?.batch_name}
          periodName={periodName || undefined}
          date={date || undefined}
          startTime={startTime || undefined}
          endTime={endTime || undefined}
          existingAttendance={existingAttendance}
          isEditMode={isEditMode}
          editDiff={editDiff}
        />
      </div>
    </ContentLayout>
  );
}
