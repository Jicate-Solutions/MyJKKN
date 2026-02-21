'use client';

export const dynamic = 'force-dynamic';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  Suspense,
  use,
  useMemo
} from 'react';
import { useRouter } from 'next/navigation';
import {
  Save,
  Plus,
  Calendar,
  Settings,
  Download,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Lock
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import Loading from '@/components/Loading/Loading';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { useTimetables } from '@/hooks/academic/use-timetables';
import { useCourses } from '@/hooks/organization/use-courses';
import { useStaffForSelection } from '@/hooks/staff/use-staff';
import { useSections } from '@/hooks/organization/use-sections';
import { useCourseMappings } from '@/hooks/organization/use-course-mappings';
import { SectionService } from '@/lib/services/organization/section-service';
import { Timetable, DayOfWeek, Period } from '@/types/academics';
import { usePermissions } from '@/hooks/use-permissions';
import { Label } from '@/components/ui/label';

// Import custom hooks (Phase 1)
import {
  useTimetableDetail,
  useTimetablePeriods,
  useStaffPlanningData,
  useTimetableDialogs
} from './_hooks';

// Import utilities (Phase 2)
import {
  sortPeriodsByName,
  generateDateRange,
  validateDateRange,
  checkDatesWithSlots,
  calculateDaysInRange,
  exportTimetableToPDF,
  createRangeMarker,
  parseRangeMarker,
  isPeriodLocked,
  buildSlotData,
  validateSlotData,
  findExistingSlot,
  isSubdividedSlot,
  formatSlotForGrid
} from './_utils';

// Import existing components
import { TimetableHeader } from './_components/timetable-header';
import { TimetableGrid } from './_components/timetable-grid';
import { BatchTimetableGrid } from './_components/batch-timetable-grid';
import { SortablePeriodItem } from './_components/sortable-period-item';

// Import extracted components (Phase 3)
import { TimetableActions } from './_components/timetable-actions';
import { TemplateDialog } from './_components/template-dialog';
import { UnsavedChangesDialog } from './_components/unsaved-changes-dialog';
import { DateRangeDialog } from './_components/date-range-dialog';

// Import lazy-loaded dialogs (Phase 3)
import {
  SlotDialogLazy,
  SubdivisionConfigDialogLazy,
  PeriodConfigurationLazy,
  DialogLoadingFallback
} from './_components/lazy-dialogs';

import toast from 'react-hot-toast';

// All available days (Monday to Saturday - Sunday is holiday)
const ALL_DAYS_OF_WEEK: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY'
];

export default function TimetableDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const timetableId = unwrappedParams.id;
  const { saveTimetableAsTemplate } = useTimetables();

  // Get permissions for role-based access control
  const { canAccess, isSuperAdmin } = usePermissions();

  // Permission checks for different actions
  const canEditTimetable =
    isSuperAdmin || canAccess('academic.timetables', 'edit');
  const canDeleteTimetable =
    isSuperAdmin || canAccess('academic.timetables', 'delete');
  const canCreateTimetable =
    isSuperAdmin || canAccess('academic.timetables', 'create');

  // Add ref for timetable grid capture
  const timetableGridRef = useRef<HTMLDivElement>(null);

  // ===================================
  // PHASE 1: Use Custom Hooks
  // ===================================

  // Core timetable data management
  const {
    timetable,
    periods,
    slots,
    setSlots,
    loading,
    error,
    hasAttendance,
    markedPeriods,
    timetableFormat,
    setTimetableFormat,
    selectedDays,
    setSelectedDays,
    selectedDates,
    setSelectedDates,
    fetchTimetableData
  } = useTimetableDetail(timetableId);

  // Period selection and persistence
  const {
    selectedPeriods,
    setSelectedPeriods,
    lockedPeriods,
    setLockedPeriods,
    savingPeriods,
    savePeriodSelections: savePeriods
  } = useTimetablePeriods(timetableId, periods, timetable?.periods);

  // Additional state for unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Staff planning data
  const { staffPlanningCourses, staffPlanningStaff } =
    useStaffPlanningData(timetable);

  // Additional loading states (not from hook)
  const [loadingStaffPlanData] = useState(false);

  // Dialog state management
  const {
    slotDialog,
    subdivisionDialog,
    templateDialog,
    deleteDialog,
    addDateRangeDialog,
    unsavedChangesDialog,
    periodSelectorDialog,
    dayConfigDialog
  } = useTimetableDialogs();

  // Add period dialog state (not in hook)
  const [addPeriodDialogOpen, setAddPeriodDialogOpen] = useState(false);

  // ===================================
  // Additional Local State (Non-extracted)
  // ===================================

  const [dateRanges, setDateRanges] = useState<
    Array<{ start: string; end: string }>
  >([]);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null
  );
  // State to track which date range is being edited
  const [pendingEditRangeMarker, setPendingEditRangeMarker] = useState<string | null>(null);

  // ===================================
  // Helper Functions for Period Management
  // ===================================

  const addPeriod = useCallback(
    async (period: Period) => {
      const newSelectedPeriods = sortPeriodsByName([
        ...selectedPeriods,
        period
      ]);
      setSelectedPeriods(newSelectedPeriods);
      setHasUnsavedChanges(true);
    },
    [selectedPeriods, setSelectedPeriods]
  );

  const removePeriod = useCallback(
    (period: Period) => {
      const newSelectedPeriods = selectedPeriods.filter(
        (p: Period) => p.id !== period.id
      );

      setSelectedPeriods(newSelectedPeriods);
      setHasUnsavedChanges(true);
      toast.success(`Period "${period.period_name}" removed. Click "Save Periods" to confirm.`);
    },
    [selectedPeriods, setSelectedPeriods]
  );

  const toggleLockPeriod = useCallback(
    (periodId: string) => {
      const newLockedPeriods = lockedPeriods.includes(periodId)
        ? lockedPeriods.filter((id: string) => id !== periodId)
        : [...lockedPeriods, periodId];
      setLockedPeriods(newLockedPeriods);
    },
    [lockedPeriods, setLockedPeriods]
  );

  const clearAllPeriods = useCallback(() => {
    setSelectedPeriods([]);
    setLockedPeriods([]);
    setHasUnsavedChanges(true);
  }, [setSelectedPeriods, setLockedPeriods]);

  // Wrapper for save periods that includes all parameters
  // Updated: 2025-10-27 - Added modal close after successful save
  const savePeriodSelections = useCallback(async () => {
    if (!timetable) return;
    await savePeriods(
      timetable.id,
      selectedDays,
      selectedDates,
      timetableFormat
    );
    setHasUnsavedChanges(false);
    await fetchTimetableData(true);
    periodSelectorDialog.close(); // Close the modal after successful save
  }, [
    timetable,
    savePeriods,
    selectedDays,
    selectedDates,
    timetableFormat,
    fetchTimetableData,
    periodSelectorDialog
  ]);

  // ===================================
  // Fetch Data (React Query)
  // ===================================

  const coursesQuery = useCourses({
    institution_id: timetable?.institution_id,
    isActive: true
  });
  const allCourses = coursesQuery.data?.data || [];

  // Fixed: 2025-11-07 - Use lightweight staff query to avoid timeout
  const staffQuery = useStaffForSelection({
    institution_id: timetable?.institution_id,
    isActive: true
  });
  const allStaff = staffQuery.data || [];

  const sectionsQuery = useSections({
    institution_id: timetable?.institution_id,
    limit: 1000 // Fixed: 2025-11-07 - Fetch all sections for the institution
  });
  const sections = sectionsQuery.data?.data || [];

  // Fixed: 2025-12-31 - Fetch course mappings to filter courses by timetable's program/department/semester
  // This prevents showing courses from other departments when staff planning data is unavailable
  const courseMappingsQuery = useCourseMappings({
    institution_id: timetable?.institution_id,
    program_id: timetable?.program_id,
    department_id: timetable?.department_id,
    semester_id: timetable?.semester_id,
    isActive: true,
    limit: 1000
  });
  const courseMappings = courseMappingsQuery.data?.data || [];

  // Computed values for courses and staff to use in slot creation
  // Use staff planning data if available, otherwise fall back to filtered courses based on mappings
  const courses = useMemo(() => {
    // If staff planning courses are available, use them
    if (staffPlanningCourses.length > 0) {
      return staffPlanningCourses;
    }

    // Fixed: 2025-12-31 - Filter allCourses by course mappings to show only relevant courses
    // Extract course IDs from course mappings for this timetable's program/department/semester
    const mappedCourseIds = new Set(courseMappings.map(mapping => mapping.course_id));

    // Filter allCourses to only include courses with valid mappings
    const filteredCourses = allCourses.filter(course => mappedCourseIds.has(course.id));

    logger.info('academic/timetables', 'Filtering courses by mappings', {
      totalCourses: allCourses.length,
      mappedCourses: mappedCourseIds.size,
      filteredCourses: filteredCourses.length,
      timetableProgram: timetable?.program_id,
      timetableDepartment: timetable?.department_id,
      timetableSemester: timetable?.semester_id
    });

    return filteredCourses;
  }, [staffPlanningCourses, allCourses, courseMappings, timetable]);

  // Fixed: 2025-11-07 - Merge staff from existing slot when editing
  const staff = useMemo(() => {
    const baseStaff = staffPlanningStaff.length > 0 ? staffPlanningStaff : allStaff;

    // If editing an existing slot, merge in any staff that are assigned but not in staff planning
    if (slotDialog.isOpen && slotDialog.data.selectedSlot) {
      const existingSlot = slotDialog.data.selectedSlot;

      // Get staff members from existing slot (enriched data)
      const existingStaffMembers = existingSlot.staff_members || [];

      // Check which existing staff are missing from base staff list
      const missingStaff = existingStaffMembers.filter(
        (staffMember: any) => !baseStaff.some((s: any) => s.id === staffMember.id)
      );

      if (missingStaff.length > 0) {
        return [...baseStaff, ...missingStaff];
      }
    }

    return baseStaff;
  }, [staffPlanningStaff, allStaff, slotDialog.isOpen, slotDialog.data.selectedSlot]);

  // ===================================
  // Filter sections by semester for slot dialog
  // Fixed: 2025-11-07 - Filter sections based on timetable semester using useMemo
  // ===================================
  const filteredSections = useMemo(() => {
    if (timetable?.semester_id && sections.length > 0) {
      const filtered = sections.filter(
        (section) => section.semester_id === timetable.semester_id
      );

      if (filtered.length === 0) {
        logger.warn('academic/timetables', 'No sections found after filtering', {
          timetableSemesterId: timetable.semester_id,
          totalSections: sections.length
        });
      }

      return filtered;
    }
    return [];
  }, [timetable?.semester_id, sections]);

  // ===================================
  // Navigation Warning
  // ===================================

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue =
          'You have unsaved changes to your timetable configuration. Are you sure you want to leave?';
        return 'You have unsaved changes to your timetable configuration. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleNavigationWithWarning = (path: string) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(path);
      unsavedChangesDialog.open();
    } else {
      router.push(path);
    }
  };

  const handleSaveAndContinue = async () => {
    try {
      await savePeriodSelections();
      unsavedChangesDialog.close();
      if (pendingNavigation) {
        router.push(pendingNavigation);
        setPendingNavigation(null);
      }
    } catch (error) {
      logger.error('academic/timetables', 'Error saving configuration', error);
      toast.error('Failed to save configuration. Please try again.');
    }
  };

  const handleDiscardAndContinue = () => {
    setHasUnsavedChanges(false);
    unsavedChangesDialog.close();
    if (pendingNavigation) {
      router.push(pendingNavigation);
      setPendingNavigation(null);
    }
  };

  // ===================================
  // Template Save Handler
  // ===================================

  const handleSaveAsTemplate = async (name: string) => {
    try {
      const success = await saveTimetableAsTemplate(timetableId, name);
      if (success) {
        toast.success('Timetable saved as template successfully');
        templateDialog.close();
      } else {
        throw new Error('Failed to save template');
      }
    } catch (err) {
      logger.error('academic/timetables', 'Error saving as template', err);
      toast.error('Failed to save as template. Please try again.');
    }
  };

  // ===================================
  // Slot Management
  // ===================================

  // NEW: 2025-12-05 - Get default slot data for pre-filling new slots
  // DISABLED: 2025-12-11 - Pre-fill feature caused confusion because empty slots
  // appeared to have data from other days. Users would click an empty slot,
  // see pre-filled data, and think the slot already existed.
  // Keeping the function structure for potential future use with better UX.
  const getDefaultSlotDataForPeriod = useCallback(
    (periodId: string): {
      staff_ids?: string[];
      staff_members?: any[];
      course_id?: string;
      course?: any;
      section_ids?: string[];
    } | undefined => {
      // DISABLED: Pre-fill feature removed to avoid confusion
      // Empty slots should show empty form, not data from other days
      return undefined;

      // Original implementation (commented out for reference):
      // Search through existing slots to find one with the same period_id
      // const existingSlotForPeriod = slots.find(
      //   (slot: any) => slot.period_id === periodId && !slot.is_break_slot
      // );
      //
      // if (existingSlotForPeriod) {
      //   return {
      //     staff_ids: existingSlotForPeriod.staff_ids,
      //     staff_members: existingSlotForPeriod.staff_members,
      //     course_id: existingSlotForPeriod.course_id,
      //     course: existingSlotForPeriod.course,
      //     section_ids: existingSlotForPeriod.section_ids
      //   };
      // }
      //
      // return undefined;
    },
    [slots]
  );

  const openSlotDialog = useCallback(
    async (day: DayOfWeek | string, period: Period, existingSlot?: any) => {
      // Check if this period has attendance marked (but allow super admins to override)
      const periodLocked = isPeriodLocked(period.id, markedPeriods);

      if (periodLocked && !isSuperAdmin) {
        toast.error(
          'This period cannot be modified because attendance has been marked. Staff changes should be made through the Staff Planning module.'
        );
        return;
      }

      // Check if this is an existing subdivided slot
      if (isSubdividedSlot(existingSlot)) {
        const hasStudentAssignments = existingSlot.sub_slots?.some(
          (ss: any) => ss.student_ids && ss.student_ids.length > 0
        );

        if (hasStudentAssignments && existingSlot.section_ids?.[0]) {
          try {
            const sectionId = existingSlot.section_ids[0];
            const { LearnerProfileService } = await import(
              '@/lib/services/learner-profile-service'
            );
            const studentsResponse = await LearnerProfileService.getLearnerProfiles({
              section_id: sectionId,
              limit: 1000
            });

            // Use subdivision dialog methods to set state
            subdivisionDialog.setAllStudents(studentsResponse.data || []);
            subdivisionDialog.setType(
              existingSlot.subdivision_type || 'practical'
            );
            subdivisionDialog.setMode(existingSlot.subdivision_mode || 'auto');
            subdivisionDialog.setPendingSlotData(existingSlot);

            // Open subdivision config dialog with config object
            subdivisionDialog.openWith({
              slotData: existingSlot,
              period,
              day: day as DayOfWeek | string,
              type: existingSlot.subdivision_type || 'practical',
              mode: existingSlot.subdivision_mode || 'auto',
              students: studentsResponse.data || []
            });
          } catch (error) {
            logger.error('academic/timetables', 'Error fetching students', error);
            toast.error('Failed to load student data. Please try again.');
          }
          return;
        }
      }

      // Check permissions
      let isReadOnly = false;
      if (existingSlot) {
        isReadOnly = !canEditTimetable;
      } else {
        if (!canEditTimetable) {
          toast.error('You do not have permission to create timetable slots.');
          return;
        }
      }

      // Prevent slot creation for break periods
      if (period.is_break && !existingSlot) {
        toast.error(
          'Slots cannot be created during break periods. Break periods are reserved for breaks across all days.'
        );
        return;
      }

      // Open slot dialog
      slotDialog.openWith(day as DayOfWeek, period, existingSlot, isReadOnly);
    },
    [
      markedPeriods,
      isSuperAdmin,
      canEditTimetable,
      slotDialog,
      subdivisionDialog
    ]
  );

  const handleSlotSave = useCallback(
    async (
      slotData: any,
      shouldConfigureSubdivision: boolean,
      period: Period,
      day: DayOfWeek | string
    ) => {
      try {
        if (shouldConfigureSubdivision) {
          // Store data for subdivision configuration
          if (slotData.section_ids?.[0]) {
            const { LearnerProfileService } = await import(
              '@/lib/services/learner-profile-service'
            );
            const studentsResponse = await LearnerProfileService.getLearnerProfiles({
              section_id: slotData.section_ids[0],
              limit: 1000
            });

            // Use subdivision dialog methods
            subdivisionDialog.setAllStudents(studentsResponse.data || []);
            subdivisionDialog.setPendingSlotData(slotData);

            subdivisionDialog.openWith({
              slotData,
              period,
              day: day as DayOfWeek | string,
              students: studentsResponse.data || []
            });
          }

          slotDialog.close();
        } else {
          // Regular slot save
          // Add required fields for validation (Updated: 2025-10-25)
          const completeSlotData = {
            ...slotData,
            timetable_id: timetableId,
            period_id: period.id,
            slot_date: day as string
          };

          const validation = validateSlotData(completeSlotData);
          if (!validation.valid) {
            logger.error('academic/timetables', 'Slot validation failed', { errors: validation.errors });
            toast.error(validation.errors.join(', '));
            return;
          }

          // Updated: 2025-12-01 - Handle RANGE markers in batch mode
          // When day is a RANGE marker (e.g., "RANGE:2025-11-02:2025-12-17"),
          // we need to update ALL individual dates in that range
          const dayStr = day as string;
          if (timetableFormat === 'batch' && dayStr.startsWith('RANGE:')) {
            // Parse the range marker to get start and end dates
            const parts = dayStr.split(':');
            if (parts.length === 3) {
              const startDate = parts[1];
              const endDate = parts[2];

              // Generate all dates in the range
              const dates: string[] = [];
              const current = new Date(startDate);
              const end = new Date(endDate);

              while (current <= end) {
                dates.push(current.toISOString().split('T')[0]);
                current.setDate(current.getDate() + 1);
              }

              // Updated: 2025-12-11 - Also update the RANGE key so the grid shows correct data
              // The batch grid displays data from RANGE keys, so we need to update that as well
              // First update the RANGE slot
              await TimetableService.updateTimetableSlot(
                timetableId,
                dayStr, // The RANGE marker itself (e.g., "RANGE:2025-11-02:2025-12-17")
                period.id,
                { ...slotData, slot_date: dayStr }, // Set slot_date to the RANGE marker
                true // isBatch
              );

              // Then update all individual dates atomically
              await TimetableService.updateTimetableSlotsBatch(
                timetableId,
                dates,
                period.id,
                slotData,
                true // suppressToast - we'll show our own
              );
            } else {
              // Fallback for malformed range - save as single entry
              logger.warn('academic/timetables', 'Malformed range marker', { dayStr });
              await TimetableService.updateTimetableSlot(
                timetableId,
                dayStr,
                period.id,
                slotData,
                timetableFormat === 'batch'
              );
            }
          } else {
            // Regular save (non-batch or single date)
            await TimetableService.updateTimetableSlot(
              timetableId,
              dayStr,
              period.id,
              slotData,
              timetableFormat === 'batch'
            );
          }
          await fetchTimetableData(true);
          slotDialog.close();
          toast.success('Slot saved successfully');
        }
      } catch (error) {
        logger.error('academic/timetables', 'Error saving slot', error);
        toast.error('Failed to save slot. Please try again.');
      }
    },
    [
      timetableId,
      timetableFormat,
      slotDialog,
      subdivisionDialog,
      fetchTimetableData
    ]
  );

  const handleSubdivisionConfigSave = useCallback(
    async (config: any) => {
      try {
        const slotData = subdivisionDialog.data.pendingSlotData;
        const period = subdivisionDialog.data.pendingPeriod;
        const day = subdivisionDialog.data.pendingDay;

        if (!slotData || !period || !day) {
          toast.error('Missing slot data for subdivision save');
          return;
        }

        const completeSlotData = {
          ...slotData,
          is_subdivided: true,
          subdivision_type: config.subdivision_type,
          subdivision_mode: config.subdivision_mode,
          sub_slots: config.groups.map((group: any, index: number) => ({
            sub_slot_order: index + 1,
            group_name: group.group_name,
            course_id: group.course_id,
            staff_ids: group.staff_ids,
            student_ids: group.student_ids,
            lab_room: group.lab_room,
            max_capacity: group.max_capacity
          }))
        };

        // FIX: 2025-12-06 - Handle RANGE markers in batch mode for subdivision saves
        // This ensures subdivided slots are propagated to ALL dates in the range
        const dayStr = day as string;
        if (timetableFormat === 'batch' && dayStr.startsWith('RANGE:')) {
          const parts = dayStr.split(':');
          if (parts.length === 3) {
            const startDate = parts[1];
            const endDate = parts[2];

            // Generate all dates in the range
            const dates: string[] = [];
            const current = new Date(startDate);
            const end = new Date(endDate);

            while (current <= end) {
              dates.push(current.toISOString().split('T')[0]);
              current.setDate(current.getDate() + 1);
            }

            // Updated: 2025-12-11 - Also update the RANGE key so the grid shows correct data
            // First update the RANGE slot
            await TimetableService.updateTimetableSlot(
              timetableId,
              dayStr, // The RANGE marker itself
              period.id,
              { ...completeSlotData, slot_date: dayStr },
              true // isBatch
            );

            // Then update all individual dates atomically
            await TimetableService.updateTimetableSlotsBatch(
              timetableId,
              dates,
              period.id,
              completeSlotData,
              true // suppressToast
            );
          } else {
            // Fallback for malformed range
            logger.warn('academic/timetables', 'Malformed range marker in subdivision', { dayStr });
            await TimetableService.updateTimetableSlot(
              timetableId,
              dayStr,
              period.id,
              completeSlotData,
              timetableFormat === 'batch'
            );
          }
        } else {
          // Regular save (non-batch or single date)
          await TimetableService.updateTimetableSlot(
            timetableId,
            dayStr,
            period.id,
            completeSlotData,
            timetableFormat === 'batch'
          );
        }
        await fetchTimetableData(true);
        subdivisionDialog.close();
        toast.success('Subdivided slot saved successfully');
      } catch (error) {
        logger.error('academic/timetables', 'Error saving subdivision', error);
        toast.error('Failed to save subdivision. Please try again.');
      }
    },
    [timetableId, timetableFormat, subdivisionDialog, fetchTimetableData]
  );

  const requestSlotDeletion = useCallback(
    (day: DayOfWeek | string, period: Period, existingSlot: any) => {
      // Check if period is locked
      if (isPeriodLocked(period.id, markedPeriods) && !isSuperAdmin) {
        toast.error(
          'This period cannot be modified because attendance has been marked.'
        );
        return;
      }

      deleteDialog.openWith(existingSlot);
    },
    [markedPeriods, isSuperAdmin, deleteDialog]
  );

  const confirmSlotDeletion = useCallback(async () => {
    try {
      const slotData = deleteDialog.data.slotToDelete;

      // Fixed: 2025-10-27 - Check for period_id instead of id
      // Slots don't have an 'id' field, they have 'period_id', 'timetable_id', and 'day_of_week'/'slot_date'
      if (!slotData || !slotData.period_id) {
        logger.error('academic/timetables', 'Invalid slot data for deletion', { slotData });
        toast.error('No slot selected for deletion');
        return;
      }

      const day =
        timetableFormat === 'batch' ? slotData.slot_date : slotData.day_of_week;
      const periodId = slotData.period_id;

      if (!day || !periodId) {
        logger.error('academic/timetables', 'Missing day or period ID', { day, periodId });
        toast.error('Invalid slot data');
        return;
      }

      await TimetableService.deleteTimetableSlot(
        timetableId,
        day,
        periodId,
        timetableFormat === 'batch',
        true // suppressToast - let page handle toast
      );
      await fetchTimetableData(true);
      deleteDialog.close();
      deleteDialog.clearSlot();
      toast.success('Slot deleted successfully');
    } catch (error) {
      logger.error('academic/timetables', 'Error deleting slot', error);
      toast.error('Failed to delete slot. Please try again.');
    }
  }, [timetableId, timetableFormat, deleteDialog, fetchTimetableData]);

  // ===================================
  // Day Configuration
  // ===================================

  const handleDayToggle = (day: DayOfWeek) => {
    const newSelectedDays = selectedDays.includes(day)
      ? selectedDays.filter((d: DayOfWeek) => d !== day)
      : [...selectedDays, day];
    setSelectedDays(newSelectedDays);
    setHasUnsavedChanges(true);
  };

  const selectAllDays = () => {
    setSelectedDays(ALL_DAYS_OF_WEEK);
    setHasUnsavedChanges(true);
  };

  const clearAllDays = () => {
    setSelectedDays([]);
    setHasUnsavedChanges(true);
  };

  // ===================================
  // Date Range Management
  // ===================================

  const handleAddDateRange = useCallback(
    (startDate: Date, endDate: Date) => {
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // If we're editing, we need to exclude the current range from validation
      const datesToValidate = pendingEditRangeMarker
        ? selectedDates.filter(d => d !== pendingEditRangeMarker)
        : selectedDates;

      // Validate date range
      const validation = validateDateRange(
        startDateStr,
        endDateStr,
        datesToValidate
      );
      if (!validation.valid) {
        toast.error(validation.message || 'Invalid date range');
        return;
      }

      // Check for dates with slots (only if not editing, or if dates changed)
      const slotCheck = checkDatesWithSlots(startDateStr, endDateStr, slots);
      if (slotCheck.hasSlots) {
        toast.error(slotCheck.message || 'Some dates already have slots');
        return;
      }

      // If editing, remove the old range first
      let newSelectedDates = [...selectedDates];
      let newDateRanges = [...dateRanges];

      if (pendingEditRangeMarker) {
        // Remove old range
        newSelectedDates = newSelectedDates.filter(d => d !== pendingEditRangeMarker);
        const oldParsed = parseRangeMarker(pendingEditRangeMarker);
        if (oldParsed) {
          newDateRanges = newDateRanges.filter(
            r => !(r.start === oldParsed.start && r.end === oldParsed.end)
          );
        }
      }

      // Add new/updated range marker
      const rangeMarker = createRangeMarker(startDateStr, endDateStr);
      newSelectedDates.push(rangeMarker);
      newDateRanges.push({ start: startDateStr, end: endDateStr });

      setSelectedDates(newSelectedDates);
      setDateRanges(newDateRanges);
      setHasUnsavedChanges(true);

      const days = calculateDaysInRange(startDateStr, endDateStr);
      const message = pendingEditRangeMarker
        ? `Date range updated to ${startDateStr} to ${endDateStr} (${days} days). Click 'Save Configuration' to confirm.`
        : `Date range from ${startDateStr} to ${endDateStr} (${days} days) has been added. Click 'Save Configuration' to confirm.`;

      toast.success(message);

      // Reset edit state and close dialog
      setPendingEditRangeMarker(null);
      addDateRangeDialog.close();
    },
    [
      selectedDates,
      slots,
      addDateRangeDialog,
      setSelectedDates,
      setHasUnsavedChanges,
      pendingEditRangeMarker,
      dateRanges
    ]
  );

  const removeDateRange = useCallback(
    (rangeMarker: string) => {
      const newSelectedDates = selectedDates.filter(
        (d: string) => d !== rangeMarker
      );
      setSelectedDates(newSelectedDates);

      const parsed = parseRangeMarker(rangeMarker);
      if (parsed) {
        setDateRanges((prev) =>
          prev.filter(
            (r) => !(r.start === parsed.start && r.end === parsed.end)
          )
        );
      }

      setHasUnsavedChanges(true);
      toast.success(
        'Date range removed. Click "Save Configuration" to confirm.'
      );
    },
    [selectedDates, setSelectedDates, setHasUnsavedChanges]
  );

  const editDateRange = useCallback(
    (rangeMarker: string) => {
      // Parse the existing range marker to get start and end dates
      const parsed = parseRangeMarker(rangeMarker);
      if (parsed) {
        // Set the dates in the dialog
        addDateRangeDialog.setStartDate(new Date(parsed.start));
        addDateRangeDialog.setEndDate(new Date(parsed.end));

        // Store the range marker being edited so we can remove it when updating
        // We'll use a state variable to track this
        setPendingEditRangeMarker(rangeMarker);

        // Open the dialog
        addDateRangeDialog.open();
      } else {
        toast.error('Unable to edit this date range. Please try removing and adding it again.');
      }
    },
    [addDateRangeDialog]
  );

  // ===================================
  // Period Drag & Drop
  // ===================================

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = selectedPeriods.findIndex(
        (item) => item.id === active.id
      );
      const newIndex = selectedPeriods.findIndex((item) => item.id === over.id);
      const newPeriods = arrayMove(selectedPeriods, oldIndex, newIndex);
      setSelectedPeriods(newPeriods);
      setHasUnsavedChanges(true);
    }
  };

  const getAvailablePeriods = useCallback(() => {
    return periods.filter(
      (period) => !selectedPeriods.some((sp) => sp.id === period.id)
    );
  }, [periods, selectedPeriods]);

  // ===================================
  // PDF Export
  // ===================================

  const handleExportPDF = useCallback(async () => {
    if (!timetable || !timetableGridRef.current) {
      toast.error('Unable to export timetable');
      return;
    }

    try {
      await exportTimetableToPDF(timetable, timetableFormat, timetableGridRef);
      toast.success('Timetable exported successfully');
    } catch (error) {
      logger.error('academic/timetables', 'Error exporting PDF', error);
      toast.error('Failed to export timetable');
    }
  }, [timetable, timetableFormat]);

  // ===================================
  // Format Change
  // ===================================

  const handleFormatChange = (newFormat: 'regular' | 'batch') => {
    if (hasAttendance && !isSuperAdmin) {
      toast.error(
        'Cannot change timetable format after attendance has been marked. Please contact an administrator.'
      );
      return;
    }

    if (slots.length > 0 && !isSuperAdmin) {
      toast.error(
        'Cannot change timetable format after slots have been created. Please clear all slots first or contact an administrator.'
      );
      return;
    }

    setTimetableFormat(newFormat);
    setHasUnsavedChanges(true);

    if (newFormat === 'batch') {
      setSelectedDates([]);
    } else {
      setSelectedDays(ALL_DAYS_OF_WEEK);
    }
  };

  // ===================================
  // Render
  // ===================================

  if (loading) {
    return <Loading title='Loading Timetable' />;
  }

  if (error || !timetable) {
    return (
      <ContentLayout title='Error'>
        <Card>
          <CardContent className='pt-6'>
            <div className='text-center space-y-4'>
              <AlertCircle className='h-12 w-12 text-red-500 mx-auto' />
              <h2 className='text-xl font-semibold'>Error Loading Timetable</h2>
              <p className='text-muted-foreground'>
                {error || 'Timetable not found'}
              </p>
              <Button onClick={() => router.push('/academic/timetables')}>
                <ArrowLeft className='mr-2 h-4 w-4' />
                Back to Timetables
              </Button>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Timetable Details'>
      <div className='space-y-6'>
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                onClick={() =>
                  handleNavigationWithWarning('/academic/timetables')
                }
              >
                Timetables
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{timetable.timetable_name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <TimetableHeader
          timetable={timetable}
          onBack={() => handleNavigationWithWarning('/academic/timetables')}
          canEdit={canEditTimetable}
          isSuperAdmin={isSuperAdmin}
          hasAttendance={hasAttendance}
        />

        {/* Action Buttons */}
        <TimetableActions
          timetableFormat={timetableFormat}
          onFormatChange={handleFormatChange}
          selectedPeriods={selectedPeriods}
          selectedDays={selectedDays}
          selectedDates={selectedDates}
          canEdit={canEditTimetable}
          isSuperAdmin={isSuperAdmin}
          hasAttendance={hasAttendance}
          hasSlots={slots.length > 0}
          savingPeriods={savingPeriods}
          hasUnsavedChanges={hasUnsavedChanges}
          onConfigurePeriods={periodSelectorDialog.open}
          onConfigureDays={dayConfigDialog.open}
          onAddDateRange={addDateRangeDialog.open}
          onSaveConfiguration={savePeriodSelections}
          onExportPDF={handleExportPDF}
        />

        {/* Warning if no periods configured */}
        {selectedPeriods.length === 0 && (
          <Card className='border-amber-200 bg-amber-50'>
            <CardContent className='pt-6'>
              <div className='flex items-start gap-3'>
                <AlertCircle className='h-5 w-5 text-amber-600 mt-0.5' />
                <div>
                  <h3 className='font-semibold text-amber-900'>
                    No Periods Configured
                  </h3>
                  <p className='text-sm text-amber-700 mt-1'>
                    Please configure periods to start creating your timetable.
                    Click the &quot;Configure Periods&quot; button above to get started.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timetable Grid */}
        <div ref={timetableGridRef}>
          {timetableFormat === 'regular' ? (
            <TimetableGrid
              selectedDays={selectedDays}
              selectedPeriods={selectedPeriods}
              slots={slots}
              onSlotClick={(day, period, existingSlot) => {
                openSlotDialog(day, period, existingSlot);
              }}
              onSlotDelete={(day, period, existingSlot) => {
                requestSlotDeletion(day, period, existingSlot);
              }}
              lockedPeriods={markedPeriods}
              isSuperAdmin={isSuperAdmin}
              canEdit={canEditTimetable}
            />
          ) : (
            <BatchTimetableGrid
              selectedDates={selectedDates}
              selectedPeriods={selectedPeriods}
              slots={slots}
              onSlotClick={(date, period, existingSlot) => {
                openSlotDialog(date, period, existingSlot);
              }}
              onSlotDelete={(date, period, existingSlot) => {
                requestSlotDeletion(date, period, existingSlot);
              }}
              onRemoveDate={removeDateRange}
              onEditDate={editDateRange}
              lockedPeriods={markedPeriods}
              canEdit={canEditTimetable}
              isSuperAdmin={isSuperAdmin}
            />
          )}
        </div>

        {/* ===================================
            DIALOGS - Lazy Loaded for Performance
            =================================== */}

        {/* Slot Dialog - Lazy Loaded */}
        <Suspense fallback={<DialogLoadingFallback />}>
          <SlotDialogLazy
            isOpen={slotDialog.isOpen}
            onClose={slotDialog.close}
            onSave={(slotData: any, shouldConfigureSubdivision?: boolean) => {
              if (slotDialog.data.selectedDay && slotDialog.data.selectedPeriod) {
                handleSlotSave(
                  slotData,
                  shouldConfigureSubdivision || false,
                  slotDialog.data.selectedPeriod,
                  slotDialog.data.selectedDay
                );
              }
            }}
            onDelete={() => {
              if (slotDialog.data.selectedDay && slotDialog.data.selectedPeriod && slotDialog.data.selectedSlot) {
                requestSlotDeletion(
                  slotDialog.data.selectedDay,
                  slotDialog.data.selectedPeriod,
                  slotDialog.data.selectedSlot
                );
              }
            }}
            timetable={timetable}
            existingSlot={slotDialog.data.selectedSlot}
            courses={courses}
            staff={staff}
            sections={sections}
            filteredSections={filteredSections}
            loadingFilteredSections={sectionsQuery.isLoading}
            isUsingStaffPlanningData={staffPlanningCourses.length > 0}
            loadingStaffPlanData={loadingStaffPlanData}
            readOnly={slotDialog.data.readOnly}
            selectedPeriod={slotDialog.data.selectedPeriod}
            // NEW: 2025-12-05 - Pass default slot data for pre-filling new slots
            defaultSlotData={
              !slotDialog.data.selectedSlot && slotDialog.data.selectedPeriod
                ? getDefaultSlotDataForPeriod(slotDialog.data.selectedPeriod.id)
                : undefined
            }
          />
        </Suspense>

        {/* Subdivision Config Dialog - Lazy Loaded */}
        <Suspense fallback={<DialogLoadingFallback />}>
          {subdivisionDialog.data.pendingSlotData && (
            <SubdivisionConfigDialogLazy
              isOpen={subdivisionDialog.isOpen}
              onClose={subdivisionDialog.close}
              onSave={handleSubdivisionConfigSave}
              sectionId={
                subdivisionDialog.data.pendingSlotData.section_ids?.[0] || ''
              }
              courseId={subdivisionDialog.data.pendingSlotData.course_id || ''}
              availableCourses={courses}
              subdivisionType={subdivisionDialog.data.type as 'practical' | 'tutorial'}
              subdivisionMode={subdivisionDialog.data.mode as 'auto' | 'manual'}
              allStudents={subdivisionDialog.data.allStudents}
              availableStaff={staff}
              existingConfig={
                subdivisionDialog.data.pendingSlotData.sub_slots?.length > 0
                  ? {
                      section_id:
                        subdivisionDialog.data.pendingSlotData.section_ids?.[0] ||
                        '',
                      course_id:
                        subdivisionDialog.data.pendingSlotData.course_id || '',
                      group_count:
                        subdivisionDialog.data.pendingSlotData.sub_slots.length,
                      subdivision_type:
                        subdivisionDialog.data.pendingSlotData.subdivision_type ||
                        'practical',
                      subdivision_mode:
                        subdivisionDialog.data.pendingSlotData.subdivision_mode ||
                        'auto',
                      groups: subdivisionDialog.data.pendingSlotData.sub_slots.map(
                        (ss: any) => ({
                          group_order: ss.sub_slot_order,
                          group_name:
                            ss.group_name ||
                            `Group ${String.fromCharCode(
                              64 + ss.sub_slot_order
                            )}`,
                          course_id:
                            ss.course_id ||
                            subdivisionDialog.data.pendingSlotData.course_id ||
                            '',
                          staff_ids: ss.staff_ids || [],
                          student_ids: ss.student_ids || [],
                          lab_room: ss.lab_room || '',
                          max_capacity: ss.max_capacity
                        })
                      )
                    }
                  : undefined
              }
              timetable={timetable}
            />
          )}
        </Suspense>

        {/* Period Configuration - Lazy Loaded */}
        <Suspense fallback={<DialogLoadingFallback />}>
          <PeriodConfigurationLazy
            isOpen={periodSelectorDialog.isOpen}
            onClose={periodSelectorDialog.close}
            selectedPeriods={selectedPeriods}
            periods={periods}
            lockedPeriods={lockedPeriods}
            hasUnsavedChanges={hasUnsavedChanges}
            savingPeriods={savingPeriods}
            onDragEnd={handleDragEnd}
            onRemovePeriod={(periodId: string) => {
              const period = selectedPeriods.find(p => p.id === periodId);
              if (period) {
                removePeriod(period);
              } else {
                logger.error('academic/timetables', 'Period not found in selectedPeriods', { periodId });
                toast.error('Unable to remove period. Please try again.');
              }
            }}
            onToggleLock={toggleLockPeriod}
            onSelectAllClassPeriods={() => {
              const classPeriods = sortPeriodsByName(
                periods.filter((p) => !p.is_break)
              );
              setSelectedPeriods(classPeriods);
              setHasUnsavedChanges(true);
            }}
            onClearAllPeriods={clearAllPeriods}
            onAddPeriod={addPeriod}
            onSave={savePeriodSelections}
          />
        </Suspense>

        {/* Template Dialog */}
        <TemplateDialog
          isOpen={templateDialog.isOpen}
          templateName={templateDialog.data.templateName}
          saving={templateDialog.data.saving}
          onClose={templateDialog.close}
          onTemplateNameChange={templateDialog.setTemplateName}
          onSave={() => handleSaveAsTemplate(templateDialog.data.templateName)}
        />

        {/* Unsaved Changes Dialog */}
        <UnsavedChangesDialog
          isOpen={unsavedChangesDialog.isOpen}
          timetableFormat={timetableFormat}
          savingPeriods={savingPeriods}
          onCancel={() => {
            unsavedChangesDialog.close();
            setPendingNavigation(null);
          }}
          onDiscard={handleDiscardAndContinue}
          onSaveAndContinue={handleSaveAndContinue}
        />

        {/* Date Range Dialog */}
        <DateRangeDialog
          isOpen={addDateRangeDialog.isOpen}
          startDate={addDateRangeDialog.data.startDate}
          endDate={addDateRangeDialog.data.endDate}
          isEditing={!!pendingEditRangeMarker}
          onClose={() => {
            addDateRangeDialog.close();
            setPendingEditRangeMarker(null);
          }}
          onStartDateChange={(date) => addDateRangeDialog.setStartDate(date)}
          onEndDateChange={(date) => addDateRangeDialog.setEndDate(date)}
          onAdd={handleAddDateRange}
        />

        {/* Add Period Dialog */}
        <Dialog
          open={addPeriodDialogOpen}
          onOpenChange={() => setAddPeriodDialogOpen(false)}
        >
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Add Period to Timetable</DialogTitle>
              <DialogDescription>
                Select a period to add to your timetable.
              </DialogDescription>
            </DialogHeader>
            <div className='space-y-4 py-4 max-h-[60vh] overflow-y-auto'>
              {getAvailablePeriods().length > 0 ? (
                <div className='space-y-2'>
                  {getAvailablePeriods().map((period) => (
                    <div
                      key={period.id}
                      className='flex items-center justify-between p-3 border rounded-md hover:bg-slate-50 transition-colors cursor-pointer'
                      onClick={async () => {
                        await addPeriod(period);
                        setAddPeriodDialogOpen(false);
                      }}
                    >
                      <div className='flex-1'>
                        <h4 className='font-medium text-sm'>
                          {period.period_name}
                        </h4>
                        <p className='text-xs text-slate-500 mt-1'>
                          {new Date(
                            `2000-01-01T${period.start_time}`
                          ).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}{' '}
                          -{' '}
                          {new Date(
                            `2000-01-01T${period.end_time}`
                          ).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </p>
                      </div>
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-8 w-8 p-0 rounded-full'
                      >
                        <Plus className='h-4 w-4' />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='text-center py-8'>
                  <p className='text-sm text-slate-500'>
                    No periods available to add
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant='outline' onClick={() => setAddPeriodDialogOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Day Configuration Dialog */}
        <Dialog
          open={dayConfigDialog.isOpen}
          onOpenChange={dayConfigDialog.close}
        >
          <DialogContent className='sm:max-w-[400px]'>
            <DialogHeader>
              <DialogTitle>Configure Timetable Days</DialogTitle>
              <DialogDescription>
                Select which days to display in your timetable.
              </DialogDescription>
            </DialogHeader>
            <div className='space-y-4 py-4'>
              <div className='flex justify-between'>
                <Button variant='outline' size='sm' onClick={selectAllDays}>
                  Select All
                </Button>
                <Button variant='outline' size='sm' onClick={clearAllDays}>
                  Clear All
                </Button>
              </div>
              <div className='grid grid-cols-1 gap-2'>
                {ALL_DAYS_OF_WEEK.map((day) => (
                  <div
                    key={day}
                    className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer ${
                      selectedDays.includes(day)
                        ? 'bg-green-50 border-green-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                    onClick={() => handleDayToggle(day)}
                  >
                    <input
                      type='checkbox'
                      checked={selectedDays.includes(day)}
                      onChange={() => handleDayToggle(day)}
                      className='rounded'
                    />
                    <span className='font-medium text-sm'>
                      {day.charAt(0) + day.slice(1).toLowerCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant='outline' onClick={dayConfigDialog.close}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  await savePeriodSelections();
                  dayConfigDialog.close();
                }}
                disabled={savingPeriods}
              >
                Save Days
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={deleteDialog.isOpen}
          onOpenChange={deleteDialog.close}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Slot Deletion</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this timetable slot?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className='py-4 space-y-2'>
              {deleteDialog.data.slotToDelete?.course?.course_name && (
                <div className='font-medium'>
                  Course: {deleteDialog.data.slotToDelete.course.course_name}
                </div>
              )}
              {deleteDialog.data.slotToDelete?.period && (
                <div className='text-sm'>
                  Period: {deleteDialog.data.slotToDelete.period.period_name} (
                  {deleteDialog.data.slotToDelete.period.start_time} -{' '}
                  {deleteDialog.data.slotToDelete.period.end_time})
                </div>
              )}
              {timetableFormat === 'regular' &&
                deleteDialog.data.slotToDelete?.day_of_week && (
                  <div className='text-sm'>
                    Day: {deleteDialog.data.slotToDelete.day_of_week}
                  </div>
                )}
              {timetableFormat === 'batch' && deleteDialog.data.slotToDelete?.slot_date && (
                <div className='text-sm'>
                  Date: {deleteDialog.data.slotToDelete.slot_date}
                </div>
              )}
              <div className='mt-3 text-sm text-amber-600 font-medium'>
                ⚠️ This action cannot be undone.
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={deleteDialog.close}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmSlotDeletion}
                className='bg-red-600 hover:bg-red-700 text-white'
              >
                Delete Slot
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ContentLayout>
  );
}
