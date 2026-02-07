'use client';

import { useEffect, useState, useMemo } from 'react';
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
import { LeaveCalendarService } from '@/lib/services/academic/leave-calendar-service';
import type { LeaveBlockInfo } from '@/types/leaves';
import { logger } from '@/lib/utils/enhanced-logger';
import { AttendanceSummaryModal } from './components/attendance-summary-modal';
import { SubdividedAttendanceGrid } from './_components/subdivided-attendance-grid';
import { PracticalAttendanceSelector } from './_components/practical-attendance-selector';
import type { SubdivisionGroup, PeriodMode, PracticalConfig } from '@/types/academics';
import type { LearningBehavior } from '@/types/attendance';
import { LEARNING_BEHAVIOR_LABELS } from '@/types/attendance';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sparkles, MessageSquare, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [existingAttendance, setExistingAttendance] = useState<any>(null);
  const [loadingExistingAttendance, setLoadingExistingAttendance] =
    useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [assignedStaff, setAssignedStaff] = useState<any[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  // P1.5.4 - Learning Engagement state
  const [engagementData, setEngagementData] = useState<
    Record<string, { score?: number; behaviors?: LearningBehavior[]; notes?: string }>
  >({});

  // Helper: is this a practical/lab period where engagement is required?
  const isEngagementRequired = periodMode === 'practical' || isSubdividedSlot;

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
    section_ids: string[];
  } | null>(null);

  // Updated: 2025-01-16 - Leave block checking state
  const [leaveBlockInfo, setLeaveBlockInfo] = useState<LeaveBlockInfo | null>(null);
  const [checkingLeave, setCheckingLeave] = useState(false);

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
        let query = supabase
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
            departments(id, department_name)
          `
          )
          .eq('id', timetableId);

        // Only filter by institution for non-super admins
        if (!isSuperAdmin && profile?.institution_id) {
          query = query.eq('institution_id', profile.institution_id);
        }

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
              logger.error('academic/attendance/mark', 'Failed to fetch section data for URL UUID', sectionError);
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

        // Updated: 2025-10-08 - Fetch semester name from timetable or section
        let semesterName: string | null = null;
        const semesterId =
          sectionData?.semester_id || timetable.semester_id;

        if (semesterId) {
          try {
            const { data: semesterData, error: semesterError } = await supabase
              .from('semesters')
              .select('id, semester_name')
              .eq('id', semesterId)
              .single();

            if (!semesterError && semesterData) {
              const semester = semesterData as { id: string; semester_name: string };
              semesterName = semester.semester_name;
            } else {
              logger.error('academic/attendance/mark', 'Failed to fetch semester name', semesterError);
            }
          } catch (error) {
            logger.error('academic/attendance/mark', 'Error fetching semester data', error);
          }
        } else {
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
          // We need to search through all slots to find where slot.slot_id === periodId
          for (const day in timetableSlots) {
            const daySlots = timetableSlots[day];
            if (daySlots) {
              // Search through all period keys in this day
              for (const periodKey in daySlots) {
                const slot = daySlots[periodKey];
                // Match by slot_id instead of periodKey
                if (slot && slot.slot_id === periodId) {
                  // NEW: Check if this is a subdivided slot (Updated: 2025-10-11)
                  if (
                    slot.is_subdivided &&
                    slot.sub_slots &&
                    slot.sub_slots.length > 0
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
                  if (slot.period_mode === 'practical' && slot.practical_config) {
                    setPeriodMode('practical');
                    setPracticalConfig(slot.practical_config);
                  } else {
                    setPeriodMode('standard');
                    setPracticalConfig(null);
                  }

                  if (
                    slot.section_ids &&
                    Array.isArray(slot.section_ids) &&
                    slot.section_ids.length > 0
                  ) {
                    slotSectionIds = slot.section_ids;

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
                    logger.warn('academic/attendance/mark', 'Slot has no section_ids or empty array', { slotId: slot.slot_id });
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
          degree_id: timetable.degree_id,
          program_id: timetable.program_id,
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

  // Updated: 2025-01-16 - Check for leave blocks on selected date
  useEffect(() => {
    const checkLeaveBlock = async () => {
      if (!date || !contextData || !contextData.institution_id) {
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

        // If blocked, store the leave info
        if (!result.allowed && result.leave) {
          setLeaveBlockInfo(result.leave);
          logger.warn('academic/attendance/mark', 'Date is blocked by approved leave', {
            date,
            leave: result.leave
          });
        } else {
          setLeaveBlockInfo(null);
        }
      } catch (error) {
        logger.error('academic/attendance/mark', 'Error checking leave block', {
          error_message: error instanceof Error ? error.message : 'Unknown error',
          date,
          institution_id: contextData.institution_id,
          section_id: contextData.section_id
        });
        // On error, don't block (fail open)
        setLeaveBlockInfo(null);
      } finally {
        setCheckingLeave(false);
      }
    };

    checkLeaveBlock();
  }, [date, contextData]);

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

      // For multi-section slots, section_ids array should be populated
      // For single-section, section_id should be set
      if (
        !contextData.section_id &&
        (!effectiveSectionIds || effectiveSectionIds.length === 0)
      ) {
        return;
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
          // Updated: Use effective section_ids (practical or context)
          ...(hasMultipleSections
            ? { section_ids: effectiveSectionIds }
            : { section_id: contextData.section_id })
        });

        // If we got 0 students, log a warning
        if (studentsData.length === 0) {
          logger.warn('academic/attendance/mark', 'No students returned - check RLS policy', {
            institutionId: contextData.institution_id,
            sectionId: contextData.section_id
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

        // Initialize attendance data (all present by default)
        const initialAttendance: Record<string, 'Present' | 'Absent'> = {};
        filteredStudents.forEach((student: any) => {
          initialAttendance[student.id] = 'Present';
        });

        setStudents(filteredStudents);
        setAttendanceData(initialAttendance);

        if (filteredStudents.length === 0) {
          if (isSubdividedFromUrl) {
            toast.error(
              `No students assigned to ${subdivisionGroupName || 'this group'}`
            );
          } else {
            toast.error('No students found for this section');
          }
        } else {
          const groupInfo =
            isSubdividedFromUrl && subdivisionGroupName
              ? ` (${subdivisionGroupName})`
              : '';
          toast.success(
            `Loaded ${filteredStudents.length} students${groupInfo}`
          );
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
    practicalSelection
  ]);

  // Check for existing attendance after context is loaded
  useEffect(() => {
    const checkExistingAttendance = async () => {
      if (!contextData || !timetableId || !date) {
        return;
      }

      try {
        setLoadingExistingAttendance(true);

        const existingRecord =
          await AttendanceService.getConsolidatedAttendance(
            timetableId,
            contextData.section_id,
            date,
            periodId || undefined
          );

        if (existingRecord) {
          setExistingAttendance(existingRecord);

          // Show appropriate toast based on user permissions
          if (isSuperAdmin) {
            toast.error(
              'Attendance was already marked for this class. You can review and update it if needed.'
            );
          } else {
            toast.error(
              'Attendance was already marked for this class. This record is read-only.'
            );
          }

          // Pre-populate attendance data from existing record
          if (existingRecord.attendance_data) {
            const existingData: Record<string, 'Present' | 'Absent'> = {};

            // Parse the existing attendance data
            Object.values(existingRecord.attendance_data).forEach(
              (periodData: any) => {
                if (periodData.students && Array.isArray(periodData.students)) {
                  periodData.students.forEach((student: any) => {
                    if (student.student_id && student.status) {
                      existingData[student.student_id] = student.status;
                    }
                  });
                }
              }
            );

            setAttendanceData(existingData);
          }
        } else {
          setExistingAttendance(null);
        }
      } catch (error) {
        logger.error('academic/attendance/mark', 'Error checking existing attendance', error);
        // Don't show error to user, just log it
      } finally {
        setLoadingExistingAttendance(false);
      }
    };

    checkExistingAttendance();
  }, [contextData, timetableId, date, periodId, isSuperAdmin]);

  // Load assigned staff information for the current period
  useEffect(() => {
    const loadAssignedStaff = async () => {
      if (!contextData?.timetable_data || !periodId || !date) {
        return;
      }

      try {
        setLoadingStaff(true);

        // Access the actual timetable data - it's nested in timetable_data.timetable_data
        // The contextData.timetable_data contains the full timetable record,
        // and the actual schedule is in its timetable_data property
        let actualTimetableData = contextData.timetable_data?.timetable_data;

        // Fallback: Check if the days are directly in timetable_data (for backward compatibility)
        if (!actualTimetableData && contextData.timetable_data) {
          // Check if timetable_data has day keys directly
          const hasDirectDays = [
            'MONDAY',
            'TUESDAY',
            'WEDNESDAY',
            'THURSDAY',
            'FRIDAY',
            'SATURDAY',
            'SUNDAY'
          ].some((day) => contextData.timetable_data[day]);

          if (hasDirectDays) {
            actualTimetableData = contextData.timetable_data;
          }
        }

        if (!actualTimetableData) {
          return;
        }

        // Updated: 2025-10-09 - Detect timetable format and use appropriate key
        const timetableFormat =
          contextData.timetable_data?.timetable_format || 'regular';

        let dayKey: string;
        if (timetableFormat === 'batch') {
          // For batch timetables, we need to find the actual date key in timetable_data
          // The slot might have been applied from a different date using "range pattern"
          // So we search through all date keys to find which one contains our periodId

          const timetableKeys = Object.keys(actualTimetableData);
          let foundKey: string | null = null;

          // Search for the period across all dates
          for (const dateKey of timetableKeys) {
            const daySlots = actualTimetableData[dateKey];
            if (daySlots && typeof daySlots === 'object') {
              // Check if this date has our period
              if (
                daySlots[periodId] ||
                Object.values(daySlots).some(
                  (slot: any) => slot?.slot_id === periodId
                )
              ) {
                foundKey = dateKey;

                break;
              }
            }
          }

          // Use found key, or fallback to query date
          dayKey = foundKey || date;
        } else {
          // For regular timetables, use day of week (e.g., "MONDAY")
          dayKey = new Date(date)
            .toLocaleDateString('en-US', { weekday: 'long' })
            .toUpperCase();
        }

        const dayData = actualTimetableData[dayKey];
        if (!dayData) {
          return;
        }

        // Updated: 2025-10-13 - Extract original slot_id for subdivided periods
        // Subdivision periods have IDs like "original-slot-id_group_1"
        // We need to search using the original slot_id
        let searchSlotId = periodId;
        if (periodId && periodId.includes('_group_')) {
          searchSlotId = periodId.split('_group_')[0];
        }

        // Find the specific period slot
        // The periodId might be used as a key directly OR it might be a slot_id within the period data
        let periodSlot = dayData[periodId] || dayData[searchSlotId];

        // If not found directly, search for it as a slot_id
        if (!periodSlot) {
          // Search through all periods in the day to find one with matching slot_id
          for (const [periodKey, slot] of Object.entries(dayData)) {
            if (slot && typeof slot === 'object' && 'slot_id' in slot) {
              if (
                (slot as any).slot_id === periodId ||
                (slot as any).slot_id === searchSlotId
              ) {
                periodSlot = slot as any;
                break;
              }
            }
          }
        }

        if (!periodSlot) {
          return;
        }

        // Updated: 2025-10-13 - Extract staff IDs from subdivision group if applicable
        const staffIds: string[] = [];
        let primaryStaffId: string | null = null;

        // Priority 1: Use subdivision group staff IDs from URL if this is a subdivided period
        if (isSubdividedFromUrl && subdivisionStaffIds) {
          const groupStaffIds = subdivisionStaffIds.split(',');
          staffIds.push(...groupStaffIds);
          primaryStaffId = groupStaffIds[0] || null;
        } else {
          // Priority 2: Get primary staff ID from slot
          if (
            periodSlot.primary_staff_id &&
            typeof periodSlot.primary_staff_id === 'string'
          ) {
            primaryStaffId = periodSlot.primary_staff_id;
            staffIds.push(periodSlot.primary_staff_id);
          }

          // Get additional staff from staff_ids array
          if (
            Array.isArray(periodSlot.staff_ids) &&
            periodSlot.staff_ids.length > 0
          ) {
            periodSlot.staff_ids.forEach((id: string) => {
              if (id && !staffIds.includes(id)) {
                staffIds.push(id);
              }
            });
          }
        }

        if (staffIds.length === 0) {
          logger.warn('academic/attendance/mark', 'No staff IDs found for period');
          setAssignedStaff([]);
          return;
        }

        // Fetch staff information
        const { createClientSupabaseClient } = await import(
          '@/lib/supabase/client'
        );
        const supabase = createClientSupabaseClient();

        const { data: staffData, error: staffError } = await supabase
          .from('staff')
          .select(
            `
            id,
            first_name,
            last_name,
            email,
            institution_email,
            staff_id,
            phone
          `
          )
          .in('id', staffIds);

        if (staffError) {
          logger.error('academic/attendance/mark', 'Error fetching staff data', staffError);
          setAssignedStaff([]);
          return;
        }

        if (staffData) {
          // Mark primary staff and sort
          const enrichedStaffData = staffData
            .map((staff: any) => ({
              ...staff,
              is_primary: staff.id === primaryStaffId,
              full_name: `${staff.first_name || ''} ${
                staff.last_name || ''
              }`.trim()
            }))
            .sort((a, b) => {
              // Primary staff first
              if (a.is_primary && !b.is_primary) return -1;
              if (!a.is_primary && b.is_primary) return 1;
              // Then by name
              return a.full_name.localeCompare(b.full_name);
            });

          setAssignedStaff(enrichedStaffData);
        } else {
          logger.warn('academic/attendance/mark', 'No staff data returned from query');
          setAssignedStaff([]);
        }
      } catch (error) {
        logger.error('academic/attendance/mark', 'Error loading assigned staff', error);
        setAssignedStaff([]);
      } finally {
        setLoadingStaff(false);
      }
    };

    loadAssignedStaff();
  }, [
    contextData,
    periodId,
    date,
    isSubdividedFromUrl,
    subdivisionStaffIds,
    subdivisionGroupName
  ]);

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
  const toggleAttendance = (studentId: string) => {
    setAttendanceData((prev) => ({
      ...prev,
      [studentId]: prev[studentId] === 'Present' ? 'Absent' : 'Present'
    }));
  };

  // Mark all as present/absent
  const markAll = (status: 'Present' | 'Absent') => {
    const newData: Record<string, 'Present' | 'Absent'> = {};
    students.forEach((student) => {
      newData[student.id] = status;
    });
    setAttendanceData(newData);
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
    const effectiveSectionId =
      contextData?.section_id ||
      sectionId ||
      (contextData?.section_ids && contextData.section_ids.length > 0
        ? contextData.section_ids[0]
        : null);

    if (!effectiveSectionId) {
      toast.error(
        'Missing section information. Please go back and select a section.'
      );
      return;
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

    // P1.5.4 - Validate engagement scores for practical/lab periods
    if (isEngagementRequired) {
      const presentStudents = students.filter(s => attendanceData[s.id] === 'Present');
      const missingEngagement = presentStudents.filter(
        s => !engagementData[s.id]?.score || engagementData[s.id].score! < 1
      );
      if (missingEngagement.length > 0) {
        toast.error(
          `Engagement score is required for all present students in practical/lab periods. ${missingEngagement.length} student(s) missing scores.`
        );
        return;
      }
    }

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
            markerEmail =
              staff.email || staff.institution_email || markerEmail;
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
            course_code: 'N/A' // Course code may not be available from practical selection
          }
        : {
            course_id: courseDetails?.id || courseId || '',
            course_name:
              courseDetails?.course_name || courseName || 'Unknown Course',
            course_code: courseDetails?.course_code || 'N/A'
          };

      // Updated: 2025-10-09 - Allow semester-level timetables with multi-section support
      // Use first section from section_ids array for multi-section periods
      const effectiveSectionId =
        contextData?.section_id ||
        sectionId ||
        (contextData?.section_ids && contextData.section_ids.length > 0
          ? contextData.section_ids[0]
          : null);

      if (!effectiveSectionId) {
        logger.error('academic/attendance/mark', 'No valid section ID found');
        toast.error('Missing section information. Please try again.');
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
          faculty_email: staff.email || staff.institution_email || '',
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
          faculty_email: faculty.email || faculty.institution_email || ''
        };
      }

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
            groups: subdivisionGroups.map((group) => ({
              group_order: group.group_order,
              group_name: group.group_name,
              lab_room: group.lab_room,
              max_capacity: group.max_capacity,
              staff_ids: group.staff_ids,
              students: students
                .filter((student) => group.student_ids.includes(student.id))
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
          // P1.5.4 - Period-level engagement metadata
          engagement_required: isEngagementRequired,
          ...(Object.keys(engagementData).length > 0 && {
            average_engagement_score: (() => {
              const scores = Object.values(engagementData)
                .map(e => e.score)
                .filter((s): s is number => s !== undefined && s > 0);
              return scores.length > 0
                ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
                : undefined;
            })()
          }),
          // For non-subdivided or fallback, keep original structure
          students: isSubdividedSlot
            ? [] // Empty for subdivided (data is in groups)
            : students.map((student) => ({
                student_id: student.id,
                section_id:
                  student.section_id ||
                  contextData?.section_id ||
                  effectiveSectionId ||
                  '', // Updated: 2025-10-09 - Ensure section_id is always provided
                status: attendanceData[student.id] || 'Present',
                marked_at: new Date().toISOString(),
                // P1.5.4 - Learning engagement data per student
                ...(engagementData[student.id]?.score && {
                  engagement_score: engagementData[student.id].score
                }),
                ...(engagementData[student.id]?.behaviors && engagementData[student.id].behaviors!.length > 0 && {
                  learning_behaviors: engagementData[student.id].behaviors
                }),
                ...(engagementData[student.id]?.notes && {
                  engagement_notes: engagementData[student.id].notes
                })
              }))
        }
      };

      // Debug: Log the payload being sent

      // Updated: 2025-10-25 - Add practical period support with batch section_ids
      // Save attendance - use validated institution_id
      const result = await saveConsolidatedAttendance({
        timetable_id: timetableId,
        section_id: effectiveSectionId,
        section_ids: practicalSelection
          ? practicalSelection.section_ids // Use section_ids from selected batch
          : contextData?.section_ids && contextData.section_ids.length > 1
          ? contextData.section_ids
          : undefined, // Only include for multi-section or practical periods
        attendance_date: date,
        attendance_data: attendancePayload,
        marked_by: profile?.id || '',
        institution_id: institutionId
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
          toast.success('Redirecting to report details...');
        }, 500);

        setTimeout(() => {
          // Redirect to report details page using the attendance record ID
          if (result.id) {
            router.push(`/academic/attendance/reports/${result.id}`);
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
                    {isSuperAdmin ? (
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => setIsEditMode(true)}
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

        {/* Status Indicator */}
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

        {/* Modern Header with Gradient Background */}
        <div className='relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 p-6 text-white shadow-lg'>
          <div className='absolute inset-0 bg-black/20'></div>
          <div className='relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4'>
            <div className='flex items-center gap-4'>
              <Button
                variant='secondary'
                size='sm'
                onClick={() => router.push('/academic/attendance')}
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
                  {courseName || 'Unknown Course'} • {periodName}
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
              {/* Updated: 2025-10-08 - Support for multi-section display */}
              {contextData?.slot_sections &&
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

                      {/* Updated: 2025-10-08 - Support for multi-section display */}
                      {(contextData?.slot_sections &&
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

                      {loadingStaff ? (
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
                    {courseName || 'N/A'}
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
                    Section:
                  </span>
                  <span className='text-gray-900 dark:text-gray-200 font-semibold'>
                    {contextData.section_name || 'N/A'}
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
              {subdivisionGroups.length} groups. Students are organized by their
              assigned groups below.
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

        {/* P1.5.4 - Engagement Required Alert for Practical/Lab */}
        {isEngagementRequired && (!existingAttendance || isEditMode) && (
          <Alert className='border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700'>
            <Sparkles className='h-4 w-4 text-amber-600 dark:text-amber-400' />
            <AlertDescription className='text-amber-800 dark:text-amber-200'>
              This is a practical/lab session. <strong>Engagement scores are required</strong> for all present students before saving.
              Rate each student 1-5 stars, then optionally add learning behaviors and notes.
            </AlertDescription>
          </Alert>
        )}

        {/* NEW: Practical Attendance Selector (Updated: 2025-10-25) */}
        {periodMode === 'practical' && practicalConfig && !practicalSelection && (
          <PracticalAttendanceSelector
            practicalConfig={practicalConfig}
            periodId={periodId || ''}
            date={date || ''}
            timetableId={timetableId || ''}
            onSelectionComplete={(selection) => {
              setPracticalSelection(selection);
              // Students will be loaded in the existing useEffect when practicalSelection changes
            }}
            onConflictCheck={AttendanceService.checkPracticalConflict}
          />
        )}

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
                    {subdivisionGroups.length} Groups
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
          ) : isSubdividedSlot && subdivisionGroups.length > 0 ? (
            // NEW: Subdivided Attendance Grid (Updated: 2025-10-11)
            <SubdividedAttendanceGrid
              groups={subdivisionGroups}
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
                const group = subdivisionGroups.find(
                  (g) => g.group_order === groupOrder
                );
                if (group) {
                  const newData = { ...attendanceData };
                  group.student_ids.forEach((studentId) => {
                    newData[studentId] = 'Present';
                  });
                  setAttendanceData(newData);
                }
              }}
              onMarkAllGroupAbsent={(groupOrder) => {
                const group = subdivisionGroups.find(
                  (g) => g.group_order === groupOrder
                );
                if (group) {
                  const newData = { ...attendanceData };
                  group.student_ids.forEach((studentId) => {
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
                        <h3 className='font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight'>
                          {student.first_name} {student.last_name}
                        </h3>
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

                      {/* P1.5.4 - Engagement Score (only for present students) */}
                      {attendanceData[student.id] === 'Present' && (
                        <div className='w-full space-y-1.5 pt-1 border-t border-gray-200 dark:border-gray-700'>
                          <div className='flex items-center justify-between'>
                            <span className='text-[10px] font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1'>
                              <Sparkles className='h-3 w-3' />
                              Engagement
                              {isEngagementRequired && <span className='text-red-500'>*</span>}
                            </span>
                            <div className='flex items-center gap-1'>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type='button'
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!existingAttendance || isEditMode) {
                                      setEngagementData(prev => ({
                                        ...prev,
                                        [student.id]: {
                                          ...prev[student.id],
                                          score: prev[student.id]?.score === star ? undefined : star
                                        }
                                      }));
                                    }
                                  }}
                                  disabled={existingAttendance && !isEditMode}
                                  className={cn(
                                    'transition-colors',
                                    (engagementData[student.id]?.score || 0) >= star
                                      ? 'text-amber-400'
                                      : 'text-gray-300 dark:text-gray-600',
                                    !(existingAttendance && !isEditMode) && 'hover:text-amber-300'
                                  )}
                                >
                                  <Star className='h-3.5 w-3.5 fill-current' />
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Behaviors & Notes Popover */}
                          {attendanceData[student.id] === 'Present' && engagementData[student.id]?.score && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type='button'
                                  onClick={(e) => e.stopPropagation()}
                                  className='w-full text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center gap-1'
                                >
                                  <MessageSquare className='h-3 w-3' />
                                  {engagementData[student.id]?.behaviors?.length
                                    ? `${engagementData[student.id].behaviors!.length} behaviors`
                                    : 'Add behaviors'}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                className='w-72 p-3'
                                align='center'
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className='space-y-3'>
                                  <p className='text-xs font-semibold text-gray-700 dark:text-gray-300'>
                                    Learning Behaviors
                                  </p>
                                  <div className='flex flex-wrap gap-1.5'>
                                    {(Object.keys(LEARNING_BEHAVIOR_LABELS) as LearningBehavior[]).map((behavior) => {
                                      const isSelected = engagementData[student.id]?.behaviors?.includes(behavior);
                                      return (
                                        <button
                                          key={behavior}
                                          type='button'
                                          onClick={() => {
                                            if (existingAttendance && !isEditMode) return;
                                            setEngagementData(prev => {
                                              const current = prev[student.id]?.behaviors || [];
                                              const updated = isSelected
                                                ? current.filter(b => b !== behavior)
                                                : [...current, behavior];
                                              return {
                                                ...prev,
                                                [student.id]: {
                                                  ...prev[student.id],
                                                  behaviors: updated
                                                }
                                              };
                                            });
                                          }}
                                          disabled={existingAttendance && !isEditMode}
                                          className={cn(
                                            'px-2 py-1 rounded-full text-[10px] font-medium border transition-colors',
                                            isSelected
                                              ? 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-600'
                                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-700'
                                          )}
                                        >
                                          {LEARNING_BEHAVIOR_LABELS[behavior]}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div>
                                    <p className='text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1'>
                                      Notes
                                    </p>
                                    <Textarea
                                      placeholder='Optional engagement notes...'
                                      value={engagementData[student.id]?.notes || ''}
                                      onChange={(e) => {
                                        setEngagementData(prev => ({
                                          ...prev,
                                          [student.id]: {
                                            ...prev[student.id],
                                            notes: e.target.value
                                          }
                                        }));
                                      }}
                                      disabled={existingAttendance && !isEditMode}
                                      className='h-16 text-xs resize-none'
                                    />
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      )}
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
          courseName={courseName || undefined}
          periodName={periodName || undefined}
          date={date || undefined}
          startTime={startTime || undefined}
          endTime={endTime || undefined}
          existingAttendance={existingAttendance}
        />
      </div>
    </ContentLayout>
  );
}
