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
  ArrowLeft
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
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
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Timetable,
  TimetableSlot,
  TimetableSubSlot,
  DayOfWeek,
  Period,
  CreateTimetableSlotDto,
  CreateTimetableSubSlotDto
} from '@/types/academics';

// Import extracted components
import { TimetableHeader } from './_components/timetable-header';
import { TimetableGrid } from './_components/timetable-grid';
import { SlotDialog } from './_components/slot-dialog';
import { PeriodConfiguration } from './_components/period-configuration';
import { SortablePeriodItem } from './_components/sortable-period-item';
import { LeaveCalendar } from './_components/leave-calendar';
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
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);
  const [isBreakSlot, setIsBreakSlot] = useState(false);
  const [breakDescription, setBreakDescription] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [sectionSearchQuery, setSectionSearchQuery] = useState('');

  // Combined class state
  const [isCombinedClass, setIsCombinedClass] = useState(false);
  const [subSlots, setSubSlots] = useState<CreateTimetableSubSlotDto[]>([
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
  const [slotToDelete, setSlotToDelete] = useState<TimetableSlot | null>(null);
  const [lockedPeriods, setLockedPeriods] = useState<string[]>([]);
  const [addPeriodDialogOpen, setAddPeriodDialogOpen] = useState(false);
  const [savingPeriods, setSavingPeriods] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Day configuration state
  const [selectedDays, setSelectedDays] =
    useState<DayOfWeek[]>(ALL_DAYS_OF_WEEK);
  const [dayConfigOpen, setDayConfigOpen] = useState(false);

  // Additional state for UI components
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [slotType, setSlotType] = useState<'regular' | 'break'>('regular');
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);

  // State for staff planning courses and staff
  const [staffPlanningCourses, setStaffPlanningCourses] = useState<any[]>([]);
  const [staffPlanningStaff, setStaffPlanningStaff] = useState<any[]>([]);
  const [loadingStaffPlanData, setLoadingStaffPlanData] = useState(false);

  // Fetch courses, staff and sections data
  const {
    courses: allCourses,
    loading: loadingCourses,
    fetchCourses
  } = useCourses({
    institution_id: timetable?.institution_id,
    isActive: true
  });

  const {
    staff: allStaff,
    loading: loadingStaff,
    fetchStaff
  } = useStaff({
    isActive: true
  });

  const { sections, loading: loadingSections, fetchSections } = useSections();

  // Fetch staff planning data based on timetable hierarchy
  const fetchStaffPlanningData = useCallback(async () => {
    if (!timetable) return;

    try {
      setLoadingStaffPlanData(true);

      // CRITICAL: We must match the exact semester between timetable and staff planning
      // Timetable is semester-specific, so only courses from that same semester's staff planning should be shown
      let semesterIdForStaffPlan: string | undefined;

      // If timetable has semester as object with id, use it directly
      if (
        typeof timetable.semester === 'object' &&
        timetable.semester &&
        'id' in timetable.semester
      ) {
        semesterIdForStaffPlan = (timetable.semester as any).id;
        console.log('Using semester object ID:', semesterIdForStaffPlan);
      }
      // If timetable has semester as string, find the matching semester ID
      else if (typeof timetable.semester === 'string') {
        try {
          console.log(
            'Looking up semester ID for timetable semester:',
            timetable.semester
          );

          // Find the semester ID by matching semester name within the same program/department context
          const semestersResponse = await SemesterService.getSemesters({
            program_id: timetable.program_id,
            department_id: timetable.department_id,
            isActive: true,
            limit: 100
          });

          const matchingSemester = semestersResponse.data.find(
            (semester) => semester.semester_name === timetable.semester
          );

          if (matchingSemester) {
            semesterIdForStaffPlan = matchingSemester.id;
            console.log(
              '✓ Found matching semester ID:',
              semesterIdForStaffPlan,
              'for semester:',
              timetable.semester
            );
          } else {
            console.warn(
              '✗ No matching semester found for:',
              timetable.semester
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

      const staffPlanFilters = {
        institution_id: timetable.institution_id,
        degree_id: timetable.degree_id,
        program_id: timetable.program_id,
        department_id: timetable.department_id,
        academic_year_id: timetable.academic_year_id,
        semester_id: semesterIdForStaffPlan, // REQUIRED: Only show courses from this exact semester
        isActive: true,
        limit: 1000 // Get all active staff plans for this hierarchy
      };

      console.log('Fetching staff plans with filters:', staffPlanFilters);

      // Fetch staff plans that match the timetable hierarchy
      const staffPlansResult = await StaffPlanService.getStaffPlans(
        staffPlanFilters
      );

      console.log('Found staff plans:', staffPlansResult.data.length);

      if (staffPlansResult.data.length === 0) {
        console.warn('No staff plans found for this timetable hierarchy');
        setStaffPlanningCourses([]);
        setStaffPlanningStaff([]);
        return;
      }

      // Extract unique courses and staff from staff plans
      const coursesSet = new Set<string>();
      const staffSet = new Set<string>();
      const courseDetailsMap = new Map<string, any>();
      const staffDetailsMap = new Map<string, any>();

      // Fetch course assignments for each staff plan
      for (const staffPlan of staffPlansResult.data) {
        try {
          const courseAssignments = await StaffPlanService.getStaffPlanCourses(
            staffPlan.id
          );

          console.log(
            `Staff plan ${staffPlan.id} has ${courseAssignments.length} course assignments`
          );

          for (const assignment of courseAssignments) {
            if (assignment.course && assignment.staff) {
              coursesSet.add(assignment.course.id);
              staffSet.add(assignment.staff.id);

              // Store course details
              courseDetailsMap.set(assignment.course.id, assignment.course);

              // Store staff details
              staffDetailsMap.set(assignment.staff.id, assignment.staff);
            }
          }
        } catch (error) {
          console.error(
            `Error fetching courses for staff plan ${staffPlan.id}:`,
            error
          );
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

  // Fetch sections filtered by semester and institution
  const fetchFilteredSections = useCallback(async () => {
    if (!timetable) return;

    try {
      setLoadingFilteredSections(true);

      // Find the semester ID based on the timetable's semester name and context
      let semesterId: string | null = null;

      if (
        typeof timetable.semester === 'string' ||
        typeof timetable.semester === 'number'
      ) {
        // Find the semester ID by matching semester name with timetable context
        try {
          const semestersResponse = await SemesterService.getSemesters({
            institution_id: timetable.institution_id,
            degree_id: timetable.degree_id,
            program_id: timetable.program_id,
            department_id: timetable.department_id,
            isActive: true,
            limit: 100
          });

          const matchingSemester = semestersResponse.data.find(
            (semester) => semester.semester_name === timetable.semester
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
            console.warn('No matching semester found for:', timetable.semester);
          }
        } catch (error) {
          console.error('Error finding semester ID:', error);
        }
      } else if (
        typeof timetable.semester === 'object' &&
        timetable.semester !== null &&
        'id' in timetable.semester
      ) {
        // If semester is already an object with ID (unlikely but handle it)
        semesterId = (timetable.semester as any).id;
      }

      let sectionsData: any[] = [];
      if (semesterId && timetable.institution_id) {
        // Use the specialized method for semester and institution filtering
        console.log(
          'Fetching sections for semester ID:',
          semesterId,
          'and institution:',
          timetable.institution_id
        );
        sectionsData = await SectionService.getSectionsBySemesterAndInstitution(
          semesterId,
          timetable.institution_id
        );
        console.log('Found filtered sections:', sectionsData.length);
      } else if (timetable.institution_id) {
        // Fallback to filtering by institution only
        console.warn('Using fallback - filtering by institution only');
        const response = await SectionService.getSections({
          institution_id: timetable.institution_id,
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
          'You have unsaved changes. Are you sure you want to leave?';
        return 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Load selected periods from local storage
  useEffect(() => {
    if (typeof window !== 'undefined' && timetableId) {
      const storedPeriods = localStorage.getItem(
        `selectedPeriods-${timetableId}`
      );
      if (storedPeriods) {
        try {
          const periodIds = JSON.parse(storedPeriods);
          // We'll apply these IDs after periods are loaded
          if (periods.length > 0) {
            // Fix: Instead of just filtering, we need to maintain the order from localStorage
            const orderedPeriods = periodIds
              .map((id: string) => periods.find((period) => period.id === id))
              .filter(Boolean); // Filter out any undefined values

            if (orderedPeriods.length > 0) {
              setSelectedPeriods(orderedPeriods);
            }
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
          setLockedPeriods(lockedIds);
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
  const fetchTimetableData = async () => {
    try {
      setLoading(true);
      setError(null);
      const timetableData = await TimetableService.getTimetable(timetableId);
      setTimetable(timetableData);

      // Set slots from timetable data
      if (timetableData.slots) {
        setSlots(timetableData.slots);
      } else {
        setSlots([]);
      }

      // Fetch periods filtered by institution
      const periodsResult = await PeriodService.getPeriods({
        limit: 50,
        institution_id: timetableData.institution_id
      });
      setPeriods(periodsResult.data);

      // Load selected periods from timetable_periods table
      const timetablePeriods = await TimetableService.getTimetablePeriods(
        timetableId
      );
      if (timetablePeriods.length > 0) {
        const selectedPeriodsFromDB = timetablePeriods
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((tp) => tp.period)
          .filter(Boolean);
        setSelectedPeriods(selectedPeriodsFromDB);
      }

      // Load selected days from timetable data
      if (
        timetableData.selected_days &&
        timetableData.selected_days.length > 0
      ) {
        setSelectedDays(timetableData.selected_days);
      } else {
        setSelectedDays(ALL_DAYS_OF_WEEK);
      }

      // Load related courses - fetch from course mappings for this program and semester
      if (timetableData.institution_id) {
        fetchCourses({
          institution_id: timetableData.institution_id,
          isActive: true
        });
      }

      // Load staff
      fetchStaff();

      // Load sections
      fetchSections();
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
    existingSlot?: TimetableSlot
  ) => {
    setSelectedDay(day);
    setSelectedPeriod(period);

    if (existingSlot) {
      setSelectedSlot(existingSlot);
      setEditingSlot(existingSlot); // Set editingSlot for the dialog
      setIsCombinedClass(existingSlot.is_combined || false);

      if (existingSlot.is_combined && existingSlot.sub_slots) {
        // Handle combined slot with sub-slots
        setSlotType('regular'); // Combined slots are still regular type
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
              existingSlot.sub_slots.find((ss) => ss.sub_slot_order === 1)
                ?.course_id || '',
            staff_ids:
              existingSlot.sub_slots
                .find((ss) => ss.sub_slot_order === 1)
                ?.staff_members?.map((s) => s.id) || [],
            section_ids:
              existingSlot.sub_slots
                .find((ss) => ss.sub_slot_order === 1)
                ?.sections?.map((s) => s.id) || [],
            is_break_slot:
              existingSlot.sub_slots.find((ss) => ss.sub_slot_order === 1)
                ?.is_break_slot || false,
            break_description:
              existingSlot.sub_slots.find((ss) => ss.sub_slot_order === 1)
                ?.break_description || ''
          },
          {
            sub_slot_order: 2 as const,
            course_id:
              existingSlot.sub_slots.find((ss) => ss.sub_slot_order === 2)
                ?.course_id || '',
            staff_ids:
              existingSlot.sub_slots
                .find((ss) => ss.sub_slot_order === 2)
                ?.staff_members?.map((s) => s.id) || [],
            section_ids:
              existingSlot.sub_slots
                .find((ss) => ss.sub_slot_order === 2)
                ?.sections?.map((s) => s.id) || [],
            is_break_slot:
              existingSlot.sub_slots.find((ss) => ss.sub_slot_order === 2)
                ?.is_break_slot || false,
            break_description:
              existingSlot.sub_slots.find((ss) => ss.sub_slot_order === 2)
                ?.break_description || ''
          }
        ];
        setSubSlots(updatedSubSlots);
      } else {
        // Handle regular slot
        setSlotType(existingSlot.is_break_slot ? 'break' : 'regular'); // Set slot type correctly
        setIsBreakSlot(existingSlot.is_break_slot);
        setBreakDescription(existingSlot.break_description || '');
        setSelectedCourseId(existingSlot.course_id || '');

        // Handle both legacy single staff and new multiple staff
        if (
          existingSlot.staff_members &&
          existingSlot.staff_members.length > 0
        ) {
          setSelectedStaffIds(existingSlot.staff_members.map((s) => s.id));
        } else if (existingSlot.staff_id) {
          setSelectedStaffIds([existingSlot.staff_id]);
        } else {
          setSelectedStaffIds([]);
        }

        // Handle sections
        if (existingSlot.sections && existingSlot.sections.length > 0) {
          setSelectedSectionIds(existingSlot.sections.map((s) => s.id));
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
      setEditingSlot(null); // Reset editingSlot for new slots
      setSlotType('regular'); // Default to regular slot type for new slots
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

    setSlotDialogOpen(true);
  };

  // Close slot dialog and reset form
  const closeSlotDialog = () => {
    setSlotDialogOpen(false);
    setSelectedDay(null);
    setSelectedPeriod(null);
    setSelectedSlot(null);
    setEditingSlot(null); // Reset editingSlot when closing dialog
    setSlotType('regular'); // Reset slot type to default
    setIsCombinedClass(false);
    setIsBreakSlot(false);
    setBreakDescription('');
    setSelectedCourseId('');
    setSelectedStaffIds([]);
    setSelectedSectionIds([]);
    setStaffSearchQuery('');
    setSectionSearchQuery('');
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
  };

  // Helper functions for sub-slot management
  const updateSubSlot = (
    index: number,
    updates: Partial<CreateTimetableSubSlotDto>
  ) => {
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
  const saveSlot = async () => {
    if (!selectedDay || !selectedPeriod) return;

    // Validation for mandatory fields
    if (!isBreakSlot) {
      if (isCombinedClass) {
        // Validate combined class sub-slots
        const invalidSubSlots = [];
        for (let i = 0; i < subSlots.length; i++) {
          const subSlot = subSlots[i];
          if (!subSlot.is_break_slot) {
            if (!subSlot.course_id || subSlot.course_id === 'none') {
              invalidSubSlots.push(`Sub-slot ${i + 1}: Course is required`);
            }
            if (
              !subSlot.staff_ids ||
              subSlot.staff_ids.length === 0 ||
              subSlot.staff_ids.every((id) => id === 'none')
            ) {
              invalidSubSlots.push(
                `Sub-slot ${i + 1}: At least one staff member is required`
              );
            }
            if (
              !subSlot.section_ids ||
              subSlot.section_ids.length === 0 ||
              subSlot.section_ids.every((id) => id === 'none')
            ) {
              invalidSubSlots.push(
                `Sub-slot ${i + 1}: At least one section is required`
              );
            }
          }
        }

        if (invalidSubSlots.length > 0) {
          toast({
            title: 'Validation Error',
            description: (
              <div className='space-y-1'>
                <div>
                  Cannot create slot. Please fill in the required fields:
                </div>
                {invalidSubSlots.map((error, index) => (
                  <div key={index} className='text-sm'>
                    • {error}
                  </div>
                ))}
              </div>
            ),
            variant: 'destructive'
          });
          return;
        }
      } else {
        // Validate regular slot
        const missingFields = [];

        if (!selectedCourseId || selectedCourseId === 'none') {
          missingFields.push('Course');
        }

        if (
          !selectedStaffIds ||
          selectedStaffIds.length === 0 ||
          selectedStaffIds.every((id) => id === 'none')
        ) {
          missingFields.push('Staff');
        }

        if (
          !selectedSectionIds ||
          selectedSectionIds.length === 0 ||
          selectedSectionIds.every((id) => id === 'none')
        ) {
          missingFields.push('Sections');
        }

        if (missingFields.length > 0) {
          toast({
            title: 'Validation Error',
            description: `Cannot create slot. The following fields are required: ${missingFields.join(
              ', '
            )}`,
            variant: 'destructive'
          });
          return;
        }
      }
    }

    try {
      if (isCombinedClass) {
        // Handle combined class
        const slotData: CreateTimetableSlotDto = {
          timetable_id: timetableId,
          day_of_week: selectedDay,
          period_id: selectedPeriod.id,
          is_combined: true,
          is_break_slot: false,
          sub_slots: subSlots.filter(
            (subSlot) =>
              subSlot.is_break_slot ||
              (subSlot.course_id && subSlot.course_id !== 'none')
          )
        };

        let result;
        if (selectedSlot) {
          // Update existing slot
          result = await TimetableService.updateTimetableSlot(selectedSlot.id, {
            is_combined: true,
            is_break_slot: false,
            course_id: undefined, // No main course for combined slots
            staff_ids: [], // Clear main staff for combined slots
            section_ids: [], // Clear main sections for combined slots
            sub_slots: slotData.sub_slots
          });
        } else {
          // Create new slot
          result = await TimetableService.createTimetableSlot(slotData);
        }

        // Check for staff conflicts in sub-slots
        for (const subSlot of subSlots) {
          if (subSlot.staff_ids && subSlot.staff_ids.length > 0) {
            for (const staffId of subSlot.staff_ids) {
              const hasConflict = await TimetableService.checkStaffConflicts(
                staffId,
                selectedDay,
                selectedPeriod.id,
                timetableId
              );

              if (hasConflict) {
                const staffMember = staff.find((s) => s.id === staffId);
                const staffName = staffMember
                  ? `${staffMember.first_name} ${staffMember.last_name}`
                  : 'Staff member';

                toast({
                  title: 'Warning',
                  description: `${staffName} is already assigned to another class at this time.`,
                  variant: 'destructive'
                });
              }
            }
          }
        }
      } else {
        // Handle regular slot
        const slotData: CreateTimetableSlotDto = {
          timetable_id: timetableId,
          day_of_week: selectedDay,
          period_id: selectedPeriod.id,
          is_combined: false,
          is_break_slot: isBreakSlot,
          break_description: isBreakSlot ? breakDescription : undefined,
          course_id:
            !isBreakSlot && selectedCourseId && selectedCourseId !== 'none'
              ? selectedCourseId
              : undefined,
          staff_ids:
            !isBreakSlot && selectedCourseId && selectedCourseId !== 'none'
              ? selectedStaffIds.filter((id) => id !== 'none')
              : undefined,
          section_ids:
            !isBreakSlot && selectedCourseId && selectedCourseId !== 'none'
              ? selectedSectionIds.filter((id) => id !== 'none')
              : undefined
        };

        let result;
        if (selectedSlot) {
          // Update existing slot
          result = await TimetableService.updateTimetableSlot(selectedSlot.id, {
            is_combined: false,
            is_break_slot: isBreakSlot,
            break_description: isBreakSlot ? breakDescription : undefined,
            course_id:
              !isBreakSlot && selectedCourseId && selectedCourseId !== 'none'
                ? selectedCourseId
                : undefined,
            staff_ids:
              !isBreakSlot && selectedCourseId && selectedCourseId !== 'none'
                ? selectedStaffIds.filter((id) => id !== 'none')
                : undefined,
            section_ids:
              !isBreakSlot && selectedCourseId && selectedCourseId !== 'none'
                ? selectedSectionIds.filter((id) => id !== 'none')
                : undefined,
            sub_slots: [] // Clear sub-slots for regular slots
          });
        } else {
          // Create new slot
          result = await TimetableService.createTimetableSlot(slotData);
        }

        // Check for staff conflicts for regular slots
        if (slotData.staff_ids && slotData.staff_ids.length > 0) {
          for (const staffId of slotData.staff_ids) {
            const hasConflict = await TimetableService.checkStaffConflicts(
              staffId,
              slotData.day_of_week,
              slotData.period_id,
              timetableId
            );

            if (hasConflict) {
              const staffMember = staff.find((s) => s.id === staffId);
              const staffName = staffMember
                ? `${staffMember.first_name} ${staffMember.last_name}`
                : 'Staff member';

              toast({
                title: 'Warning',
                description: `${staffName} is already assigned to another class at this time.`,
                variant: 'destructive'
              });
            }
          }
        }
      }

      // Refresh timetable data
      await fetchTimetableData();

      toast({
        title: 'Success',
        description: selectedSlot
          ? 'Slot updated successfully'
          : 'Slot added successfully'
      });

      closeSlotDialog();
    } catch (err) {
      console.error('Error saving slot:', err);
      toast({
        title: 'Error',
        description: 'Failed to save slot. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Delete a timetable slot
  const deleteSlot = async () => {
    // Use editingSlot if available (called from SlotDialog), otherwise use slotToDelete (called from AlertDialog)
    const slotToDeleteNow = editingSlot || slotToDelete;

    if (!slotToDeleteNow) return;

    try {
      await TimetableService.deleteTimetableSlot(slotToDeleteNow.id);

      // Refresh timetable data
      await fetchTimetableData();

      toast({
        title: 'Success',
        description: 'Slot deleted successfully'
      });

      // Close dialogs and reset state
      setDeleteDialogOpen(false);
      setSlotToDelete(null);
      closeSlotDialog(); // Also close the slot dialog if it was called from there
    } catch (err) {
      console.error('Error deleting slot:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete slot. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Open delete dialog
  const openDeleteDialog = (slot: TimetableSlot) => {
    setSlotToDelete(slot);
    setDeleteDialogOpen(true);
  };

  // Get slot for a day and period
  const getSlot = (day: DayOfWeek, periodId: string) => {
    return timetable?.slots?.find(
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
  const addPeriod = async (period: Period) => {
    if (!selectedPeriods.some((p) => p.id === period.id)) {
      // Add the period at the end of the existing list (don't sort)
      const newSelectedPeriods = [...selectedPeriods, period];
      setSelectedPeriods(newSelectedPeriods);

      // Immediately save to database to prevent loss on refresh
      try {
        const currentPeriodIds = newSelectedPeriods.map((p) => p.id);
        await TimetableService.saveTimetablePeriods(
          timetableId,
          currentPeriodIds
        );

        toast({
          title: 'Period Added',
          description: `${period.period_name} has been added to the bottom of your timetable.`
        });
      } catch (err) {
        console.error('Error saving period selection:', err);
        toast({
          title: 'Error',
          description: 'Failed to save period selection. Please try again.',
          variant: 'destructive'
        });
      }
    }
  };

  // Save selected periods and days to database
  const savePeriodSelections = async () => {
    if (!timetable) return;

    setSavingPeriods(true);
    try {
      // Save period selections to timetable_periods table
      const currentPeriodIds = selectedPeriods.map((p) => p.id);
      await TimetableService.saveTimetablePeriods(
        timetableId,
        currentPeriodIds
      );

      // Save day selections to timetables table
      await TimetableService.saveTimetableDays(timetableId, selectedDays);

      // Only remove slots for periods that are no longer selected OR days that are no longer selected
      const slotsToDelete =
        timetable.slots?.filter(
          (slot) =>
            (!currentPeriodIds.includes(slot.period_id) ||
              !selectedDays.includes(slot.day_of_week)) &&
            !slot.course_id && // Only delete empty slots
            !slot.is_break_slot &&
            !slot.break_description // Don't delete break slots with descriptions
        ) || [];

      // Delete slots for periods/days that are no longer selected
      for (const slot of slotsToDelete) {
        await TimetableService.deleteTimetableSlot(slot.id);
      }

      // Refresh timetable data
      await fetchTimetableData();

      // Clear unsaved changes flag after successful save
      setHasUnsavedChanges(false);

      // Close the period configuration dialog
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
        slot.sub_slots.forEach((subSlot) => {
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
    if (
      !timetable ||
      selectedPeriods.length === 0 ||
      selectedDays.length === 0
    ) {
      toast({
        title: 'Error',
        description: 'No timetable data available to export.',
        variant: 'destructive'
      });
      return;
    }

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
        title: `Timetable - ${timetable.timetable_name}`,
        subject: `Timetable for ${timetable.semester}`,
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

      pdf.text(`Timetable: ${timetable.timetable_name}`, margin, yPosition);
      yPosition += 7;

      if (timetable.institution?.name) {
        pdf.text(
          `Institution: ${timetable.institution.name}`,
          margin,
          yPosition
        );
        yPosition += 7;
      }

      if (timetable.semester) {
        const semesterName =
          typeof timetable.semester === 'string'
            ? timetable.semester
            : 'Semester';
        pdf.text(`Semester: ${semesterName}`, margin, yPosition);
        yPosition += 7;
      }

      if (timetable.department?.department_name) {
        pdf.text(
          `Department: ${timetable.department.department_name}`,
          margin,
          yPosition
        );
        yPosition += 7;
      }

      pdf.text(`Generated on: ${format(new Date(), 'PPP')}`, margin, yPosition);
      yPosition += 15;

      // Prepare table data
      const tableColumns = [
        'Period',
        ...selectedDays.map((day) => day.charAt(0) + day.slice(1).toLowerCase())
      ];

      const tableRows = selectedPeriods.map((period) => {
        const row = [
          `${period.period_name}\n${new Date(
            `2000-01-01T${period.start_time}`
          ).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })} - ${new Date(`2000-01-01T${period.end_time}`).toLocaleTimeString(
            'en-US',
            {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }
          )}`
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
            const subSlotTexts = slot.sub_slots.map((subSlot) => {
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
                subSlot.sections?.map((s) => s.section_name).join(', ') ||
                'Section';

              return `${courseCode}\n${staffName}\n${sectionNames}`;
            });
            row.push(`COMBINED:\n${subSlotTexts.join('\n---\n')}`);
          } else {
            // Regular slot
            const courseCode = slot.course?.course_code || 'Course';
            const staffNames =
              slot.staff_members
                ?.map((s) => `${s.first_name} ${s.last_name}`)
                .join(', ') || 'Staff';
            const sectionNames =
              slot.sections?.map((s) => s.section_name).join(', ') || 'Section';

            row.push(`${courseCode}\n${staffNames}\n${sectionNames}`);
          }
        });

        return row;
      });

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
        `Timetable_${timetable.timetable_name.replace(/\s+/g, '_')}_${format(
          new Date(),
          'yyyy-MM-dd'
        )}.pdf`
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
    <ContentLayout title='Timetable Details'>
      <div className='space-y-6'>
        {/* Timetable Header */}
        <TimetableHeader
          timetable={timetable}
          onBack={() => router.push('/academic/timetables')}
        />

        {/* Timetable Section */}
        <div className='bg-white rounded-lg shadow-sm border'>
          <div className='p-6'>
            <div className='flex items-center justify-between mb-6'>
              <div>
                <h2 className='text-lg font-semibold text-gray-900'>
                  Timetable
                </h2>
                <p className='text-sm text-gray-500'>
                  Schedule for{' '}
                  {typeof timetable.semester === 'object' &&
                  timetable.semester &&
                  'semester_name' in timetable.semester
                    ? (timetable.semester as any).semester_name
                    : typeof timetable.semester === 'string'
                    ? timetable.semester
                    : 'Semester'}
                </p>
              </div>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setPeriodSelectorOpen(true)}
                >
                  <Settings className='h-4 w-4 mr-2' />
                  Configure Periods
                  <Badge variant='secondary' className='ml-2'>
                    {selectedPeriods.length}
                  </Badge>
                </Button>
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
                <Button
                  variant='default'
                  size='sm'
                  onClick={savePeriodSelections}
                  disabled={savingPeriods}
                  className='bg-green-600 hover:bg-green-700'
                >
                  <Save className='h-4 w-4 mr-2' />
                  Save Configuration
                </Button>
                <Button variant='outline' size='sm' onClick={exportToPDF}>
                  <Download className='h-4 w-4 mr-2' />
                  Export PDF
                </Button>
              </div>
            </div>

            <TimetableGrid
              ref={timetableGridRef}
              selectedDays={selectedDays}
              selectedPeriods={selectedPeriods}
              slots={slots}
              lockedPeriods={lockedPeriods}
              onSlotClick={openSlotDialog}
            />

            {/* Add Period Button */}
            {getAvailablePeriods().length > 0 && (
              <div className='mt-4'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setAddPeriodDialogOpen(true)}
                  className='bg-green-600 text-white hover:bg-green-700 border-green-600 hover:text-white'
                >
                  <Plus className='h-4 w-4 mr-2' />
                  Add Period
                </Button>
              </div>
            )}

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

        {/* Leave Management Section */}
        <div className='bg-white rounded-lg shadow-sm border'>
          <div className='p-6'>
            <LeaveCalendar timetableId={timetableId} />
          </div>
        </div>
      </div>

      {/* Keep existing dialogs */}
      <SlotDialog
        isOpen={slotDialogOpen}
        onClose={closeSlotDialog}
        day={selectedDay}
        period={selectedPeriod}
        existingSlot={editingSlot}
        slotType={slotType}
        setSlotType={setSlotType}
        isBreakSlot={isBreakSlot}
        setIsBreakSlot={setIsBreakSlot}
        breakDescription={breakDescription}
        setBreakDescription={setBreakDescription}
        selectedCourse={selectedCourseId}
        setSelectedCourse={setSelectedCourseId}
        selectedStaff={selectedStaffIds}
        setSelectedStaff={setSelectedStaffIds}
        selectedSections={selectedSectionIds}
        setSelectedSections={setSelectedSectionIds}
        isCombinedClass={isCombinedClass}
        setIsCombinedClass={setIsCombinedClass}
        subSlots={subSlots}
        updateSubSlot={updateSubSlot}
        updateSubSlotStaff={updateSubSlotStaff}
        updateSubSlotSections={updateSubSlotSections}
        onSave={saveSlot}
        onDelete={deleteSlot}
        courses={courses}
        staff={staff}
        sections={sections}
        filteredSections={filteredSections}
        loadingFilteredSections={loadingFilteredSections}
        timetable={timetable}
        isUsingStaffPlanningData={staffPlanningCourses.length > 0}
        loadingStaffPlanData={loadingStaffPlanData}
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
      <Dialog open={addPeriodDialogOpen} onOpenChange={setAddPeriodDialogOpen}>
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
    </ContentLayout>
  );
}
