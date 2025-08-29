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
  Loader2
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

            // Try to find section by semester name/number
            const semesterMatch = allMatchingSections.find((section) => {
              // Get semester info for each section
              // Note: This is a simplified match, might need adjustment based on your semester naming
              return section.semester_id; // For now, just take the first one with semester_id
            });

            if (semesterMatch) {
              sections = semesterMatch;
              console.log(
                `✅ Selected section based on semester match:`,
                sections
              );
            } else {
              console.log(
                `⚠️ No semester match found, using first section:`,
                sections
              );
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
  }, [timetableId, profile?.institution_id, sectionId, isSuperAdmin]);

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
          attendance_date: date
        });

        const existingRecord =
          await AttendanceService.getConsolidatedAttendance(
            timetableId,
            contextData.section_id,
            date
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
  }, [contextData, timetableId, date, isSuperAdmin]);

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

  // Save attendance
  const handleSaveAttendance = async () => {
    if (!profile?.id) {
      toast.error('User profile not loaded. Please refresh the page.');
      return;
    }

    // For non-super admins, we need institution_id
    if (!isSuperAdmin && !profile?.institution_id) {
      toast.error('Institution information not found. Please refresh the page.');
      return;
    }

    try {
      setSavingAttendance(true);

      // Prepare attendance data
      const attendancePayload = {
        [periodId || '']: {
          period_id: periodId || '',
          period_name: periodName || '',
          course_id: '',
          course_name: courseName || '',
          start_time: startTime || '',
          end_time: endTime || '',
          students: students.map((student) => ({
            student_id: student.id,
            status: attendanceData[student.id] || 'Present',
            marked_at: new Date().toISOString()
          }))
        }
      };

      // Save attendance - use institution_id from context (timetable) for consistency
      const result = await saveConsolidatedAttendance({
        timetable_id: timetableId!,
        section_id: contextData?.section_id || sectionId!,
        attendance_date: date!,
        attendance_data: attendancePayload,
        marked_by: profile.id,
        institution_id: contextData?.institution_id || profile?.institution_id || ''
      });

      if (result) {
        const successMessage = existingAttendance
          ? 'Attendance updated successfully!'
          : 'Attendance saved successfully!';
        toast.success(successMessage);

        // Redirect to report page after delay
        setTimeout(() => {
          toast.loading('Redirecting to attendance report...');
        }, 500);

        setTimeout(() => {
          if (result.id) {
            router.push(`/academic/attendance/reports/${result.id}`);
          } else {
            const reportParams = new URLSearchParams({
              date: date || '',
              section: sectionId || '',
              timetable: timetableId || ''
            });
            router.push(
              `/academic/attendance/reports?${reportParams.toString()}`
            );
          }
        }, 1500);
      }
    } catch (error) {
      console.error('Error saving attendance:', error);
      toast.error('Failed to save attendance');
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

        {/* Header with Back Button */}
        <div className='flex items-center justify-between'>
          <Button
            variant='outline'
            onClick={() => router.push('/academic/attendance')}
          >
            <ArrowLeft className='h-4 w-4 mr-2' />
            Back to Attendance
          </Button>

          <div className='flex items-center gap-2'>
            <Badge variant='outline'>
              <Calendar className='h-3 w-3 mr-1' />
              {date ? format(new Date(date), 'dd MMM yyyy') : 'No date'}
            </Badge>
            <Badge variant='outline'>
              <Clock className='h-3 w-3 mr-1' />
              {startTime} - {endTime}
            </Badge>
          </div>
        </div>

        {/* Class Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <BookOpen className='h-5 w-5' />
              {courseName || 'Unknown Course'}
            </CardTitle>
            <p className='text-sm text-muted-foreground'>
              {periodName} • Section{' '}
              {contextData?.section_name || sectionId || 'Unknown'}
            </p>
          </CardHeader>
        </Card>

        {/* Context Information Card */}
        {contextData && (
          <Card className='mb-6'>
            <CardContent className='p-4'>
              <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2'>
                <Users className='h-5 w-5 text-blue-600 dark:text-blue-500' />
                Class Details
              </h3>
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

        {/* Quick Stats */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          <Card>
            <CardContent className='p-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-sm text-muted-foreground'>
                    Total Students
                  </p>
                  <p className='text-2xl font-bold'>{students.length}</p>
                </div>
                <Users className='h-8 w-8 text-muted-foreground' />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className='p-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-sm text-muted-foreground'>Present</p>
                  <p className='text-2xl font-bold text-green-600'>
                    {presentCount}
                  </p>
                </div>
                <Check className='h-8 w-8 text-green-600' />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className='p-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-sm text-muted-foreground'>Absent</p>
                  <p className='text-2xl font-bold text-red-600'>
                    {absentCount}
                  </p>
                </div>
                <X className='h-8 w-8 text-red-600' />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className='p-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-sm text-muted-foreground'>Attendance %</p>
                  <p className='text-2xl font-bold'>{attendancePercentage}%</p>
                </div>
                <div
                  className={cn(
                    'h-8 w-8 rounded-full',
                    attendancePercentage >= 75 ? 'bg-green-100' : 'bg-red-100'
                  )}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions Bar */}
        <Card>
          <CardContent className='p-4'>
            <div className='flex flex-col md:flex-row gap-4 items-center justify-between'>
              <div className='flex gap-2 w-full md:w-auto'>
                <Input
                  placeholder='Search students...'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className='w-full md:w-64'
                />
              </div>

              <div className='flex gap-2 w-full md:w-auto'>
                <Button
                  variant='outline'
                  onClick={() => markAll('Present')}
                  className='flex-1 md:flex-initial'
                  disabled={existingAttendance && !isEditMode}
                >
                  Mark All Present
                </Button>
                <Button
                  variant='outline'
                  onClick={() => markAll('Absent')}
                  className='flex-1 md:flex-initial'
                  disabled={existingAttendance && !isEditMode}
                >
                  Mark All Absent
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Students List */}
        <Card>
          <CardHeader>
            <CardTitle>Students</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingStudents ? (
              <div className='flex flex-col items-center justify-center py-12 space-y-4'>
                <div className='flex items-center space-x-2'>
                  <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-500'></div>
                  <span className='text-gray-600 dark:text-gray-400 font-medium'>
                    Loading students...
                  </span>
                </div>
                <p className='text-sm text-gray-500 dark:text-gray-500 text-center'>
                  Please wait while we fetch the student roster for this
                  section.
                </p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <Alert>
                <AlertTriangle className='h-4 w-4' />
                <AlertDescription>
                  {searchTerm
                    ? 'No students found matching your search.'
                    : 'No students found in this section.'}
                </AlertDescription>
              </Alert>
            ) : (
              <div className='space-y-2'>
                {filteredStudents.map((student) => (
                  <div
                    key={student.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border transition-colors',
                      attendanceData[student.id] === 'Present'
                        ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                        : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                    )}
                  >
                    <div className='flex items-center gap-3'>
                      <Avatar>
                        <AvatarImage src={student.avatar_url} />
                        <AvatarFallback>
                          {student.first_name?.[0]}
                          {student.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className='font-medium'>
                          {student.first_name} {student.last_name}
                        </p>
                        <p className='text-sm text-muted-foreground'>
                          {student.roll_number} • {student.student_email}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant={
                        attendanceData[student.id] === 'Present'
                          ? 'default'
                          : 'destructive'
                      }
                      size='sm'
                      onClick={() => toggleAttendance(student.id)}
                      disabled={existingAttendance && !isEditMode}
                    >
                      {attendanceData[student.id] === 'Present' ? (
                        <>
                          <Check className='h-4 w-4 mr-1' />
                          Present
                        </>
                      ) : (
                        <>
                          <X className='h-4 w-4 mr-1' />
                          Absent
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save Button - Only show if no existing attendance OR in edit mode */}
        {(!existingAttendance || isEditMode) && (
          <div className='flex justify-end gap-2'>
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
            >
              {isEditMode ? 'Cancel Edit' : 'Cancel'}
            </Button>
            <Button
              onClick={handleSaveAttendance}
              disabled={savingAttendance || students.length === 0}
            >
              {savingAttendance ? (
                <>
                  <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                  {existingAttendance ? 'Updating...' : 'Saving...'}
                </>
              ) : (
                <>
                  <Check className='h-4 w-4 mr-2' />
                  {existingAttendance ? 'Update Attendance' : 'Save Attendance'}
                </>
              )}
            </Button>
          </div>
        )}

        {/* Read-only message for non-super admins */}
        {existingAttendance && !isEditMode && !isSuperAdmin && (
          <div className='flex justify-center'>
            <div className='text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg'>
              <p className='text-gray-600 dark:text-gray-400 text-sm mb-2'>
                📋 This attendance record is view-only
              </p>
              <Button
                variant='outline'
                onClick={() => router.push('/academic/attendance')}
              >
                ← Back to Attendance
              </Button>
            </div>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
