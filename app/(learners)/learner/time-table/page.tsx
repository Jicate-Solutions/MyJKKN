'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Clock,
  User,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Download,
  Eye,
  Settings,
  Bell,
  MapPin,
  Phone,
  Mail,
  ExternalLink,
  Palette,
  Grid,
  List,
  CalendarDays,
  RefreshCw
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import Loading from '@/components/Loading/Loading';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { StudentService } from '@/lib/services/student/student-service';
import { useToast } from '@/hooks/use-toast';
import type { Timetable, Period, DayOfWeek } from '@/types/academics';
import type { Student } from '@/types/student';
import type { Staff } from '@/types/staff';
import { format, startOfWeek, addDays, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { PeriodService } from '@/lib/services/academic/period-service';
import { UserService } from '@/lib/services/users/user-service';

const DAYS_OF_WEEK: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY'
];

const DAY_ABBREVIATIONS: Record<DayOfWeek, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun'
};

// Color schemes for course types
const COURSE_COLORS = [
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-green-100 border-green-300 text-green-800',
  'bg-purple-100 border-purple-300 text-purple-800',
  'bg-orange-100 border-orange-300 text-orange-800',
  'bg-pink-100 border-pink-300 text-pink-800',
  'bg-indigo-100 border-indigo-300 text-indigo-800',
  'bg-yellow-100 border-yellow-300 text-yellow-800',
  'bg-red-100 border-red-300 text-red-800'
];

export default function TimeTablePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('MONDAY');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'calendar'>(
    'grid'
  );
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(
    () => startOfWeek(new Date(), { weekStartsOn: 1 }) // Start week on Monday
  );

  // Advanced features state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [selectedInstructor, setSelectedInstructor] = useState<string>('all');
  const [showBreaks, setShowBreaks] = useState(true);
  const [colorCoding, setColorCoding] = useState(true);
  const [courseColors, setCourseColors] = useState<Record<string, string>>({});
  const [showCourseDetails, setShowCourseDetails] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Settings state
  const [settings, setSettings] = useState({
    showInstructorNames: true,
    showCourseNames: true,
    showTimings: true,
    compactView: false,
    highlightCurrentPeriod: true,
    showWeekend: false
  });

  // Initialize course colors when timetable is loaded
  useEffect(() => {
    if (timetable?.slots && colorCoding) {
      const courses = Array.from(
        new Set(
          timetable.slots
            .filter((slot) => !slot.is_break_slot && slot.course)
            .map((slot) => slot.course?.id)
        )
      ).filter(Boolean);

      const colors: Record<string, string> = {};
      courses.forEach((courseId, index) => {
        colors[courseId!] = COURSE_COLORS[index % COURSE_COLORS.length];
      });
      setCourseColors(colors);
    }
  }, [timetable?.slots, colorCoding]);

  // Get unique courses for filtering
  const availableCourses = useMemo(() => {
    if (!timetable?.slots) return [];
    return Array.from(
      new Set(
        timetable.slots
          .filter((slot) => !slot.is_break_slot && slot.course)
          .map((slot) => slot.course)
      )
    ).filter(Boolean);
  }, [timetable?.slots]);

  // Get unique instructors for filtering
  const availableInstructors = useMemo(() => {
    if (!timetable?.slots) return [];
    const instructors = new Set();
    timetable.slots.forEach((slot) => {
      if (slot.staff_members) {
        slot.staff_members.forEach((staff: Staff) =>
          instructors.add(`${staff.first_name} ${staff.last_name}`)
        );
      } else if (slot.staff) {
        instructors.add(`${slot.staff.first_name} ${slot.staff.last_name}`);
      }
    });
    return Array.from(instructors) as string[];
  }, [timetable?.slots]);

  // Helper function to get date for a specific day in the current week
  const getDateForDay = (day: DayOfWeek): Date => {
    const dayIndex = DAYS_OF_WEEK.indexOf(day);
    return addDays(currentWeekStart, dayIndex);
  };

  // Filter slots based on search and filters
  const filteredSlots = useMemo(() => {
    if (!timetable?.slots) return [];

    return timetable.slots.filter((slot) => {
      // Date range filter - only show slots that fall within timetable date range for current week
      if (timetable?.start_date && timetable?.end_date) {
        const dayDate = getDateForDay(slot.day_of_week);
        const timetableStart = new Date(timetable.start_date!);
        const timetableEnd = new Date(timetable.end_date!);

        // Check if the slot's day is within the timetable's valid date range
        if (dayDate < timetableStart || dayDate > timetableEnd) {
          return false;
        }
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesCourse =
          slot.course?.course_name?.toLowerCase().includes(query) ||
          slot.course?.course_code?.toLowerCase().includes(query);
        const matchesInstructor =
          slot.staff?.first_name?.toLowerCase().includes(query) ||
          slot.staff?.last_name?.toLowerCase().includes(query) ||
          slot.staff_members?.some(
            (staff: Staff) =>
              staff.first_name?.toLowerCase().includes(query) ||
              staff.last_name?.toLowerCase().includes(query)
          );
        if (!matchesCourse && !matchesInstructor) return false;
      }

      // Course filter
      if (selectedCourse !== 'all' && slot.course?.id !== selectedCourse) {
        return false;
      }

      // Instructor filter
      if (selectedInstructor !== 'all') {
        const hasInstructor =
          slot.staff?.first_name + ' ' + slot.staff?.last_name ===
            selectedInstructor ||
          slot.staff_members?.some(
            (staff: Staff) =>
              staff.first_name + ' ' + staff.last_name === selectedInstructor
          );
        if (!hasInstructor) return false;
      }

      // Break filter
      if (!showBreaks && slot.is_break_slot) {
        return false;
      }

      return true;
    });
  }, [
    timetable?.slots,
    searchQuery,
    selectedCourse,
    selectedInstructor,
    showBreaks,
    timetable?.start_date,
    timetable?.end_date,
    currentWeekStart
  ]);

  // Refresh timetable data
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStudentAndTimetable();
    setRefreshing(false);
    toast({
      title: 'Refreshed',
      description: 'Timetable data has been updated'
    });
  };

  // Export timetable as text (could be enhanced for PDF)
  const handleExport = () => {
    if (!timetable || !periods) return;

    let exportText = `TIMETABLE - ${timetable.academic_year?.academic_year_name}\n`;
    exportText += `${timetable.degree?.degree_name} - ${timetable.department?.department_name}\n`;
    exportText += `Semester: ${timetable.semester}\n\n`;

    // Add date range info to export
    if (timetable.start_date && timetable.end_date) {
      exportText += `Week: ${format(currentWeekStart, 'MMM dd')} - ${format(addDays(currentWeekStart, 6), 'MMM dd, yyyy')}\n`;
      exportText += `Timetable Range: ${format(new Date(timetable.start_date!), 'MMM dd')} - ${format(new Date(timetable.end_date!), 'MMM dd, yyyy')}\n\n`;
    }

    // Use the same filtered periods from the main component
    const periodsToExport = [...periods].sort((a, b) =>
      (a.start_time || '').localeCompare(b.start_time || '')
    ).filter((period) => {
      if (!timetable?.start_date || !timetable?.end_date) {
        return true; // Show all periods if no date range
      }

      const periodId = (period as any).period_id || period.id;

      // Check if this period has any slots in the current week that are within date range
      const hasValidSlots = timetable.selected_days?.some((day) => {
        const dayDate = getDateForDay(day as DayOfWeek);
        const timetableStart = new Date(timetable.start_date!);
        const timetableEnd = new Date(timetable.end_date!);

        // Check if the day is within timetable range
        if (dayDate < timetableStart || dayDate > timetableEnd) {
          return false;
        }

        // Check if there's a slot for this day and period
        const slot = filteredSlots.find(
          (s) => s.day_of_week === day && s.period_id === periodId
        );
        return !!slot;
      });

      return hasValidSlots;
    });

    // Create a simple text table
    exportText += 'Time\t\t';
    timetable.selected_days?.forEach((day) => {
      exportText += `${day}\t\t`;
    });
    exportText += '\n';

    periodsToExport.forEach((period) => {
      exportText += `${period.period_name} (${formatTime(period.start_time)}-${formatTime(period.end_time)})\t`;
      timetable.selected_days?.forEach((day) => {
        const slot = getSlotForDayAndPeriod(day as DayOfWeek, (period as any).period_id || period.id);
        if (slot) {
          if (slot.is_break_slot) {
            exportText += 'Break\t\t';
          } else {
            exportText += `${slot.course?.course_code || ''}\t\t`;
          }
        } else {
          exportText += '-\t\t';
        }
      });
      exportText += '\n';
    });

    // Download as text file
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetable-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Exported',
      description: 'Timetable has been exported successfully'
    });
  };

  const fetchStudentAndTimetable = React.useCallback(async () => {
    try {
      setLoading(true);

      // Get current user profile
      const { data: profile, error: profileError } =
        await UserService.getCurrentUserProfile();

      if (profileError || !profile) {
        toast({
          title: 'Error',
          description: 'Could not load user profile',
          variant: 'destructive'
        });
        return;
      }

      if (profile.role !== 'student' || !profile.student_id) {
        toast({
          title: 'Error',
          description: 'No student profile linked to your account',
          variant: 'destructive'
        });
        return;
      }

      // Get student details
      const studentData = await StudentService.getStudent(profile.student_id);
      if (!studentData) {
        toast({
          title: 'Error',
          description: 'Student profile not found',
          variant: 'destructive'
        });
        return;
      }
      setStudent(studentData);

      // Find active timetable for student's current semester
      console.log('🔍 Student data for timetable query:', {
        institution_id: studentData.institution_id,
        degree_id: studentData.degree_id,
        department_id: studentData.department_id,
        program_id: studentData.program_id,
        semester_id: studentData.semester_id,
        semester_name: studentData.semester?.semester_name,
        semester_object: studentData.semester
      });

      // Try multiple approaches to find the timetable
      let timetables;
      let searchAttempt = 0;

      // Attempt 1: Use semester_id directly from student data
      if (studentData.semester_id) {
        searchAttempt++;
        console.log(`📋 Attempt ${searchAttempt}: Searching with semester_id`);
        timetables = await TimetableService.getTimetables({
          institution_id: studentData.institution_id,
          degree_id: studentData.degree_id,
          department_id: studentData.department_id,
          program_id: studentData.program_id,
          semester: studentData.semester_id,
          is_active: true,
          is_template: false
        });
      }

      // Attempt 2: Use semester name if first attempt failed
      if (
        (!timetables || timetables.data.length === 0) &&
        studentData.semester?.semester_name
      ) {
        searchAttempt++;
        console.log(
          `📋 Attempt ${searchAttempt}: Searching with semester_name`
        );
        timetables = await TimetableService.getTimetables({
          institution_id: studentData.institution_id,
          degree_id: studentData.degree_id,
          department_id: studentData.department_id,
          program_id: studentData.program_id,
          semester: studentData.semester.semester_name,
          is_active: true,
          is_template: false
        });
      }

      // Attempt 3: Try with semester.id if available
      if (
        (!timetables || timetables.data.length === 0) &&
        studentData.semester?.id
      ) {
        searchAttempt++;
        console.log(`📋 Attempt ${searchAttempt}: Searching with semester.id`);
        timetables = await TimetableService.getTimetables({
          institution_id: studentData.institution_id,
          degree_id: studentData.degree_id,
          department_id: studentData.department_id,
          program_id: studentData.program_id,
          semester: studentData.semester.id,
          is_active: true,
          is_template: false
        });
      }

      // Attempt 4: Try without semester filter as last resort
      if (!timetables || timetables.data.length === 0) {
        searchAttempt++;
        console.log(
          `📋 Attempt ${searchAttempt}: Searching without semester filter`
        );
        timetables = await TimetableService.getTimetables({
          institution_id: studentData.institution_id,
          degree_id: studentData.degree_id,
          department_id: studentData.department_id,
          program_id: studentData.program_id,
          is_active: true,
          is_template: false
        });
      }

      console.log(
        `✅ Found ${
          timetables?.data?.length || 0
        } timetables after ${searchAttempt} attempts`
      );

      if (timetables.data.length > 0) {
        console.log(
          '🎯 Found timetables:',
          timetables.data.map((t) => ({
            id: t.id,
            name: t.timetable_name,
            semester: t.semester,
            section: t.section,
            is_active: t.is_active
          }))
        );

        // Get the full timetable with slots
        const fullTimetable = await TimetableService.getTimetable(
          timetables.data[0].id
        );
        console.log('📚 Full timetable loaded:', {
          id: fullTimetable.id,
          name: fullTimetable.timetable_name,
          slotsCount: fullTimetable.slots?.length || 0,
          periodsCount: fullTimetable.periods?.length || 0,
          hasSlots: !!fullTimetable.slots,
          hasPeriods: !!fullTimetable.periods,
          timetableFormat: fullTimetable.timetable_format,
          hasTimetableData: !!fullTimetable.timetable_data,
          timetableDataKeys: fullTimetable.timetable_data
            ? Object.keys(fullTimetable.timetable_data)
            : [],
          selectedDays: fullTimetable.selected_days
        });

        // The timetable service now automatically enriches slots with course and staff details
        console.log('✨ Enriched timetable slots:', {
          slotsCount: fullTimetable.slots?.length || 0,
          sampleSlot: fullTimetable.slots?.[0] || null
        });
        setTimetable(fullTimetable);

        // Load periods from the timetable data - periods are stored in the timetable object
        if (fullTimetable.periods && Array.isArray(fullTimetable.periods)) {
          setPeriods(fullTimetable.periods);
        } else {
          // Fallback: Get periods from the PeriodService if not stored in timetable
          try {
            const allPeriods = await PeriodService.getPeriods({
              institution_id: studentData.institution_id
            });
            if (allPeriods.data && allPeriods.data.length > 0) {
              setPeriods(allPeriods.data);
            }
          } catch (periodError) {
            console.error('Error fetching periods:', periodError);
          }
        }
      } else {
        toast({
          title: 'No Timetable',
          description: 'No active timetable found for your current semester',
          variant: 'default'
        });
      }
    } catch (error) {
      console.error('Error fetching timetable:', error);
      toast({
        title: 'Error',
        description: 'Failed to load timetable',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStudentAndTimetable();
  }, [fetchStudentAndTimetable]);

  // Initialize currentWeekStart to be within timetable date range
  useEffect(() => {
    if (timetable?.start_date && timetable?.end_date) {
      const timetableStart = new Date(timetable.start_date!);
      const timetableEnd = new Date(timetable.end_date!);
      const currentWeek = currentWeekStart;
      const currentWeekEnd = addDays(currentWeek, 6);

      // Check if current week is outside timetable range
      if (currentWeek > timetableEnd || currentWeekEnd < timetableStart) {
        // Set to the first week that overlaps with timetable
        const firstValidWeek = startOfWeek(timetableStart, { weekStartsOn: 1 });
        setCurrentWeekStart(firstValidWeek);
        console.log('🗓️ Adjusted week to timetable range:', {
          originalWeek: format(currentWeek, 'MMM dd, yyyy'),
          newWeek: format(firstValidWeek, 'MMM dd, yyyy'),
          timetableRange: `${format(timetableStart, 'MMM dd')} - ${format(timetableEnd, 'MMM dd, yyyy')}`
        });
      }
    }
  }, [timetable?.start_date, timetable?.end_date, currentWeekStart]);

  // Filter periods to only show those with valid slots within timetable date range for current week
  const filteredPeriods = useMemo(() => {
    const sortedPeriods = [...periods].sort((a, b) =>
      (a.start_time || '').localeCompare(b.start_time || '')
    );

    if (!timetable?.start_date || !timetable?.end_date) {
      return sortedPeriods; // Show all periods if no date range
    }

    return sortedPeriods.filter((period) => {
      const periodId = (period as any).period_id || period.id;

      // Check if this period has any slots in the current week that are within date range
      const hasValidSlots = timetable.selected_days?.some((day) => {
        const dayDate = getDateForDay(day as DayOfWeek);
        const timetableStart = new Date(timetable.start_date!);
        const timetableEnd = new Date(timetable.end_date!);

        // Check if the day is within timetable range
        if (dayDate < timetableStart || dayDate > timetableEnd) {
          return false;
        }

        // Check if there's a slot for this day and period
        const slot = filteredSlots.find(
          (s) => s.day_of_week === day && s.period_id === periodId
        );
        return !!slot;
      });

      return hasValidSlots;
    });
  }, [periods, timetable?.start_date, timetable?.end_date, timetable?.selected_days, currentWeekStart, filteredSlots]);

  const getSlotForDayAndPeriod = (
    day: DayOfWeek,
    periodId: string
  ): any | undefined => {
    // Use filtered slots instead of all slots
    const foundSlot = filteredSlots.find(
      (slot) => slot.day_of_week === day && slot.period_id === periodId
    );

    // Debug logging
    if (!foundSlot) {
      console.log('🔍 Slot not found for:', { day, periodId });
      console.log('📋 Available slots:', filteredSlots.map(s => ({
        day: s.day_of_week,
        period: s.period_id,
        course: s.course?.course_code,
        hasCourseName: !!s.course?.course_name
      })));
      console.log('🎯 Looking for period:', periodId);
      console.log('📅 Looking for day:', day);
    } else {
      console.log('✅ Found slot:', {
        day: foundSlot.day_of_week,
        period: foundSlot.period_id,
        course: foundSlot.course?.course_code,
        courseName: foundSlot.course?.course_name,
        staff: foundSlot.staff?.first_name,
        staffMembers: foundSlot.staff_members?.length || 0,
        staffIds: foundSlot.staff_ids,
        primaryStaffId: foundSlot.primary_staff_id,
        hasStaff: !!foundSlot.staff,
        hasStaffMembers: !!foundSlot.staff_members?.length,
        staffMembersDetails: foundSlot.staff_members?.map((s: any) => ({
          id: s.id,
          name: `${s.first_name} ${s.last_name}`
        }))
      });
    }

    return foundSlot;
  };

  const getCurrentDaySlots = () => {
    return filteredSlots.filter((slot) => slot.day_of_week === selectedDay);
  };

  const navigateDay = (direction: 'prev' | 'next') => {
    const currentIndex = DAYS_OF_WEEK.indexOf(selectedDay);
    if (direction === 'prev' && currentIndex > 0) {
      setSelectedDay(DAYS_OF_WEEK[currentIndex - 1]);
    } else if (direction === 'next' && currentIndex < DAYS_OF_WEEK.length - 1) {
      setSelectedDay(DAYS_OF_WEEK[currentIndex + 1]);
    }
  };

  // Helper function to format time from 24-hour to 12-hour format
  const formatTime = (timeString: string | undefined): string => {
    if (!timeString) return '';

    try {
      // Handle both "HH:MM:SS" and "HH:MM" formats
      const timeParts = timeString.split(':');
      const hours24 = parseInt(timeParts[0], 10);
      const minutes = timeParts[1];

      // Convert to 12-hour format
      const period = hours24 >= 12 ? 'PM' : 'AM';
      const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;

      return `${hours12}:${minutes} ${period}`;
    } catch (error) {
      return timeString; // Return original if parsing fails
    }
  };

  // Helper function to check if current week is within timetable date range
  const isWeekWithinTimetableRange = (weekStartDate: Date): boolean => {
    if (!timetable?.start_date || !timetable?.end_date) return true; // Show all if no date range

    const weekStart = weekStartDate;
    const weekEnd = addDays(weekStart, 6); // End of week (Sunday)
    const timetableStart = new Date(timetable.start_date!);
    const timetableEnd = new Date(timetable.end_date!);

    // Check if week overlaps with timetable date range
    return weekStart <= timetableEnd && weekEnd >= timetableStart;
  };

  // Helper function to check if we can navigate to previous week
  const canNavigateToPreviousWeek = (): boolean => {
    if (!timetable?.start_date) return true; // Allow if no start date
    const previousWeekStart = addDays(currentWeekStart, -7);
    return isWeekWithinTimetableRange(previousWeekStart);
  };

  // Helper function to check if we can navigate to next week
  const canNavigateToNextWeek = (): boolean => {
    if (!timetable?.end_date) return true; // Allow if no end date
    const nextWeekStart = addDays(currentWeekStart, 7);
    return isWeekWithinTimetableRange(nextWeekStart);
  };

  const renderSlotContent = (slot: any, isCompact: boolean = false) => {
    if (slot.is_break_slot) {
      return (
        <div className='text-center'>
          <p
            className={cn(
              'font-medium text-muted-foreground',
              isCompact ? 'text-xs' : 'text-sm'
            )}
          >
            Break
          </p>
          {slot.break_description && !isCompact && (
            <p className='text-xs text-muted-foreground mt-1'>
              {slot.break_description}
            </p>
          )}
        </div>
      );
    }

    if (slot.is_combined) {
      return (
        <div className={cn('space-y-2', isCompact && 'space-y-1')}>
          <Badge
            variant='secondary'
            className={cn(isCompact ? 'text-[10px]' : 'text-xs')}
          >
            Combined
          </Badge>
          {slot.sub_slots?.map((subSlot: any, index: number) => (
            <div key={subSlot.id} className='border-l-2 border-primary/20 pl-2'>
              {settings.showCourseNames && (
                <p
                  className={cn(
                    'font-medium',
                    isCompact ? 'text-xs' : 'text-sm'
                  )}
                >
                  {subSlot.course?.course_code}
                </p>
              )}
              {!isCompact && settings.showCourseNames && (
                <p className='text-xs text-muted-foreground'>
                  {subSlot.course?.course_name}
                </p>
              )}
              {settings.showInstructorNames &&
                subSlot.staff_members?.map((staff: Staff) => (
                  <p
                    key={`${subSlot.id}-${staff.id}`}
                    className={cn(
                      'text-muted-foreground',
                      isCompact ? 'text-[10px]' : 'text-xs'
                    )}
                  >
                    {isCompact
                      ? staff.last_name
                      : `${staff.first_name} ${staff.last_name}`}
                  </p>
                ))}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className='space-y-1'>
        {settings.showCourseNames && (
          <>
            <p className={cn('font-medium', isCompact ? 'text-xs' : 'text-sm')}>
              {slot.course?.course_code}
            </p>
            {!isCompact && (
              <p className='text-xs text-muted-foreground line-clamp-1'>
                {slot.course?.course_name}
              </p>
            )}
          </>
        )}

        {settings.showInstructorNames && (
          <>
            {slot.staff_members && slot.staff_members.length > 0
              ? slot.staff_members.map((staff: Staff, staffIndex: number) => (
                  <p
                    key={`staff-${staff.id || staffIndex}`}
                    className={cn(
                      'text-muted-foreground',
                      isCompact ? 'text-[10px]' : 'text-xs'
                    )}
                  >
                    {!isCompact && <User className='inline h-3 w-3 mr-1' />}
                    {isCompact
                      ? staff.last_name
                      : `${staff.first_name} ${staff.last_name}`}
                  </p>
                ))
              : slot.staff && (
                  <p
                    className={cn(
                      'text-muted-foreground',
                      isCompact ? 'text-[10px]' : 'text-xs'
                    )}
                  >
                    {!isCompact && <User className='inline h-3 w-3 mr-1' />}
                    {isCompact
                      ? slot.staff.last_name
                      : `${slot.staff.first_name} ${slot.staff.last_name}`}
                  </p>
                )}
          </>
        )}

        {/* Additional course info for detailed view */}
        {!isCompact && showCourseDetails && slot.course && (
          <div className='mt-2 pt-2 border-t border-muted'>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setSelectedSlot(slot)}
              className='p-0 h-auto text-xs text-primary hover:text-primary/80'
            >
              <Eye className='inline h-3 w-3 mr-1' />
              View Details
            </Button>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <Loading title='Loading timetable...' />;
  }

  if (!timetable) {
    return (
      <ContentLayout title='My Timetable'>
        <div className='flex flex-col items-center justify-center h-[400px] text-center'>
          <Calendar className='h-12 w-12 text-muted-foreground mb-4' />
          <h2 className='text-lg font-semibold'>No Timetable Available</h2>
          <p className='text-muted-foreground mt-2'>
            No active timetable found for your current semester.
          </p>
        </div>
      </ContentLayout>
    );
  }


  // Debug periods data
  console.log('🕐 Periods data:', periods.map(p => ({
    id: p.id,
    period_id: (p as any).period_id, // Check if this exists
    name: p.period_name,
    start: p.start_time
  })));

  console.log('📅 Filtered periods for current week:', {
    total: filteredPeriods.length,
    filtered: filteredPeriods.length,
    currentWeek: format(currentWeekStart, 'MMM dd, yyyy'),
    timetableRange: timetable?.start_date && timetable?.end_date
      ? `${format(new Date(timetable.start_date!), 'MMM dd')} - ${format(new Date(timetable.end_date!), 'MMM dd, yyyy')}`
      : 'No date range'
  });

  console.log('🎯 Sample period structure:', periods[0]);

  return (
    <ContentLayout title='My Timetable'>
      <div className='space-y-4'>
        {/* Enhanced Header with Controls */}
        <Card>
          <CardContent className='p-4'>
            <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4'>
              {/* Academic Info */}
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4'>
                <div>
                  <p className='text-sm text-muted-foreground'>Institution</p>
                  <p className='font-medium text-sm'>
                    {timetable.institution?.name || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Degree</p>
                  <p className='font-medium text-sm'>{timetable.degree?.degree_name || 'N/A'}</p>
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Department</p>
                  <p className='font-medium text-sm'>
                    {timetable.department?.department_name || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Program</p>
                  <p className='font-medium text-sm'>
                    {timetable.program?.program_name || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Semester</p>
                  <p className='font-medium text-sm'>{timetable.semester || 'N/A'}</p>
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Section</p>
                  <p className='font-medium text-sm'>{timetable.section || 'N/A'}</p>
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Academic Year</p>
                  <p className='font-medium text-sm'>
                    {timetable.academic_year?.academic_year_name || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <RefreshCw
                    className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')}
                  />
                  Refresh
                </Button>

                <Button variant='outline' size='sm' onClick={handleExport}>
                  <Download className='h-4 w-4 mr-2' />
                  Export
                </Button>

                {/* Settings Sheet */}
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant='outline' size='sm'>
                      <Settings className='h-4 w-4 mr-2' />
                      Settings
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>Timetable Settings</SheetTitle>
                      <SheetDescription>
                        Customize your timetable view and preferences
                      </SheetDescription>
                    </SheetHeader>
                    <div className='space-y-6 mt-6'>
                      {/* Display Settings */}
                      <div className='space-y-4'>
                        <h4 className='font-medium'>Display Options</h4>
                        <div className='space-y-3'>
                          <div className='flex items-center justify-between'>
                            <Label>Show Instructor Names</Label>
                            <Switch
                              checked={settings.showInstructorNames}
                              onCheckedChange={(checked) =>
                                setSettings((prev) => ({
                                  ...prev,
                                  showInstructorNames: checked
                                }))
                              }
                            />
                          </div>
                          <div className='flex items-center justify-between'>
                            <Label>Show Course Names</Label>
                            <Switch
                              checked={settings.showCourseNames}
                              onCheckedChange={(checked) =>
                                setSettings((prev) => ({
                                  ...prev,
                                  showCourseNames: checked
                                }))
                              }
                            />
                          </div>
                          <div className='flex items-center justify-between'>
                            <Label>Show Timings</Label>
                            <Switch
                              checked={settings.showTimings}
                              onCheckedChange={(checked) =>
                                setSettings((prev) => ({
                                  ...prev,
                                  showTimings: checked
                                }))
                              }
                            />
                          </div>
                          <div className='flex items-center justify-between'>
                            <Label>Compact View</Label>
                            <Switch
                              checked={settings.compactView}
                              onCheckedChange={(checked) =>
                                setSettings((prev) => ({
                                  ...prev,
                                  compactView: checked
                                }))
                              }
                            />
                          </div>
                          <div className='flex items-center justify-between'>
                            <Label>Color Coding</Label>
                            <Switch
                              checked={colorCoding}
                              onCheckedChange={setColorCoding}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Filter Settings */}
                      <div className='space-y-4'>
                        <h4 className='font-medium'>Filter Options</h4>
                        <div className='space-y-3'>
                          <div className='flex items-center justify-between'>
                            <Label>Show Breaks</Label>
                            <Switch
                              checked={showBreaks}
                              onCheckedChange={setShowBreaks}
                            />
                          </div>
                          <div className='flex items-center justify-between'>
                            <Label>Course Details</Label>
                            <Switch
                              checked={showCourseDetails}
                              onCheckedChange={setShowCourseDetails}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Advanced Filters */}
        <Card>
          <CardContent className='p-4'>
            <div className='flex flex-col md:flex-row gap-4'>
              {/* Search */}
              <div className='flex-1'>
                <div className='relative'>
                  <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
                  <Input
                    placeholder='Search courses or instructors...'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className='pl-10'
                  />
                </div>
              </div>

              {/* Course Filter */}
              <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                <SelectTrigger className='w-full md:w-48'>
                  <SelectValue placeholder='Filter by course' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Courses</SelectItem>
                  {availableCourses.map((course) => (
                    <SelectItem key={`course-${course.id}`} value={course.id}>
                      {course.course_code} - {course.course_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Instructor Filter */}
              <Select
                value={selectedInstructor}
                onValueChange={setSelectedInstructor}
              >
                <SelectTrigger className='w-full md:w-48'>
                  <SelectValue placeholder='Filter by instructor' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Instructors</SelectItem>
                  {availableInstructors.map((instructor) => (
                    <SelectItem
                      key={`instructor-${instructor}`}
                      value={instructor}
                    >
                      {instructor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Enhanced View Mode Toggle */}
        <Card>
          <CardContent className='p-4'>
            <div className='flex items-center justify-between'>
              <Tabs
                value={viewMode}
                onValueChange={(v) =>
                  setViewMode(v as 'grid' | 'list' | 'calendar')
                }
              >
                <TabsList className='grid w-full grid-cols-3 md:grid-cols-3'>
                  <TabsTrigger value='grid' className='flex items-center gap-2'>
                    <Grid className='h-4 w-4' />
                    <span className='hidden sm:inline'>Week</span>
                  </TabsTrigger>
                  <TabsTrigger value='list' className='flex items-center gap-2'>
                    <List className='h-4 w-4' />
                    <span className='hidden sm:inline'>Day</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value='calendar'
                    className='flex items-center gap-2'
                  >
                    <CalendarDays className='h-4 w-4' />
                    <span className='hidden sm:inline'>Agenda</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Filter Summary */}
              {(searchQuery ||
                selectedCourse !== 'all' ||
                selectedInstructor !== 'all' ||
                !showBreaks) && (
                <div className='flex items-center gap-2'>
                  <Badge variant='secondary' className='text-xs'>
                    Filters Active
                  </Badge>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCourse('all');
                      setSelectedInstructor('all');
                      setShowBreaks(true);
                    }}
                    className='text-xs'
                  >
                    Clear All
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Week Navigation - Desktop */}
        <div className='hidden md:flex items-center justify-between mb-4'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setCurrentWeekStart((prev) => addDays(prev, -7))}
            disabled={!canNavigateToPreviousWeek()}
          >
            <ChevronLeft className='h-4 w-4 mr-1' />
            Previous Week
          </Button>

          <div className='text-center'>
            <p className='font-medium'>
              {format(currentWeekStart, 'MMM dd')} -{' '}
              {format(addDays(currentWeekStart, 6), 'MMM dd, yyyy')}
            </p>
            {isToday(currentWeekStart) && (
              <p className='text-sm text-muted-foreground'>Current Week</p>
            )}
            {timetable?.start_date && timetable?.end_date && (
              <p className='text-xs text-muted-foreground mt-1'>
                Timetable: {format(new Date(timetable.start_date!), 'MMM dd')} - {format(new Date(timetable.end_date!), 'MMM dd, yyyy')}
              </p>
            )}
          </div>

          <Button
            variant='outline'
            size='sm'
            onClick={() => setCurrentWeekStart((prev) => addDays(prev, 7))}
            disabled={!canNavigateToNextWeek()}
          >
            Next Week
            <ChevronRight className='h-4 w-4 ml-1' />
          </Button>
        </div>

        {/* Desktop Grid View */}
        <Card className='hidden md:block'>
          <CardContent className='p-0'>
            <ScrollArea className='w-full'>
              <div className='min-w-[800px]'>
                <table className='w-full'>
                  <thead>
                    <tr className='border-b'>
                      <th className='p-3 text-left font-medium'>Time</th>
                      {timetable.selected_days?.map((day, dayIndex) => {
                        const date = getDateForDay(day as DayOfWeek);

                        return (
                          <th
                            key={`header-${day}-${dayIndex}`}
                            className='p-3 text-center font-medium'
                          >
                            <div>
                              <div>{day}</div>
                              <div className='text-xs font-normal text-muted-foreground'>
                                {format(date, 'MMM dd')}
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPeriods.map((periodItem, periodIndex) => {
                      const period = periodItem;
                      if (!period) return null;

                      return (
                        <tr
                          key={`period-${period.id || periodIndex}`}
                          className='border-b'
                        >
                          <td className='p-3 text-sm'>
                            <div className='font-medium'>
                              {period.period_name}
                            </div>
                            <div className='text-xs text-muted-foreground'>
                              {formatTime(period.start_time)} - {formatTime(period.end_time)}
                            </div>
                          </td>
                          {timetable.selected_days?.map((day, dayIndex) => {
                            const slot = getSlotForDayAndPeriod(
                              day as DayOfWeek,
                              (period as any).period_id || period.id
                            );

                            return (
                              <td
                                key={`slot-${period.id}-${day}-${dayIndex}`}
                                className='p-3'
                              >
                                {slot ? (
                                  <div
                                    className={cn(
                                      'p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
                                      slot.is_break_slot
                                        ? 'bg-muted/50 border-muted-foreground/20'
                                        : colorCoding &&
                                          slot.course?.id &&
                                          courseColors[slot.course.id]
                                        ? courseColors[slot.course.id]
                                        : 'bg-primary/5 border-primary/20',
                                      settings.compactView && 'p-2'
                                    )}
                                    onClick={() =>
                                      !slot.is_break_slot &&
                                      setSelectedSlot(slot)
                                    }
                                  >
                                    {renderSlotContent(
                                      slot,
                                      settings.compactView
                                    )}
                                  </div>
                                ) : (
                                  <div className='p-3 rounded-lg border border-dashed border-muted-foreground/20'>
                                    <p className='text-xs text-muted-foreground text-center'>
                                      -
                                    </p>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ScrollBar orientation='horizontal' />
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Mobile View */}
        <div className='md:hidden space-y-4'>
          {viewMode === 'list' ? (
            <>
              {/* Day Navigation */}
              <Card>
                <CardContent className='p-3'>
                  <div className='flex items-center justify-between'>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => navigateDay('prev')}
                      disabled={selectedDay === DAYS_OF_WEEK[0]}
                    >
                      <ChevronLeft className='h-4 w-4' />
                    </Button>
                    <div className='text-center'>
                      <div className='font-medium'>{selectedDay}</div>
                      <div className='text-sm text-muted-foreground'>
                        {format(getDateForDay(selectedDay), 'MMM dd, yyyy')}
                      </div>
                    </div>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => navigateDay('next')}
                      disabled={
                        selectedDay === DAYS_OF_WEEK[DAYS_OF_WEEK.length - 1]
                      }
                    >
                      <ChevronRight className='h-4 w-4' />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Day Schedule */}
              <div className='space-y-3'>
                {filteredPeriods.map((periodItem, periodIndex) => {
                  const period = periodItem;
                  if (!period) return null;

                  const slot = getSlotForDayAndPeriod(selectedDay, (period as any).period_id || period.id);

                  return (
                    <Card
                      key={`day-schedule-${period.id || periodIndex}`}
                      className={cn(
                        'transition-all',
                        slot?.is_break_slot && 'opacity-75'
                      )}
                    >
                      <CardContent className='p-4'>
                        <div className='flex items-start justify-between mb-2'>
                          <div>
                            <p className='font-medium'>{period.period_name}</p>
                            <p className='text-sm text-muted-foreground'>
                              <Clock className='inline h-3 w-3 mr-1' />
                              {formatTime(period.start_time)} - {formatTime(period.end_time)}
                            </p>
                          </div>
                          {slot?.is_break_slot && (
                            <Badge variant='secondary'>Break</Badge>
                          )}
                        </div>
                        {slot ? (
                          <div className='mt-3'>{renderSlotContent(slot)}</div>
                        ) : (
                          <p className='text-sm text-muted-foreground'>
                            No class scheduled
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          ) : (
            /* Mobile Week View */
            <Card>
              <CardContent className='p-0'>
                <ScrollArea className='w-full'>
                  <div className='min-w-[600px]'>
                    <table className='w-full text-sm'>
                      <thead>
                        <tr className='border-b'>
                          <th className='p-2 text-left text-xs'>Time</th>
                          {timetable.selected_days?.map((day, dayIndex) => (
                            <th
                              key={`mobile-header-${day}-${dayIndex}`}
                              className='p-2 text-center text-xs'
                            >
                              {DAY_ABBREVIATIONS[day as DayOfWeek]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPeriods.map((periodItem, periodIndex) => {
                          const period = periodItem;
                          if (!period) return null;

                          return (
                            <tr
                              key={`mobile-period-${period.id || periodIndex}`}
                              className='border-b'
                            >
                              <td className='p-2 text-xs'>
                                <div className='font-medium'>
                                  {period.period_name}
                                </div>
                                <div className='text-[10px] text-muted-foreground'>
                                  {formatTime(period.start_time)}
                                </div>
                              </td>
                              {timetable.selected_days?.map((day, dayIndex) => {
                                const slot = getSlotForDayAndPeriod(
                                  day as DayOfWeek,
                                  (period as any).period_id || period.id
                                );
                                return (
                                  <td
                                    key={`mobile-slot-${period.id}-${day}-${dayIndex}`}
                                    className='p-1'
                                  >
                                    {slot ? (
                                      <div
                                        className={cn(
                                          'p-2 rounded text-xs cursor-pointer transition-all hover:shadow-sm',
                                          slot.is_break_slot
                                            ? 'bg-muted/50'
                                            : colorCoding &&
                                              slot.course?.id &&
                                              courseColors[slot.course.id]
                                            ? courseColors[slot.course.id]
                                            : 'bg-primary/10'
                                        )}
                                        onClick={() =>
                                          !slot.is_break_slot &&
                                          setSelectedSlot(slot)
                                        }
                                      >
                                        {slot.is_break_slot ? (
                                          <span className='text-[10px]'>
                                            Break
                                          </span>
                                        ) : (
                                          <>
                                            {settings.showCourseNames && (
                                              <p className='font-medium text-[11px]'>
                                                {slot.course?.course_code}
                                              </p>
                                            )}
                                            {settings.showInstructorNames &&
                                              slot.staff && (
                                                <p className='text-[10px] text-muted-foreground truncate'>
                                                  {slot.staff.last_name}
                                                </p>
                                              )}
                                          </>
                                        )}
                                      </div>
                                    ) : (
                                      <div className='p-2 text-center text-muted-foreground'>
                                        -
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <ScrollBar orientation='horizontal' />
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Calendar/Agenda View */}
        {viewMode === 'calendar' && (
          <Card>
            <CardHeader>
              <h3 className='text-lg font-semibold'>Weekly Agenda</h3>
            </CardHeader>
            <CardContent>
              <div className='space-y-6'>
                {DAYS_OF_WEEK.map((day) => {
                  const daySlots = filteredSlots
                    .filter((slot) => slot.day_of_week === day)
                    .sort((a, b) => {
                      const periodA = periods.find((p) => (p as any).period_id === a.period_id || p.id === a.period_id);
                      const periodB = periods.find((p) => (p as any).period_id === b.period_id || p.id === b.period_id);
                      return (periodA?.start_time || '').localeCompare(
                        periodB?.start_time || ''
                      );
                    });

                  if (daySlots.length === 0) return null;

                  return (
                    <div key={day} className='space-y-3'>
                      <div className='flex items-center gap-3'>
                        <h4 className='font-semibold'>{day}</h4>
                        <div className='text-sm text-muted-foreground'>
                          {format(getDateForDay(day), 'MMM dd, yyyy')}
                        </div>
                      </div>
                      <div className='space-y-2 ml-4'>
                        {daySlots.map((slot) => {
                          const period = periods.find(
                            (p) => (p as any).period_id === slot.period_id || p.id === slot.period_id
                          );
                          return (
                            <div
                              key={`${slot.day_of_week}-${slot.period_id}`}
                              className={cn(
                                'flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
                                slot.is_break_slot
                                  ? 'bg-muted/50 border-muted-foreground/20'
                                  : colorCoding &&
                                    slot.course?.id &&
                                    courseColors[slot.course.id]
                                  ? courseColors[slot.course.id]
                                  : 'bg-primary/5 border-primary/20'
                              )}
                              onClick={() =>
                                !slot.is_break_slot && setSelectedSlot(slot)
                              }
                            >
                              <div className='flex items-center gap-2 min-w-0'>
                                <Clock className='h-4 w-4 text-muted-foreground' />
                                <span className='text-sm font-medium'>
                                  {formatTime(period?.start_time)} - {formatTime(period?.end_time)}
                                </span>
                              </div>
                              <div className='flex-1 min-w-0'>
                                {renderSlotContent(slot, false)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Course Summary */}
        {viewMode !== 'list' && (
          <Card>
            <CardHeader>
              <h3 className='text-lg font-semibold'>Course Summary</h3>
            </CardHeader>
            <CardContent>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
                {Array.from(
                  new Set(
                    filteredSlots
                      .filter((slot) => !slot.is_break_slot && slot.course)
                      .map((slot) => slot.course?.id)
                  )
                ).map((courseId) => {
                  const slot = filteredSlots.find(
                    (s) => s.course?.id === courseId
                  );
                  if (!slot?.course) return null;

                  const courseSlots = filteredSlots.filter(
                    (s) => s.course?.id === courseId
                  );
                  const totalClasses = courseSlots.length;

                  return (
                    <div
                      key={courseId}
                      className={cn(
                        'flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
                        colorCoding && courseColors[courseId!]
                          ? courseColors[courseId!]
                          : 'border-border'
                      )}
                      onClick={() => setSelectedSlot(slot)}
                    >
                      <BookOpen className='h-5 w-5 text-primary mt-0.5' />
                      <div className='flex-1 min-w-0'>
                        <p className='font-medium'>{slot.course.course_code}</p>
                        <p className='text-sm text-muted-foreground truncate'>
                          {slot.course.course_name}
                        </p>
                        <p className='text-xs text-muted-foreground mt-1'>
                          {totalClasses} classes/week
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Course Details Dialog */}
        <Dialog
          open={!!selectedSlot}
          onOpenChange={() => setSelectedSlot(null)}
        >
          <DialogContent className='max-w-md'>
            <DialogHeader>
              <DialogTitle>Course Details</DialogTitle>
              <DialogDescription>
                Detailed information about this class
              </DialogDescription>
            </DialogHeader>
            {selectedSlot && (
              <div className='space-y-4'>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <Label className='text-xs text-muted-foreground'>
                      Course Code
                    </Label>
                    <p className='font-medium'>
                      {selectedSlot.course?.course_code}
                    </p>
                  </div>
                  <div>
                    <Label className='text-xs text-muted-foreground'>
                      Course Name
                    </Label>
                    <p className='font-medium'>
                      {selectedSlot.course?.course_name}
                    </p>
                  </div>
                </div>

                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <Label className='text-xs text-muted-foreground'>Day</Label>
                    <p className='font-medium'>{selectedSlot.day_of_week}</p>
                  </div>
                  <div>
                    <Label className='text-xs text-muted-foreground'>
                      Time
                    </Label>
                    <p className='font-medium'>
                      {formatTime(
                        periods.find((p) => (p as any).period_id === selectedSlot.period_id || p.id === selectedSlot.period_id)
                          ?.start_time
                      )}{' '}
                      -{' '}
                      {formatTime(
                        periods.find((p) => (p as any).period_id === selectedSlot.period_id || p.id === selectedSlot.period_id)
                          ?.end_time
                      )}
                    </p>
                  </div>
                </div>

                {(selectedSlot.staff ||
                  selectedSlot.staff_members?.length > 0) && (
                  <div>
                    <Label className='text-xs text-muted-foreground'>
                      Instructor(s)
                    </Label>
                    <div className='space-y-2 mt-1'>
                      {selectedSlot.staff_members?.map(
                        (staff: Staff, index: number) => (
                          <div
                            key={`dialog-staff-${staff.id || index}`}
                            className='flex items-center gap-3 p-2 rounded-lg bg-muted/50'
                          >
                            <User className='h-4 w-4 text-muted-foreground' />
                            <div>
                              <p className='font-medium text-sm'>
                                {staff.first_name} {staff.last_name}
                              </p>
                              {staff.email && (
                                <p className='text-xs text-muted-foreground flex items-center gap-1'>
                                  <Mail className='h-3 w-3' />
                                  {staff.email}
                                </p>
                              )}
                              {staff.phone && (
                                <p className='text-xs text-muted-foreground flex items-center gap-1'>
                                  <Phone className='h-3 w-3' />
                                  {staff.phone}
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      ) ||
                        (selectedSlot.staff && (
                          <div className='flex items-center gap-3 p-2 rounded-lg bg-muted/50'>
                            <User className='h-4 w-4 text-muted-foreground' />
                            <div>
                              <p className='font-medium text-sm'>
                                {selectedSlot.staff.first_name}{' '}
                                {selectedSlot.staff.last_name}
                              </p>
                              {selectedSlot.staff.email && (
                                <p className='text-xs text-muted-foreground flex items-center gap-1'>
                                  <Mail className='h-3 w-3' />
                                  {selectedSlot.staff.email}
                                </p>
                              )}
                              {selectedSlot.staff.phone && (
                                <p className='text-xs text-muted-foreground flex items-center gap-1'>
                                  <Phone className='h-3 w-3' />
                                  {selectedSlot.staff.phone}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {selectedSlot.room && (
                  <div>
                    <Label className='text-xs text-muted-foreground'>
                      Room/Location
                    </Label>
                    <p className='font-medium flex items-center gap-2'>
                      <MapPin className='h-4 w-4 text-muted-foreground' />
                      {selectedSlot.room}
                    </p>
                  </div>
                )}

                {selectedSlot.notes && (
                  <div>
                    <Label className='text-xs text-muted-foreground'>
                      Notes
                    </Label>
                    <p className='text-sm text-muted-foreground mt-1'>
                      {selectedSlot.notes}
                    </p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ContentLayout>
  );
}
