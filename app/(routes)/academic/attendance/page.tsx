'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Users,
  Search,
  RotateCcw,
  X,
  Check,
  AlertTriangle,
  BarChart3,
  User,
  Clock,
  TrendingUp,
  Award,
  Target,
  BookOpen,
  Loader2
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import Loading from '@/components/Loading/Loading';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import {
  useAttendanceRoster,
  useConsolidatedAttendance
} from '@/hooks/academic/use-attendance';
import { useAcademicYears } from '@/hooks/academic/use-academic-years';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  StaffMember,
  ConsolidatedAttendanceData,
  AttendancePeriodOption
} from '@/types/attendance';
import {
  findPeriodBySlotId,
  hasAvailablePeriods
} from '@/utils/attendance-helpers';
import { convertTo12HourFormat, formatTimeRange } from '@/utils/time-format';
import { AttendanceViewSelector } from './_components/attendance-view-selector';

export default function AttendancePage() {
  const {
    rosterData,
    availablePeriods: availablePeriodsRaw,
    loading,
    error,
    searchContext,
    updateSearchContext,
    fetchAvailablePeriods,
    fetchAttendanceRoster
  } = useAttendanceRoster();

  // Ensure availablePeriods is always an array
  const availablePeriods = availablePeriodsRaw || [];

  const { saveConsolidatedAttendance, loading: savingConsolidatedAttendance } =
    useConsolidatedAttendance();

  const { canAccess, isSuperAdmin, userProfile } = usePermissions();
  const { profile } = useAuth();
  const user = profile;
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [studentsForSection, setStudentsForSection] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [loadingPeriodData, setLoadingPeriodData] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showStudents, setShowStudents] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [sortByRollNo, setSortByRollNo] = useState(true);
  const [sortByName, setSortByName] = useState(false);
  const [allAbsent, setAllAbsent] = useState(false);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendancePermissions, setAttendancePermissions] = useState<
    Map<string, boolean>
  >(new Map());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [attendanceCompleted, setAttendanceCompleted] = useState<{
    isCompleted: boolean;
    details: {
      periodName: string;
      courseName: string;
      timeSlot: string;
      date: string;
      markedBy: string;
      markedAt: string;
      presentCount: number;
      absentCount: number;
      totalStudents: number;
      attendancePercentage: number;
      staffName: string;
      staffEmail: string;
      sectionName: string;
      semesterName: string;
      institutionName: string;
      departmentName: string;
      programName: string;
      degreeName: string;
    } | null;
  }>({ isCompleted: false, details: null });
  const [existingAttendance, setExistingAttendance] = useState<any[]>([]);

  // Data hooks for search form
  const { institutions, refetch: fetchInstitutions } =
    useInstitutionsWithAccess({});

  const { academicYears, fetchAcademicYears, refetchWithCurrentFilters } =
    useAcademicYears({
      institution_id: searchContext.institution_id || undefined,
      isActive: true
    });

  const { data: degreesData, refetch: fetchDegrees } = useDegrees({
    institution_id: searchContext.institution_id || undefined,
    isActive: true
  });
  const degrees = degreesData?.data ?? [];

  const { data: departmentsData, refetch: fetchDepartments } = useDepartments({
    institution_id: searchContext.institution_id || undefined,
    degree_id: searchContext.degree_id || undefined,
    isActive: true
  });
  const departments = departmentsData?.data ?? [];

  const { data: programsData, refetch: fetchPrograms } = usePrograms({
    institution_id: searchContext.institution_id || undefined,
    degree_id: searchContext.degree_id || undefined,
    department_id: searchContext.department_id || undefined,
    isActive: true
  });
  const programs = programsData?.data ?? [];

  const { data: semestersData, refetch: fetchSemesters } = useSemesters({
    institution_id: searchContext.institution_id || undefined,
    degree_id: searchContext.degree_id || undefined,
    department_id: searchContext.department_id || undefined,
    program_id: searchContext.program_id || undefined,
    isActive: true
  });
  const semesters = semestersData?.data ?? [];

  const { data: sectionsData, refetch: fetchSections } = useSections({
    institution_id: searchContext.institution_id || undefined,
    degree_id: searchContext.degree_id || undefined,
    department_id: searchContext.department_id || undefined,
    program_id: searchContext.program_id || undefined,
    semester_id: searchContext.semester_id || undefined,
    isActive: true
  });
  const sections = sectionsData?.data ?? [];

  const canViewAttendance =
    isSuperAdmin || canAccess('academic.attendance', 'view');

  // Determine user role for appropriate view
  const isFaculty = profile?.role === 'faculty';
  const isAdmin =
    profile?.role === 'administrator' ||
    profile?.role === 'principal' ||
    isSuperAdmin;
  const canMarkAttendance =
    isSuperAdmin || canAccess('academic.attendance', 'mark');

  // Check if all required fields are filled - memoized for performance
  const isSearchFormValid = useMemo(() => {
    return !!(
      searchContext.institution_id &&
      searchContext.academic_year_id &&
      searchContext.degree_id &&
      searchContext.department_id &&
      searchContext.program_id &&
      searchContext.semester_id &&
      searchContext.section_id &&
      searchContext.attendance_date
    );
  }, [
    searchContext.institution_id,
    searchContext.academic_year_id,
    searchContext.degree_id,
    searchContext.department_id,
    searchContext.program_id,
    searchContext.semester_id,
    searchContext.section_id,
    searchContext.attendance_date
  ]);

  // Check staff permission for the selected period
  const checkStaffPermissionForPeriod = async (
    timetableSlotId: string
  ): Promise<boolean> => {
    try {
      const { AttendanceService } = await import(
        '@/lib/services/academic/attendance-service'
      );
      const canMark = await AttendanceService.canMarkAttendanceForSlot(
        timetableSlotId,
        isSuperAdmin
      );
      return canMark;
    } catch (error) {
      console.error('Error checking staff permission:', error);
      return false;
    }
  };

  // Check if attendance already exists for the selected criteria (using consolidated approach with versioning)
  const checkExistingAttendance = async (
    timetableSlotId: string,
    attendanceDate: string
  ) => {
    try {
      const { AttendanceService } = await import(
        '@/lib/services/academic/attendance-service'
      );

      // Get the period info to extract timetable_id
      // Check if availablePeriods exists and is an array
      if (!hasAvailablePeriods(availablePeriods)) {
        console.warn('Available periods not loaded yet');
        return [];
      }

      const selectedPeriodInfo = findPeriodBySlotId(
        availablePeriods,
        timetableSlotId
      );

      if (!selectedPeriodInfo || !searchContext.section_id) {
        return [];
      }

      // First, check if we can use the slot versioning system
      // This will find attendance across all versions of this slot
      const slotHistory = await AttendanceService.getSlotAttendanceWithHistory(
        timetableSlotId,
        searchContext.section_id!,
        attendanceDate,
        attendanceDate
      );

      if (slotHistory && slotHistory.length > 0) {
        // Found attendance through versioning system
        console.log('Found attendance through slot versioning:', slotHistory);

        // slotHistory is already a flat array of individual student attendance records
        // No need to extract students from a nested structure
        const records: any[] = slotHistory.map((record: any) => ({
          id: record.id,
          student_id: record.student_id,
          timetable_slot_id: timetableSlotId,
          attendance_date: record.attendance_date,
          status: record.status,
          marked_by: record.marked_by,
          created_at: record.marked_at,
          updated_at: record.marked_at,
          marked_by_user: record.marked_by_profile || null // Now includes the user profile data
        }));

        return records;
      }

      // Fallback to original method if versioning not available or no data found
      // Try to get attendance with the current timetable_id
      const consolidatedRecord =
        await AttendanceService.getConsolidatedAttendance(
          selectedPeriodInfo.timetable_id,
          searchContext.section_id,
          attendanceDate
        );

      // Removed fallback logic that was causing attendance to show as marked for all periods
      // This was the root cause of the issue where faculty attendance appeared marked for periods they didn't mark

      if (!consolidatedRecord || !consolidatedRecord.attendance_data) {
        return [];
      }

      // Extract student attendance records from consolidated data
      const attendanceData = consolidatedRecord.attendance_data as any;
      const records: any[] = [];

      // Check if attendance exists for any period on this date
      // Don't strictly match by slot ID since it can change when timetables are recreated
      let foundAttendance = false;

      // Get the current period info for comparison
      const currentPeriodInfo = findPeriodBySlotId(
        availablePeriods,
        timetableSlotId
      );

      for (const [slotId, periodData] of Object.entries(attendanceData)) {
        if (periodData && typeof periodData === 'object') {
          const periodInfo = periodData as any;

          // Try to match by period name or time slot instead of slot ID
          // This handles cases where timetable slot IDs change but the period remains the same
          let isMatchingPeriod = false;

          if (slotId === timetableSlotId) {
            // Direct slot ID match (ideal case)
            isMatchingPeriod = true;
          } else if (currentPeriodInfo && periodInfo.period_name) {
            // Match by period name and time
            isMatchingPeriod =
              periodInfo.period_name === currentPeriodInfo.period_name ||
              (periodInfo.start_time === currentPeriodInfo.start_time &&
                periodInfo.end_time === currentPeriodInfo.end_time);
          }

          // Only show attendance if this specific period matches
          if (isMatchingPeriod) {
            if (periodInfo.students && Array.isArray(periodInfo.students)) {
              foundAttendance = true;
              periodInfo.students.forEach((student: any) => {
                records.push({
                  id: `${consolidatedRecord.id}_${student.student_id}`,
                  student_id: student.student_id,
                  timetable_slot_id: timetableSlotId,
                  attendance_date: attendanceDate,
                  status: student.status,
                  marked_by: consolidatedRecord.marked_by,
                  created_at:
                    student.marked_at || consolidatedRecord.created_at,
                  updated_at: consolidatedRecord.updated_at,
                  marked_by_user: consolidatedRecord.marked_by_profile
                });
              });
              break; // Use the first matching period
            }
          }
        }
      }

      return records;
    } catch (error) {
      console.error('Error checking existing attendance:', error);
      return [];
    }
  };

  // Load initial data
  useEffect(() => {
    fetchInstitutions();
    // Set default date to today if not set
    if (!searchContext.attendance_date) {
      // Get today's date in local timezone
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;
      updateSearchContext({ attendance_date: today });
    }

    // Auto-populate institution for faculty users
    if (
      !isSuperAdmin &&
      userProfile?.institution_id &&
      !searchContext.institution_id
    ) {
      updateSearchContext({ institution_id: userProfile.institution_id });
    }
  }, [
    isSuperAdmin,
    userProfile?.institution_id,
    searchContext.institution_id,
    searchContext.attendance_date,
    updateSearchContext,
    fetchInstitutions
  ]);

  // Load dependent data when filters change
  useEffect(() => {
    if (searchContext.institution_id) {
      refetchWithCurrentFilters({
        institution_id: searchContext.institution_id,
        isActive: true
      });
    }
  }, [searchContext.institution_id, refetchWithCurrentFilters]);

  useEffect(() => {
    if (searchContext.institution_id && searchContext.academic_year_id) {
      fetchDegrees();
    }
  }, [
    searchContext.institution_id,
    searchContext.academic_year_id,
    fetchDegrees
  ]);

  useEffect(() => {
    if (
      searchContext.institution_id &&
      searchContext.academic_year_id &&
      searchContext.degree_id
    ) {
      fetchDepartments();
    }
  }, [
    searchContext.institution_id,
    searchContext.academic_year_id,
    searchContext.degree_id,
    fetchDepartments
  ]);

  useEffect(() => {
    if (
      searchContext.institution_id &&
      searchContext.academic_year_id &&
      searchContext.degree_id &&
      searchContext.department_id
    ) {
      fetchPrograms();
    }
  }, [
    searchContext.institution_id,
    searchContext.academic_year_id,
    searchContext.degree_id,
    searchContext.department_id,
    fetchPrograms
  ]);

  useEffect(() => {
    if (
      searchContext.institution_id &&
      searchContext.academic_year_id &&
      searchContext.degree_id &&
      searchContext.department_id &&
      searchContext.program_id
    ) {
      fetchSemesters();
    }
  }, [
    searchContext.institution_id,
    searchContext.academic_year_id,
    searchContext.degree_id,
    searchContext.department_id,
    searchContext.program_id,
    fetchSemesters
  ]);

  useEffect(() => {
    if (
      searchContext.institution_id &&
      searchContext.academic_year_id &&
      searchContext.degree_id &&
      searchContext.department_id &&
      searchContext.program_id &&
      searchContext.semester_id
    ) {
      fetchSections();
    }
  }, [
    searchContext.institution_id,
    searchContext.academic_year_id,
    searchContext.degree_id,
    searchContext.department_id,
    searchContext.program_id,
    searchContext.semester_id,
    fetchSections
  ]);

  // Update attendance permissions when available periods change
  useEffect(() => {
    // Since periods are now pre-filtered by staff assignment,
    // we can set all permissions to true for the returned periods
    const permissionMap = new Map<string, boolean>();
    if (availablePeriods && Array.isArray(availablePeriods)) {
      availablePeriods.forEach((period) => {
        if (period && period.timetable_slot_id) {
          permissionMap.set(period.timetable_slot_id, true);
        }
      });
    }
    setAttendancePermissions(permissionMap);
  }, [availablePeriods]);

  // Reset dependent state when parent fields change
  useEffect(() => {
    // Reset all form-related state when institution changes
    setSelectedPeriod(null);
    setStudentsForSection([]);
    setShowResults(false);
    setShowStudents(false);
    setStudentSearchTerm('');
    setAttendanceCompleted({ isCompleted: false, details: null });
    setExistingAttendance([]);
    setAttendancePermissions(new Map());
  }, [searchContext.institution_id]);

  useEffect(() => {
    // Reset period-related state when academic structure changes
    setSelectedPeriod(null);
    setStudentsForSection([]);
    setShowResults(false);
    setShowStudents(false);
    setStudentSearchTerm('');
    setAttendanceCompleted({ isCompleted: false, details: null });
    setExistingAttendance([]);
  }, [
    searchContext.academic_year_id,
    searchContext.degree_id,
    searchContext.department_id,
    searchContext.program_id,
    searchContext.semester_id,
    searchContext.section_id
  ]);

  // Handle search form submission - Focus on loading periods first
  const handleSearch = async () => {
    // Validate all required fields
    if (!isSearchFormValid) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setLoadingPeriods(true);
      setShowResults(true);
      setShowStudents(false);
      // Clear any previous state
      setAttendanceCompleted({ isCompleted: false, details: null });
      setExistingAttendance([]);
      setSelectedPeriod(null);
      setStudentsForSection([]);
      setLoadingPeriodData(false);

      // Show loading toast
      const loadingToast = toast.loading('Searching for available periods...');

      const { AttendanceService } = await import(
        '@/lib/services/academic/attendance-service'
      );

      // Fetch available periods for the date with staff-based filtering
      if (
        searchContext.academic_year_id &&
        searchContext.degree_id &&
        searchContext.program_id &&
        searchContext.department_id
      ) {
        try {
          // Use the hook's fetchAvailablePeriods method with staff filtering
          // For non-admin users, only show periods they are assigned to
          console.log('Fetching periods with staff filtering:', {
            isSuperAdmin,
            filterByStaffAssignment: !isSuperAdmin
          });

          await fetchAvailablePeriods(searchContext, {
            filterByStaffAssignment: !isSuperAdmin, // Only filter for non-admin users
            isSuperAdmin: isSuperAdmin
          });

          // Dismiss loading toast and show success
          toast.dismiss(loadingToast);
          toast.success('Periods loaded successfully');

          // Auto-scroll to periods section after a short delay
          setTimeout(() => {
            const periodsSection = document.getElementById('periods-section');
            if (periodsSection) {
              periodsSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              });
            }
          }, 300);
        } catch (periodError) {
          console.warn('Could not fetch periods:', periodError);
          toast.dismiss(loadingToast);
          toast.error('No periods found for the selected criteria');
        }
      }
    } catch (error) {
      console.error('Error loading periods:', error);
      toast.error('Failed to load periods');
    } finally {
      setLoadingPeriods(false);
    }
  };

  // Handle reset form
  const handleReset = async () => {
    try {
      setIsResetting(true);

      // Clear all local state first
      setShowResults(false);
      setShowStudents(false);
      setStudentsForSection([]);
      setSelectedPeriod(null);
      setStudentSearchTerm('');
      setSortByRollNo(true);
      setSortByName(false);
      setAllAbsent(false);
      setCalendarOpen(false);
      setAttendanceCompleted({ isCompleted: false, details: null });
      setExistingAttendance([]);
      setLoadingPeriodData(false);
      setLoadingPeriods(false);

      // Get today's date
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;

      // Reset search context - for non-super admin, keep institution if set
      let resetContext;
      if (!isSuperAdmin && userProfile?.institution_id) {
        // For faculty users, keep their institution
        resetContext = {
          institution_id: userProfile.institution_id,
          academic_year_id: null,
          degree_id: null,
          program_id: null,
          department_id: null,
          semester_id: null,
          section_id: null,
          attendance_date: today
        };
      } else {
        // For super admin, clear everything
        resetContext = {
          institution_id: null,
          academic_year_id: null,
          degree_id: null,
          program_id: null,
          department_id: null,
          semester_id: null,
          section_id: null,
          attendance_date: today
        };
      }

      // Update context with reset values
      await updateSearchContext(resetContext);

      // Clear available periods
      if (typeof fetchAvailablePeriods === 'function') {
        // Clear the periods by fetching with the reset context
        await fetchAvailablePeriods(resetContext, {
          filterByStaffAssignment: false
        });
      }

      // Force refetch of base data
      await fetchInstitutions();

      // If institution is set, refetch academic years
      if (resetContext.institution_id) {
        await refetchWithCurrentFilters({
          institution_id: resetContext.institution_id,
          isActive: true
        });
      }

      toast.success('Form reset successfully');
    } catch (error) {
      console.error('Error resetting form:', error);
      toast.error('Error resetting form');
    } finally {
      setIsResetting(false);
    }
  };

  // Handle date selection
  const handleDateSelect = async (date: Date | undefined) => {
    if (date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      await updateSearchContext({ attendance_date: dateString });
      setCalendarOpen(false);
    }
  };

  // Toggle student attendance status
  const toggleStudentStatus = (studentId: string) => {
    setStudentsForSection((prev) =>
      prev.map((student) =>
        student.id === studentId
          ? {
              ...student,
              status: student.status === 'Present' ? 'Absent' : 'Present'
            }
          : student
      )
    );
  };

  // Get student initials for avatar fallback
  const getInitials = (name: string) => {
    if (!name || typeof name !== 'string') return 'ST';
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Filter students based on search term
  const filteredStudents = studentsForSection.filter((student) => {
    if (!studentSearchTerm) return true;

    const searchLower = studentSearchTerm.toLowerCase();
    const fullName = `${student.first_name || ''} ${
      student.last_name || ''
    }`.trim();
    const nameMatch = fullName.toLowerCase().includes(searchLower);
    const rollMatch =
      student.roll_number?.toLowerCase().includes(searchLower) || false;

    return nameMatch || rollMatch;
  });

  // Handle period selection - Load students and check for existing attendance
  const handlePeriodSelection = async (
    periodOrId: string | AttendancePeriodOption
  ) => {
    const periodId =
      typeof periodOrId === 'string'
        ? periodOrId
        : periodOrId.timetable_slot_id;
    setSelectedPeriod(periodId);
    setLoadingPeriodData(true);
    setShowStudents(true);
    // Clear any previous state
    setAttendanceCompleted({ isCompleted: false, details: null });
    setStudentsForSection([]);

    if (periodId && searchContext.attendance_date) {
      try {
        // First check for existing attendance
        const existingRecords = await checkExistingAttendance(
          periodId,
          searchContext.attendance_date
        );

        setExistingAttendance(existingRecords);

        // Load students for the section
        const { AttendanceService } = await import(
          '@/lib/services/academic/attendance-service'
        );

        // Validate and resolve section_id if it's not a valid UUID or is missing
        let resolvedSectionId = searchContext.section_id;
        
        // First check if we have a section from the period itself
        const periodInfo = findPeriodBySlotId(availablePeriods, periodId);
        if (!resolvedSectionId && periodInfo?.sections?.[0]?.id) {
          resolvedSectionId = periodInfo.sections[0].id;
          console.log(`Using section from period: ${resolvedSectionId}`);
        }
        
        // For faculty, section might be optional if teaching multiple sections
        // or if section data is stored differently in timetables
        if (!resolvedSectionId && isFaculty) {
          console.log('Faculty attendance without specific section - will show all students');
          // Don't return here for faculty - they might be teaching a combined class
        } else if (!resolvedSectionId) {
          console.error('No section_id found in searchContext or period');
          toast.error('Unable to determine section for attendance');
          setLoadingPeriodData(false);
          return;
        }

        // Check if section_id is not a UUID (i.e., it's a section name like "A")
        // Skip this check if resolvedSectionId is null/undefined for faculty
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (resolvedSectionId && !uuidRegex.test(resolvedSectionId)) {
          console.warn(
            `Section ID "${resolvedSectionId}" is not a UUID, attempting to resolve...`
          );

          // Import Supabase client
          const { createClientSupabaseClient } = await import(
            '@/lib/supabase/client'
          );
          const supabase = createClientSupabaseClient();

          // Build query with optional constraints
          let query = supabase
            .from('sections')
            .select('id')
            .eq('institution_id', searchContext.institution_id)
            .eq('section_name', resolvedSectionId)
            .eq('is_active', true);
          
          // Add optional constraints if available
          if (searchContext.degree_id) {
            query = query.eq('degree_id', searchContext.degree_id);
          }
          if (searchContext.program_id) {
            query = query.eq('program_id', searchContext.program_id);
          }
          if (searchContext.department_id) {
            query = query.eq('department_id', searchContext.department_id);
          }
          
          const { data: sectionData, error: sectionError } = await query.maybeSingle();

          if (!sectionError && sectionData) {
            resolvedSectionId = sectionData.id;
            console.log(
              `Resolved section name "${periodInfo?.sections?.[0]?.name || resolvedSectionId}" to UUID: ${resolvedSectionId}`
            );
          } else {
            // For faculty, if we can't resolve the section, we can still proceed
            // They might be teaching a combined class or the section mapping is incomplete
            if (isFaculty) {
              console.warn(
                `Could not resolve section "${resolvedSectionId}" to UUID. Proceeding without specific section filter.`
              );
              resolvedSectionId = ''; // Clear it so we fetch all students
            } else {
              console.error(
                'Failed to resolve section name to UUID:',
                sectionError
              );
              toast.error(`Unable to resolve section "${resolvedSectionId}"`);
              setLoadingPeriodData(false);
              return;
            }
          }
        }

        const students = await AttendanceService.getStudentsForAttendance({
          institution_id: searchContext.institution_id!,
          degree_id: searchContext.degree_id || undefined,
          program_id: searchContext.program_id || undefined,
          department_id: searchContext.department_id || undefined,
          semester_id: searchContext.semester_id!,
          section_id: resolvedSectionId || undefined
        });

        if (existingRecords.length > 0) {
          // Attendance already exists, show completed state
          const selectedPeriodInfo = findPeriodBySlotId(
            availablePeriods,
            periodId
          );

          // Count present/absent students
          const presentCount = existingRecords.filter(
            (r) => r.status === 'Present'
          ).length;
          const absentCount = existingRecords.filter(
            (r) => r.status === 'Absent'
          ).length;
          const total = existingRecords.length;
          const attendancePercentage =
            total > 0 ? Math.round((presentCount / total) * 100) : 0;

          // Get marking details from the first record
          const firstRecord = existingRecords[0];
          const markedDate = new Date(firstRecord.created_at);

          setAttendanceCompleted({
            isCompleted: true,
            details: {
              periodName: selectedPeriodInfo?.period_name || 'Unknown',
              courseName: selectedPeriodInfo?.course?.course_name || 'N/A',
              timeSlot: formatTimeRange(
                selectedPeriodInfo?.start_time,
                selectedPeriodInfo?.end_time
              ),
              date: format(
                new Date(searchContext.attendance_date + 'T00:00:00'),
                'dd-MMM-yyyy'
              ),
              markedBy:
                firstRecord.marked_by_user?.full_name ||
                firstRecord.marked_by_user?.email ||
                'Unknown',
              markedAt: format(markedDate, 'dd-MMM-yyyy hh:mm a'),
              presentCount,
              absentCount,
              totalStudents: total,
              attendancePercentage,
              // Add staff and section details with proper names
              staffName: (() => {
                const periodInfo = selectedPeriodInfo;
                if (
                  periodInfo?.staff?.first_name &&
                  periodInfo?.staff?.last_name
                ) {
                  return `${periodInfo.staff.first_name} ${periodInfo.staff.last_name}`.trim();
                }
                if (
                  periodInfo?.staff_members &&
                  periodInfo.staff_members.length > 0
                ) {
                  return periodInfo.staff_members
                    .map((staff: StaffMember) =>
                      `${staff.first_name || ''} ${
                        staff.last_name || ''
                      }`.trim()
                    )
                    .join(', ');
                }
                return 'Not assigned';
              })(),
              staffEmail: 'N/A',
              sectionName:
                sections.find(
                  (s: { id: string }) => s.id === searchContext.section_id
                )?.section_name || 'Unknown Section',
              semesterName:
                semesters.find(
                  (s: { id: string }) => s.id === searchContext.semester_id
                )?.semester_name || 'Unknown Semester',
              institutionName:
                institutions.find(
                  (i: { id: string }) => i.id === searchContext.institution_id
                )?.name || 'Unknown Institution',
              departmentName:
                departments.find(
                  (d: { id: string }) => d.id === searchContext.department_id
                )?.department_name || 'Unknown Department',
              programName:
                programs.find(
                  (p: { id: string }) => p.id === searchContext.program_id
                )?.program_name || 'Unknown Program',
              degreeName:
                degrees.find(
                  (d: { id: string }) => d.id === searchContext.degree_id
                )?.degree_name || 'Unknown Degree'
            }
          });

          // Update student statuses to match existing attendance
          const studentsWithStatus = students.map((student) => {
            const attendanceRecord = existingRecords.find(
              (r) => r.student_id === student.id
            );
            return {
              ...student,
              status: attendanceRecord ? attendanceRecord.status : 'Present'
            };
          });
          setStudentsForSection(studentsWithStatus);
        } else {
          // No existing attendance, prepare for marking
          setAttendanceCompleted({ isCompleted: false, details: null });

          // Add default status to students
          const studentsWithStatus = students.map((student) => ({
            ...student,
            status: 'Present' // Default to Present
          }));
          setStudentsForSection(studentsWithStatus);
        }
      } catch (error) {
        console.error('Error loading attendance data:', error);
        toast.error('Failed to load attendance data');
      } finally {
        setLoadingPeriodData(false);
      }
    }
  };

  // Handle save attendance confirmation and processing
  const handleSaveAttendance = async () => {
    try {
      setSavingAttendance(true);
      setShowConfirmDialog(false);

      if (!selectedPeriod) {
        toast.error('Please select a period first');
        return;
      }

      if (!searchContext.institution_id || !user?.id) {
        toast.error('Missing required information to save attendance');
        return;
      }

      // Check staff permission for the selected period
      if (!isSuperAdmin) {
        const canMark = await checkStaffPermissionForPeriod(selectedPeriod);
        if (!canMark) {
          toast.error(
            'You are not authorized to mark attendance for this period. Please contact your administrator if you believe this is an error.'
          );
          return;
        }
      }

      // Get selected period info for consolidated data
      const selectedPeriodInfo = findPeriodBySlotId(
        availablePeriods,
        selectedPeriod
      );

      if (!selectedPeriodInfo) {
        toast.error('Period information not found');
        return;
      }

      // Prepare consolidated attendance data
      const attendance_data: ConsolidatedAttendanceData = {
        [selectedPeriod]: {
          period_id: selectedPeriodInfo.id,
          period_name: selectedPeriodInfo.period_name,
          start_time: selectedPeriodInfo.start_time,
          end_time: selectedPeriodInfo.end_time,
          course_id: selectedPeriodInfo.course?.id || '',
          course_name: selectedPeriodInfo.course?.course_name || '',
          students: studentsForSection.map((student) => ({
            student_id: student.id,
            status: student.status as 'Present' | 'Absent',
            marked_at: new Date().toISOString()
          }))
        }
      };

      // Save using the consolidated attendance service
      const result = await saveConsolidatedAttendance({
        timetable_id: selectedPeriodInfo.timetable_id, // Use the correct timetable_id
        section_id: searchContext.section_id!,
        attendance_date: searchContext.attendance_date!,
        attendance_data: attendance_data,
        marked_by: user.id,
        institution_id: searchContext.institution_id!
      });

      const success = !!result;

      if (success) {
        // Get attendance statistics
        const presentCount = studentsForSection.filter(
          (s) => s.status === 'Present'
        ).length;
        const absentCount = studentsForSection.filter(
          (s) => s.status === 'Absent'
        ).length;
        const total = studentsForSection.length;
        const attendancePercentage = Math.round((presentCount / total) * 100);

        // selectedPeriodInfo already defined above

        // Get current date and time
        const currentDate = new Date();
        const formattedDate = format(currentDate, 'dd-MMM-yyyy');
        const formattedTime = format(currentDate, 'hh:mm a');

        // Set completion details for display
        setAttendanceCompleted({
          isCompleted: true,
          details: {
            periodName: selectedPeriodInfo?.period_name || 'Unknown',
            courseName: selectedPeriodInfo?.course?.course_name || 'N/A',
            timeSlot: `${selectedPeriodInfo?.start_time} - ${selectedPeriodInfo?.end_time}`,
            date: formattedDate,
            markedBy: userProfile?.full_name || user?.email || 'Unknown',
            markedAt: formattedTime,
            presentCount,
            absentCount,
            totalStudents: total,
            attendancePercentage,
            // Add staff and section details with proper names
            staffName: (() => {
              const periodInfo = selectedPeriodInfo;
              if (
                periodInfo?.staff?.first_name &&
                periodInfo?.staff?.last_name
              ) {
                return `${periodInfo.staff.first_name} ${periodInfo.staff.last_name}`.trim();
              }
              if (
                periodInfo?.staff_members &&
                periodInfo.staff_members.length > 0
              ) {
                return periodInfo.staff_members
                  .map((staff: StaffMember) =>
                    `${staff.first_name || ''} ${staff.last_name || ''}`.trim()
                  )
                  .join(', ');
              }
              return 'Not assigned';
            })(),
            staffEmail: 'N/A',
            sectionName:
              sections.find(
                (s: { id: string }) => s.id === searchContext.section_id
              )?.section_name || 'Unknown Section',
            semesterName:
              semesters.find(
                (s: { id: string }) => s.id === searchContext.semester_id
              )?.semester_name || 'Unknown Semester',
            institutionName:
              institutions.find(
                (i: { id: string }) => i.id === searchContext.institution_id
              )?.name || 'Unknown Institution',
            departmentName:
              departments.find(
                (d: { id: string }) => d.id === searchContext.department_id
              )?.department_name || 'Unknown Department',
            programName:
              programs.find(
                (p: { id: string }) => p.id === searchContext.program_id
              )?.program_name || 'Unknown Program',
            degreeName:
              degrees.find(
                (d: { id: string }) => d.id === searchContext.degree_id
              )?.degree_name || 'Unknown Degree'
          }
        });

        // Show simple success toast
        toast.success('Attendance saved successfully!');
      } else {
        toast.error('Failed to save attendance');
      }
    } catch (error) {
      console.error('Error saving attendance:', error);
      toast.error('Failed to save attendance');
    } finally {
      setSavingAttendance(false);
    }
  };

  if (!canViewAttendance) {
    return (
      <div className='flex items-center justify-center h-screen'>
        <Loader2 className='h-10 w-10 animate-spin' />
      </div>
    );
  }

  return (
    <ContentLayout title='Attendance'>
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
            <BreadcrumbPage>Attendance</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        {/* Header with status indicator */}
        <div className='flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg dark:bg-green-950 dark:border-green-800/50'>
          <div className='flex-shrink-0'>
            <Check className='h-5 w-5 text-green-600 dark:text-green-500' />
          </div>
          <span className='text-green-800 dark:text-green-300 font-medium'>
            Select the class to record attendance
          </span>
        </div>

        {/* Attendance View Selector - Shows Quick View for Faculty or Search for Admin */}
        <Card>
          <CardContent className='p-6'>
            <AttendanceViewSelector
              searchContext={searchContext}
              onContextChange={updateSearchContext}
              availablePeriods={availablePeriods}
              selectedPeriod={selectedPeriod}
              onPeriodSelect={handlePeriodSelection}
              loading={loading || loadingPeriods}
              onSearch={handleSearch}
            />
          </CardContent>
        </Card>

        {/* Results Section */}
        {showResults && (
          <>
            {/* Available Periods Section */}
            {!showStudents && (
              <Card id='periods-section'>
                <CardContent className='p-6'>
                  <div className='flex items-center gap-3 mb-4'>
                    <Calendar className='h-5 w-5 text-blue-600 dark:text-blue-500' />
                    <h3 className='text-lg font-medium'>Available Periods</h3>
                    <Badge variant='secondary' className='ml-auto'>
                      {searchContext.attendance_date
                        ? format(
                            new Date(
                              searchContext.attendance_date + 'T00:00:00'
                            ),
                            'dd MMM yyyy'
                          )
                        : ''}
                    </Badge>
                  </div>

                  {loadingPeriods ? (
                    <div className='flex flex-col items-center justify-center py-12 space-y-4'>
                      <Loader2 className='h-8 w-8 text-primary animate-spin' />
                      <p className='text-sm text-muted-foreground'>
                        Loading available periods...
                      </p>
                    </div>
                  ) : availablePeriods.length > 0 ? (
                    <div className='max-w-md'>
                      <Label
                        htmlFor='period-select'
                        className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block'
                      >
                        Select Period to View/Mark Attendance
                      </Label>
                      <Select onValueChange={handlePeriodSelection}>
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='Choose a period...' />
                        </SelectTrigger>
                        <SelectContent>
                          {(() => {
                            const filteredPeriods = availablePeriods.filter(
                              (period) =>
                                isSuperAdmin ||
                                attendancePermissions.get(
                                  period.timetable_slot_id
                                ) === true
                            );

                            if (filteredPeriods.length === 0) {
                              return (
                                <SelectItem value='no-periods' disabled>
                                  <div className='flex items-center gap-2'>
                                    <AlertTriangle className='h-4 w-4 text-orange-500' />
                                    <span className='text-gray-500 dark:text-gray-400'>
                                      No periods available
                                    </span>
                                  </div>
                                </SelectItem>
                              );
                            }

                            return filteredPeriods.map((period) => (
                              <SelectItem
                                key={period.timetable_slot_id}
                                value={period.timetable_slot_id}
                              >
                                <div className='flex items-center justify-between w-full'>
                                  <div className='flex flex-col'>
                                    <span className='font-medium'>
                                      {period.period_name}
                                    </span>
                                    <span className='text-xs text-gray-500 dark:text-gray-400'>
                                      {formatTimeRange(
                                        period.start_time,
                                        period.end_time
                                      )}
                                      {period.course &&
                                        ` • ${period.course.course_name}`}
                                    </span>
                                  </div>
                                </div>
                              </SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>

                      {availablePeriods.filter(
                        (period) =>
                          isSuperAdmin ||
                          attendancePermissions.get(
                            period.timetable_slot_id
                          ) === true
                      ).length === 0 && (
                        <div className='mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg dark:bg-orange-950 dark:border-orange-800/50'>
                          <div className='flex items-center gap-2'>
                            <AlertTriangle className='h-4 w-4 text-orange-600 dark:text-orange-500' />
                            <p className='text-sm text-orange-800 dark:text-orange-300'>
                              No periods available - You are not assigned to
                              teach any periods for this class on the selected
                              date.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className='text-center py-8 text-muted-foreground dark:text-gray-500'>
                      <Calendar className='h-12 w-12 mx-auto mb-4 opacity-50' />
                      <p className='font-medium'>No periods available</p>
                      <p className='text-sm'>
                        {isSuperAdmin
                          ? 'No timetable periods are configured for this class on the selected date.'
                          : 'You are not assigned to teach any periods for this class on the selected date.'}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Student Attendance Section */}
            {showStudents && (
              <>
                {/* Back to Periods Button */}
                <div className='flex items-center gap-3 mb-4'>
                  <Button
                    variant='outline'
                    onClick={() => {
                      setShowStudents(false);
                      setSelectedPeriod(null);
                      setAttendanceCompleted({
                        isCompleted: false,
                        details: null
                      });
                      setStudentsForSection([]);
                      setLoadingPeriodData(false);
                    }}
                    className='flex items-center gap-2'
                    disabled={loadingPeriodData}
                  >
                    <RotateCcw className='h-4 w-4' />
                    Back to Periods
                  </Button>
                  {selectedPeriod && (
                    <div className='flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400'>
                      <Calendar className='h-4 w-4' />
                      <span>
                        {
                          findPeriodBySlotId(availablePeriods, selectedPeriod)
                            ?.period_name
                        }
                        (
                        {convertTo12HourFormat(
                          findPeriodBySlotId(availablePeriods, selectedPeriod)
                            ?.start_time
                        )}{' '}
                        -{' '}
                        {convertTo12HourFormat(
                          findPeriodBySlotId(availablePeriods, selectedPeriod)
                            ?.end_time
                        )}
                        )
                      </span>
                    </div>
                  )}
                </div>

                {/* Loading State for Period Data */}
                {loadingPeriodData && (
                  <Card>
                    <CardContent className='p-8'>
                      <div className='flex flex-col items-center justify-center space-y-4'>
                        <div className='flex items-center space-x-2'>
                          <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-500'></div>
                          <span className='text-gray-600 dark:text-gray-400'>
                            Checking attendance status...
                          </span>
                        </div>
                        <p className='text-sm text-gray-500 dark:text-gray-500 text-center'>
                          Please wait while we load the attendance data for this
                          period.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Content - Only show when not loading */}
                {!loadingPeriodData && (
                  <>
                    {/* Attendance Completed Details - Simple & Clean Design */}
                    {attendanceCompleted.isCompleted &&
                      attendanceCompleted.details && (
                        <div className='space-y-6'>
                          {/* Header Section */}
                          <Card className='border-0 bg-gradient-to-r from-green-600 to-emerald-600 text-white dark:from-green-700 dark:to-emerald-700'>
                            <CardContent className='p-6'>
                              <div className='flex items-center justify-between mb-4'>
                                <div className='flex items-center gap-3'>
                                  <div className='flex items-center justify-center w-12 h-12 bg-white/20 rounded-lg'>
                                    <Check className='h-6 w-6 text-white' />
                                  </div>
                                  <div>
                                    <h2 className='text-xl font-bold text-white'>
                                      Attendance Completed!
                                    </h2>
                                    <p className='text-green-100 dark:text-green-200 text-sm'>
                                      {attendanceCompleted.details.periodName} •{' '}
                                      {attendanceCompleted.details.timeSlot}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  onClick={() => {
                                    setShowStudents(false);
                                    setSelectedPeriod(null);
                                    setAttendanceCompleted({
                                      isCompleted: false,
                                      details: null
                                    });
                                  }}
                                  className='text-white/80 hover:text-white hover:bg-white/20'
                                >
                                  <X className='h-4 w-4' />
                                </Button>
                              </div>

                              {/* Stats Row */}
                              <div className='grid grid-cols-4 gap-4 text-center'>
                                <div>
                                  <div className='text-2xl font-bold text-white'>
                                    {attendanceCompleted.details.totalStudents}
                                  </div>
                                  <div className='text-green-100 dark:text-green-200 text-sm'>
                                    Total
                                  </div>
                                </div>
                                <div>
                                  <div className='text-2xl font-bold text-white'>
                                    {attendanceCompleted.details.presentCount}
                                  </div>
                                  <div className='text-green-100 dark:text-green-200 text-sm'>
                                    Present
                                  </div>
                                </div>
                                <div>
                                  <div className='text-2xl font-bold text-white'>
                                    {attendanceCompleted.details.absentCount}
                                  </div>
                                  <div className='text-green-100 dark:text-green-200 text-sm'>
                                    Absent
                                  </div>
                                </div>
                                <div>
                                  <div className='text-2xl font-bold text-white'>
                                    {
                                      attendanceCompleted.details
                                        .attendancePercentage
                                    }
                                    %
                                  </div>
                                  <div className='text-green-100 dark:text-green-200 text-sm'>
                                    Rate
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          {/* Information Cards */}
                          <div className='grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6'>
                            {/* Academic Information */}
                            <Card className='border-blue-200 bg-blue-50 shadow-sm hover:shadow-md transition-shadow dark:bg-blue-950 dark:border-blue-800/50'>
                              <CardContent className='p-4 lg:p-6'>
                                <div className='flex items-center gap-3 mb-4'>
                                  <div className='p-2 bg-blue-100 dark:bg-blue-900 rounded-lg'>
                                    <BookOpen className='h-5 w-5 text-blue-600 dark:text-blue-500' />
                                  </div>
                                  <h3 className='font-semibold text-blue-900 dark:text-blue-300 text-sm lg:text-base'>
                                    Academic Info
                                  </h3>
                                </div>
                                <div className='space-y-3'>
                                  <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2'>
                                    <span className='text-xs lg:text-sm text-gray-600 dark:text-gray-400 font-medium min-w-fit'>
                                      Course
                                    </span>
                                    <span className='text-xs lg:text-sm font-medium text-gray-900 dark:text-gray-200 break-words text-right'>
                                      {attendanceCompleted.details.courseName}
                                    </span>
                                  </div>
                                  <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2'>
                                    <span className='text-xs lg:text-sm text-gray-600 dark:text-gray-400 font-medium min-w-fit'>
                                      Section
                                    </span>
                                    <span className='text-xs lg:text-sm font-medium text-gray-900 dark:text-gray-200 break-words text-right'>
                                      {attendanceCompleted.details.sectionName}
                                    </span>
                                  </div>
                                  <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2'>
                                    <span className='text-xs lg:text-sm text-gray-600 dark:text-gray-400 font-medium min-w-fit'>
                                      Department
                                    </span>
                                    <span className='text-xs lg:text-sm font-medium text-gray-900 dark:text-gray-200 break-words text-right'>
                                      {
                                        attendanceCompleted.details
                                          .departmentName
                                      }
                                    </span>
                                  </div>
                                  <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2'>
                                    <span className='text-xs lg:text-sm text-gray-600 dark:text-gray-400 font-medium min-w-fit'>
                                      Program
                                    </span>
                                    <span className='text-xs lg:text-sm font-medium text-gray-900 dark:text-gray-200 break-words text-right'>
                                      {attendanceCompleted.details.programName}
                                    </span>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>

                            {/* Staff Information */}
                            <Card className='border-purple-200 bg-purple-50 shadow-sm hover:shadow-md transition-shadow dark:bg-purple-950 dark:border-purple-800/50'>
                              <CardContent className='p-4 lg:p-6'>
                                <div className='flex items-center gap-3 mb-4'>
                                  <div className='p-2 bg-purple-100 dark:bg-purple-900 rounded-lg'>
                                    <User className='h-5 w-5 text-purple-600 dark:text-purple-500' />
                                  </div>
                                  <h3 className='font-semibold text-purple-900 dark:text-purple-300 text-sm lg:text-base'>
                                    Staff Details
                                  </h3>
                                </div>
                                <div className='space-y-3'>
                                  <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2'>
                                    <span className='text-xs lg:text-sm text-gray-600 dark:text-gray-400 font-medium min-w-fit'>
                                      Assigned Faculty
                                    </span>
                                    <span className='text-xs lg:text-sm font-medium text-gray-900 dark:text-gray-200 break-words text-right'>
                                      {attendanceCompleted.details.staffName}
                                    </span>
                                  </div>

                                  <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2'>
                                    <span className='text-xs lg:text-sm text-gray-600 dark:text-gray-400 font-medium min-w-fit'>
                                      Marked by
                                    </span>
                                    <span className='text-xs lg:text-sm font-medium text-gray-900 dark:text-gray-200 break-words text-right'>
                                      {attendanceCompleted.details.markedBy}
                                    </span>
                                  </div>
                                  <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2'>
                                    <span className='text-xs lg:text-sm text-gray-600 dark:text-gray-400 font-medium min-w-fit'>
                                      Marked at
                                    </span>
                                    <span className='text-xs lg:text-sm font-medium text-gray-900 dark:text-gray-200 break-words text-right'>
                                      {attendanceCompleted.details.markedAt}
                                    </span>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>

                            {/* Session Information */}
                            <Card className='border-amber-200 bg-amber-50 shadow-sm hover:shadow-md transition-shadow lg:col-span-2 xl:col-span-1 dark:bg-amber-950 dark:border-amber-800/50'>
                              <CardContent className='p-4 lg:p-6'>
                                <div className='flex items-center gap-3 mb-4'>
                                  <div className='p-2 bg-amber-100 dark:bg-amber-900 rounded-lg'>
                                    <Calendar className='h-5 w-5 text-amber-600 dark:text-amber-500' />
                                  </div>
                                  <h3 className='font-semibold text-amber-900 dark:text-amber-300 text-sm lg:text-base'>
                                    Session Details
                                  </h3>
                                </div>
                                <div className='space-y-3'>
                                  <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2'>
                                    <span className='text-xs lg:text-sm text-gray-600 dark:text-gray-400 font-medium min-w-fit'>
                                      Date
                                    </span>
                                    <span className='text-xs lg:text-sm font-medium text-gray-900 dark:text-gray-200 break-words text-right'>
                                      {attendanceCompleted.details.date}
                                    </span>
                                  </div>
                                  <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2'>
                                    <span className='text-xs lg:text-sm text-gray-600 dark:text-gray-400 font-medium min-w-fit'>
                                      Time
                                    </span>
                                    <span className='text-xs lg:text-sm font-medium text-gray-900 dark:text-gray-200 break-words text-right'>
                                      {attendanceCompleted.details.timeSlot}
                                    </span>
                                  </div>
                                  <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2'>
                                    <span className='text-xs lg:text-sm text-gray-600 dark:text-gray-400 font-medium min-w-fit'>
                                      Institution
                                    </span>
                                    <span className='text-xs lg:text-sm font-medium text-gray-900 dark:text-gray-200 break-words text-right'>
                                      {
                                        attendanceCompleted.details
                                          .institutionName
                                      }
                                    </span>
                                  </div>
                                  <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2'>
                                    <span className='text-xs lg:text-sm text-gray-600 dark:text-gray-400 font-medium min-w-fit'>
                                      Status
                                    </span>
                                    <Badge className='bg-green-100 text-green-700 border-green-200 text-xs dark:bg-green-900/50 dark:text-green-300 dark:border-green-800/50'>
                                      <Check className='h-3 w-3 mr-1' />
                                      Completed
                                    </Badge>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      )}

                    {/* Attendance Warning - Only show if attendance not completed */}
                    {!attendanceCompleted.isCompleted && (
                      <div className='flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg dark:bg-orange-950 dark:border-orange-800/50'>
                        <AlertTriangle className='h-5 w-5 text-orange-600 dark:text-orange-500' />
                        <span className='text-orange-800 dark:text-orange-300'>
                          Attendance not yet recorded
                        </span>
                        <div className='ml-auto text-orange-600 dark:text-orange-400 text-sm'>
                          {(() => {
                            const total = studentsForSection.length;
                            const present = studentsForSection.filter(
                              (s) => s.status === 'Present'
                            ).length;
                            const percentage =
                              total > 0
                                ? Math.round((present / total) * 100)
                                : 100;
                            const dateStr = searchContext.attendance_date
                              ? format(
                                  new Date(
                                    searchContext.attendance_date + 'T00:00:00'
                                  ),
                                  'dd-MMM-yyyy'
                                )
                              : '';
                            return `${present}/${total} | ${percentage}% attendance | ${dateStr}`;
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Period Selection and Controls - Only show if attendance not completed */}
                    {availablePeriods.length > 0 &&
                      !attendanceCompleted.isCompleted && (
                        <div className='space-y-4 p-4 bg-blue-50 dark:bg-blue-950/50 rounded-lg'>
                          <div className='flex flex-wrap items-center gap-4'>
                            <div className='flex items-center gap-2'>
                              <Label className='dark:text-gray-300'>
                                Period:
                              </Label>
                              <Select
                                value={selectedPeriod || undefined}
                                onValueChange={handlePeriodSelection}
                              >
                                <SelectTrigger className='w-48'>
                                  <SelectValue placeholder='Select period' />
                                </SelectTrigger>
                                <SelectContent>
                                  {availablePeriods
                                    .filter(
                                      (period) =>
                                        isSuperAdmin ||
                                        attendancePermissions.get(
                                          period.timetable_slot_id
                                        ) === true
                                    )
                                    .map((period) => (
                                      <SelectItem
                                        key={period.timetable_slot_id}
                                        value={period.timetable_slot_id}
                                      >
                                        {period.period_name} (
                                        {formatTimeRange(
                                          period.start_time,
                                          period.end_time
                                        )}
                                        )
                                        {period.course &&
                                          ` - ${period.course.course_name}`}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Show message if no periods available for staff */}
                            {!isSuperAdmin &&
                              availablePeriods.length > 0 &&
                              availablePeriods.filter(
                                (p) =>
                                  attendancePermissions.get(
                                    p.timetable_slot_id
                                  ) === true
                              ).length === 0 && (
                                <div className='text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 p-2 rounded border border-orange-200 dark:border-orange-800/50'>
                                  <AlertTriangle className='h-4 w-4 inline mr-1' />
                                  No periods available - You are not assigned to
                                  teach any periods for this class on this date.
                                </div>
                              )}

                            <div className='flex items-center gap-2 flex-1 min-w-[200px]'>
                              <Label className='dark:text-gray-300'>
                                Search:
                              </Label>
                              <div className='relative flex-1'>
                                <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
                                <Input
                                  placeholder='Search by name or roll number...'
                                  value={studentSearchTerm}
                                  onChange={(e) =>
                                    setStudentSearchTerm(e.target.value)
                                  }
                                  className='pl-10 pr-10'
                                />
                                {studentSearchTerm && (
                                  <Button
                                    variant='ghost'
                                    size='sm'
                                    className='absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0'
                                    onClick={() => setStudentSearchTerm('')}
                                  >
                                    <X className='h-4 w-4' />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className='flex flex-wrap items-center gap-4'>
                            <div className='flex items-center gap-2'>
                              <Label className='dark:text-gray-300'>
                                Sort by Roll No.
                              </Label>
                              <Button
                                variant='outline'
                                size='sm'
                                onClick={() => {
                                  setSortByRollNo(!sortByRollNo);
                                  setSortByName(false);
                                }}
                              >
                                <Check
                                  className={`h-3 w-3 mr-1 ${
                                    sortByRollNo ? '' : 'opacity-0'
                                  }`}
                                />
                                {sortByRollNo ? 'YES' : 'NO'}
                              </Button>
                            </div>
                            <div className='flex items-center gap-2'>
                              <Label className='dark:text-gray-300'>
                                Name A-Z
                              </Label>
                              <Button
                                variant='outline'
                                size='sm'
                                onClick={() => {
                                  setSortByName(!sortByName);
                                  setSortByRollNo(false);
                                }}
                              >
                                <Check
                                  className={`h-3 w-3 mr-1 ${
                                    sortByName ? '' : 'opacity-0'
                                  }`}
                                />
                                {sortByName ? 'YES' : 'NO'}
                              </Button>
                            </div>
                            <div className='flex items-center gap-2'>
                              <Label className='dark:text-gray-300'>
                                All absent
                              </Label>
                              <Button
                                variant='outline'
                                size='sm'
                                onClick={() => {
                                  const newAllAbsent = !allAbsent;
                                  setAllAbsent(newAllAbsent);
                                  if (newAllAbsent) {
                                    setStudentsForSection((prev) =>
                                      prev.map((student) => ({
                                        ...student,
                                        status: 'Absent'
                                      }))
                                    );
                                  } else {
                                    setStudentsForSection((prev) =>
                                      prev.map((student) => ({
                                        ...student,
                                        status: 'Present'
                                      }))
                                    );
                                  }
                                }}
                              >
                                <Check
                                  className={`h-3 w-3 mr-1 ${
                                    allAbsent ? '' : 'opacity-0'
                                  }`}
                                />
                                {allAbsent ? 'YES' : 'NO'}
                              </Button>
                            </div>
                            <div className='ml-auto text-blue-800 dark:text-blue-300 text-sm'>
                              {filteredStudents.length} of{' '}
                              {studentsForSection.length} student(s)
                            </div>
                          </div>
                        </div>
                      )}

                    {/* Period Selection for Completed Attendance */}
                    {attendanceCompleted.isCompleted && selectedPeriod && (
                      <div className='space-y-4 p-4 bg-green-50 dark:bg-green-950/50 rounded-lg border border-green-200 dark:border-green-800/50'>
                        <div className='flex items-center gap-4'>
                          <div className='flex items-center gap-2'>
                            <Check className='h-4 w-4 text-green-600 dark:text-green-500' />
                            <Label className='text-green-800 dark:text-green-300 font-medium'>
                              Selected Period:
                            </Label>
                            <span className='text-green-700 dark:text-green-400'>
                              {
                                findPeriodBySlotId(
                                  availablePeriods,
                                  selectedPeriod
                                )?.period_name
                              }
                              (
                              {convertTo12HourFormat(
                                findPeriodBySlotId(
                                  availablePeriods,
                                  selectedPeriod
                                )?.start_time
                              )}{' '}
                              -{' '}
                              {convertTo12HourFormat(
                                findPeriodBySlotId(
                                  availablePeriods,
                                  selectedPeriod
                                )?.end_time
                              )}
                              )
                              {findPeriodBySlotId(
                                availablePeriods,
                                selectedPeriod
                              )?.course &&
                                ` - ${
                                  findPeriodBySlotId(
                                    availablePeriods,
                                    selectedPeriod
                                  )?.course?.course_name
                                }`}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* No Periods Available Message */}
                    {!loadingStudents &&
                      studentsForSection.length > 0 &&
                      availablePeriods.length === 0 && (
                        <div className='flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-950/50 border border-yellow-200 dark:border-yellow-800/50 rounded-lg'>
                          <AlertTriangle className='h-5 w-5 text-yellow-600 dark:text-yellow-500' />
                          <div>
                            <p className='text-yellow-800 dark:text-yellow-300 font-medium'>
                              No periods available for the selected date
                            </p>
                            <p className='text-yellow-700 dark:text-yellow-400 text-sm'>
                              {isSuperAdmin
                                ? 'No timetable periods are configured for this class on the selected date.'
                                : 'You are not assigned to teach any periods for this class on the selected date, or no periods are configured.'}
                            </p>
                          </div>
                        </div>
                      )}

                    {/* Loading State */}
                    {loadingStudents && (
                      <div className='flex items-center justify-center py-8'>
                        <Loader2 className='h-5 w-5 text-primary animate-spin' />
                      </div>
                    )}

                    {/* Attendance Already Completed Message */}
                    {attendanceCompleted.isCompleted &&
                      studentsForSection.length > 0 && (
                        <div className='flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/50 rounded-lg'>
                          <Check className='h-5 w-5 text-blue-600 dark:text-blue-500' />
                          <div>
                            <p className='text-blue-800 dark:text-blue-300 font-medium'>
                              Attendance has been recorded for this period
                            </p>
                            <p className='text-blue-700 dark:text-blue-400 text-sm'>
                              The attendance records below show the current
                              status. To modify attendance, contact your system
                              administrator.
                            </p>
                          </div>
                        </div>
                      )}

                    {/* Context Information Card */}
                    {!loadingStudents && studentsForSection.length > 0 && (
                      <Card className='mb-6'>
                        <CardContent className='p-4'>
                          <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2'>
                            <Users className='h-5 w-5 text-blue-600 dark:text-blue-500' />
                            Class Details
                          </h3>
                          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm'>
                            <div className='flex flex-col items-start gap-2'>
                              <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                Institution:
                              </span>
                              <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                                {institutions.find(
                                  (i) => i.id === searchContext.institution_id
                                )?.name || 'N/A'}
                              </span>
                            </div>
                            <div className='flex flex-col items-start gap-2'>
                              <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                Academic Year:
                              </span>
                              <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                                {academicYears.find(
                                  (ay) =>
                                    ay.id === searchContext.academic_year_id
                                )?.academic_year_name || 'N/A'}
                              </span>
                            </div>
                            <div className='flex flex-col items-start gap-2'>
                              <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                Degree:
                              </span>
                              <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                                {degrees.find(
                                  (d) => d.id === searchContext.degree_id
                                )?.degree_name || 'N/A'}
                              </span>
                            </div>
                            <div className='flex flex-col items-start gap-2'>
                              <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                Department:
                              </span>
                              <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                                {departments.find(
                                  (d) => d.id === searchContext.department_id
                                )?.department_name || 'N/A'}
                              </span>
                            </div>
                            <div className='flex flex-col items-start gap-2'>
                              <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                Program:
                              </span>
                              <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                                {programs.find(
                                  (p) => p.id === searchContext.program_id
                                )?.program_name || 'N/A'}
                              </span>
                            </div>
                            <div className='flex flex-col items-start gap-2'>
                              <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                Semester:
                              </span>
                              <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                                {semesters.find(
                                  (s) => s.id === searchContext.semester_id
                                )?.semester_name || 'N/A'}
                              </span>
                            </div>
                            <div className='flex flex-col items-start gap-2'>
                              <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                Section:
                              </span>
                              <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                                {sections.find(
                                  (s) => s.id === searchContext.section_id
                                )?.section_name || 'N/A'}
                              </span>
                            </div>
                            <div className='flex flex-col items-start gap-2'>
                              <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                Date:
                              </span>
                              <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                                {searchContext.attendance_date
                                  ? format(
                                      new Date(
                                        searchContext.attendance_date +
                                          'T00:00:00'
                                      ),
                                      'dd-MMM-yyyy'
                                    )
                                  : 'N/A'}
                              </span>
                            </div>
                            <div className='flex flex-col items-start gap-2'>
                              <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                Total Students:
                              </span>
                              <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                                {studentsForSection.length}
                              </span>
                            </div>
                          </div>

                          {/* Selected Period Information */}
                          {selectedPeriod && (
                            <div className='mt-4 pt-4 border-t border-gray-200 dark:border-gray-700'>
                              <h4 className='text-md font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2'>
                                <Calendar className='h-4 w-4 text-green-600 dark:text-green-500' />
                                Selected Period Details
                              </h4>
                              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm'>
                                {(() => {
                                  const periodInfo = findPeriodBySlotId(
                                    availablePeriods,
                                    selectedPeriod
                                  );
                                  return (
                                    <>
                                      <div className='flex flex-col items-start gap-2'>
                                        <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                          Period:
                                        </span>
                                        <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                                          {periodInfo?.period_name || 'N/A'}
                                        </span>
                                      </div>
                                      <div className='flex flex-col items-start gap-2'>
                                        <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                          Time:
                                        </span>
                                        <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                                          {periodInfo?.start_time &&
                                          periodInfo?.end_time
                                            ? formatTimeRange(
                                                periodInfo.start_time,
                                                periodInfo.end_time
                                              )
                                            : 'N/A'}
                                        </span>
                                      </div>
                                      <div className='flex flex-col items-start gap-2'>
                                        <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                          Course:
                                        </span>
                                        <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                                          {periodInfo?.course?.course_name ||
                                            'N/A'}
                                        </span>
                                      </div>
                                      <div className='flex flex-col items-start gap-2'>
                                        <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                          Course Code:
                                        </span>
                                        <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                                          {periodInfo?.course?.course_code ||
                                            'N/A'}
                                        </span>
                                      </div>
                                      <div className='flex flex-col items-start gap-2'>
                                        <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                          Faculty:
                                        </span>
                                        <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                                          {(() => {
                                            if (
                                              periodInfo?.staff?.first_name &&
                                              periodInfo?.staff?.last_name
                                            ) {
                                              return `${periodInfo.staff.first_name} ${periodInfo.staff.last_name}`.trim();
                                            }
                                            if (
                                              periodInfo?.staff_members &&
                                              periodInfo.staff_members.length >
                                                0
                                            ) {
                                              return periodInfo.staff_members
                                                .map((staff: StaffMember) =>
                                                  `${staff.first_name || ''} ${
                                                    staff.last_name || ''
                                                  }`.trim()
                                                )
                                                .join(', ');
                                            }
                                            return 'Not assigned';
                                          })()}
                                        </span>
                                      </div>
                                      <div className='flex flex-col items-start gap-2'>
                                        <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                          Present:
                                        </span>
                                        <span className='text-green-600 dark:text-green-500 font-semibold'>
                                          {
                                            studentsForSection.filter(
                                              (s) => s.status === 'Present'
                                            ).length
                                          }
                                        </span>
                                      </div>
                                      <div className='flex flex-col items-start gap-2'>
                                        <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                          Absent:
                                        </span>
                                        <span className='text-red-600 dark:text-red-500 font-semibold'>
                                          {
                                            studentsForSection.filter(
                                              (s) => s.status === 'Absent'
                                            ).length
                                          }
                                        </span>
                                      </div>
                                      <div className='flex flex-col items-start gap-2'>
                                        <span className='text-gray-600 dark:text-gray-400 font-medium'>
                                          Attendance Rate:
                                        </span>
                                        <span className='text-blue-600 dark:text-blue-500 font-semibold'>
                                          {studentsForSection.length > 0
                                            ? Math.round(
                                                (studentsForSection.filter(
                                                  (s) => s.status === 'Present'
                                                ).length /
                                                  studentsForSection.length) *
                                                  100
                                              )
                                            : 0}
                                          %
                                        </span>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Save Attendance Button - Only show if attendance not completed */}
                    {!loadingStudents &&
                      studentsForSection.length > 0 &&
                      !attendanceCompleted.isCompleted && (
                        <div className='flex justify-end gap-3 my-4'>
                          <Button
                            variant='outline'
                            onClick={() => {
                              // Mark all as present
                              setStudentsForSection((prev) =>
                                prev.map((student) => ({
                                  ...student,
                                  status: 'Present'
                                }))
                              );
                            }}
                          >
                            Mark All Present
                          </Button>
                          <Button
                            variant='outline'
                            onClick={() => {
                              // Mark all as absent
                              setStudentsForSection((prev) =>
                                prev.map((student) => ({
                                  ...student,
                                  status: 'Absent'
                                }))
                              );
                            }}
                          >
                            Mark All Absent
                          </Button>
                          <Dialog
                            open={showConfirmDialog}
                            onOpenChange={setShowConfirmDialog}
                          >
                            <DialogTrigger asChild>
                              <Button
                                className='flex items-center gap-2'
                                disabled={
                                  !selectedPeriod ||
                                  studentsForSection.length === 0 ||
                                  savingAttendance ||
                                  (!isSuperAdmin &&
                                    attendancePermissions.get(
                                      selectedPeriod
                                    ) !== true)
                                }
                              >
                                <Check className='h-4 w-4' />
                                {savingAttendance
                                  ? 'Saving...'
                                  : 'Save Attendance'}
                              </Button>
                            </DialogTrigger>
                            <DialogContent className='sm:max-w-[600px]'>
                              <DialogHeader>
                                <DialogTitle className='flex items-center gap-2'>
                                  <AlertTriangle className='h-5 w-5 text-orange-600' />
                                  Confirm Attendance Submission
                                </DialogTitle>
                                <DialogDescription>
                                  Please review the attendance details before
                                  submitting. This action cannot be undone.
                                </DialogDescription>
                              </DialogHeader>

                              <div className='py-4'>
                                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                                  {/* Left Column - Period Details */}
                                  <div className='space-y-3'>
                                    <h4 className='font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2'>
                                      <Calendar className='h-4 w-4' />
                                      Period Information
                                    </h4>
                                    <div className='space-y-2 text-sm'>
                                      <div className='flex justify-between'>
                                        <span className='text-gray-600 dark:text-gray-400'>
                                          Period:
                                        </span>
                                        <span className='font-medium'>
                                          {availablePeriods.find(
                                            (p) =>
                                              p.timetable_slot_id ===
                                              selectedPeriod
                                          )?.period_name || 'Unknown'}
                                        </span>
                                      </div>
                                      <div className='flex justify-between'>
                                        <span className='text-gray-600 dark:text-gray-400'>
                                          Time:
                                        </span>
                                        <span className='font-medium'>
                                          {(() => {
                                            const period = findPeriodBySlotId(
                                              availablePeriods,
                                              selectedPeriod
                                            );
                                            return formatTimeRange(
                                              period?.start_time,
                                              period?.end_time
                                            );
                                          })()}
                                        </span>
                                      </div>
                                      <div className='flex justify-between'>
                                        <span className='text-gray-600 dark:text-gray-400'>
                                          Course:
                                        </span>
                                        <span className='font-medium'>
                                          {findPeriodBySlotId(
                                            availablePeriods,
                                            selectedPeriod
                                          )?.course?.course_name || 'N/A'}
                                        </span>
                                      </div>
                                      <div className='flex justify-between'>
                                        <span className='text-gray-600 dark:text-gray-400'>
                                          Date:
                                        </span>
                                        <span className='font-medium'>
                                          {searchContext.attendance_date
                                            ? format(
                                                new Date(
                                                  searchContext.attendance_date +
                                                    'T00:00:00'
                                                ),
                                                'dd-MMM-yyyy'
                                              )
                                            : ''}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right Column - Attendance Summary */}
                                  <div className='space-y-3'>
                                    <h4 className='font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2'>
                                      <BarChart3 className='h-4 w-4' />
                                      Attendance Summary
                                    </h4>
                                    <div className='space-y-2 text-sm'>
                                      <div className='flex justify-between'>
                                        <span className='text-gray-600 dark:text-gray-400'>
                                          Present:
                                        </span>
                                        <span className='font-medium text-green-600 dark:text-green-500'>
                                          {
                                            studentsForSection.filter(
                                              (s) => s.status === 'Present'
                                            ).length
                                          }{' '}
                                          students
                                        </span>
                                      </div>
                                      <div className='flex justify-between'>
                                        <span className='text-gray-600 dark:text-gray-400'>
                                          Absent:
                                        </span>
                                        <span className='font-medium text-red-600 dark:text-red-500'>
                                          {
                                            studentsForSection.filter(
                                              (s) => s.status === 'Absent'
                                            ).length
                                          }{' '}
                                          students
                                        </span>
                                      </div>
                                      <div className='flex justify-between'>
                                        <span className='text-gray-600 dark:text-gray-400'>
                                          Total:
                                        </span>
                                        <span className='font-medium'>
                                          {studentsForSection.length} students
                                        </span>
                                      </div>
                                      <div className='flex justify-between'>
                                        <span className='text-gray-600 dark:text-gray-400'>
                                          Attendance Rate:
                                        </span>
                                        <span className='font-medium text-blue-600 dark:text-blue-500'>
                                          {Math.round(
                                            (studentsForSection.filter(
                                              (s) => s.status === 'Present'
                                            ).length /
                                              studentsForSection.length) *
                                              100
                                          )}
                                          %
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Warning Message */}
                                <div className='mt-4 p-3 bg-yellow-50 dark:bg-yellow-950/50 border border-yellow-200 dark:border-yellow-800/50 rounded-lg'>
                                  <p className='text-yellow-800 dark:text-yellow-300 text-sm flex items-start gap-2'>
                                    <AlertTriangle className='h-4 w-4 mt-0.5 flex-shrink-0' />
                                    <span>
                                      <strong>Important:</strong> Once
                                      submitted, this attendance record will be
                                      saved to the database. Make sure all
                                      attendance statuses are correct before
                                      proceeding.
                                    </span>
                                  </p>
                                </div>
                              </div>

                              <DialogFooter>
                                <Button
                                  variant='outline'
                                  onClick={() => setShowConfirmDialog(false)}
                                  disabled={savingAttendance}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  onClick={handleSaveAttendance}
                                  disabled={savingAttendance}
                                  className='flex items-center gap-2'
                                >
                                  <Check className='h-4 w-4' />
                                  {savingAttendance
                                    ? 'Saving...'
                                    : 'Confirm & Save'}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      )}

                    {/* Students Grid */}
                    {!loadingStudents && filteredStudents.length > 0 && (
                      <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
                        {filteredStudents
                          .slice() // Create a copy to avoid mutating original array
                          .sort((a, b) => {
                            if (sortByRollNo) {
                              const rollA = a.roll_number || '';
                              const rollB = b.roll_number || '';
                              return rollA.localeCompare(rollB);
                            } else if (sortByName) {
                              const nameA = `${a.first_name || ''} ${
                                a.last_name || ''
                              }`.trim();
                              const nameB = `${b.first_name || ''} ${
                                b.last_name || ''
                              }`.trim();
                              return nameA.localeCompare(nameB);
                            }
                            return 0; // No sorting
                          })
                          .map((student) => (
                            <Card
                              key={student.id}
                              className={`transition-all ${
                                attendanceCompleted.isCompleted
                                  ? 'opacity-75'
                                  : 'cursor-pointer hover:shadow-md'
                              }`}
                              onClick={() =>
                                attendanceCompleted.isCompleted
                                  ? undefined
                                  : toggleStudentStatus(student.id)
                              }
                            >
                              <CardContent className='p-4 text-center'>
                                <Avatar className='h-16 w-16 mx-auto mb-3'>
                                  <AvatarImage
                                    src={student.student_photo_url}
                                  />
                                  <AvatarFallback className='text-lg'>
                                    {getInitials(
                                      `${student.first_name || ''} ${
                                        student.last_name || ''
                                      }`.trim()
                                    )}
                                  </AvatarFallback>
                                </Avatar>

                                <h4 className='font-medium text-sm mb-1'>
                                  {`${student.first_name || ''} ${
                                    student.last_name || ''
                                  }`.trim() || 'Unknown Student'}
                                </h4>
                                <p className='text-xs text-muted-foreground mb-3'>
                                  {student.roll_number || 'No Roll Number'}
                                </p>

                                <Badge
                                  variant={
                                    student.status === 'Present'
                                      ? 'default'
                                      : 'destructive'
                                  }
                                  className='w-full justify-center'
                                >
                                  {student.status || 'Present'}
                                </Badge>
                              </CardContent>
                            </Card>
                          ))}
                      </div>
                    )}

                    {/* No Students Found */}
                    {!loadingStudents && studentsForSection.length === 0 && (
                      <div className='text-center py-8 text-muted-foreground'>
                        <Users className='h-12 w-12 mx-auto mb-4 opacity-50' />
                        <p>No students found for the selected criteria</p>
                      </div>
                    )}

                    {/* No Students Match Search */}
                    {!loadingStudents &&
                      studentsForSection.length > 0 &&
                      filteredStudents.length === 0 && (
                        <div className='text-center py-8 text-muted-foreground'>
                          <Search className='h-12 w-12 mx-auto mb-4 opacity-50' />
                          <p>
                            No students match your search for &ldquo;
                            {studentSearchTerm}
                            &rdquo;
                          </p>
                          <Button
                            variant='outline'
                            size='sm'
                            className='mt-2'
                            onClick={() => setStudentSearchTerm('')}
                          >
                            Clear Search
                          </Button>
                        </div>
                      )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}
