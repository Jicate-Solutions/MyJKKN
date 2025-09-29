'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { use } from 'react';
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
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
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
import { useToast } from '@/hooks/use-toast';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';
import { useTimetables } from '@/hooks/academic/use-timetables';
import { PeriodService } from '@/lib/services/academic/period-service';
import { useStaff } from '@/hooks/staff/use-staff';
import { useCourses } from '@/hooks/organization/use-courses';
import { useSections } from '@/hooks/organization/use-sections';
import { SectionService } from '@/lib/services/organization/section-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { Timetable, DayOfWeek, Period } from '@/types/academics';
import { usePermissions } from '@/hooks/use-permissions';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';

// Import extracted components
import { TimetableHeader } from './_components/timetable-header';
import { TimetableGrid } from './_components/timetable-grid';
import { BatchTimetableGrid } from './_components/batch-timetable-grid';
import { SlotDialog } from './_components/slot-dialog';
import { PeriodConfiguration } from './_components/period-configuration';
import { SortablePeriodItem } from './_components/sortable-period-item';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// All available days (Monday to Saturday - Sunday is holiday)
const ALL_DAYS_OF_WEEK: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY'
];

// Sortable period item component is now extracted to _components/sortable-period-item.tsx

// TimetableGrid component is now extracted to _components/timetable-grid.tsx
// SlotDialog component is now extracted to _components/slot-dialog.tsx

export default function TimetableDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
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

  // States
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<Period[]>([]);
  const [periodSelectorOpen, setPeriodSelectorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [slotDialogReadOnly, setSlotDialogReadOnly] = useState(false);
  const [hasAttendance, setHasAttendance] = useState(false);
  const [markedPeriods, setMarkedPeriods] = useState<string[]>([]);
  const [timetableFormat, setTimetableFormat] = useState<'regular' | 'batch'>(
    'regular'
  );
  const [batchStartDate, setBatchStartDate] = useState<Date | undefined>();
  const [batchEndDate, setBatchEndDate] = useState<Date | undefined>();
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [isBreakSlot, setIsBreakSlot] = useState(false);
  const [breakDescription, setBreakDescription] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [sectionSearchQuery, setSectionSearchQuery] = useState('');

  // Combined class state
  const [isCombinedClass, setIsCombinedClass] = useState(false);
  const [subSlots, setSubSlots] = useState<any[]>([
    {
      sub_slot_order: 1,
      course_id: '',
      staff_ids: [],
      section_ids: [],
      is_break_slot: false,
      break_description: ''
    },
    {
      sub_slot_order: 2,
      course_id: '',
      staff_ids: [],
      section_ids: [],
      is_break_slot: false,
      break_description: ''
    }
  ]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState<any | null>(null);
  const [lockedPeriods, setLockedPeriods] = useState<string[]>([]);
  const [addPeriodDialogOpen, setAddPeriodDialogOpen] = useState(false);
  const [savingPeriods, setSavingPeriods] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] =
    useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null
  );

  // Day configuration state
  const [selectedDays, setSelectedDays] =
    useState<DayOfWeek[]>(ALL_DAYS_OF_WEEK);
  const [dayConfigOpen, setDayConfigOpen] = useState(false);

  // State for batch date management
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [dateRanges, setDateRanges] = useState<
    Array<{ start: string; end: string }>
  >([]);
  const [addDateRangeOpen, setAddDateRangeOpen] = useState(false);
  const [newStartDate, setNewStartDate] = useState<Date | undefined>();
  const [newEndDate, setNewEndDate] = useState<Date | undefined>();

  // Additional state for UI components
  const [slots, setSlots] = useState<any[]>([]);
  const [editingSlot, setEditingSlot] = useState<any | null>(null);
  const [slotType, setSlotType] = useState<'regular' | 'break'>('regular');
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);

  // State for staff planning courses and staff
  const [staffPlanningCourses, setStaffPlanningCourses] = useState<any[]>([]);
  const [staffPlanningStaff, setStaffPlanningStaff] = useState<any[]>([]);
  const [loadingStaffPlanData, setLoadingStaffPlanData] = useState(false);

  // Fetch courses, staff and sections data
  const coursesQuery = useCourses({
    institution_id: timetable?.institution_id,
    isActive: true
  });

  const allCourses = coursesQuery.data?.data || [];
  const loadingCourses = coursesQuery.isLoading;
  const fetchCourses = coursesQuery.refetch;

  const staffQuery = useStaff({
    isActive: true
  });

  const allStaff = staffQuery.data?.data || [];
  const loadingStaff = staffQuery.isLoading;
  const fetchStaff = staffQuery.refetch;

  const sectionsQuery = useSections({});

  const sections = sectionsQuery.data?.data || [];
  const loadingSections = sectionsQuery.isLoading;
  const fetchSections = sectionsQuery.refetch;

  // Fetch staff planning data based on timetable hierarchy
  const fetchStaffPlanningData = useCallback(async () => {
    if (!timetable) return;

    // Create a local reference to avoid TypeScript null issues
    const currentTimetable = timetable;

    try {
      setLoadingStaffPlanData(true);

      // CRITICAL: We must match the exact semester between timetable and staff planning
      // Timetable is semester-specific, so only courses from that same semester's staff planning should be shown
      let semesterIdForStaffPlan: string | undefined;

      // The timetable.semester_id should now always be a UUID after normalization
      if (
        typeof currentTimetable.semester_id === 'string' &&
        currentTimetable.semester_id.match(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        )
      ) {
        // It's already a UUID, use it directly
        semesterIdForStaffPlan = currentTimetable.semester_id;
        console.log('Using semester UUID:', semesterIdForStaffPlan);
      } else if (typeof currentTimetable.semester_id === 'string') {
        // Fallback: if it's still a string name, look it up (for backwards compatibility)
        try {
          console.log(
            'Looking up semester ID for timetable semester:',
            currentTimetable.semester_id
          );

          // Find the semester ID by matching semester name within the same program/department context
          const semestersResponse = await SemesterService.getSemesters({
            program_id: currentTimetable.program_id,
            department_id: currentTimetable.department_id,
            isActive: true,
            limit: 100
          });

          const matchingSemester = semestersResponse.data.find(
            (semester) =>
              semester.semester_name === currentTimetable.semester_id
          );

          if (matchingSemester) {
            semesterIdForStaffPlan = matchingSemester.id;
            console.log(
              '✓ Found matching semester ID:',
              semesterIdForStaffPlan,
              'for semester:',
              currentTimetable.semester_id
            );
          } else {
            console.warn(
              '✗ No matching semester found for:',
              currentTimetable.semester_id
            );
            console.log(
              'Available semesters:',
              semestersResponse.data.map((s) => s.semester_name)
            );
            // If we can't find the semester, don't show any staff planning data
            setStaffPlanningCourses([]);
            setStaffPlanningStaff([]);
            return;
          }
        } catch (error) {
          console.error('Error finding semester ID:', error);
          setStaffPlanningCourses([]);
          setStaffPlanningStaff([]);
          return;
        }
      }

      // If we don't have a semester ID, we can't properly match staff planning to timetable
      if (!semesterIdForStaffPlan) {
        console.warn(
          'No semester ID available - cannot match staff planning to timetable semester'
        );
        setStaffPlanningCourses([]);
        setStaffPlanningStaff([]);
        return;
      }

      // Use the optimized consolidated staff plan method
      try {
        const consolidatedPlan =
          await StaffPlanService.getConsolidatedStaffPlan(
            currentTimetable.institution_id,
            currentTimetable.program_id,
            semesterIdForStaffPlan,
            currentTimetable.academic_year_id
          );

        console.log(
          'Found consolidated staff plan with courses:',
          consolidatedPlan.all_courses.length
        );

        // Check if this is an empty staff plan (no plans found for this semester)
        if (
          consolidatedPlan.total_courses === 0 &&
          consolidatedPlan.all_courses.length === 0
        ) {
          console.info(
            'No staff plans available for this semester configuration'
          );
        }

        // Extract unique courses and staff from the consolidated plan
        const coursesSet = new Set<string>();
        const staffSet = new Set<string>();
        const courseDetailsMap = new Map<string, any>();
        const staffDetailsMap = new Map<string, any>();

        for (const assignment of consolidatedPlan.all_courses) {
          if (assignment.course && assignment.staff) {
            coursesSet.add(assignment.course.id);
            staffSet.add(assignment.staff.id);

            // Store course details
            courseDetailsMap.set(assignment.course.id, assignment.course);

            // Store staff details
            staffDetailsMap.set(assignment.staff.id, assignment.staff);
          }
        }

        // Convert sets to arrays with details
        const coursesFromStaffPlanning = Array.from(coursesSet)
          .map((courseId) => courseDetailsMap.get(courseId))
          .filter(Boolean);

        const staffFromStaffPlanning = Array.from(staffSet)
          .map((staffId) => staffDetailsMap.get(staffId))
          .filter(Boolean);

        console.log(
          'Extracted courses from staff planning:',
          coursesFromStaffPlanning.length
        );
        console.log(
          'Extracted staff from staff planning:',
          staffFromStaffPlanning.length
        );

        setStaffPlanningCourses(coursesFromStaffPlanning);
        setStaffPlanningStaff(staffFromStaffPlanning);
      } catch (error) {
        // Fallback to the original method if consolidated fetch fails
        console.warn(
          'Consolidated staff plan fetch failed, falling back to individual queries:',
          error
        );

        const staffPlanFilters = {
          institution_id: currentTimetable.institution_id,
          degree_id: currentTimetable.degree_id,
          program_id: currentTimetable.program_id,
          department_id: currentTimetable.department_id,
          academic_year_id: currentTimetable.academic_year_id,
          semester_id: semesterIdForStaffPlan,
          isActive: true,
          limit: 10 // Limit to reduce load
        };

        // Just get the staff plans without fetching individual courses
        const staffPlansResult = await StaffPlanService.getStaffPlans(
          staffPlanFilters
        );

        if (staffPlansResult.data.length === 0) {
          console.warn('No staff plans found for this timetable hierarchy');
          setStaffPlanningCourses([]);
          setStaffPlanningStaff([]);
          return;
        }

        // For now, just indicate that staff planning data exists but couldn't be fully loaded
        console.log(
          'Staff plans exist but detailed course data not loaded for performance'
        );
        setStaffPlanningCourses([]);
        setStaffPlanningStaff([]);
      }
    } catch (error) {
      console.error('Error fetching staff planning data:', error);
      setStaffPlanningCourses([]);
      setStaffPlanningStaff([]);
    } finally {
      setLoadingStaffPlanData(false);
    }
  }, [timetable]);

  // State for filtered sections
  const [filteredSections, setFilteredSections] = useState<any[]>([]);
  const [loadingFilteredSections, setLoadingFilteredSections] = useState(false);

  // Sync isBreakSlot with slotType
  useEffect(() => {
    setIsBreakSlot(slotType === 'break');
  }, [slotType]);

  // Monitor slotDialogOpen changes
  useEffect(() => {
    console.log('slotDialogOpen state changed to:', slotDialogOpen);
    if (slotDialogOpen) {
      console.log('Dialog should be open now with:', {
        day: selectedDay,
        period: selectedPeriod?.period_name,
        timetableFormat: timetableFormat
      });
    }
  }, [slotDialogOpen, selectedDay, selectedPeriod, timetableFormat]);

  // Fetch sections filtered by semester and institution
  const fetchFilteredSections = useCallback(async () => {
    if (!timetable) return;

    // Create a local reference to avoid TypeScript null issues
    const currentTimetable = timetable;

    try {
      setLoadingFilteredSections(true);

      // Find the semester ID based on the timetable's semester name and context
      // After normalization, semester_id should be a UUID
      let semesterId: string | null = null;

      if (
        typeof currentTimetable.semester_id === 'string' &&
        currentTimetable.semester_id.match(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        )
      ) {
        // It's already a UUID, use it directly
        semesterId = currentTimetable.semester_id;
        console.log('Using semester UUID for sections:', semesterId);
      } else if (typeof currentTimetable.semester_id === 'string') {
        // Fallback: if it's still a string name, look it up (for backwards compatibility)
        try {
          const semestersResponse = await SemesterService.getSemesters({
            institution_id: currentTimetable.institution_id,
            degree_id: currentTimetable.degree_id,
            program_id: currentTimetable.program_id,
            department_id: currentTimetable.department_id,
            isActive: true,
            limit: 100
          });

          const matchingSemester = semestersResponse.data.find(
            (semester) =>
              semester.semester_name === currentTimetable.semester_id
          );

          if (matchingSemester) {
            semesterId = matchingSemester.id;
            console.log(
              'Found matching semester:',
              matchingSemester.semester_name,
              'ID:',
              semesterId
            );
          } else {
            console.warn(
              'No matching semester found for:',
              currentTimetable.semester_id
            );
          }
        } catch (error) {
          console.error('Error finding semester ID:', error);
        }
      }

      let sectionsData: any[] = [];
      if (semesterId && currentTimetable.institution_id) {
        // Use the specialized method for semester and institution filtering
        console.log(
          'Fetching sections for semester ID:',
          semesterId,
          'and institution:',
          currentTimetable.institution_id
        );
        sectionsData = await SectionService.getSectionsBySemesterAndInstitution(
          semesterId,
          currentTimetable.institution_id
        );
        console.log('Found filtered sections:', sectionsData.length);
      } else if (currentTimetable.institution_id) {
        // Fallback to filtering by institution only
        console.warn('Using fallback - filtering by institution only');
        const response = await SectionService.getSections({
          institution_id: currentTimetable.institution_id,
          isActive: true,
          limit: 100
        });
        sectionsData = response.data;
      } else {
        console.warn('No institution_id available for filtering sections');
      }

      setFilteredSections(sectionsData);
    } catch (error) {
      console.error('Error fetching filtered sections:', error);
      setFilteredSections([]);
    } finally {
      setLoadingFilteredSections(false);
    }
  }, [timetable]);

  // Fetch staff planning data when timetable data is loaded
  useEffect(() => {
    if (timetable) {
      fetchStaffPlanningData();
    }
  }, [timetable, fetchStaffPlanningData]);

  // Fetch filtered sections when timetable data is loaded
  useEffect(() => {
    if (timetable) {
      fetchFilteredSections();
    }
  }, [timetable, fetchFilteredSections]);

  // Computed values for courses and staff to use in slot creation
  const courses =
    staffPlanningCourses.length > 0 ? staffPlanningCourses : allCourses;
  const staff = staffPlanningStaff.length > 0 ? staffPlanningStaff : allStaff;

  // Helper function to sort periods by name naturally (Period 1, Period 2, etc.)
  const sortPeriodsByName = (periods: Period[]): Period[] => {
    return periods.sort((a, b) => {
      const aName = a.period_name.toLowerCase();
      const bName = b.period_name.toLowerCase();

      // Extract numbers from period names for proper sorting
      const aMatch = aName.match(/(\d+)/);
      const bMatch = bName.match(/(\d+)/);

      if (aMatch && bMatch) {
        const aNumber = parseInt(aMatch[1]);
        const bNumber = parseInt(bMatch[1]);
        return aNumber - bNumber;
      }

      // Fallback to alphabetical sorting if no numbers found
      return aName.localeCompare(bName);
    });
  };

  // Handle unsaved changes warning
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

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Handle navigation button clicks with unsaved changes protection
  const handleNavigationWithWarning = (path: string) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(path);
      setShowUnsavedChangesDialog(true);
    } else {
      router.push(path);
    }
  };

  // Functions to handle unsaved changes dialog
  const handleSaveAndContinue = async () => {
    try {
      await savePeriodSelections();
      setShowUnsavedChangesDialog(false);
      if (pendingNavigation) {
        router.push(pendingNavigation);
        setPendingNavigation(null);
      }
    } catch (error) {
      console.error('Error saving configuration:', error);
      toast({
        title: 'Error',
        description: 'Failed to save configuration. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleDiscardAndContinue = () => {
    setHasUnsavedChanges(false);
    setShowUnsavedChangesDialog(false);
    if (pendingNavigation) {
      router.push(pendingNavigation);
      setPendingNavigation(null);
    }
  };

  const handleCancelNavigation = () => {
    setShowUnsavedChangesDialog(false);
    setPendingNavigation(null);
  };

  // Load selected periods from local storage
  useEffect(() => {
    if (typeof window !== 'undefined' && timetableId && periods.length > 0) {
      const storedPeriods = localStorage.getItem(
        `selectedPeriods-${timetableId}`
      );
      if (storedPeriods) {
        try {
          const periodIds = JSON.parse(storedPeriods);
          // Fix: Instead of just filtering, we need to maintain the order from localStorage
          // Also check both id and period_id fields to handle different data structures
          const orderedPeriods = periodIds
            .map((id: string) =>
              periods.find(
                (period) => period.id === id || (period as any).period_id === id
              )
            )
            .filter(Boolean) // Filter out any undefined values
            .map((period: any) => ({
              ...period,
              id: period.period_id || period.id // Ensure id field is set correctly
            }));

          if (orderedPeriods.length > 0) {
            // Only update if the periods have actually changed to avoid infinite loops
            setSelectedPeriods((prev) => {
              if (
                prev.length !== orderedPeriods.length ||
                !prev.every((p, idx) => p.id === orderedPeriods[idx]?.id)
              ) {
                return orderedPeriods;
              }
              return prev;
            });
          }
        } catch (err) {
          console.error('Error parsing stored periods:', err);
        }
      }

      // Load locked periods from localStorage
      const storedLockedPeriods = localStorage.getItem(
        `lockedPeriods-${timetableId}`
      );
      if (storedLockedPeriods) {
        try {
          const lockedIds = JSON.parse(storedLockedPeriods);
          setLockedPeriods((prev) => {
            if (JSON.stringify(prev) !== JSON.stringify(lockedIds)) {
              return lockedIds;
            }
            return prev;
          });
        } catch (err) {
          console.error('Error parsing locked periods:', err);
        }
      }
    }
  }, [periods, timetableId]);

  // Save selected periods to local storage
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      timetableId &&
      selectedPeriods.length > 0
    ) {
      const periodIds = selectedPeriods.map((period) => period.id);
      localStorage.setItem(
        `selectedPeriods-${timetableId}`,
        JSON.stringify(periodIds)
      );
    }
  }, [selectedPeriods, timetableId]);

  // Save locked periods to local storage
  useEffect(() => {
    if (typeof window !== 'undefined' && timetableId) {
      if (lockedPeriods.length > 0) {
        localStorage.setItem(
          `lockedPeriods-${timetableId}`,
          JSON.stringify(lockedPeriods)
        );
      } else {
        localStorage.removeItem(`lockedPeriods-${timetableId}`);
      }
    }
  }, [lockedPeriods, timetableId]);

  // Fetch timetable data
  const fetchTimetableData = async (preserveUnsavedDates: boolean = false) => {
    try {
      setLoading(true);
      setError(null);

      // Store current unsaved dates if preserving
      const currentSelectedDates = preserveUnsavedDates ? selectedDates : [];

      const timetableData = await TimetableService.getTimetable(timetableId);
      setTimetable(timetableData);

      // Check if attendance has been marked for this timetable
      const attendanceStatus = await TimetableService.hasAttendanceMarked(
        timetableId
      );
      setHasAttendance(attendanceStatus.hasAttendance);
      setMarkedPeriods(attendanceStatus.markedPeriods);

      // Update timetable format based on fetched data
      if (timetableData.timetable_format) {
        setTimetableFormat(timetableData.timetable_format);
      }

      // Update selected days/dates based on timetable format
      if (timetableData.timetable_format === 'batch') {
        // For batch mode, load selected dates
        if (preserveUnsavedDates && currentSelectedDates.length > 0) {
          // Preserve unsaved date ranges - use current state instead of DB data
          console.log('Preserving unsaved date ranges:', currentSelectedDates);
          setSelectedDates(currentSelectedDates);
        } else if (
          timetableData.selected_dates &&
          Array.isArray(timetableData.selected_dates)
        ) {
          setSelectedDates(timetableData.selected_dates);
        } else {
          // If no dates are configured in the timetable, start with an empty selection
          setSelectedDates([]);
        }
      } else {
        // For regular mode, load selected days
        if (
          timetableData.selected_days &&
          Array.isArray(timetableData.selected_days)
        ) {
          setSelectedDays(timetableData.selected_days);
        }
      }

      // Load all available periods for the configuration
      try {
        const periodsResponse = await PeriodService.getPeriods({
          institution_id: timetableData.institution_id,
          limit: 100
        });
        setPeriods(periodsResponse.data || []);
      } catch (error) {
        console.error('Error fetching periods:', error);
      }

      if (timetableData.periods && Array.isArray(timetableData.periods)) {
        // Map periods to the expected format (period_id -> id)
        const mappedPeriods = timetableData.periods
          .map((period: any) => ({
            ...period,
            id: period.period_id || period.id // Use period_id if available, fallback to id
          }))
          .filter((period: any) => period && period.id);

        // Always set the timetable's saved periods (this should take priority over localStorage)
        setSelectedPeriods(mappedPeriods);

        // Clear localStorage if it exists since we're using the timetable's saved periods
        if (typeof window !== 'undefined' && timetableId) {
          localStorage.removeItem(`selectedPeriods-${timetableId}`);
        }
      } else {
        // If no periods are configured in the timetable, start with an empty selection
        // The user will need to configure periods using the period selector
        setSelectedPeriods([]);
      }

      const timetableSlots = await TimetableService.getTimetableSlots(
        timetableId
      );
      setSlots(timetableSlots || []);
    } catch (err) {
      console.error('Error fetching timetable data:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimetableData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timetableId]);

  // Save as template handler
  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a template name',
        variant: 'destructive'
      });
      return;
    }

    setSavingTemplate(true);
    try {
      const success = await saveTimetableAsTemplate(timetableId, templateName);
      if (success) {
        toast({
          title: 'Success',
          description: 'Timetable saved as template successfully'
        });
        setTemplateDialogOpen(false);
      } else {
        throw new Error('Failed to save template');
      }
    } catch (err) {
      console.error('Error saving as template:', err);
      toast({
        title: 'Error',
        description: 'Failed to save as template. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  // Open slot dialog to add or edit a slot
  const openSlotDialog = (
    day: DayOfWeek,
    period: Period,
    existingSlot?: any
  ) => {
    // Check if this period has attendance marked (but allow super admins to override)
    const isPeriodLocked = markedPeriods.includes(period.id);

    if (isPeriodLocked && !isSuperAdmin) {
      toast({
        title: 'Period Locked',
        description:
          'This period cannot be modified because attendance has been marked. Staff changes should be made through the Staff Planning module.',
        variant: 'destructive'
      });
      return;
    }

    // For viewing existing slots, allow users with view permission
    // For creating/editing, require edit permission
    let isReadOnly = false;

    if (existingSlot) {
      // Viewing existing slot - allow with view permission
      // Dialog will be in read-only mode if user doesn't have edit permission
      isReadOnly = !canEditTimetable;
    } else {
      // Creating new slot - require edit permission
      if (!canEditTimetable) {
        toast({
          title: 'Permission Denied',
          description: 'You do not have permission to create timetable slots.',
          variant: 'destructive'
        });
        return;
      }
    }

    // Prevent slot creation for break periods (but allow viewing)
    if (period.is_break && !existingSlot) {
      toast({
        title: 'Break Period',
        description:
          'Slots cannot be created during break periods. Break periods are reserved for breaks across all days.',
        variant: 'default'
      });
      return;
    }

    setSelectedDay(day);
    setSelectedPeriod(period);
    setSelectedSlot(existingSlot || null);
    setEditingSlot(existingSlot || null);
    setSlotDialogReadOnly(isReadOnly);

    setSlotDialogOpen(true);
  };

  // Close slot dialog and reset form
  const closeSlotDialog = () => {
    setSlotDialogOpen(false);
    setSelectedDay(null);
    setSelectedPeriod(null);
    setSelectedSlot(null);
    setEditingSlot(null);
    setSlotDialogReadOnly(false);
  };

  // Delete a timetable slot from grid - shows confirmation dialog first
  const handleSlotDelete = async (
    day: DayOfWeek | string,
    period: Period,
    existingSlot: any
  ) => {
    // Check permission for deleting timetable slots
    if (!canDeleteTimetable) {
      toast({
        title: 'Permission Denied',
        description: 'You do not have permission to delete timetable slots.',
        variant: 'destructive'
      });
      return;
    }

    // Store the slot information for deletion
    setSlotToDelete({
      day,
      period,
      existingSlot
    });

    // Show confirmation dialog
    setDeleteDialogOpen(true);
  };

  // Actual deletion function called after confirmation
  const confirmSlotDeletion = async () => {
    if (!slotToDelete) return;

    const { day, period, existingSlot } = slotToDelete;

    // Real-time check if this specific period slot has attendance marked
    // Super admins can override this check
    if (!isSuperAdmin) {
      try {
        const lockStatus = await TimetableService.isPeriodSlotLocked(
          timetableId,
          period.id,
          day as string,
          timetableFormat === 'batch'
        );

        if (lockStatus.isLocked) {
          toast({
            title: 'Cannot Delete Slot',
            description: `This period slot cannot be deleted. Attendance has been marked for ${
              lockStatus.attendanceCount
            } students${
              lockStatus.attendanceDate
                ? ` on ${lockStatus.attendanceDate}`
                : ''
            }. Deleting would lose attendance records.`,
            variant: 'destructive',
            duration: 6000
          });
          setDeleteDialogOpen(false);
          setSlotToDelete(null);
          return;
        }
      } catch (checkError) {
        console.error('Error checking slot lock status:', checkError);
        // Continue with caution if check fails
      }
    } else if (isSuperAdmin) {
      // Show warning for super admin but allow them to proceed
      const lockStatus = await TimetableService.isPeriodSlotLocked(
        timetableId,
        period.id,
        day as string,
        timetableFormat === 'batch'
      );

      if (lockStatus.isLocked) {
        toast({
          title: 'Warning: Attendance Exists',
          description: `This slot has attendance for ${lockStatus.attendanceCount} students. As super admin, you can still delete it.`,
          variant: 'default',
          duration: 3000
        });
      }
    }

    try {
      // Check if this is a range operation
      if (typeof day === 'string' && day.startsWith('RANGE:')) {
        const parts = day.split(':');
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

          console.log(
            `Deleting slot from ${dates.length} dates in range:`,
            dates
          );

          // Delete the slot from all dates in the range
          const deletePromises = dates.map((date) =>
            TimetableService.deleteTimetableSlot(
              timetableId,
              date,
              period.id,
              true, // isBatch = true for batch mode
              true // suppressToast = true for bulk operations
            )
          );

          await Promise.allSettled(deletePromises); // Use allSettled to handle non-existent slots gracefully

          await fetchTimetableData(true); // Preserve unsaved date ranges
          toast({
            title: 'Success',
            description: `Slot deleted from ${dates.length} dates (${startDate} to ${endDate})`
          });
          // Close the dialog
          setDeleteDialogOpen(false);
          setSlotToDelete(null);
        } else {
          throw new Error('Invalid range format');
        }
      } else {
        // Single date/day operation
        await TimetableService.deleteTimetableSlot(
          timetableId,
          day as string,
          period.id,
          timetableFormat === 'batch'
        );

        await fetchTimetableData(true); // Preserve unsaved date ranges
        toast({
          title: 'Success',
          description: 'Slot deleted successfully'
        });
        // Close the dialog
        setDeleteDialogOpen(false);
        setSlotToDelete(null);
      }
    } catch (err) {
      console.error('Error deleting slot:', err);

      // Check if it's an attendance-related error
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (errorMessage.includes('attendance')) {
        toast({
          title: 'Cannot Delete Slot',
          description: errorMessage,
          variant: 'destructive',
          duration: 5000
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to delete slot. Please try again.',
          variant: 'destructive'
        });
      }
      // Close dialog on error too
      setDeleteDialogOpen(false);
      setSlotToDelete(null);
    }
  };

  // Helper functions for sub-slot management
  const updateSubSlot = (index: number, updates: any) => {
    setSubSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, ...updates } : slot))
    );
  };

  const updateSubSlotStaff = (index: number, staffIds: string[]) => {
    updateSubSlot(index, { staff_ids: staffIds });
  };

  const updateSubSlotSections = (index: number, sectionIds: string[]) => {
    updateSubSlot(index, { section_ids: sectionIds });
  };

  // Save a timetable slot
  const saveSlot = async (slotData: any) => {
    if (!selectedPeriod) return;

    // For batch mode, we need to use the date; for regular mode, use the day
    let dateStr: string;

    if (selectedDay) {
      // Use the date from when the slot was clicked (stored in selectedDay for batch mode)
      dateStr = selectedDay as string;
    } else {
      // Fallback to sessionStorage for safety, though direct state passing is preferred
      const storedDate = sessionStorage.getItem('batchSelectedDate');
      if (storedDate) {
        // Handle both range identifiers and single dates from sessionStorage
        if (storedDate.startsWith('RANGE:')) {
          // Range identifier - use as is for range operations
          dateStr = storedDate;
        } else {
          // Single date string
          dateStr = storedDate;
        }
      } else {
        console.error('No date available for batch mode slot');
        toast({
          title: 'Error',
          description: 'Please select a date for the slot.',
          variant: 'destructive'
        });
        return;
      }
    }

    console.log('Batch mode save - parameters:', {
      timetableId,
      dateStr,
      periodId: selectedPeriod.id,
      slotData,
      isBatch: true,
      selectedDay
    });

    if (!dateStr || dateStr === 'null' || dateStr === 'undefined') {
      console.error('Invalid date string in batch mode:', dateStr);
      toast({
        title: 'Error',
        description: 'Date information is invalid. Please try again.',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Check if this is a range operation
      if (dateStr.startsWith('RANGE:')) {
        const parts = dateStr.split(':');
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

          console.log(
            `Creating slot for ${dates.length} dates in range:`,
            dates
          );

          // Create the same slot for all dates in the range
          const createPromises = dates.map((date) =>
            TimetableService.updateTimetableSlot(
              timetableId,
              date,
              selectedPeriod.id,
              { ...slotData, slot_date: date },
              true, // isBatch = true for batch mode
              true // suppressToast = true for bulk operations
            )
          );

          await Promise.all(createPromises);

          await fetchTimetableData(true); // Preserve unsaved date ranges
          closeSlotDialog();
          toast({
            title: 'Success',
            description: `Slot created for ${dates.length} dates (${startDate} to ${endDate})`
          });
        } else {
          throw new Error('Invalid range format');
        }
      } else {
        // Single date operation
        await TimetableService.updateTimetableSlot(
          timetableId,
          dateStr, // Pass the date string for batch mode
          selectedPeriod.id,
          slotData,
          true // isBatch = true for batch mode
        );

        await fetchTimetableData(true); // Preserve unsaved date ranges
        closeSlotDialog();
        toast({
          title: 'Success',
          description: 'Slot saved successfully'
        });
      }
    } catch (err) {
      console.error('Error saving batch slot:', err);
      toast({
        title: 'Error',
        description: 'Failed to save slot. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Delete a timetable slot
  const deleteSlot = async () => {
    const slotToDeleteNow = editingSlot || slotToDelete;
    if (!slotToDeleteNow || !selectedPeriod) return;

    // For batch mode, use the date from selectedDay or sessionStorage
    if (timetableFormat === 'batch') {
      let dateStr: string;

      if (selectedDay) {
        // Use the date from when the slot was clicked
        dateStr = selectedDay as string;
      } else {
        // Fallback to sessionStorage
        const storedDate = sessionStorage.getItem('batchSelectedDate');
        if (storedDate) {
          // Handle both range identifiers and single dates from sessionStorage
          if (storedDate.startsWith('RANGE:')) {
            // Range identifier - use as is for range operations
            dateStr = storedDate;
          } else {
            // Single date string
            dateStr = storedDate;
          }
        } else {
          console.error('No date found for batch mode deletion');
          toast({
            title: 'Error',
            description: 'Unable to delete slot. Date information is missing.',
            variant: 'destructive'
          });
          return;
        }
      }

      try {
        // Check if this is a range operation
        if (dateStr.startsWith('RANGE:')) {
          const parts = dateStr.split(':');
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

            console.log(
              `Deleting slot from ${dates.length} dates in range:`,
              dates
            );

            // Delete the slot from all dates in the range
            const deletePromises = dates.map((date) =>
              TimetableService.deleteTimetableSlot(
                timetableId,
                date,
                selectedPeriod.id,
                true, // isBatch = true for batch mode
                true // suppressToast = true for bulk operations
              )
            );

            await Promise.allSettled(deletePromises); // Use allSettled to handle non-existent slots gracefully

            await fetchTimetableData(true); // Preserve unsaved date ranges

            toast({
              title: 'Success',
              description: `Slot deleted from ${dates.length} dates (${startDate} to ${endDate})`
            });
            setDeleteDialogOpen(false);
            setSlotToDelete(null);
            closeSlotDialog();
          } else {
            throw new Error('Invalid range format');
          }
        } else {
          // Single date operation
          await TimetableService.deleteTimetableSlot(
            timetableId,
            dateStr,
            selectedPeriod.id,
            true // isBatch = true for batch mode
          );

          await fetchTimetableData(true); // Preserve unsaved date ranges

          toast({
            title: 'Success',
            description: 'Slot deleted successfully'
          });
          setDeleteDialogOpen(false);
          setSlotToDelete(null);
          closeSlotDialog();
        }
      } catch (err) {
        console.error('Error deleting batch slot:', err);
        toast({
          title: 'Error',
          description: 'Failed to delete slot. Please try again.',
          variant: 'destructive'
        });
      }
    } else {
      // Regular mode
      if (!selectedDay) {
        console.error('No day selected for regular mode deletion');
        return;
      }

      try {
        await TimetableService.deleteTimetableSlot(
          timetableId,
          selectedDay,
          selectedPeriod.id,
          false // isBatch = false for regular mode
        );

        await fetchTimetableData(); // Regular mode - no need to preserve dates

        toast({
          title: 'Success',
          description: 'Slot deleted successfully'
        });
        setDeleteDialogOpen(false);
        setSlotToDelete(null);
        closeSlotDialog();
      } catch (err) {
        console.error('Error deleting slot:', err);
        toast({
          title: 'Error',
          description: 'Failed to delete slot. Please try again.',
          variant: 'destructive'
        });
      }
    }
  };

  // Open delete dialog
  const openDeleteDialog = (slot: any) => {
    setSlotToDelete(slot);
    setDeleteDialogOpen(true);
  };

  // Get slot for a day and period
  const getSlot = (day: DayOfWeek, periodId: string) => {
    return slots.find(
      (slot) => slot.day_of_week === day && slot.period_id === periodId
    );
  };

  // Handle period selection
  const handlePeriodSelection = (selectedIds: string[]) => {
    const newSelectedPeriods = periods.filter((period) =>
      selectedIds.includes(period.id)
    );
    setSelectedPeriods(newSelectedPeriods);
    setPeriodSelectorOpen(false);
  };

  // Set up DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8 // Start dragging after moving 8px to prevent accidental drags
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // Handle DnD end event
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSelectedPeriods((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
      setHasUnsavedChanges(true);
    }
  };

  // Handle removing a period
  const handleRemovePeriod = (id: string) => {
    setSelectedPeriods(selectedPeriods.filter((p) => p.id !== id));
    // Also remove from locked periods if it was locked
    if (lockedPeriods.includes(id)) {
      setLockedPeriods(lockedPeriods.filter((periodId) => periodId !== id));
    }
    setHasUnsavedChanges(true);
  };

  // Toggle lock for a period
  const toggleLockPeriod = (id: string) => {
    if (lockedPeriods.includes(id)) {
      setLockedPeriods(lockedPeriods.filter((periodId) => periodId !== id));
    } else {
      setLockedPeriods([...lockedPeriods, id]);
    }
  };

  // Add a period to the timetable
  const addPeriod = (period: Period) => {
    if (!selectedPeriods.some((p) => p.id === period.id)) {
      const newSelectedPeriods = [...selectedPeriods, period];
      setSelectedPeriods(newSelectedPeriods);
      setHasUnsavedChanges(true);
      toast({
        title: 'Period Added',
        description: `${period.period_name} has been added. Click 'Save Changes' to confirm.`
      });
    }
  };

  // Save selected periods and days to database
  const savePeriodSelections = async () => {
    if (!timetable) return;

    // Create a local reference to avoid TypeScript null issues
    const currentTimetable = timetable;

    setSavingPeriods(true);
    try {
      const currentPeriodIds = selectedPeriods.map((p) => p.id);

      // For batch mode, handle slot deletion for removed dates
      if (timetableFormat === 'batch') {
        const previousSelectedDates = currentTimetable.selected_dates || [];
        const currentSelectedDates = selectedDates;

        // Helper function to extract individual dates from range markers
        const extractDatesFromRanges = (dateArray: string[]) => {
          const allDates: string[] = [];
          dateArray.forEach((item) => {
            if (item.startsWith('RANGE:')) {
              const parts = item.split(':');
              if (parts.length === 3) {
                const startDate = parts[1];
                const endDate = parts[2];

                // Generate all dates in this range
                const current = new Date(startDate);
                const end = new Date(endDate);

                while (current <= end) {
                  allDates.push(current.toISOString().split('T')[0]);
                  current.setDate(current.getDate() + 1);
                }
              }
            } else if (!item.includes('RANGE')) {
              // Individual date
              allDates.push(item);
            }
          });
          return allDates;
        };

        const previousDates = extractDatesFromRanges(previousSelectedDates);
        const currentDates = extractDatesFromRanges(currentSelectedDates);

        // Find removed dates
        const removedDates = previousDates.filter(
          (date) => !currentDates.includes(date)
        );

        if (removedDates.length > 0) {
          console.log('Removing slots for dates:', removedDates);

          // Delete slots for removed dates before saving configuration
          await TimetableService.deleteSlotsForRemovedDates(
            timetableId,
            removedDates,
            selectedPeriods
          );

          toast({
            title: 'Cleanup Complete',
            description: `Removed ${removedDates.length} dates and their associated slots.`
          });
        }
      }

      await TimetableService.saveTimetablePeriods(
        timetableId,
        currentPeriodIds
      );

      // Update timetable configuration with selected days/dates based on format
      const updateData: any = {
        timetable_format: timetableFormat
      };

      if (timetableFormat === 'batch') {
        updateData.selected_dates = selectedDates;
        updateData.selected_days = null; // Clear regular mode data
      } else {
        updateData.selected_days = selectedDays;
        updateData.selected_dates = null; // Clear batch mode data
      }

      // Save the timetable configuration
      await TimetableService.updateTimetable(timetableId, updateData);

      await fetchTimetableData();
      setHasUnsavedChanges(false);
      setPeriodSelectorOpen(false);

      toast({
        title: 'Success',
        description: `Timetable configuration saved successfully. All users can now see the same layout.`
      });
    } catch (err) {
      console.error('Error saving timetable configuration:', err);
      toast({
        title: 'Error',
        description:
          'Failed to save timetable configuration. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSavingPeriods(false);
    }
  };

  // Get available periods (not already selected)
  const getAvailablePeriods = () => {
    return periods.filter(
      (period) => !selectedPeriods.some((p) => p.id === period.id)
    );
  };

  // Day management functions
  const handleDayToggle = (day: DayOfWeek) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      // Insert in correct order
      const newDays = [...selectedDays, day];
      const orderedDays = ALL_DAYS_OF_WEEK.filter((day) =>
        newDays.includes(day)
      );
      setSelectedDays(orderedDays);
    }
    setHasUnsavedChanges(true);
  };

  const selectAllDays = () => {
    setSelectedDays([...ALL_DAYS_OF_WEEK]);
    setHasUnsavedChanges(true);
  };

  const clearAllDays = () => {
    setSelectedDays([]);
    setHasUnsavedChanges(true);
  };

  // Get unique courses from current timetable slots for reference
  const getCoursesInTimetable = () => {
    const uniqueCourses = new Map();

    slots.forEach((slot) => {
      if (slot.course && !slot.is_break_slot) {
        uniqueCourses.set(slot.course.id, slot.course);
      }

      // Also check sub-slots for combined classes
      if (slot.sub_slots && slot.sub_slots.length > 0) {
        slot.sub_slots.forEach((subSlot: any) => {
          if (subSlot.course && !subSlot.is_break_slot) {
            uniqueCourses.set(subSlot.course.id, subSlot.course);
          }
        });
      }
    });

    return Array.from(uniqueCourses.values()).sort((a, b) =>
      a.course_code.localeCompare(b.course_code)
    );
  };

  // Add PDF export function
  const exportToPDF = async () => {
    // Check validation based on timetable format
    const isValidForExport = () => {
      if (!currentTimetable || selectedPeriods.length === 0) {
        return false;
      }

      if (timetableFormat === 'batch') {
        return selectedDates.length > 0;
      } else {
        return selectedDays.length > 0;
      }
    };

    if (!isValidForExport()) {
      const formatType = timetableFormat === 'batch' ? 'date ranges' : 'days';
      toast({
        title: 'Error',
        description: `No timetable data available to export. Please configure periods and ${formatType}.`,
        variant: 'destructive'
      });
      return;
    }

    // Create a local reference to avoid TypeScript null issues
    const currentTimetable = timetable!;

    try {
      // Show loading toast
      toast({
        title: 'Generating PDF',
        description: 'Please wait while we generate your timetable PDF...'
      });

      const pdf = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.width;
      const pageHeight = pdf.internal.pageSize.height;
      const margin = 15;

      // Set document properties
      pdf.setProperties({
        title: `Timetable - ${currentTimetable.timetable_name}`,
        subject: `Timetable for ${
          currentTimetable.semesters?.semester_name || 'Semester'
        }`,
        creator: 'JKKN Timetable System'
      });

      // Add header
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('JKKN TIMETABLE', pageWidth / 2, 25, { align: 'center' });

      // Add timetable info
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'normal');
      let yPosition = 40;

      pdf.text(
        `Timetable: ${currentTimetable.timetable_name}`,
        margin,
        yPosition
      );
      yPosition += 7;

      if (currentTimetable.institution?.name) {
        pdf.text(
          `Institution: ${currentTimetable.institution.name}`,
          margin,
          yPosition
        );
        yPosition += 7;
      }

      if (currentTimetable.semesters?.semester_name) {
        pdf.text(
          `Semester: ${currentTimetable.semesters.semester_name}`,
          margin,
          yPosition
        );
        yPosition += 7;
      }

      if (currentTimetable.department?.department_name) {
        pdf.text(
          `Department: ${currentTimetable.department.department_name}`,
          margin,
          yPosition
        );
        yPosition += 7;
      }

      pdf.text(`Generated on: ${format(new Date(), 'PPP')}`, margin, yPosition);
      pdf.text(
        `Format: ${
          timetableFormat === 'batch'
            ? 'Batch (Date-wise)'
            : 'Regular (Day-wise)'
        }`,
        margin,
        yPosition + 7
      );
      yPosition += 22;

      // Prepare table data based on timetable format
      let tableColumns: string[];
      let tableRows: string[][];

      if (timetableFormat === 'batch') {
        // Helper function to parse date ranges from selectedDates
        const parseDateRanges = (dateArray: string[]) => {
          const ranges: Array<{
            start: string;
            end: string;
            dates: string[];
            rangeMarker: string;
            displayName: string;
          }> = [];

          dateArray.forEach((item) => {
            if (item.startsWith('RANGE:')) {
              const parts = item.split(':');
              if (parts.length === 3) {
                const startDate = parts[1];
                const endDate = parts[2];

                // Generate all dates in this range
                const rangeDates: string[] = [];
                const current = new Date(startDate);
                const end = new Date(endDate);

                while (current <= end) {
                  rangeDates.push(current.toISOString().split('T')[0]);
                  current.setDate(current.getDate() + 1);
                }

                // Create display name for the range
                const startFormatted = new Date(startDate).toLocaleDateString(
                  'en-US',
                  {
                    month: 'short',
                    day: 'numeric'
                  }
                );
                const endFormatted = new Date(endDate).toLocaleDateString(
                  'en-US',
                  {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  }
                );

                const displayName =
                  startDate === endDate
                    ? `${startFormatted}\n${new Date(
                        startDate
                      ).toLocaleDateString('en-US', { weekday: 'short' })}`
                    : `${startFormatted} -\n${endFormatted}\n(${rangeDates.length} days)`;

                ranges.push({
                  start: startDate,
                  end: endDate,
                  dates: rangeDates,
                  rangeMarker: item,
                  displayName
                });
              }
            } else if (!item.includes('RANGE')) {
              // Individual date
              const displayName =
                new Date(item).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                }) +
                '\n' +
                new Date(item).toLocaleDateString('en-US', {
                  weekday: 'short'
                });

              ranges.push({
                start: item,
                end: item,
                dates: [item],
                rangeMarker: item,
                displayName
              });
            }
          });

          return ranges;
        };

        const dateRanges = parseDateRanges(selectedDates);

        // Create column headers with date ranges
        tableColumns = [
          'Period',
          ...dateRanges.map((range) => range.displayName)
        ];

        // Create rows for each period
        tableRows = selectedPeriods.map((period) => {
          const row = [
            `${period.period_name}\n${new Date(
              `2000-01-01T${period.start_time}`
            ).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })} - ${new Date(
              `2000-01-01T${period.end_time}`
            ).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })}`
          ];

          dateRanges.forEach((range) => {
            // For each date range, find a representative slot (first slot found in the range)
            const slot = slots.find(
              (s) =>
                range.dates.includes(s.slot_date || '') &&
                s.period_id === period.id
            );

            if (!slot) {
              row.push('---');
            } else if (slot.is_break_slot) {
              row.push(`BREAK\n${slot.break_description || 'Break Time'}`);
            } else if (
              slot.is_combined &&
              slot.sub_slots &&
              slot.sub_slots.length > 0
            ) {
              const subSlotTexts = slot.sub_slots.map((subSlot: any) => {
                if (subSlot.is_break_slot) {
                  return `Break: ${subSlot.break_description || 'Break'}`;
                }

                const courseCode = subSlot.course?.course_code || 'Course';
                const staffName =
                  subSlot.staff_members && subSlot.staff_members.length > 0
                    ? `${subSlot.staff_members[0]?.first_name || ''} ${
                        subSlot.staff_members[0]?.last_name || ''
                      }`
                    : 'Staff';
                const sectionNames =
                  subSlot.sections
                    ?.map((s: any) => s.section_name)
                    .join(', ') || 'Section';

                return `${courseCode}\n${staffName}\n${sectionNames}`;
              });
              row.push(`COMBINED:\n${subSlotTexts.join('\n---\n')}`);
            } else {
              // Regular slot
              const courseCode = slot.course?.course_code || 'Course';
              const staffNames =
                slot.staff_members
                  ?.map((s: any) => `${s.first_name} ${s.last_name}`)
                  .join(', ') || 'Staff';
              const sectionNames =
                slot.sections?.map((s: any) => s.section_name).join(', ') ||
                'Section';

              row.push(`${courseCode}\n${staffNames}\n${sectionNames}`);
            }
          });

          return row;
        });
      } else {
        // Regular mode (existing logic)
        tableColumns = [
          'Period',
          ...selectedDays.map(
            (day) => day.charAt(0) + day.slice(1).toLowerCase()
          )
        ];

        tableRows = selectedPeriods.map((period) => {
          const row = [
            `${period.period_name}\n${new Date(
              `2000-01-01T${period.start_time}`
            ).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })} - ${new Date(
              `2000-01-01T${period.end_time}`
            ).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })}`
          ];

          selectedDays.forEach((day) => {
            const slot = slots.find(
              (s) => s.day_of_week === day && s.period_id === period.id
            );

            if (!slot) {
              row.push('---');
            } else if (slot.is_break_slot) {
              row.push(`BREAK\n${slot.break_description || 'Break Time'}`);
            } else if (
              slot.is_combined &&
              slot.sub_slots &&
              slot.sub_slots.length > 0
            ) {
              const subSlotTexts = slot.sub_slots.map((subSlot: any) => {
                if (subSlot.is_break_slot) {
                  return `Break: ${subSlot.break_description || 'Break'}`;
                }

                const courseCode = subSlot.course?.course_code || 'Course';
                const staffName =
                  subSlot.staff_members && subSlot.staff_members.length > 0
                    ? `${subSlot.staff_members[0]?.first_name || ''} ${
                        subSlot.staff_members[0]?.last_name || ''
                      }`
                    : 'Staff';
                const sectionNames =
                  subSlot.sections
                    ?.map((s: any) => s.section_name)
                    .join(', ') || 'Section';

                return `${courseCode}\n${staffName}\n${sectionNames}`;
              });
              row.push(`COMBINED:\n${subSlotTexts.join('\n---\n')}`);
            } else {
              // Regular slot
              const courseCode = slot.course?.course_code || 'Course';
              const staffNames =
                slot.staff_members
                  ?.map((s: any) => `${s.first_name} ${s.last_name}`)
                  .join(', ') || 'Staff';
              const sectionNames =
                slot.sections?.map((s: any) => s.section_name).join(', ') ||
                'Section';

              row.push(`${courseCode}\n${staffNames}\n${sectionNames}`);
            }
          });

          return row;
        });
      }

      // Generate table using autoTable
      autoTable(pdf, {
        head: [tableColumns],
        body: tableRows,
        startY: yPosition,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 9,
          cellPadding: 4,
          overflow: 'linebreak',
          halign: 'center',
          valign: 'middle',
          lineColor: [0, 0, 0],
          lineWidth: 0.1
        },
        headStyles: {
          fillColor: [37, 99, 235], // Blue
          textColor: 255,
          fontSize: 10,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle'
        },
        columnStyles: {
          0: {
            fillColor: [34, 197, 94], // Green
            textColor: 255,
            fontStyle: 'bold',
            halign: 'center',
            cellWidth: 30
          }
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251] // Light gray
        },
        tableLineColor: [0, 0, 0],
        tableLineWidth: 0.1,
        didParseCell: function (data) {
          // Adjust row height for multi-line content
          if (data.cell.text.length > 1) {
            data.cell.styles.minCellHeight = Math.max(
              20,
              data.cell.text.length * 6
            );
          }

          // Color coding for different slot types
          if (
            data.column.index > 0 &&
            data.cell.text.join('\n').includes('BREAK')
          ) {
            data.cell.styles.fillColor = [255, 237, 213]; // Orange tint
            data.cell.styles.textColor = [194, 65, 12]; // Orange text
          } else if (
            data.column.index > 0 &&
            data.cell.text.join('\n').includes('COMBINED')
          ) {
            data.cell.styles.fillColor = [243, 232, 255]; // Purple tint
            data.cell.styles.textColor = [126, 34, 206]; // Purple text
          } else if (
            data.column.index > 0 &&
            !data.cell.text.join('\n').includes('---')
          ) {
            data.cell.styles.fillColor = [239, 246, 255]; // Blue tint
            data.cell.styles.textColor = [37, 99, 235]; // Blue text
          }
        }
      });

      // Add course reference section
      const coursesInTimetable = getCoursesInTimetable();
      let finalY = (pdf as any).lastAutoTable.finalY || yPosition + 100;

      if (coursesInTimetable.length > 0) {
        finalY += 15; // Space before course reference

        // Course reference header
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text(
          `Course Reference (${coursesInTimetable.length} courses)`,
          margin,
          finalY
        );
        finalY += 8;

        // Course reference table
        const courseTableData = coursesInTimetable.map((course) => [
          course.course_code,
          course.course_name
        ]);

        autoTable(pdf, {
          head: [['Course Code', 'Course Name']],
          body: courseTableData,
          startY: finalY,
          margin: { left: margin, right: margin },
          styles: {
            fontSize: 9,
            cellPadding: 3,
            overflow: 'linebreak',
            lineColor: [0, 0, 0],
            lineWidth: 0.1
          },
          headStyles: {
            fillColor: [75, 85, 99], // Gray
            textColor: 255,
            fontSize: 10,
            fontStyle: 'bold',
            halign: 'center'
          },
          columnStyles: {
            0: {
              halign: 'center',
              cellWidth: 30,
              fontStyle: 'bold',
              fillColor: [249, 250, 251] // Light gray background for codes
            },
            1: {
              halign: 'left',
              cellWidth: 'auto'
            }
          },
          alternateRowStyles: {
            fillColor: [255, 255, 255] // White
          }
        });

        finalY = (pdf as any).lastAutoTable.finalY + 10;
      }

      // Add footer
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'italic');
      pdf.text(
        'Generated by JKKN Timetable Management System',
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );

      // Save the PDF
      pdf.save(
        `Timetable_${currentTimetable.timetable_name.replace(
          /\s+/g,
          '_'
        )}_${format(new Date(), 'yyyy-MM-dd')}.pdf`
      );

      // Success toast
      toast({
        title: 'PDF Generated',
        description: 'Your timetable has been exported to PDF successfully.'
      });
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast({
        title: 'Error',
        description: 'Failed to generate PDF. Please try again.',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return <Loading title='Loading timetable...' />;
  }

  if (error || !timetable) {
    return (
      <ContentLayout title='Timetable Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error || 'Timetable not found'}</p>
          <Button
            variant='outline'
            onClick={() => router.push('/academic/timetables')}
            className='mt-4'
          >
            Back to Timetables
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <PermissionGuard module='academic.timetables' action='view'>
      <ContentLayout title='Timetable Details'>
        <div className='space-y-6'>
          {/* Timetable Header */}
          <TimetableHeader
            timetable={timetable}
            onBack={() => handleNavigationWithWarning('/academic/timetables')}
            hasAttendance={hasAttendance}
            attendanceCount={markedPeriods.length}
            isSuperAdmin={isSuperAdmin}
          />

          {/* Unsaved Changes Indicator */}
          {hasUnsavedChanges && (
            <div className='bg-amber-50 border border-amber-200 rounded-lg p-4'>
              <div className='flex items-center gap-3'>
                <AlertCircle className='h-5 w-5 text-amber-600 flex-shrink-0' />
                <div className='flex-1'>
                  <p className='text-sm font-medium text-amber-800'>
                    You have unsaved changes
                  </p>
                  <p className='text-sm text-amber-700 mt-1'>
                    Your timetable configuration changes haven&apos;t been saved
                    yet. Click &quot;Save Configuration&quot; to save your
                    changes.
                  </p>
                </div>
                <Button
                  size='sm'
                  onClick={savePeriodSelections}
                  disabled={savingPeriods}
                  className='bg-amber-600 hover:bg-amber-700 text-white'
                >
                  {savingPeriods ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className='mr-2 h-4 w-4' />
                      Save Now
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Timetable Section */}
          <div className='bg-white rounded-lg shadow-sm border'>
            <div className='p-6'>
              <div className='flex flex-col gap-4 mb-6'>
                <div>
                  <h2 className='text-lg font-semibold text-gray-900'>
                    Timetable
                  </h2>
                  <p className='text-sm text-gray-500'>
                    Schedule for{' '}
                    {timetable?.semesters?.semester_name || 'Semester'}
                    {timetable?.sections?.section_name &&
                      ` - ${timetable.sections.section_name}`}
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  {canEditTimetable && (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        if (hasAttendance && !isSuperAdmin) {
                          toast({
                            title: 'Timetable Locked',
                            description:
                              'Cannot configure periods. Attendance has been marked for this timetable.',
                            variant: 'destructive'
                          });
                          return;
                        }
                        setPeriodSelectorOpen(true);
                      }}
                      disabled={hasAttendance && !isSuperAdmin}
                    >
                      {hasAttendance && !isSuperAdmin && (
                        <Lock className='h-3 w-3 mr-1' />
                      )}
                      <Settings className='h-4 w-4 mr-2' />
                      Configure Periods
                      <Badge variant='secondary' className='ml-2'>
                        {selectedPeriods.length}
                      </Badge>
                    </Button>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Select
                            value={timetableFormat}
                            onValueChange={(value) => {
                              const newFormat = value as 'regular' | 'batch';
                              if (newFormat !== timetableFormat) {
                                setTimetableFormat(newFormat);
                                setHasUnsavedChanges(true);
                              }
                            }}
                            disabled={slots.length > 0}
                          >
                            <SelectTrigger
                              className={cn(
                                'w-[180px] h-9',
                                slots.length > 0 &&
                                  'cursor-not-allowed opacity-60'
                              )}
                            >
                              <SelectValue placeholder='Timetable Format' />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value='regular'>
                                Regular (Day-wise)
                              </SelectItem>
                              <SelectItem value='batch'>
                                Batch (Date-wise)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TooltipTrigger>
                      {slots.length > 0 && (
                        <TooltipContent>
                          <p>
                            Cannot change format when slots exist. Delete all
                            slots first to change format.
                          </p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  {timetableFormat === 'regular' && canEditTimetable && (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setDayConfigOpen(true)}
                    >
                      <Calendar className='h-4 w-4 mr-2' />
                      Configure Days
                      <Badge variant='secondary' className='ml-2'>
                        {selectedDays.length}
                      </Badge>
                    </Button>
                  )}
                  {canEditTimetable && (!hasAttendance || isSuperAdmin) && (
                    <Button
                      variant='default'
                      size='sm'
                      onClick={savePeriodSelections}
                      disabled={
                        savingPeriods || (hasAttendance && !isSuperAdmin)
                      }
                      className='bg-green-600 hover:bg-green-700'
                    >
                      <Save className='h-4 w-4 mr-2' />
                      Save Configuration
                    </Button>
                  )}
                  <Button variant='outline' size='sm' onClick={exportToPDF}>
                    <Download className='h-4 w-4 mr-2' />
                    Export PDF
                  </Button>
                </div>
              </div>

              {timetableFormat === 'regular' ? (
                <TimetableGrid
                  ref={timetableGridRef}
                  selectedDays={selectedDays}
                  selectedPeriods={selectedPeriods}
                  slots={slots}
                  lockedPeriods={markedPeriods}
                  onSlotClick={openSlotDialog}
                  onSlotDelete={handleSlotDelete}
                  isSuperAdmin={isSuperAdmin}
                />
              ) : (
                <BatchTimetableGrid
                  ref={timetableGridRef}
                  selectedDates={selectedDates}
                  selectedPeriods={selectedPeriods}
                  slots={slots}
                  onSlotClick={(date, period, existingSlot) => {
                    console.log('BatchTimetableGrid onSlotClick called:', {
                      date,
                      period: period?.period_name,
                      existingSlot: !!existingSlot,
                      slotDialogOpen: slotDialogOpen
                    });

                    // For batch mode, store the date range info
                    if (typeof window !== 'undefined') {
                      sessionStorage.setItem('batchSelectedDate', date);
                    }

                    // Prevent slot creation/editing for break periods
                    if (period.is_break && !existingSlot) {
                      console.log('Preventing break period slot creation');
                      toast({
                        title: 'Break Period',
                        description:
                          'Slots cannot be created during break periods. Break periods are reserved for breaks across all days.',
                        variant: 'default'
                      });
                      return;
                    }

                    // For batch mode, store the date in selectedDay even though it's not a day of week
                    // This will be used in saveSlot function
                    setSelectedDay(date as any); // Store the date string for batch mode
                    setSelectedPeriod(period);

                    if (existingSlot) {
                      setSelectedSlot(existingSlot);
                      setEditingSlot(existingSlot);
                      setIsCombinedClass(existingSlot.is_combined || false);

                      if (existingSlot.is_combined && existingSlot.sub_slots) {
                        // Handle combined slot with sub-slots
                        setSlotType('regular');
                        setIsBreakSlot(false);
                        setBreakDescription('');
                        setSelectedCourseId('');
                        setSelectedStaffIds([]);
                        setSelectedSectionIds([]);

                        // Populate sub-slots
                        const updatedSubSlots = [
                          {
                            sub_slot_order: 1 as const,
                            course_id:
                              existingSlot.sub_slots.find(
                                (ss: any) => ss.sub_slot_order === 1
                              )?.course_id || '',
                            staff_ids:
                              existingSlot.sub_slots
                                .find((ss: any) => ss.sub_slot_order === 1)
                                ?.staff_members?.map((s: any) => s.id) || [],
                            section_ids:
                              existingSlot.sub_slots
                                .find((ss: any) => ss.sub_slot_order === 1)
                                ?.sections?.map((s: any) => s.id) || [],
                            is_break_slot:
                              existingSlot.sub_slots.find(
                                (ss: any) => ss.sub_slot_order === 1
                              )?.is_break_slot || false,
                            break_description:
                              existingSlot.sub_slots.find(
                                (ss: any) => ss.sub_slot_order === 1
                              )?.break_description || ''
                          },
                          {
                            sub_slot_order: 2 as const,
                            course_id:
                              existingSlot.sub_slots.find(
                                (ss: any) => ss.sub_slot_order === 2
                              )?.course_id || '',
                            staff_ids:
                              existingSlot.sub_slots
                                .find((ss: any) => ss.sub_slot_order === 2)
                                ?.staff_members?.map((s: any) => s.id) || [],
                            section_ids:
                              existingSlot.sub_slots
                                .find((ss: any) => ss.sub_slot_order === 2)
                                ?.sections?.map((s: any) => s.id) || [],
                            is_break_slot:
                              existingSlot.sub_slots.find(
                                (ss: any) => ss.sub_slot_order === 2
                              )?.is_break_slot || false,
                            break_description:
                              existingSlot.sub_slots.find(
                                (ss: any) => ss.sub_slot_order === 2
                              )?.break_description || ''
                          }
                        ];
                        setSubSlots(updatedSubSlots);
                      } else {
                        // Handle regular slot
                        setSlotType(
                          existingSlot.is_break_slot ? 'break' : 'regular'
                        );
                        setIsBreakSlot(existingSlot.is_break_slot);
                        setBreakDescription(
                          existingSlot.break_description || ''
                        );
                        setSelectedCourseId(existingSlot.course_id || '');

                        // Handle both legacy single staff and new multiple staff
                        if (
                          existingSlot.staff_members &&
                          existingSlot.staff_members.length > 0
                        ) {
                          setSelectedStaffIds(
                            existingSlot.staff_members.map((s: any) => s.id)
                          );
                        } else {
                          setSelectedStaffIds([]);
                        }

                        // Handle sections
                        if (
                          existingSlot.sections &&
                          existingSlot.sections.length > 0
                        ) {
                          setSelectedSectionIds(
                            existingSlot.sections.map((s: any) => s.id)
                          );
                        } else {
                          setSelectedSectionIds([]);
                        }

                        // Reset sub-slots to default
                        setSubSlots([
                          {
                            sub_slot_order: 1,
                            course_id: '',
                            staff_ids: [],
                            section_ids: [],
                            is_break_slot: false,
                            break_description: ''
                          },
                          {
                            sub_slot_order: 2,
                            course_id: '',
                            staff_ids: [],
                            section_ids: [],
                            is_break_slot: false,
                            break_description: ''
                          }
                        ]);
                      }
                    } else {
                      // Creating new slot - reset everything
                      setSelectedSlot(null);
                      setEditingSlot(null);
                      setSlotType('regular');
                      setIsCombinedClass(false);
                      setIsBreakSlot(false);
                      setBreakDescription('');
                      setSelectedCourseId('');
                      setSelectedStaffIds([]);
                      setSelectedSectionIds([]);
                      setSubSlots([
                        {
                          sub_slot_order: 1,
                          course_id: '',
                          staff_ids: [],
                          section_ids: [],
                          is_break_slot: false,
                          break_description: ''
                        },
                        {
                          sub_slot_order: 2,
                          course_id: '',
                          staff_ids: [],
                          section_ids: [],
                          is_break_slot: false,
                          break_description: ''
                        }
                      ]);
                    }

                    console.log('Setting slotDialogOpen to true');
                    setSlotDialogOpen(true);
                    console.log(
                      'slotDialogOpen set, current state:',
                      slotDialogOpen
                    );
                  }}
                  onSlotDelete={handleSlotDelete}
                  onRemoveDate={(rangeMarker) => {
                    // Remove the specific range marker
                    const newDates = selectedDates.filter(
                      (d) => d !== rangeMarker
                    );
                    setSelectedDates(newDates);

                    // Also update dateRanges state
                    if (rangeMarker.startsWith('RANGE:')) {
                      const parts = rangeMarker.split(':');
                      if (parts.length === 3) {
                        setDateRanges((prev) =>
                          prev.filter(
                            (r) => !(r.start === parts[1] && r.end === parts[2])
                          )
                        );
                      }
                    }

                    setHasUnsavedChanges(true);
                    toast({
                      title: 'Date Range Removed',
                      description:
                        "Date range has been removed from the timetable. Click 'Save Configuration' to confirm."
                    });
                  }}
                  lockedPeriods={lockedPeriods}
                />
              )}

              {/* Add Period/Date Range Button */}
              <div className='mt-4'>
                {timetableFormat === 'regular'
                  ? getAvailablePeriods().length > 0 &&
                    canEditTimetable && (
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => setAddPeriodDialogOpen(true)}
                        className='bg-green-600 text-white hover:bg-green-700 border-green-600 hover:text-white'
                      >
                        <Plus className='h-4 w-4 mr-2' />
                        Add Period
                      </Button>
                    )
                  : canEditTimetable && (
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => setAddDateRangeOpen(true)}
                        className='bg-blue-600 text-white hover:bg-blue-700 border-blue-600 hover:text-white'
                      >
                        <Plus className='h-4 w-4 mr-2' />
                        Add Date Range
                      </Button>
                    )}
              </div>

              {/* Course Reference Section */}
              {getCoursesInTimetable().length > 0 && (
                <div className='mt-6 border-t pt-4'>
                  <h3 className='text-sm font-medium text-gray-600 mb-3'>
                    Course Reference ({getCoursesInTimetable().length})
                  </h3>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2'>
                    {getCoursesInTimetable().map((course) => (
                      <div
                        key={course.id}
                        className='flex items-center gap-3 text-sm'
                      >
                        <span className='font-mono bg-gray-100 px-2 py-1 rounded text-xs font-medium min-w-16 text-center'>
                          {course.course_code}
                        </span>
                        <span className='text-gray-700 flex-1'>
                          {course.course_name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Keep existing dialogs */}
        <SlotDialog
          isOpen={slotDialogOpen}
          onClose={closeSlotDialog}
          timetable={timetable}
          existingSlot={selectedSlot}
          onSave={saveSlot}
          onDelete={deleteSlot}
          courses={courses}
          staff={staff}
          sections={sections}
          filteredSections={filteredSections}
          loadingFilteredSections={loadingFilteredSections}
          isUsingStaffPlanningData={staffPlanningCourses.length > 0}
          loadingStaffPlanData={loadingStaffPlanData}
          readOnly={slotDialogReadOnly}
        />

        {/* Period Configuration Component */}
        <PeriodConfiguration
          isOpen={periodSelectorOpen}
          onClose={() => setPeriodSelectorOpen(false)}
          selectedPeriods={selectedPeriods}
          periods={periods}
          lockedPeriods={lockedPeriods}
          hasUnsavedChanges={hasUnsavedChanges}
          savingPeriods={savingPeriods}
          onDragEnd={handleDragEnd}
          onRemovePeriod={handleRemovePeriod}
          onToggleLock={toggleLockPeriod}
          onSelectAllClassPeriods={() => {
            setSelectedPeriods(
              sortPeriodsByName(periods.filter((p) => !p.is_break))
            );
            setHasUnsavedChanges(true);
          }}
          onClearAllPeriods={() => {
            setSelectedPeriods([]);
            setLockedPeriods([]);
            setHasUnsavedChanges(true);
          }}
          onAddPeriod={addPeriod}
          onSave={savePeriodSelections}
        />

        {/* Add Period Dialog */}
        <Dialog
          open={addPeriodDialogOpen}
          onOpenChange={setAddPeriodDialogOpen}
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
              <Button
                variant='outline'
                onClick={() => setAddPeriodDialogOpen(false)}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Day Configuration Dialog */}
        <Dialog open={dayConfigOpen} onOpenChange={setDayConfigOpen}>
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
              <Button variant='outline' onClick={() => setDayConfigOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  await savePeriodSelections();
                  setDayConfigOpen(false);
                }}
                disabled={savingPeriods}
              >
                Save Days
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Date Range Dialog */}
        <Dialog open={addDateRangeOpen} onOpenChange={setAddDateRangeOpen}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Add Date Range to Timetable</DialogTitle>
              <DialogDescription>
                Select a date range to add to your batch timetable.
              </DialogDescription>
            </DialogHeader>
            <div className='space-y-4 py-4'>
              <div className='grid gap-1'>
                <Label htmlFor='new-start-date'>Start Date</Label>
                <DatePicker
                  date={newStartDate}
                  setDate={(date) => setNewStartDate(date ?? undefined)}
                />
              </div>
              <div className='grid gap-1'>
                <Label htmlFor='new-end-date'>End Date</Label>
                <DatePicker
                  date={newEndDate}
                  setDate={(date) => setNewEndDate(date ?? undefined)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => {
                  setAddDateRangeOpen(false);
                  setNewStartDate(undefined);
                  setNewEndDate(undefined);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (newStartDate && newEndDate) {
                    const startDateStr = newStartDate
                      .toISOString()
                      .split('T')[0];
                    const endDateStr = newEndDate.toISOString().split('T')[0];

                    // Generate all dates in the new range to check for conflicts
                    const newRangeDates: string[] = [];
                    const current = new Date(startDateStr);
                    const end = new Date(endDateStr);

                    while (current <= end) {
                      newRangeDates.push(current.toISOString().split('T')[0]);
                      current.setDate(current.getDate() + 1);
                    }

                    // Check if any date in the new range already exists in current ranges
                    const existingDates: string[] = [];
                    selectedDates.forEach((item) => {
                      if (item.startsWith('RANGE:')) {
                        const parts = item.split(':');
                        if (parts.length === 3) {
                          const existingStart = parts[1];
                          const existingEnd = parts[2];

                          const existingCurrent = new Date(existingStart);
                          const existingEndDate = new Date(existingEnd);

                          while (existingCurrent <= existingEndDate) {
                            existingDates.push(
                              existingCurrent.toISOString().split('T')[0]
                            );
                            existingCurrent.setDate(
                              existingCurrent.getDate() + 1
                            );
                          }
                        }
                      } else if (!item.includes('RANGE')) {
                        existingDates.push(item);
                      }
                    });

                    // Check for overlaps
                    const overlappingDates = newRangeDates.filter((date) =>
                      existingDates.includes(date)
                    );

                    if (overlappingDates.length > 0) {
                      toast({
                        title: 'Date Range Conflict',
                        description: `The selected range overlaps with existing dates: ${overlappingDates
                          .slice(0, 3)
                          .join(', ')}${
                          overlappingDates.length > 3
                            ? ` and ${overlappingDates.length - 3} more`
                            : ''
                        }. Please choose a different range.`,
                        variant: 'destructive'
                      });
                      return;
                    }

                    // Check if any dates in the new range already have slots
                    const datesWithSlots = newRangeDates.filter((date) =>
                      slots.some((slot) => slot.slot_date === date)
                    );

                    if (datesWithSlots.length > 0) {
                      toast({
                        title: 'Existing Slots Found',
                        description: `Some dates in this range already have slots created: ${datesWithSlots
                          .slice(0, 3)
                          .join(', ')}${
                          datesWithSlots.length > 3
                            ? ` and ${datesWithSlots.length - 3} more`
                            : ''
                        }. Please save your current changes first or choose a different range.`,
                        variant: 'destructive'
                      });
                      return;
                    }

                    // Store the range as a JSON string in the selectedDates array
                    // Format: "RANGE:start:end"
                    const rangeMarker = `RANGE:${startDateStr}:${endDateStr}`;

                    // Add the range marker to selectedDates
                    const newDates = [...selectedDates, rangeMarker];
                    setSelectedDates(newDates);

                    // Also update the dateRanges state for tracking
                    setDateRanges((prev) => [
                      ...prev,
                      { start: startDateStr, end: endDateStr }
                    ]);

                    setHasUnsavedChanges(true);
                    setAddDateRangeOpen(false);
                    setNewStartDate(undefined);
                    setNewEndDate(undefined);

                    // Calculate number of days in range
                    const days =
                      Math.ceil(
                        (new Date(endDateStr).getTime() -
                          new Date(startDateStr).getTime()) /
                          (1000 * 3600 * 24)
                      ) + 1;

                    toast({
                      title: 'Date Range Added',
                      description: `Date range from ${startDateStr} to ${endDateStr} (${days} days) has been added as a separate row. Click 'Save Configuration' to confirm.`
                    });
                  }
                }}
                disabled={!newStartDate || !newEndDate}
              >
                Add Date Range
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Unsaved Changes Warning Dialog */}
        <Dialog open={showUnsavedChangesDialog} onOpenChange={() => {}}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2 text-amber-600'>
                <AlertCircle className='h-5 w-5' />
                Unsaved Changes
              </DialogTitle>
              <DialogDescription asChild>
                <div>
                  <p className='text-sm text-muted-foreground'>
                    You have unsaved changes to your timetable configuration
                    including:
                  </p>
                  {timetableFormat === 'batch' ? (
                    <ul className='mt-2 list-disc list-inside text-sm space-y-1 text-muted-foreground'>
                      <li>Date ranges configuration</li>
                      <li>Period selections</li>
                      <li>Timetable format settings</li>
                    </ul>
                  ) : (
                    <ul className='mt-2 list-disc list-inside text-sm space-y-1 text-muted-foreground'>
                      <li>Day selections</li>
                      <li>Period selections</li>
                      <li>Timetable format settings</li>
                    </ul>
                  )}
                  <p className='mt-3 text-amber-700 font-medium'>
                    Do you want to save these changes before leaving?
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className='flex-col sm:flex-row gap-2'>
              <Button
                variant='outline'
                onClick={handleCancelNavigation}
                className='w-full sm:w-auto'
              >
                Cancel
              </Button>
              <Button
                variant='destructive'
                onClick={handleDiscardAndContinue}
                className='w-full sm:w-auto'
              >
                Discard Changes
              </Button>
              <Button
                onClick={handleSaveAndContinue}
                disabled={savingPeriods}
                className='w-full sm:w-auto bg-green-600 hover:bg-green-700'
              >
                {savingPeriods ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className='mr-2 h-4 w-4' />
                    Save & Continue
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Slot Deletion</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this timetable slot?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className='py-4 space-y-2'>
              {slotToDelete?.existingSlot?.course?.course_name && (
                <div className='font-medium'>
                  Course: {slotToDelete.existingSlot.course.course_name}
                </div>
              )}
              {slotToDelete?.period?.period_name && (
                <div className='text-sm'>
                  Period: {slotToDelete.period.period_name} (
                  {slotToDelete.period.start_time} -{' '}
                  {slotToDelete.period.end_time})
                </div>
              )}
              {timetableFormat === 'regular' && slotToDelete?.day && (
                <div className='text-sm'>Day: {slotToDelete.day}</div>
              )}
              {timetableFormat === 'batch' && slotToDelete?.day && (
                <div className='text-sm'>Date: {slotToDelete.day}</div>
              )}
              <div className='mt-3 text-sm text-amber-600 font-medium'>
                ⚠️ This action cannot be undone.
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSlotToDelete(null)}>
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
      </ContentLayout>
    </PermissionGuard>
  );
}
