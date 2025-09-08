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
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useAttendanceRoster,
  useConsolidatedAttendance
} from '@/hooks/academic/use-attendance';
import { AttendanceService } from '@/lib/services/academic/attendance-service';
import { AttendanceSummaryModal } from './components/attendance-summary-modal';
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

  // Debug URL parameters
  console.log('📥 Attendance Mark Page - URL parameters:', {
    periodId,
    timetableId,
    sectionId,
    date,
    periodName,
    courseName,
    startTime,
    endTime
  });

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
    console.log('🔄 loadContextData effect triggered:', {
      timetableId,
      institutionId: profile?.institution_id,
      sectionId
    });

    const loadContextData = async () => {
      if (!timetableId) {
        console.log('Missing timetable ID:', { timetableId });
        setLoadingContext(false);
        toast.error('Missing required parameter: timetable ID');
        return;
      }

      // For non-super admins, we need institution_id from profile
      if (!isSuperAdmin && !profile?.institution_id) {
        console.log('Waiting for profile institution_id:', {
          profile,
          isSuperAdmin
        });
        // Don't set loading to false here, let the effect retry
        return;
      }

      try {
        setLoadingContext(true);
        const { createClientSupabaseClient } = await import(
          '@/lib/supabase/client'
        );
        const supabase = createClientSupabaseClient();

        console.log('🔍 Fetching timetable with:', {
          timetableId,
          institutionId: profile?.institution_id,
          isSuperAdmin
        });

        // Build query
        let query = supabase
          .from('timetables')
          .select(
            `
            id,
            timetable_name,
            institution_id,
            academic_year_id,
            degree_id,
            program_id,
            department_id,
            semester,
            section,
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
          console.error('❌ Failed to fetch timetable data:', {
            error: timetableError,
            timetableId,
            institutionId: profile?.institution_id,
            data: timetableData
          });
          toast.error(
            timetableError?.message || 'Failed to load class information'
          );
          setLoadingContext(false);
          return;
        }

        console.log('Timetable data loaded:', timetableData);

        // Extract section information from timetable data
        let resolvedSectionId = sectionId;
        let sectionData = null;

        console.log('Initial sectionId from URL:', sectionId);
        console.log('Section from timetable:', timetableData.section);

        // Priority 1: If we have a section name from timetable, resolve it to UUID
        // This is the most common case since timetables store section names like "A", "B", etc.
        if (timetableData.section) {
          console.log(
            `🔍 Resolving section name "${timetableData.section}" with timetable hierarchy...`
          );

          // First, let's see how many sections match our criteria
          const { data: allMatchingSections, error: countError } =
            await supabase
              .from('sections')
              .select(
                'id, section_name, degree_id, program_id, department_id, semester_id'
              )
              .eq('institution_id', timetableData.institution_id)
              .eq('section_name', timetableData.section)
              .eq('degree_id', timetableData.degree_id)
              .eq('program_id', timetableData.program_id)
              .eq('department_id', timetableData.department_id)
              .eq('is_active', true);

          console.log(
            `📊 Found ${allMatchingSections?.length || 0} sections named "${
              timetableData.section
            }":`,
            allMatchingSections
          );

          // If multiple sections found, try to disambiguate by semester
          let sections = allMatchingSections?.[0];
          if (
            allMatchingSections &&
            allMatchingSections.length > 1 &&
            timetableData.semester
          ) {
            console.log(
              `🎯 Multiple sections found, trying to match by semester: "${timetableData.semester}"`
            );

            try {
              // Fetch semester information for all matching sections to find the correct one
              const sectionIds = allMatchingSections.map((s) => s.id);
              const { data: sectionsWithSemesters, error: semesterError } =
                await supabase
                  .from('sections')
                  .select(
                    `
                  id,
                  section_name,
                  semesters(id, semester_name)
                `
                  )
                  .in('id', sectionIds);

              if (!semesterError && sectionsWithSemesters) {
                console.log(
                  '📚 Sections with semester info:',
                  sectionsWithSemesters
                );

                // Find the section that matches the timetable semester
                const semesterMatch = sectionsWithSemesters.find(
                  (sectionData: any) => {
                    const semesterName = sectionData.semesters?.semester_name;
                    console.log(
                      `Comparing: "${semesterName}" with "${timetableData.semester}"`
                    );

                    // Case-insensitive comparison
                    return (
                      semesterName &&
                      semesterName.toLowerCase() ===
                        timetableData.semester.toLowerCase()
                    );
                  }
                );

                if (semesterMatch) {
                  // Find the corresponding section from our original list
                  sections =
                    allMatchingSections.find(
                      (s) => s.id === semesterMatch.id
                    ) || sections;
                  console.log(
                    `✅ Selected section based on semester match: ${
                      (semesterMatch as any).semesters?.semester_name
                    }`,
                    sections
                  );
                } else {
                  console.log(
                    `⚠️ No semester match found for "${timetableData.semester}", using first section:`,
                    sections
                  );
                }
              } else {
                console.error('Error fetching semester info:', semesterError);
                console.log(
                  '⚠️ Using first section due to semester query error:',
                  sections
                );
              }
            } catch (error) {
              console.error('Error in semester disambiguation:', error);
              console.log('⚠️ Using first section due to error:', sections);
            }
          }

          const sectionError = countError;

          if (!sectionError && sections) {
            resolvedSectionId = sections.id;
            sectionData = sections;
            console.log(
              `✅ Resolved section "${timetableData.section}" to UUID: ${resolvedSectionId}`
            );
            console.log('Section data:', sections);
          } else {
            console.error(
              '❌ Failed to resolve section name to UUID:',
              sectionError
            );
            console.log('Search criteria:', {
              institution_id: timetableData.institution_id,
              section_name: timetableData.section,
              degree_id: timetableData.degree_id,
              program_id: timetableData.program_id,
              department_id: timetableData.department_id
            });

            // Fallback: Try without department filter (sometimes departments don't match exactly)
            console.log(
              '🔄 Trying fallback section resolution without department...'
            );
            const { data: allFallbackSections, error: fallbackCountError } =
              await supabase
                .from('sections')
                .select(
                  'id, section_name, degree_id, program_id, department_id, semester_id'
                )
                .eq('institution_id', timetableData.institution_id)
                .eq('section_name', timetableData.section)
                .eq('degree_id', timetableData.degree_id)
                .eq('program_id', timetableData.program_id)
                .eq('is_active', true);

            console.log(
              `📊 Fallback found ${allFallbackSections?.length || 0} sections:`,
              allFallbackSections
            );

            // Take the first matching section from fallback
            const fallbackSections = allFallbackSections?.[0];
            const fallbackError = fallbackCountError;

            if (!fallbackError && fallbackSections) {
              resolvedSectionId = fallbackSections.id;
              sectionData = fallbackSections;
              console.log(
                `✅ Fallback resolved section "${timetableData.section}" to UUID: ${resolvedSectionId}`
              );
              console.log('Fallback section data:', fallbackSections);
            } else {
              console.error('❌ Fallback also failed:', fallbackError);
            }
          }
        } else if (resolvedSectionId) {
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
            }
          } else {
            // It's a name, resolve to UUID
            const { data: sections, error: sectionError } = await supabase
              .from('sections')
              .select(
                'id, section_name, degree_id, program_id, department_id, semester_id'
              )
              .eq('institution_id', timetableData.institution_id)
              .eq('section_name', resolvedSectionId)
              .eq('is_active', true)
              .maybeSingle();

            if (!sectionError && sections) {
              resolvedSectionId = sections.id;
              sectionData = sections;
              console.log(
                `Resolved section name "${sectionId}" to UUID: ${resolvedSectionId}`
              );
            }
          }
        }

        if (!resolvedSectionId) {
          console.error('❌ Unable to resolve section information');
          console.log('Available data:', {
            sectionFromUrl: sectionId,
            sectionFromTimetable: timetableData.section,
            resolvedSectionId
          });
          toast.error(
            `Unable to resolve section information. Section: ${
              timetableData.section || sectionId || 'Unknown'
            }`
          );
          setLoadingContext(false);
          return;
        }

        // Build complete context similar to search classes
        // Use timetable's institution_id for consistency
        const context = {
          institution_id:
            timetableData.institution_id || profile?.institution_id,
          academic_year_id: timetableData.academic_year_id,
          degree_id: timetableData.degree_id,
          program_id: timetableData.program_id,
          department_id: timetableData.department_id,
          semester_id: sectionData?.semester_id,
          section_id: resolvedSectionId,
          timetable_id: timetableId,
          timetable_data: timetableData,
          section_data: sectionData,
          academic_year_name: (timetableData as any).academic_years
            ?.academic_year_name,
          degree_name: (timetableData as any).degrees?.degree_name,
          program_name: (timetableData as any).programs?.program_name,
          department_name: (timetableData as any).departments?.department_name,
          section_name: sectionData?.section_name || timetableData.section
        };

        setContextData(context);
        console.log('✅ Context data resolved successfully:', context);
      } catch (error) {
        console.error('❌ Error loading context data:', error);
        toast.error(
          error instanceof Error
            ? `Failed to load class context: ${error.message}`
            : 'Failed to load class context'
        );
      } finally {
        setLoadingContext(false);
        console.log('🏁 Context loading finished');
      }
    };

    loadContextData();
  }, [timetableId, profile?.institution_id, profile, sectionId, isSuperAdmin]);

  // Load students using the resolved context
  useEffect(() => {
    const loadStudents = async () => {
      if (!contextData || !contextData.section_id) {
        console.log('Context data not ready or missing section ID');
        return;
      }

      try {
        setLoadingStudents(true);

        console.log('🎯 Fetching students with complete context:', {
          institution_id: contextData.institution_id,
          degree_id: contextData.degree_id,
          program_id: contextData.program_id,
          department_id: contextData.department_id,
          semester_id: contextData.semester_id,
          section_id: contextData.section_id
        });

        const studentsData = await AttendanceService.getStudentsForAttendance({
          institution_id: contextData.institution_id,
          degree_id: contextData.degree_id,
          program_id: contextData.program_id,
          department_id: contextData.department_id,
          semester_id: contextData.semester_id,
          section_id: contextData.section_id
        });

        console.log('Students fetched successfully:', studentsData.length);

        // Initialize attendance data (all present by default)
        const initialAttendance: Record<string, 'Present' | 'Absent'> = {};
        studentsData.forEach((student: any) => {
          initialAttendance[student.id] = 'Present';
        });

        setStudents(studentsData);
        setAttendanceData(initialAttendance);

        if (studentsData.length === 0) {
          toast.info('No students found for this section');
        } else {
          toast.success(`Loaded ${studentsData.length} students`);
        }
      } catch (error) {
        console.error('Error fetching students for attendance:', error);

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
  }, [contextData]);

  // Check for existing attendance after context is loaded
  useEffect(() => {
    const checkExistingAttendance = async () => {
      if (!contextData || !timetableId || !date) {
        return;
      }

      try {
        setLoadingExistingAttendance(true);
        console.log('🔍 Checking for existing attendance...', {
          timetable_id: timetableId,
          section_id: contextData.section_id,
          attendance_date: date,
          period_id: periodId,
          period_id_type: typeof periodId,
          period_id_truthy: !!periodId
        });

        const existingRecord =
          await AttendanceService.getConsolidatedAttendance(
            timetableId,
            contextData.section_id,
            date,
            periodId || undefined
          );

        if (existingRecord) {
          console.log('📋 Found existing attendance record:', existingRecord);
          setExistingAttendance(existingRecord);

          // Show appropriate toast based on user permissions
          if (isSuperAdmin) {
            toast.info(
              'Attendance was already marked for this class. You can review and update it if needed.'
            );
          } else {
            toast.warning(
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

            console.log('📊 Pre-populated attendance data:', existingData);
            setAttendanceData(existingData);
          }
        } else {
          console.log(
            '✨ No existing attendance found - fresh marking session'
          );
          setExistingAttendance(null);
        }
      } catch (error) {
        console.error('Error checking existing attendance:', error);
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

        // Get the day of the week from the date
        const dayOfWeek = new Date(date)
          .toLocaleDateString('en-US', { weekday: 'long' })
          .toUpperCase();

        // Access the actual timetable data - it's nested in timetable_data.timetable_data
        // The contextData.timetable_data contains the full timetable record, 
        // and the actual schedule is in its timetable_data property
        let actualTimetableData = contextData.timetable_data?.timetable_data;
        
        // Fallback: Check if the days are directly in timetable_data (for backward compatibility)
        if (!actualTimetableData && contextData.timetable_data) {
          // Check if timetable_data has day keys directly
          const hasDirectDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
            .some(day => contextData.timetable_data[day]);
          
          if (hasDirectDays) {
            actualTimetableData = contextData.timetable_data;
            console.log('📋 Using direct timetable structure (legacy format)');
          }
        }

        console.log('🔍 Looking for staff assignments for:', {
          dayOfWeek,
          periodId,
          hasTimetableData: !!actualTimetableData,
          timetableDataType: typeof actualTimetableData,
          availableDays: actualTimetableData ? Object.keys(actualTimetableData).filter(key => 
            ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].includes(key)
          ) : []
        });

        if (!actualTimetableData) {
          console.log('❌ No timetable schedule data found. Check timetable structure.');
          console.log('Context timetable_data keys:', contextData.timetable_data ? Object.keys(contextData.timetable_data) : 'No timetable_data');
          return;
        }

        const dayData = actualTimetableData[dayOfWeek];
        if (!dayData) {
          console.log('No timetable data found for day:', dayOfWeek);
          console.log('Available days:', Object.keys(actualTimetableData));
          return;
        }

        // Find the specific period slot
        // The periodId might be used as a key directly OR it might be a slot_id within the period data
        let periodSlot = dayData[periodId];
        
        // If not found directly, search for it as a slot_id
        if (!periodSlot) {
          // Search through all periods in the day to find one with matching slot_id
          for (const [periodKey, slot] of Object.entries(dayData)) {
            if (slot && typeof slot === 'object' && 'slot_id' in slot) {
              if ((slot as any).slot_id === periodId) {
                periodSlot = slot as any;
                console.log(`✅ Found period by slot_id match: periodKey=${periodKey}, slot_id=${periodId}`);
                break;
              }
            }
          }
        }
        
        if (!periodSlot) {
          console.log('❌ No period slot found for periodId:', periodId);
          console.log('Available period keys:', Object.keys(dayData));
          console.log('Searched for slot_id:', periodId);
          // Log first few slots to debug structure
          const sampleSlots = Object.entries(dayData).slice(0, 2);
          sampleSlots.forEach(([key, slot]) => {
            console.log(`Sample slot ${key}:`, { 
              slot_id: (slot as any)?.slot_id,
              course_id: (slot as any)?.course_id,
              staff_ids: (slot as any)?.staff_ids
            });
          });
          return;
        }

        console.log('✅ Found period slot:', {
          course_id: periodSlot.course_id,
          primary_staff_id: periodSlot.primary_staff_id,
          staff_ids: periodSlot.staff_ids,
          is_break_slot: periodSlot.is_break_slot,
          slot_id: periodSlot.slot_id
        });

        // Extract staff IDs from the slot - based on the actual data structure
        const staffIds: string[] = [];
        let primaryStaffId: string | null = null;

        // Get primary staff ID
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

        console.log('📋 Extracted staff IDs:', { staffIds, primaryStaffId });

        if (staffIds.length === 0) {
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
          console.error('Error fetching staff data:', staffError);
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

          console.log('Loaded staff information:', enrichedStaffData);
          setAssignedStaff(enrichedStaffData);
        } else {
          setAssignedStaff([]);
        }
      } catch (error) {
        console.error('Error loading assigned staff:', error);
        setAssignedStaff([]);
      } finally {
        setLoadingStaff(false);
      }
    };

    loadAssignedStaff();
  }, [contextData, periodId, date]);

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

    if (!contextData?.section_id && !sectionId) {
      toast.error('Missing section information. Please try again.');
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

    // Show summary modal
    setShowSummaryModal(true);
  };

  // Actual save logic
  const performSaveAttendance = async () => {
    const institutionId =
      contextData?.institution_id || profile?.institution_id;

    try {
      setSavingAttendance(true);

      // Get current user's staff information for better faculty details
      let facultyName = profile?.full_name || 'Unknown Faculty';
      let facultyEmail = profile?.email || null;

      // Try to get staff details if user is faculty
      if (profile?.role === 'faculty' && profile?.email) {
        try {
          const { createClientSupabaseClient } = await import(
            '@/lib/supabase/client'
          );
          const supabase = createClientSupabaseClient();

          const { data: staffData } = await supabase
            .from('staff')
            .select('first_name, last_name, email, institution_email')
            .or(
              `email.eq.${profile.email},institution_email.eq.${profile.email}`
            )
            .eq('is_active', true)
            .single();

          if (staffData) {
            facultyName =
              `${staffData.first_name || ''} ${
                staffData.last_name || ''
              }`.trim() || facultyName;
            facultyEmail =
              staffData.email || staffData.institution_email || facultyEmail;
          }
        } catch (error) {
          console.warn(
            'Could not fetch staff details, using profile data:',
            error
          );
        }
      }

      // Updated: 2025-09-05 - Get course info from timetable data first, then URL fallback
      const timetableSlotData = contextData?.timetable_data;
      const correctCourseInfo = {
        course_id: timetableSlotData?.course?.id || contextData?.timetable_data?.course?.id || null,
        course_name: timetableSlotData?.course_name || timetableSlotData?.course?.course_name || courseName || 'Unknown Course',
        course_code: timetableSlotData?.course_code || timetableSlotData?.course?.course_code || 'N/A'
      };

      console.log('🔍 Course info resolution:', {
        from_timetable: {
          course_name: timetableSlotData?.course_name,
          course_id: timetableSlotData?.course?.id
        },
        from_url: courseName,
        final_used: correctCourseInfo
      });

      // Prepare attendance data
      const attendancePayload = {
        [periodId || 'default']: {
          period_id: periodId || 'default',
          period_name: periodName || 'Unknown Period',
          course_id: correctCourseInfo.course_id,
          course_name: correctCourseInfo.course_name,
          course_code: correctCourseInfo.course_code,
          start_time: startTime || '',
          end_time: endTime || '',
          faculty_name: facultyName,
          faculty_email: facultyEmail,
          students: students.map((student) => ({
            student_id: student.id,
            status: attendanceData[student.id] || 'Present',
            marked_at: new Date().toISOString()
          }))
        }
      };

      // Debug: Log the payload being sent
      console.log('🔄 Saving attendance with payload:', {
        timetable_id: timetableId,
        section_id: contextData?.section_id || sectionId,
        attendance_date: date,
        attendance_data: attendancePayload,
        marked_by: profile?.id || '',
        institution_id: institutionId
      });

      // Save attendance - use validated institution_id
      const result = await saveConsolidatedAttendance({
        timetable_id: timetableId,
        section_id: contextData?.section_id || sectionId,
        attendance_date: date,
        attendance_data: attendancePayload,
        marked_by: profile?.id || '',
        institution_id: institutionId
      });

      console.log('✅ Save result:', result);

      if (result) {
        const successMessage = existingAttendance
          ? 'Attendance updated successfully!'
          : 'Attendance saved successfully!';
        toast.success(successMessage);

        // Close the summary modal
        setShowSummaryModal(false);

        // Redirect to report page after delay
        setTimeout(() => {
          toast.success('Attendance saved successfully! Redirecting...');
        }, 500);

        setTimeout(() => {
          // Redirect back to attendance page after successful save
          router.push('/academic/attendance');
        }, 1500);
      } else {
        console.error('❌ Save result was null/undefined');
        toast.error('Failed to save attendance - no result returned');
      }
    } catch (error) {
      console.error('❌ Error saving attendance:', error);
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
              <Badge className='bg-white/20 text-white border-white/30 hover:bg-white/30'>
                <Building2 className='h-3 w-3 mr-1' />
                Section {contextData?.section_name || sectionId || 'Unknown'}
              </Badge>
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

                      {contextData?.timetable_data?.semester && (
                        <div className='bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
                          <span className='text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold'>
                            Semester
                          </span>
                          <p className='text-sm font-bold text-gray-900 dark:text-gray-100 mt-1'>
                            {contextData.timetable_data.semester}
                          </p>
                        </div>
                      )}

                      {(contextData?.timetable_data?.section ||
                        contextData?.section_name) && (
                        <div className='bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
                          <span className='text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold'>
                            Section
                          </span>
                          <p className='text-sm font-bold text-gray-900 dark:text-gray-100 mt-1'>
                            Section{' '}
                            {contextData.timetable_data?.section ||
                              contextData.section_name}
                          </p>
                        </div>
                      )}
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
                              <div className={`p-2 rounded-full ${
                                staff.is_primary 
                                  ? 'bg-blue-100 dark:bg-blue-800' 
                                  : 'bg-gray-100 dark:bg-gray-700'
                              }`}>
                                <User className={`h-4 w-4 ${
                                  staff.is_primary 
                                    ? 'text-blue-600 dark:text-blue-400' 
                                    : 'text-gray-600 dark:text-gray-400'
                                }`} />
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

        {/* Modern Student Grid */}
        <div className='space-y-6'>
          <div className='flex items-center justify-between'>
            <h2 className='text-xl font-semibold flex items-center gap-2'>
              <Users className='h-5 w-5 text-blue-600' />
              Student Roster
              <Badge variant='secondary' className='ml-2'>
                {filteredStudents.length}{' '}
                {filteredStudents.length === 1 ? 'Student' : 'Students'}
              </Badge>
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
          ) : filteredStudents.length === 0 ? (
            <Card className='border-0 shadow-lg border-l-4 border-l-amber-500'>
              <CardContent className='p-8'>
                <div className='flex items-center space-x-4'>
                  <div className='bg-amber-100 p-3 rounded-full'>
                    <AlertTriangle className='h-6 w-6 text-amber-600' />
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
                    disabled={savingAttendance || students.length === 0}
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
