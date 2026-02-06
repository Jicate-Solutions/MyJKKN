import { createClientSupabaseClient } from '@/lib/supabase/client';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/utils/enhanced-logger';
import { trackUsage } from '@/lib/utils/track-usage';
import type {
  Timetable,
  CreateTimetableDto,
  UpdateTimetableDto,
  TimetableFilters,
  TimetableListResponse,
  TemplateFilters,
  TemplateListResponse,
  CreateTemplateDto,
  UpdateTemplateDto,
  DayOfWeek
} from '@/types/academics';
import toast from 'react-hot-toast';

export class TimetableService {
  private static supabase = createClientSupabaseClient();

  // Helper method to check if timetable has attendance marked
  static async hasAttendanceMarked(timetableId: string): Promise<{
    hasAttendance: boolean;
    attendanceCount: number;
    markedPeriods: string[];
  }> {
    try {
      const { data: attendanceRecords, error } = (await this.supabase
        .from('student_attendance')
        .select('id, attendance_data')
        .eq('timetable_id', timetableId)) as {
        data: Array<{ id: string; attendance_data: any }> | null;
        error: any;
      };

      if (error) {
        logger.error('academic/timetables', 'Error checking attendance', error);
        return { hasAttendance: false, attendanceCount: 0, markedPeriods: [] };
      }

      if (!attendanceRecords || attendanceRecords.length === 0) {
        return { hasAttendance: false, attendanceCount: 0, markedPeriods: [] };
      }

      // Collect all periods that have attendance marked
      const markedPeriods = new Set<string>();
      let totalAttendanceCount = 0;

      attendanceRecords.forEach((record) => {
        const attendanceData = record.attendance_data || {};
        Object.keys(attendanceData).forEach((periodId) => {
          if (attendanceData[periodId]?.students?.length > 0) {
            markedPeriods.add(periodId);
            totalAttendanceCount++;
          }
        });
      });

      return {
        hasAttendance: markedPeriods.size > 0,
        attendanceCount: attendanceRecords.length,
        markedPeriods: Array.from(markedPeriods)
      };
    } catch (error) {
      logger.error('academic/timetables', 'Error in hasAttendanceMarked', error);
      return { hasAttendance: false, attendanceCount: 0, markedPeriods: [] };
    }
  }

  // Check if a specific period slot has attendance marked
  static async isPeriodSlotLocked(
    timetableId: string,
    periodId: string,
    day?: string, // For regular mode: day of week, for batch mode: date
    isBatch: boolean = false
  ): Promise<{
    isLocked: boolean;
    attendanceCount: number;
    attendanceDate?: string;
  }> {
    try {
      let attendanceQuery: any = this.supabase
        .from('student_attendance')
        .select('id, attendance_data, attendance_date')
        .eq('timetable_id', timetableId);

      // CRITICAL: Only add date filter for batch mode with valid date format
      // Regular mode passes day of week which CANNOT be used as date filter
      if (isBatch) {
        // Validate date format to prevent SQL errors
        const isValidDate = day && /^\d{4}-\d{2}-\d{2}$/.test(day);
        if (isValidDate) {
          attendanceQuery = attendanceQuery.eq('attendance_date', day);
        } else {
          logger.warn('academic/timetables', 'isPeriodSlotLocked: Batch mode but invalid/missing date', { day });
        }
      }

      const { data: attendanceCheck, error } = (await attendanceQuery) as {
        data: Array<{ id: string; attendance_data: any; attendance_date: string }> | null;
        error: any;
      };

      if (error) {
        logger.error('academic/timetables', 'Error checking period lock status', error);
        return { isLocked: false, attendanceCount: 0 };
      }

      if (!attendanceCheck || attendanceCheck.length === 0) {
        return { isLocked: false, attendanceCount: 0 };
      }

      // Check if this specific period/slot has attendance marked
      let isLocked = false;
      let attendanceCount = 0;
      let attendanceDate = '';

      for (const record of attendanceCheck) {
        const attendanceData = record.attendance_data || {};

        // Check multiple possible keys for the period
        const possibleKeys = [
          periodId,
          `${day}_${periodId}`, // day_period format
          `slot_${periodId}` // slot_period format
        ];

        for (const key of possibleKeys) {
          if (attendanceData[key] && attendanceData[key].students?.length > 0) {
            isLocked = true;
            attendanceCount = attendanceData[key].students.length;
            attendanceDate = record.attendance_date;
            break;
          }
        }

        if (isLocked) break;
      }

      return {
        isLocked,
        attendanceCount,
        attendanceDate: attendanceDate || undefined
      };
    } catch (error) {
      logger.error('academic/timetables', 'Error checking period slot lock', error);
      return { isLocked: false, attendanceCount: 0 };
    }
  }

  // Check if a timetable already exists for the given semester and section with overlapping date periods
  static async checkExistingTimetable(data: {
    institution_id: string;
    academic_year_id: string;
    degree_id: string;
    program_id: string;
    department_id: string;
    semester_id: string; // UUID
    section_id?: string; // UUID
    start_date?: string;
    end_date?: string;
  }): Promise<{
    exists: boolean;
    existingTimetable?: Timetable;
    message?: string;
  }> {
    try {
      // If no dates provided, skip date overlap validation
      if (!data.start_date || !data.end_date) {
        return { exists: false };
      }

      // Get all active timetables for the same semester and section
      let query: any = this.supabase
        .from('timetables')
        .select('*')
        .eq('institution_id', data.institution_id)
        .eq('academic_year_id', data.academic_year_id)
        .eq('degree_id', data.degree_id)
        .eq('program_id', data.program_id)
        .eq('department_id', data.department_id)
        .eq('semester_id', data.semester_id)
        .eq('is_active', true);

      // Handle section parameter correctly
      if (data.section_id) {
        query = query.eq('section_id', data.section_id);
      } else {
        query = query.is('section_id', null);
      }

      const { data: existingTimetables, error } = (await query) as {
        data: Array<{
          id: string;
          start_date: string;
          end_date: string;
          timetable_name: string;
          semesters?: { semester_name: string };
          sections?: { section_name: string };
        }> | null;
        error: any;
      };

      if (error) throw error;

      if (existingTimetables && existingTimetables.length > 0) {
        // Check for date period overlaps
        for (const existing of existingTimetables) {
          // Skip if existing timetable doesn't have dates
          if (!existing.start_date || !existing.end_date) continue;

          // Check for overlap: two periods overlap if one starts before the other ends
          const newStart = new Date(data.start_date);
          const newEnd = new Date(data.end_date);
          const existingStart = new Date(existing.start_date);
          const existingEnd = new Date(existing.end_date);

          // Overlap condition: (newStart <= existingEnd) && (newEnd >= existingStart)
          const hasOverlap = newStart <= existingEnd && newEnd >= existingStart;

          if (hasOverlap) {
            const formatDate = (dateStr: string) =>
              new Date(dateStr).toLocaleDateString();

            const semesterName =
              existing.semesters?.semester_name || 'Unknown Semester';
            const sectionName = existing.sections?.section_name || null;

            return {
              exists: true,
              existingTimetable: existing as any,
              message: `A timetable already exists for ${semesterName}${
                sectionName ? ` - Section ${sectionName}` : ''
              } with overlapping date period.

Existing: "${existing.timetable_name}" (${formatDate(
                existing.start_date
              )} to ${formatDate(existing.end_date)})
New: ${formatDate(data.start_date)} to ${formatDate(data.end_date)}

Please select a different date period that doesn't overlap.`
            };
          }
        }
      }

      return { exists: false };
    } catch (error) {
      logger.error('academic/timetables', 'Error checking existing timetable', error);
      throw error;
    }
  }

  static async createTimetable(data: CreateTimetableDto): Promise<Timetable> {
    try {
      // Use the new date-based validation method
      const existingCheck = await this.checkExistingTimetable({
        institution_id: data.institution_id,
        academic_year_id: data.academic_year_id,
        degree_id: data.degree_id,
        program_id: data.program_id,
        department_id: data.department_id,
        semester_id: data.semester_id!, // Use semester_id instead of semester text
        section_id: data.section_id || undefined, // Use section_id instead of section text
        start_date: data.start_date,
        end_date: data.end_date
      });

      if (existingCheck.exists) {
        // Show detailed error toast for date overlap
        toast.error(
          `⚠️ Date Period Conflict Detected!\n\n${existingCheck.message}`,
          {
            duration: 8000,
            position: 'top-center',
            style: {
              background: '#FEF2F2',
              color: '#991B1B',
              border: '1px solid #FCA5A5',
              maxWidth: '500px',
              whiteSpace: 'pre-line'
            }
          }
        );
        throw new Error(
          existingCheck.message ||
            'Timetable with overlapping date period already exists.'
        );
      }

      // Proceed with creating the new timetable
      // Create clean data object without any form-only fields
      const {
        institution_id,
        academic_year_id,
        degree_id,
        program_id,
        department_id,
        semester_id,
        section_id,
        timetable_name,
        is_active,
        is_template,
        template_name,
        template_description,
        template_category,
        template_tags,
        created_from_template_id,
        start_date,
        end_date,
        selected_dates,
        timetable_format,
        timetable_data,
        periods
      } = data;

      // Determine timetable type based on section_id
      // Updated: 2025-10-08 - Added support for semester-level timetables
      const timetable_type = section_id ? 'section' : 'semester';

      const timetableData = {
        institution_id,
        academic_year_id,
        degree_id,
        program_id,
        department_id,
        semester_id,
        section_id: section_id || null, // Explicitly null for semester-level
        timetable_name,
        timetable_type, // New field
        is_active: is_active ?? true,
        is_template: is_template ?? false,
        template_name: template_name || null,
        template_description: template_description || null,
        template_category: template_category || null,
        template_tags: template_tags || null,
        created_from_template_id: created_from_template_id || null,
        start_date: start_date || null,
        end_date: end_date || null,
        selected_dates: selected_dates || null,
        timetable_format: timetable_format || 'regular',
        timetable_data: timetable_data || {}, // Provide empty object as default
        periods: periods || [] // Provide empty array as default for periods
      };

      const insertData: any = {
        ...timetableData,
        created_by: (await this.supabase.auth.getUser()).data.user?.id
      };

      const { data: timetable, error } = (await (this.supabase as any)
        .from('timetables')
        .insert([insertData])
        .select('*')
        .single()) as { data: Timetable | null; error: any };

      if (error) {
        logger.error('academic/timetables', 'Error creating timetable', error);
        if (error.code === '23505') {
          toast.error(
            '⚠️ This timetable configuration already exists. Please check your semester and section selection.',
            {
              duration: 5000,
              position: 'top-center'
            }
          );
        } else {
          toast.error('Failed to create timetable. Please try again.', {
            duration: 4000,
            position: 'top-center'
          });
        }
        throw new Error('Failed to create timetable.');
      }

      trackUsage({ module: 'academic/timetables', feature: 'create_timetable', eventType: 'create' });
      return timetable;
    } catch (error) {
      logger.error('academic/timetables', 'Error in createTimetable service', error);
      throw error;
    }
  }

  // Updated: 2025-12-11 - Added isSuperAdmin parameter to allow super admins to bypass attendance lock
  static async updateTimetable(
    id: string,
    data: UpdateTimetableDto,
    isSuperAdmin: boolean = false
  ): Promise<Timetable> {
    try {
      // Define fields that are safe to update even when attendance exists
      // Updated: 2025-11-17 - Added periods to safe fields (changing period list doesn't affect existing attendance)
      // Updated: 2025-12-11 - Added start_date, end_date to safe fields (metadata changes don't affect existing attendance)
      const safeFields = [
        'selected_days',
        'selected_dates',
        'timetable_format',
        'timetable_name',
        'start_date',
        'end_date',
        'periods',
        'is_active',
        'is_template',
        'template_name',
        'template_description',
        'template_category',
        'template_tags'
      ];

      // Check if any unsafe fields are being modified
      const updateKeys = Object.keys(data);
      const hasUnsafeChanges = updateKeys.some(
        (key) => !safeFields.includes(key)
      );

      // First check if this timetable has any attendance records
      const { data: attendanceRecords, error: attendanceCheckError } = (await this.supabase
        .from('student_attendance')
        .select('id')
        .eq('timetable_id', id)
        .limit(1)) as {
        data: Array<{ id: string }> | null;
        error: any;
      };

      if (attendanceCheckError) {
        logger.error('academic/timetables', 'Error checking attendance records', attendanceCheckError);
        throw attendanceCheckError;
      }

      // If attendance records exist, only block unsafe modifications (unless super admin)
      // Super admins can bypass this restriction to make emergency changes
      if (attendanceRecords && attendanceRecords.length > 0 && hasUnsafeChanges && !isSuperAdmin) {
        const errorMessage =
          'Cannot modify this timetable structure because attendance has been marked. Once attendance is recorded, the timetable structure becomes locked to preserve data integrity. You can still update days, dates, and other configuration settings.';

        toast.error(errorMessage, {
          duration: 6000,
          position: 'top-center',
          style: {
            background: '#FEF2F2',
            color: '#991B1B',
            border: '1px solid #FCA5A5',
            maxWidth: '500px'
          }
        });

        throw new Error(errorMessage);
      }

      // Get current timetable info for conflict checking
      const { data: currentTimetable, error: fetchError } = (await this.supabase
        .from('timetables')
        .select('*')
        .eq('id', id)
        .single()) as {
        data: any | null;
        error: any;
      };

      if (fetchError) throw fetchError;
      if (!currentTimetable) throw new Error('Timetable not found');

      // Build the updated timetable data by merging current with updates
      const updatedTimetableData = {
        institution_id: data.institution_id || currentTimetable.institution_id,
        academic_year_id:
          data.academic_year_id || currentTimetable.academic_year_id,
        degree_id: data.degree_id || currentTimetable.degree_id,
        program_id: data.program_id || currentTimetable.program_id,
        department_id: data.department_id || currentTimetable.department_id,
        semester_id: data.semester_id || currentTimetable.semester_id,
        section_id:
          data.section_id !== undefined
            ? data.section_id
            : currentTimetable.section_id || undefined,
        start_date: data.start_date || currentTimetable.start_date,
        end_date: data.end_date || currentTimetable.end_date
      };

      // Check for conflicts only if both dates are provided
      if (updatedTimetableData.start_date && updatedTimetableData.end_date) {
        try {
          const existingCheck = await this.checkExistingTimetable(
            updatedTimetableData
          );

          // Filter out the current timetable from conflicts
          if (
            existingCheck.exists &&
            (existingCheck.existingTimetable as any)?.id !== id
          ) {
            toast.error(
              `⚠️ Date Period Conflict Detected!\n\n${existingCheck.message}`,
              {
                duration: 8000,
                position: 'top-center',
                style: {
                  background: '#FEF2F2',
                  color: '#991B1B',
                  border: '1px solid #FCA5A5',
                  maxWidth: '500px',
                  whiteSpace: 'pre-line'
                }
              }
            );
            throw new Error(
              existingCheck.message ||
                'Date period overlaps with existing timetable.'
            );
          }
        } catch (conflictError) {
          logger.error('academic/timetables', 'Error during conflict checking', conflictError);
          throw conflictError;
        }
      }

      // Filter out undefined values and constraint-related fields
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      // Only include fields that are explicitly provided and not part of the unique constraint
      // Updated: 2025-10-08 - Added timetable_type to allowed fields
      // Updated: 2025-11-17 - Added periods to allowed fields to fix period configuration save issue
      const allowedFields = [
        'timetable_format',
        'timetable_type',
        'start_date',
        'end_date',
        'selected_dates',
        'timetable_name',
        'selected_days',
        'periods',
        'institution_id',
        'academic_year_id',
        'degree_id',
        'program_id',
        'department_id',
        'semester_id',
        'section_id',
        'is_active',
        'is_template',
        'template_name',
        'template_description',
        'template_category',
        'template_tags'
      ];

      for (const field of allowedFields) {
        if (data[field as keyof UpdateTimetableDto] !== undefined) {
          updateData[field] = data[field as keyof UpdateTimetableDto];
        }
      }

      const { data: timetable, error } = (await (this.supabase as any)
        .from('timetables')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()) as { data: Timetable | null; error: any };

      if (error) {
        if (error.code === '23505') {
          toast.error(
            '⚠️ Cannot update: This configuration would create a duplicate timetable.\n\nTimetables with overlapping date periods are not allowed for the same semester and section.',
            {
              duration: 5000,
              position: 'top-center',
              style: {
                background: '#FEF2F2',
                color: '#991B1B'
              }
            }
          );
        } else {
          toast.error(
            'Failed to update timetable configuration. Please try again.',
            {
              duration: 4000,
              position: 'top-center'
            }
          );
        }
        throw error;
      }

      trackUsage({ module: 'academic/timetables', feature: 'update_timetable', eventType: 'update' });
      toast.success('Timetable configuration saved successfully!', {
        duration: 3000,
        position: 'top-center',
        style: {
          background: '#F0FDF4',
          color: '#166534'
        }
      });
      return timetable;
    } catch (error) {
      logger.error('academic/timetables', 'Error updating timetable', error);
      throw error;
    }
  }

  static async deleteTimetable(id: string, showToast = true): Promise<void> {
    try {
      // First check if this timetable has any attendance records
      const { data: attendanceRecords, error: attendanceCheckError } = (await this.supabase
        .from('student_attendance')
        .select('id')
        .eq('timetable_id', id)
        .limit(1)) as {
        data: Array<{ id: string }> | null;
        error: any;
      };

      if (attendanceCheckError) {
        logger.error('academic/timetables', 'Error checking attendance records', attendanceCheckError);
        throw attendanceCheckError;
      }

      // If attendance records exist, prevent deletion
      if (attendanceRecords && attendanceRecords.length > 0) {
        const errorMessage =
          'Cannot delete this timetable because it has associated attendance records. The timetable is being used to track student attendance and must be preserved for record-keeping purposes. You can still edit the timetable if needed.';

        if (showToast) {
          toast.error(errorMessage, {
            duration: 6000,
            position: 'top-center',
            style: {
              background: '#FEF2F2',
              color: '#991B1B',
              border: '1px solid #FCA5A5',
              maxWidth: '500px'
            }
          });
        }

        throw new Error(errorMessage);
      }

      // If no attendance records, proceed with deletion
      // With the new JSON-based structure, we only need to delete the timetable record
      // All slots and periods are stored in the timetable_data JSONB column
      const { error } = await this.supabase
        .from('timetables')
        .delete()
        .eq('id', id);

      if (error) throw error;

      trackUsage({ module: 'academic/timetables', feature: 'delete_timetable', eventType: 'delete' });
      if (showToast) {
        toast.success('Timetable deleted successfully');
      }
    } catch (error) {
      logger.error('academic/timetables', 'Error deleting timetable', error);
      throw error;
    }
  }

  static async bulkDeleteTimetables(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    const hasAttendanceRecords: string[] = [];

    // Process deletions sequentially
    for (const id of ids) {
      try {
        await this.deleteTimetable(id, false); // Pass false to suppress individual toasts
        success.push(id);
      } catch (error) {
        logger.error('academic/timetables', `Error deleting timetable ${id}`, error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        // Check if it's an attendance-related error
        if (errorMessage.includes('attendance records')) {
          hasAttendanceRecords.push(id);
        }

        failed.push({
          id,
          error: errorMessage
        });
      }
    }

    if (hasAttendanceRecords.length > 0) {
      toast.error(
        `Cannot delete ${hasAttendanceRecords.length} timetable(s) because they have associated attendance records. These timetables are being used to track student attendance and must be preserved. You can still edit them if needed.`,
        {
          duration: 6000,
          position: 'top-center',
          style: {
            background: '#FEF2F2',
            color: '#991B1B',
            border: '1px solid #FCA5A5',
            maxWidth: '500px'
          }
        }
      );
    } else if (failed.length > 0) {
      toast.error(
        `Failed to delete ${failed.length} timetable(s). See console for details.`
      );
    }

    return { success, failed };
  }

  // Helper method to get available semesters that have timetables
  static async getAvailableSemesters(institutionId?: string): Promise<
    Array<{
      id: string;
      semester_name: string;
      institution_id: string;
      degree_id: string;
      department_id: string;
      program_id: string;
    }>
  > {
    try {
      const { data, error } = await this.supabase
        .from('timetables')
        .select(
          `
          semester_id,
          semesters:semester_id(id, semester_name, institution_id, degree_id, department_id, program_id)
        `
        )
        .eq('is_active', true)
        .not('semester_id', 'is', null)
        .then((result) => {
          if (result.error) return result;

          // Extract unique semesters
          const uniqueSemesters = new Map();
          result.data?.forEach((item: any) => {
            if (item.semesters) {
              uniqueSemesters.set(item.semesters.id, item.semesters);
            }
          });

          return {
            data: Array.from(uniqueSemesters.values()),
            error: result.error
          };
        });

      if (error) {
        logger.error('academic/timetables', 'Error fetching available semesters', error);
        return [];
      }

      let filteredData = data || [];

      if (institutionId) {
        filteredData = filteredData.filter(
          (sem) => sem.institution_id === institutionId
        );
      }

      return filteredData;
    } catch (error) {
      logger.error('academic/timetables', 'Error in getAvailableSemesters', error);
      return [];
    }
  }

  // Helper method to get available sections that have timetables
  static async getAvailableSections(
    institutionId?: string,
    semesterId?: string
  ): Promise<
    Array<{
      id: string;
      section_name: string;
      institution_id: string;
      semester_id: string;
    }>
  > {
    try {
      let query = this.supabase
        .from('timetables')
        .select(
          `
          section_id,
          sections:section_id(id, section_name, institution_id, semester_id)
        `
        )
        .eq('is_active', true)
        .not('section_id', 'is', null);

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      if (semesterId) {
        query = query.eq('semester_id', semesterId);
      }

      const { data, error } = await query.then((result) => {
        if (result.error) return result;

        // Extract unique sections
        const uniqueSections = new Map();
        result.data?.forEach((item: any) => {
          if (item.sections) {
            uniqueSections.set(item.sections.id, item.sections);
          }
        });

        return {
          data: Array.from(uniqueSections.values()),
          error: result.error
        };
      });

      if (error) {
        logger.error('academic/timetables', 'Error fetching available sections', error);
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('academic/timetables', 'Error in getAvailableSections', error);
      return [];
    }
  }

  static async getTimetables(
    filters: TimetableFilters = {}
  ): Promise<TimetableListResponse> {
    try {
      // Check authentication status first
      const {
        data: { user },
        error: authError
      } = await this.supabase.auth.getUser();

      if (authError) {
        logger.error('academic/timetables', 'Authentication error', authError);
        throw new Error(`Authentication error: ${authError.message}`);
      }

      if (!user) {
        logger.error('academic/timetables', 'No authenticated user found');
        throw new Error('User not authenticated');
      }

      let query = (this.supabase as any).from('timetables').select(
        `
          *,
          institution:institution_id(id, name),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name),
          semesters:semester_id(id, semester_name),
          sections:section_id(id, section_name)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.ilike('timetable_name', `%${filters.search}%`);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.academic_year_id) {
        query = query.eq('academic_year_id', filters.academic_year_id);
      }

      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
      }

      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.semester) {
        // Frontend sends semester.id (UUID), so filter by semester_id
        query = query.eq('semester_id', filters.semester);
      }

      // FIXED: 2025-11-24 - Section filter was not working because PostgREST cannot filter on joined table fields directly
      // We need to look up the section IDs first, then filter by section_id
      if (filters.section) {
        try {
          // Frontend sends section.section_name (string "A", "B", etc.)
          // We need to convert this to section IDs first
          const sectionsResponse = (await this.supabase
            .from('sections')
            .select('id')
            .eq('section_name', filters.section)) as {
            data: Array<{ id: string }> | null;
            error: any;
          };

          if (sectionsResponse.data && sectionsResponse.data.length > 0) {
            const sectionIds = sectionsResponse.data.map((s) => s.id);
            query = query.in('section_id', sectionIds);
          } else {
            // If no sections found with this name, return empty result
            // by filtering with an impossible condition
            query = query.eq('id', '00000000-0000-0000-0000-000000000000');
          }
        } catch (sectionError) {
          logger.error('academic/timetables', 'Error fetching section IDs for filter', sectionError);
          // On error, don't apply the filter to avoid breaking the query
        }
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.is_template !== undefined) {
        query = query.eq('is_template', filters.is_template);
      }

      if (filters.timetable_type !== undefined) {
        query = query.eq('timetable_type', filters.timetable_type);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const start = (page - 1) * limit;

      query = query.range(start, start + limit - 1);

      // Default order by timetable_name
      query = query.order('timetable_name', { ascending: true });

      const { data, error, count } = await query;

      if (error) {
        logger.error('academic/timetables', 'Database query error', { error, message: error.message, details: error.details, hint: error.hint, code: error.code });

        throw new Error(
          `Database error: ${error.message}${
            error.hint ? ` (Hint: ${error.hint})` : ''
          }`
        );
      }

      const result = {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };

      return result;
    } catch (error) {
      logger.error('academic/timetables', 'Error fetching timetables', error);
      throw error;
    }
  }

  static async getTimetable(id: string): Promise<Timetable> {
    try {
      const { data: timetable, error } = (await this.supabase
        .from('timetables')
        .select(
          `
          *,
          institution:institution_id(id, name),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name),
          semesters:semester_id(id, semester_name),
          sections:section_id(id, section_name)
        `
        )
        .eq('id', id)
        .single()) as { data: any | null; error: any };

      if (error) throw error;
      if (!timetable) throw new Error('Timetable not found');

      // Updated: 2025-10-08 - For semester-level timetables, fetch all available sections
      if (timetable && timetable.timetable_type === 'semester' && timetable.semester_id) {
        const { data: semesterSections, error: sectionsError } = (await this.supabase
          .from('sections')
          .select('id, section_name, student_count:students(count)')
          .eq('semester_id', timetable.semester_id)
          .eq('is_active', true)
          .order('section_name')) as {
          data: any[] | null;
          error: any;
        };

        if (!sectionsError && semesterSections) {
          timetable.available_sections = semesterSections.map((s: any) => ({
            ...s,
            student_count: s.student_count?.[0]?.count || 0
          }));
        }
      }

      // Enrich timetable data with course and staff details
      if (timetable && timetable.timetable_data) {
        const enrichedTimetable = await this.enrichTimetableWithDetails(
          timetable
        );
        return enrichedTimetable;
      }

      return timetable;
    } catch (error) {
      logger.error('academic/timetables', 'Error fetching timetable', error);
      throw error;
    }
  }

  // Helper method to enrich timetable data with course and staff details
  private static async enrichTimetableWithDetails(
    timetable: any
  ): Promise<Timetable> {
    try {
      const timetableData = timetable.timetable_data;
      if (!timetableData || typeof timetableData !== 'object') {
        return timetable;
      }

      // Extract all unique course IDs and staff IDs from the timetable data
      // Updated: 2025-10-13 - Also extract from sub_slots for subdivided/combined classes
      const courseIds = new Set<string>();
      const staffIds = new Set<string>();

      Object.values(timetableData).forEach((daySlots: any) => {
        if (daySlots && typeof daySlots === 'object') {
          Object.values(daySlots).forEach((slot: any) => {
            if (slot && typeof slot === 'object') {
              // Extract from main slot
              if (slot.course_id) {
                courseIds.add(slot.course_id);
              }
              if (slot.staff_ids && Array.isArray(slot.staff_ids)) {
                slot.staff_ids.forEach((staffId: string) =>
                  staffIds.add(staffId)
                );
              }
              if (slot.primary_staff_id) {
                staffIds.add(slot.primary_staff_id);
              }

              // CRITICAL FIX: Also extract from sub_slots (for subdivided and combined classes)
              if (slot.sub_slots && Array.isArray(slot.sub_slots)) {
                slot.sub_slots.forEach((subSlot: any) => {
                  if (subSlot.course_id) {
                    courseIds.add(subSlot.course_id);
                  }
                  if (subSlot.staff_ids && Array.isArray(subSlot.staff_ids)) {
                    subSlot.staff_ids.forEach((staffId: string) =>
                      staffIds.add(staffId)
                    );
                  }
                });
              }
            }
          });
        }
      });

      // Fetch course details with institution filter for RLS
      const coursesMap = new Map();
      if (courseIds.size > 0) {
        const courseIdsArray = Array.from(courseIds);

        const { data: courses, error: coursesError } = (await this.supabase
          .from('courses')
          .select('id, course_name, course_code, institution_id, is_active')
          .in('id', courseIdsArray)
          .eq('institution_id', timetable.institution_id)) as {
          data: Array<{ id: string; course_name: string; course_code: string; institution_id: string; is_active: boolean }> | null;
          error: any;
        };

        if (coursesError) {
          logger.error('academic/timetables', 'Error fetching courses', { error: coursesError, courseIdsArray });
        } else if (courses) {
          courses.forEach((course) => coursesMap.set(course.id, course));
        }
      }

      // Fetch staff details with institution filter for RLS
      const staffMap = new Map();
      if (staffIds.size > 0) {
        const staffIdsArray = Array.from(staffIds);

        // RLS policy has been updated to allow students to view staff

        const { data: staff, error: staffError } = (await this.supabase
          .from('staff')
          .select(
            'id, first_name, last_name, email, phone, staff_id, institution_id'
          )
          .in('id', staffIdsArray)
          .eq('institution_id', timetable.institution_id)) as {
          data: Array<{ id: string; first_name: string; last_name: string; email: string; phone: string; staff_id: string; institution_id: string }> | null;
          error: any;
        };

        if (staffError) {
          logger.error('academic/timetables', 'Error fetching staff', { error: staffError, staffIdsArray, institutionId: timetable.institution_id });
        } else if (staff) {
          staff.forEach((staffMember) =>
            staffMap.set(staffMember.id, staffMember)
          );
        } else {
          logger.warn('academic/timetables', 'No staff data returned for IDs', { staffIdsArray });
        }
      }

      // Enrich the timetable data with actual course and staff objects
      const enrichedTimetableData = { ...timetableData };

      Object.keys(enrichedTimetableData).forEach((day) => {
        const daySlots = enrichedTimetableData[day];
        if (daySlots && typeof daySlots === 'object') {
          Object.keys(daySlots).forEach((periodId) => {
            const slot = daySlots[periodId];
            if (slot && typeof slot === 'object' && !slot.is_break_slot) {
              // Add course details
              if (slot.course_id && coursesMap.has(slot.course_id)) {
                slot.course = coursesMap.get(slot.course_id);
              }

              // Add staff details
              if (slot.staff_ids && Array.isArray(slot.staff_ids)) {
                slot.staff_members = slot.staff_ids
                  .map((staffId: string) => staffMap.get(staffId))
                  .filter(Boolean);
              }

              // Add primary staff details for backward compatibility
              if (
                slot.primary_staff_id &&
                staffMap.has(slot.primary_staff_id)
              ) {
                slot.staff = staffMap.get(slot.primary_staff_id);
              }

              // Updated: 2025-11-07 - Enrich practical_config with course details
              if (slot.period_mode === 'practical' && slot.practical_config) {
                const practicalConfig = slot.practical_config;

                // Enrich available_courses with full course objects
                if (practicalConfig.available_courses && Array.isArray(practicalConfig.available_courses)) {
                  practicalConfig.available_courses = practicalConfig.available_courses.map((courseOption: any) => {
                    const courseId = courseOption.course_id || courseOption;
                    if (typeof courseId === 'string' && coursesMap.has(courseId)) {
                      const courseDetails = coursesMap.get(courseId);
                      return {
                        course_id: courseId,
                        course_name: courseDetails.course_name,
                        course_code: courseDetails.course_code
                      };
                    }
                    return courseOption;
                  }).filter(Boolean);
                }

                // Enrich batches with course details for assigned_courses
                if (practicalConfig.batches && Array.isArray(practicalConfig.batches)) {
                  practicalConfig.batches = practicalConfig.batches.map((batch: any) => {
                    // Keep all batch properties
                    const enrichedBatch = { ...batch };

                    // Enrich assigned_courses if present
                    if (batch.assigned_courses && Array.isArray(batch.assigned_courses)) {
                      // Store both IDs (for functionality) and enriched details (for display)
                      enrichedBatch.assigned_courses = batch.assigned_courses;
                      enrichedBatch.enriched_courses = batch.assigned_courses
                        .map((courseId: string) => {
                          if (coursesMap.has(courseId)) {
                            return coursesMap.get(courseId);
                          }
                          return null;
                        })
                        .filter(Boolean);
                    }

                    return enrichedBatch;
                  });
                }
              }

              // Updated: 2025-10-13 - CRITICAL: Also enrich sub_slots with course and staff objects
              if (slot.sub_slots && Array.isArray(slot.sub_slots) && slot.sub_slots.length > 0) {
                // CRITICAL FIX: Auto-detect if this is a subdivided slot
                // Check if sub_slots have student_ids or group_name (indicators of subdivision)
                const hasSubdivisionData = slot.sub_slots.some((s: any) =>
                  s.student_ids?.length > 0 || s.group_name
                );

                if (hasSubdivisionData && !slot.is_subdivided) {
                  slot.is_subdivided = true;
                  // Set subdivision type if not present
                  if (!slot.subdivision_type) {
                    slot.subdivision_type = 'practical'; // Default
                  }
                  // Set subdivision mode if not present
                  if (!slot.subdivision_mode) {
                    slot.subdivision_mode = 'manual'; // Default
                  }
                }

                slot.sub_slots = slot.sub_slots.map((subSlot: any, index: number) => {
                  // Enrich course
                  if (subSlot.course_id && coursesMap.has(subSlot.course_id)) {
                    subSlot.course = coursesMap.get(subSlot.course_id);
                  }

                  // Enrich staff
                  if (subSlot.staff_ids && Array.isArray(subSlot.staff_ids)) {
                    subSlot.staff_members = subSlot.staff_ids
                      .map((staffId: string) => staffMap.get(staffId))
                      .filter(Boolean);
                  }

                  return subSlot;
                });
              }

              // Set period_id and day_of_week for easier access
              slot.period_id = periodId;
              slot.day_of_week = day;
            }
          });
        }
      });

      // CRITICAL FIX: 2025-11-19 - Handle batch mode timetables with individual date keys
      // Group individual dates under their range markers for grid compatibility
      if (timetable.selected_dates && Array.isArray(timetable.selected_dates) && timetable.selected_dates.length > 0) {
        // Check if timetable_data has individual date keys (legacy format)
        const hasIndividualDates = Object.keys(enrichedTimetableData).some(
          key => !key.startsWith('RANGE:') && /^\d{4}-\d{2}-\d{2}$/.test(key)
        );

        if (hasIndividualDates) {
          const regroupedData: any = {};

          // For each range marker in selected_dates
          timetable.selected_dates.forEach((rangeMarker: string) => {
            if (rangeMarker.startsWith('RANGE:')) {
              const parts = rangeMarker.split(':');
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

                // Merge slots from all dates in this range
                // Updated: 2025-12-01 - Fixed to prefer slots with most complete data (most staff)
                const mergedSlots: any = {};
                rangeDates.forEach(date => {
                  if (enrichedTimetableData[date]) {
                    Object.keys(enrichedTimetableData[date]).forEach(periodId => {
                      const currentSlot = enrichedTimetableData[date][periodId];
                      const existingSlot = mergedSlots[periodId];

                      if (!existingSlot) {
                        // No existing slot, use this one
                        mergedSlots[periodId] = currentSlot;
                      } else {
                        // Compare and use the more complete slot (with more staff)
                        const existingStaffCount = existingSlot.staff_ids?.length || 0;
                        const currentStaffCount = currentSlot.staff_ids?.length || 0;

                        if (currentStaffCount > existingStaffCount) {
                          // Current slot has more staff - prefer it
                          mergedSlots[periodId] = currentSlot;
                        }
                        // Also check updated_at if staff counts are equal - prefer newer
                        else if (currentStaffCount === existingStaffCount &&
                                 currentSlot.updated_at && existingSlot.updated_at &&
                                 new Date(currentSlot.updated_at) > new Date(existingSlot.updated_at)) {
                          mergedSlots[periodId] = currentSlot;
                        }
                      }
                    });
                  }
                });

                // Store under range marker
                if (Object.keys(mergedSlots).length > 0) {
                  regroupedData[rangeMarker] = mergedSlots;
                }
              }
            } else {
              // Handle single dates (no range marker)
              if (enrichedTimetableData[rangeMarker]) {
                regroupedData[rangeMarker] = enrichedTimetableData[rangeMarker];
              }
            }
          });

          // Replace enrichedTimetableData with regrouped data
          Object.keys(enrichedTimetableData).forEach(key => {
            delete enrichedTimetableData[key];
          });
          Object.assign(enrichedTimetableData, regroupedData);
        }
      }

      // Create slots array for compatibility with existing code
      // Updated: 2025-11-17 - Fixed for batch mode timetables
      const slots: any[] = [];
      Object.keys(enrichedTimetableData).forEach((dayOrRange) => {
        const daySlots = enrichedTimetableData[dayOrRange];
        if (daySlots && typeof daySlots === 'object') {
          Object.keys(daySlots).forEach((periodId) => {
            const slot = daySlots[periodId];
            if (slot) {
              // For batch mode: dayOrRange is a date range like "RANGE:2025-11-01:2025-11-05"
              // For regular mode: dayOrRange is a day of week like "MONDAY"
              const isBatchMode = dayOrRange.startsWith('RANGE:');

              slots.push({
                ...slot,
                // For batch mode, set slot_date; for regular mode, set day_of_week
                ...(isBatchMode
                  ? { slot_date: dayOrRange }
                  : { day_of_week: dayOrRange }
                ),
                period_id: periodId
              });
            }
          });
        }
      });

      return {
        ...timetable,
        timetable_data: enrichedTimetableData,
        slots: slots
      };
    } catch (error) {
      logger.error('academic/timetables', 'Error enriching timetable with details', error);
      return timetable;
    }
  }

  static async getTimetableSlots(
    timetableId: string,
    day?: DayOfWeek,
    date?: string
  ): Promise<any[]> {
    try {
      if (day || date) {
        const { data, error } = await (this.supabase as any).rpc(
          'get_timetable_slots_for_day_or_date',
          {
            p_timetable_id: timetableId,
            p_day_of_week: day || null,
            p_slot_date: date || null
          }
        );

        if (error) {
          logger.error('academic/timetables', 'Error in getTimetableSlots', error);
          throw error;
        }

        return data.map((item: any) => item.slot);
      } else {
        // New logic to fetch all slots if no day or date is provided
        const { data, error } = await (this.supabase as any).rpc(
          'get_all_timetable_slots',
          {
            p_timetable_id: timetableId
          }
        );

        if (error) {
          logger.error('academic/timetables', 'Error in getTimetableSlots (all)', error);
          throw error;
        }
        return data.map((item: any) => item.slot);
      }
    } catch (error) {
      logger.error('academic/timetables', 'Error fetching timetable slots', error);
      throw error;
    }
  }

  static async getTimetableByDate(
    institutionId: string,
    sectionId: string,
    date: string
  ): Promise<any> {
    try {
      const { data, error } = await (this.supabase as any).rpc('get_timetable_by_date', {
        p_institution_id: institutionId,
        p_section_id: sectionId,
        p_date: date
      });

      if (error) {
        logger.error('academic/timetables', 'Error fetching timetable by date', error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('academic/timetables', 'Error in getTimetableByDate', error);
      throw error;
    }
  }

  // NEW: Helper method to format subdivision data for saving (Updated: 2025-10-11)
  // Updated: 2025-10-13 - Fixed to work even when is_subdivided is not yet set
  static formatSubdivisionDataForSlot(
    slotData: any,
    subdivisionConfig?: {
      groups: Array<{
        group_order: number;
        group_name: string;
        course_id: string;
        staff_ids: string[];
        student_ids: string[];
        lab_room?: string;
        max_capacity?: number;
      }>;
      subdivision_type: string;
      subdivision_mode: string;
    }
  ): any {
    // Updated: Don't check slotData.is_subdivided - just check if subdivisionConfig is provided
    if (!subdivisionConfig || !subdivisionConfig.groups || subdivisionConfig.groups.length === 0) {
      return slotData;
    }

    // Convert subdivision groups to sub_slots format
    const subSlots = subdivisionConfig.groups.map((group) => ({
      sub_slot_order: group.group_order,
      course_id: group.course_id,
      staff_ids: group.staff_ids,
      section_ids: slotData.section_ids || [], // Preserve section IDs
      student_ids: group.student_ids, // NEW: Student assignments for this group
      group_name: group.group_name, // NEW: Group name
      lab_room: group.lab_room, // NEW: Lab room
      max_capacity: group.max_capacity, // NEW: Max capacity
      is_break_slot: false,
      break_description: undefined
    }));

    return {
      ...slotData,
      is_combined: false, // Subdivision uses sub_slots but is not "combined class"
      is_subdivided: true,
      subdivision_type: subdivisionConfig.subdivision_type,
      subdivision_mode: subdivisionConfig.subdivision_mode,
      sub_slots: subSlots
    };
  }

  static async updateTimetableSlot(
    timetableId: string,
    day: string,
    periodId: string,
    slotData: any,
    isBatch: boolean = false,
    suppressToast: boolean = false
  ): Promise<any> {
    try {
      // For batch mode, we need to check attendance for the specific date
      // For regular mode, we check for the day/period combination
      let attendanceQuery: any = this.supabase
        .from('student_attendance')
        .select('id, attendance_data, attendance_date')
        .eq('timetable_id', timetableId);

      // IMPORTANT: Only filter by date in batch mode with valid date format
      // Regular mode has day of week (MONDAY, etc.) which cannot be used as date filter
      if (isBatch) {
        // Check if day is a valid date format (YYYY-MM-DD)
        const isValidDate = day && /^\d{4}-\d{2}-\d{2}$/.test(day);
        if (isValidDate) {
          attendanceQuery = attendanceQuery.eq('attendance_date', day);
        } else {
          logger.warn('academic/timetables', 'Batch mode but invalid date format', { day });
        }
      }

      const { data: attendanceCheck, error: checkError } = (await attendanceQuery) as {
        data: Array<{ id: string; attendance_data: any; attendance_date: string }> | null;
        error: any;
      };

      if (checkError) {
        logger.error('academic/timetables', 'Error checking attendance for slot', checkError);
      }

      // Check if this specific period/slot has attendance marked
      if (attendanceCheck && attendanceCheck.length > 0) {
        let hasAttendance = false;
        let attendanceDate = '';

        for (const record of attendanceCheck) {
          const attendanceData = record.attendance_data || {};

          // Check multiple possible keys for the period
          // Sometimes attendance is stored with period_id, sometimes with slot_id
          const possibleKeys = [
            periodId,
            `${day}_${periodId}`, // day_period format
            `slot_${periodId}` // slot_period format
          ];

          for (const key of possibleKeys) {
            if (
              attendanceData[key] &&
              attendanceData[key].students?.length > 0
            ) {
              hasAttendance = true;
              attendanceDate = record.attendance_date;
              break;
            }
          }

          if (hasAttendance) break;
        }

        if (hasAttendance) {
          const errorMessage = isBatch
            ? `Cannot modify this period slot. Attendance has been marked on ${attendanceDate}. Once attendance is recorded, the period cannot be changed.`
            : `Cannot modify this period slot. Attendance has been marked for it. Once attendance is recorded, the period cannot be changed. Staff changes should be made through the Staff Planning module.`;

          if (!suppressToast) {
            toast.error(errorMessage, {
              duration: 6000,
              position: 'top-center',
              style: {
                background: '#FEF2F2',
                color: '#991B1B',
                border: '1px solid #FCA5A5',
                maxWidth: '500px'
              }
            });
          }

          throw new Error(errorMessage);
        }
      }

      // For batch mode, ensure slot_date is included in slotData
      const processedSlotData = { ...slotData };
      if (isBatch) {
        processedSlotData.slot_date = day; // The day parameter contains the date for batch mode
      }

      const payload: any = {
        p_timetable_id: timetableId,
        p_day_of_week: day,
        p_period_id: periodId,
        p_slot_data: processedSlotData,
        p_is_batch: isBatch
      };

      const { data, error } = await (this.supabase as any).rpc(
        'update_timetable_slot',
        payload
      );

      if (error) {
        logger.error('academic/timetables', 'Error updating timetable slot', error);
        if (!suppressToast) {
          toast.error('Failed to update timetable slot.');
        }
        throw error;
      }

      // Check if RPC returned success: false
      if (data && data.success === false) {
        logger.error('academic/timetables', 'RPC returned failure', data);
        if (!suppressToast) {
          toast.error(data.message || 'Failed to update timetable slot.');
        }
        throw new Error(data.message || 'RPC returned failure');
      }

      if (!suppressToast) {
        toast.success('Timetable slot updated successfully!');
      }
      return data;
    } catch (error) {
      logger.error('academic/timetables', 'Error in updateTimetableSlot', error);
      throw error;
    }
  }

  /**
   * Batch update timetable slots for multiple dates in a single atomic operation
   * This eliminates race conditions by updating all dates in ONE database transaction
   *
   * @param timetableId - The timetable ID
   * @param dates - Array of date strings in YYYY-MM-DD format
   * @param periodId - The period ID to update
   * @param slotData - The slot data to apply to all dates
   * @param suppressToast - Whether to suppress toast notifications
   * @returns Promise with update results including success/failure counts
   *
   * Updated: 2025-10-14 - Created to fix concurrent update race conditions
   */
  static async updateTimetableSlotsBatch(
    timetableId: string,
    dates: string[],
    periodId: string,
    slotData: any,
    suppressToast: boolean = false
  ): Promise<{
    success: boolean;
    updated_count: number;
    failed_count: number;
    total_dates: number;
    message: string;
  }> {
    try {
      // Call the new batch RPC function
      const { data, error } = await (this.supabase as any).rpc(
        'update_timetable_slots_batch',
        {
          p_timetable_id: timetableId,
          p_dates: dates,
          p_period_id: periodId,
          p_slot_data: slotData
        }
      );

      if (error) {
        logger.error('academic/timetables', 'Batch update error', error);
        if (!suppressToast) {
          toast.error('Failed to update timetable slots in batch.');
        }
        throw error;
      }

      if (!suppressToast && data?.success) {
        toast.success(
          `Successfully updated ${data.updated_count} of ${data.total_dates} slots!`,
          {
            duration: 3000,
            position: 'top-center',
            style: {
              background: '#F0FDF4',
              color: '#166534'
            }
          }
        );
      }

      return data;
    } catch (error) {
      logger.error('academic/timetables', 'Error in updateTimetableSlotsBatch', error);
      throw error;
    }
  }

  static async deleteTimetableSlot(
    timetableId: string,
    day: string,
    periodId: string,
    isBatch: boolean = false,
    suppressToast: boolean = false
  ): Promise<void> {
    try {
      // FIX: 2025-12-05 - Handle RANGE format dates for batch timetables
      // RANGE format: "RANGE:YYYY-MM-DD:YYYY-MM-DD" (e.g., "RANGE:2025-12-01:2025-12-11")
      // The timetable_data stores slots under individual date keys, NOT RANGE keys
      // So we need to delete from all individual dates within the range
      if (isBatch && day && day.startsWith('RANGE:')) {
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

          // Check attendance for all dates in the range
          const { data: attendanceCheck, error: checkError } = (await this.supabase
            .from('student_attendance')
            .select('id, attendance_data, attendance_date')
            .eq('timetable_id', timetableId)
            .in('attendance_date', dates)) as {
            data: Array<{ id: string; attendance_data: any; attendance_date: string }> | null;
            error: any;
          };

          if (checkError) {
            logger.error('academic/timetables', 'Error checking attendance for range deletion', checkError);
          }

          // Check if any date in the range has attendance marked
          if (attendanceCheck && attendanceCheck.length > 0) {
            for (const record of attendanceCheck) {
              const attendanceData = record.attendance_data || {};
              const possibleKeys = [
                periodId,
                `${record.attendance_date}_${periodId}`,
                `slot_${periodId}`
              ];

              for (const key of possibleKeys) {
                if (attendanceData[key] && attendanceData[key].students?.length > 0) {
                  const errorMessage = `Cannot delete this period slot. Attendance has been marked for ${attendanceData[key].students.length} students on ${record.attendance_date}. Deleting would lose attendance records.`;

                  if (!suppressToast) {
                    toast.error(errorMessage, {
                      duration: 6000,
                      position: 'top-center',
                      style: {
                        background: '#FEF2F2',
                        color: '#991B1B',
                        border: '1px solid #FCA5A5',
                        maxWidth: '500px'
                      }
                    });
                  }

                  throw new Error(errorMessage);
                }
              }
            }
          }

          // Delete slots for all dates in the range
          // IMPORTANT: Must run sequentially to avoid race condition
          // Each RPC reads current data, deletes one slot, writes back
          // Parallel execution would cause last write to overwrite all previous deletions
          let deletedCount = 0;
          let failedCount = 0;

          for (const date of dates) {
            try {
              const { error } = await (this.supabase as any).rpc('delete_timetable_slot', {
                p_timetable_id: timetableId,
                p_day_of_week: date,
                p_period_id: periodId,
                p_is_batch: true
              });

              if (error) {
                logger.error('academic/timetables', `Failed to delete slot for ${date}`, error);
                failedCount++;
              } else {
                deletedCount++;
              }
            } catch (err) {
              logger.error('academic/timetables', `Error deleting slot for ${date}`, err);
              failedCount++;
            }
          }

          if (failedCount > 0) {
            logger.error('academic/timetables', `${failedCount} slot deletions failed out of ${dates.length}`);
          }

          if (!suppressToast) {
            toast.success('Timetable slot deleted successfully!');
          }
          return;
        }
      }

      // For batch mode, we need to check attendance for the specific date
      // For regular mode, we check for the day/period combination
      let attendanceQuery: any = this.supabase
        .from('student_attendance')
        .select('id, attendance_data, attendance_date')
        .eq('timetable_id', timetableId);

      // IMPORTANT: Only filter by date in batch mode with valid date format
      // Regular mode has day of week (MONDAY, etc.) which cannot be used as date filter
      if (isBatch) {
        // Check if day is a valid date format (YYYY-MM-DD)
        const isValidDate = day && /^\d{4}-\d{2}-\d{2}$/.test(day);
        if (isValidDate) {
          attendanceQuery = attendanceQuery.eq('attendance_date', day);
        } else {
          logger.warn('academic/timetables', 'Delete: Batch mode but invalid date format', { day });
        }
      }

      const { data: attendanceCheck, error: checkError } = (await attendanceQuery) as {
        data: Array<{ id: string; attendance_data: any; attendance_date: string }> | null;
        error: any;
      };

      if (checkError) {
        logger.error('academic/timetables', 'Error checking attendance for slot deletion', checkError);
      }

      // Check if this specific period/slot has attendance marked
      if (attendanceCheck && attendanceCheck.length > 0) {
        let hasAttendance = false;
        let attendanceDate = '';
        let attendanceCount = 0;

        for (const record of attendanceCheck) {
          const attendanceData = record.attendance_data || {};

          // Check multiple possible keys for the period
          // Sometimes attendance is stored with period_id, sometimes with slot_id
          const possibleKeys = [
            periodId,
            `${day}_${periodId}`, // day_period format
            `slot_${periodId}` // slot_period format
          ];

          for (const key of possibleKeys) {
            if (
              attendanceData[key] &&
              attendanceData[key].students?.length > 0
            ) {
              hasAttendance = true;
              attendanceDate = record.attendance_date;
              attendanceCount = attendanceData[key].students.length;
              break;
            }
          }

          if (hasAttendance) break;
        }

        if (hasAttendance) {
          const errorMessage = isBatch
            ? `Cannot delete this period slot. Attendance has been marked for ${attendanceCount} students on ${attendanceDate}. Deleting would lose attendance records.`
            : `Cannot delete this period slot. Attendance has been marked for ${attendanceCount} students. Once attendance is recorded, the period cannot be removed to preserve data integrity.`;

          if (!suppressToast) {
            toast.error(errorMessage, {
              duration: 6000,
              position: 'top-center',
              style: {
                background: '#FEF2F2',
                color: '#991B1B',
                border: '1px solid #FCA5A5',
                maxWidth: '500px'
              }
            });
          }

          throw new Error(errorMessage);
        }
      }

      const { error } = await (this.supabase as any).rpc('delete_timetable_slot', {
        p_timetable_id: timetableId,
        p_day_of_week: day,
        p_period_id: periodId,
        p_is_batch: isBatch
      });

      if (error) {
        logger.error('academic/timetables', 'Error deleting timetable slot', error);
        if (!suppressToast) {
          toast.error('Failed to delete timetable slot.');
        }
        throw error;
      }

      if (!suppressToast) {
        toast.success('Timetable slot deleted successfully!');
      }
    } catch (error) {
      logger.error('academic/timetables', 'Error in deleteTimetableSlot', error);
      throw error;
    }
  }

  static async deleteSlotsForDateRange(
    timetableId: string,
    dateRange: { start: string; end: string },
    periods: { id: string }[]
  ): Promise<void> {
    try {
      // Generate all dates in the range
      const dates: string[] = [];
      const current = new Date(dateRange.start);
      const end = new Date(dateRange.end);

      while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }

      // Delete all slots for each date and period combination
      const deletePromises: Promise<void>[] = [];

      for (const date of dates) {
        for (const period of periods) {
          deletePromises.push(
            this.deleteTimetableSlot(timetableId, date, period.id, true, true) // suppressToast = true
          );
        }
      }

      // Execute all deletions (ignoring failures for non-existent slots)
      await Promise.allSettled(deletePromises);
    } catch (error) {
      logger.error('academic/timetables', 'Error in deleteSlotsForDateRange', error);
      throw error;
    }
  }

  static async deleteSlotsForRemovedDates(
    timetableId: string,
    removedDates: string[],
    periods: { id: string }[]
  ): Promise<void> {
    try {
      // Delete all slots for each removed date and period combination
      const deletePromises: Promise<void>[] = [];

      for (const date of removedDates) {
        for (const period of periods) {
          deletePromises.push(
            this.deleteTimetableSlot(timetableId, date, period.id, true, true) // suppressToast = true
          );
        }
      }

      // Execute all deletions (ignoring failures for non-existent slots)
      await Promise.allSettled(deletePromises);
    } catch (error) {
      logger.error('academic/timetables', 'Error in deleteSlotsForRemovedDates', error);
      throw error;
    }
  }

  static async saveTimetablePeriods(
    timetableId: string,
    periodIds: string[]
  ): Promise<void> {
    try {
      // First, fetch the full period objects from the period IDs
      const { data: periodsData, error: periodsError } = (await this.supabase
        .from('periods')
        .select('*')
        .in('id', periodIds)) as {
        data: Array<{
          id: string;
          period_name: string;
          start_time: string;
          end_time: string;
          is_break: boolean;
          institution_id: string;
        }> | null;
        error: any;
      };

      if (periodsError) {
        logger.error('academic/timetables', 'Error fetching period data', periodsError);
        throw periodsError;
      }

      if (!periodsData) {
        throw new Error('No period data found');
      }

      // Map the periods to the format expected by the timetable
      // and maintain the order of periodIds
      const orderedPeriods = periodIds
        .map((id, index) => {
          const period = periodsData.find((p) => p.id === id);
          if (!period) return null;

          return {
            period_id: period.id,
            period_name: period.period_name,
            start_time: period.start_time,
            end_time: period.end_time,
            is_break: period.is_break,
            sort_order: index,
            institution_id: period.institution_id
          };
        })
        .filter(Boolean); // Remove any null values

      // Save the complete period objects to the timetable
      const { error } = await (this.supabase as any)
        .from('timetables')
        .update({ periods: orderedPeriods })
        .eq('id', timetableId);

      if (error) {
        logger.error('academic/timetables', 'Error saving timetable periods', error);
        throw error;
      }
    } catch (error) {
      logger.error('academic/timetables', 'Error in saveTimetablePeriods', error);
      throw error;
    }
  }

  static async getInstitutionTimetableType(
    timetableId: string
  ): Promise<'day_order' | 'week_order'> {
    try {
      const { data, error } = await this.supabase
        .from('timetables')
        .select(
          `
          institution:institution_id(
            timetable_type
          )
        `
        )
        .eq('id', timetableId)
        .single();

      if (error) throw error;

      return (data as any)?.institution?.timetable_type || 'week_order';
    } catch (error) {
      logger.error('academic/timetables', 'Error fetching institution timetable type', error);
      return 'week_order'; // Default fallback
    }
  }

  // Template Operations
  static async saveTimetableAsTemplate(
    timetableId: string,
    templateName: string,
    templateDescription?: string
  ): Promise<void> {
    try {
      // Check if the current timetable exists
      const { error: fetchError } = await this.supabase
        .from('timetables')
        .select('*')
        .eq('id', timetableId)
        .single();

      if (fetchError) throw fetchError;

      // Update the timetable to mark it as a template
      const { error: updateError } = await (this.supabase as any)
        .from('timetables')
        .update({
          is_template: true,
          template_name: templateName,
          template_description: templateDescription || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', timetableId);

      if (updateError) throw updateError;

      toast.success('Timetable saved as template successfully!', {
        duration: 3000,
        position: 'top-center',
        style: {
          background: '#F0FDF4',
          color: '#166534'
        }
      });
    } catch (error) {
      logger.error('academic/timetables', 'Error saving timetable as template', error);
      toast.error('Failed to save as template. Please try again.', {
        duration: 4000,
        position: 'top-center'
      });
      throw error;
    }
  }

  static async createTimetableFromTemplate(
    templateId: string,
    timetableData: CreateTimetableDto
  ): Promise<Timetable> {
    try {
      // Get the template timetable
      const { data: template, error: templateError } = (await this.supabase
        .from('timetables')
        .select('*')
        .eq('id', templateId)
        .eq('is_template', true)
        .single()) as {
        data: any | null;
        error: any;
      };

      if (templateError) throw templateError;

      if (!template) {
        throw new Error('Template not found or is not a valid template');
      }

      // Check for date overlap if dates are provided
      if (timetableData.start_date && timetableData.end_date) {
        const existingCheck = await this.checkExistingTimetable({
          institution_id: timetableData.institution_id,
          academic_year_id: timetableData.academic_year_id,
          degree_id: timetableData.degree_id,
          program_id: timetableData.program_id,
          department_id: timetableData.department_id,
          semester_id: timetableData.semester_id!,
          section_id: timetableData.section_id || undefined,
          start_date: timetableData.start_date,
          end_date: timetableData.end_date
        });

        if (existingCheck.exists) {
          toast.error(
            `⚠️ Date Period Conflict Detected!\n\n${existingCheck.message}`,
            {
              duration: 8000,
              position: 'top-center',
              style: {
                background: '#FEF2F2',
                color: '#991B1B',
                border: '1px solid #FCA5A5',
                maxWidth: '500px',
                whiteSpace: 'pre-line'
              }
            }
          );
          throw new Error(
            existingCheck.message ||
              'Date period conflicts with existing timetable.'
          );
        }
      }

      // Create new timetable based on template
      const newTimetableData = {
        ...timetableData,
        // Copy template structure
        timetable_format: template.timetable_format,
        periods: template.periods, // Copy periods configuration
        timetable_data: template.timetable_data, // Copy timetable slots
        selected_days: template.selected_days,
        // Ensure it's not marked as template
        is_template: false,
        template_name: undefined,
        template_description: undefined,
        // Add metadata about template origin
        created_from_template_id: templateId,
        created_by: (await this.supabase.auth.getUser()).data.user?.id
      };

      const { data: newTimetable, error: createError } = (await (this.supabase as any)
        .from('timetables')
        .insert([newTimetableData])
        .select('*')
        .single()) as { data: Timetable | null; error: any };

      if (createError) {
        logger.error('academic/timetables', 'Error creating timetable from template', createError);
        if (createError.code === '23505') {
          toast.error(
            '⚠️ This timetable configuration already exists. Please check your semester and section selection.',
            {
              duration: 5000,
              position: 'top-center'
            }
          );
        } else {
          toast.error(
            'Failed to create timetable from template. Please try again.',
            {
              duration: 4000,
              position: 'top-center'
            }
          );
        }
        throw new Error('Failed to create timetable from template.');
      }

      // Update template usage count (optional analytics)
      await (this.supabase as any)
        .from('timetables')
        .update({
          usage_count: ((template as any).usage_count || 0) + 1
        })
        .eq('id', templateId);

      toast.success(
        `Timetable created successfully from template "${
          template.template_name || template.timetable_name
        }"!`,
        {
          duration: 4000,
          position: 'top-center',
          style: {
            background: '#F0FDF4',
            color: '#166534'
          }
        }
      );

      return newTimetable;
    } catch (error) {
      logger.error('academic/timetables', 'Error creating timetable from template', error);
      throw error;
    }
  }

  static async getTemplates(
    filters: TemplateFilters = {}
  ): Promise<TemplateListResponse> {
    try {
      let query = (this.supabase as any).from('timetables').select(
        `
          *,
          institution:institution_id(id, name),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name),
          semesters:semester_id(id, semester_name),
          sections:section_id(id, section_name)
        `,
        { count: 'exact' }
      );

      // Only get templates
      query = query.eq('is_template', true);

      // Apply filters
      if (filters.search) {
        const searchTerm = filters.search.replace(/'/g, "''"); // Escape single quotes for SQL safety
        query = query.or(
          `timetable_name.ilike.%${searchTerm}%,` +
            `template_name.ilike.%${searchTerm}%,` +
            `template_description.ilike.%${searchTerm}%`
        );
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.academic_year_id) {
        query = query.eq('academic_year_id', filters.academic_year_id);
      }

      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
      }

      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.template_category) {
        query = query.eq('template_category', filters.template_category);
      }

      // Filter by template tags (array contains any of the specified tags)
      if (filters.template_tags && filters.template_tags.length > 0) {
        // Use overlaps operator to match any of the provided tags
        query = query.overlaps('template_tags', filters.template_tags);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const start = (page - 1) * limit;

      query = query.range(start, start + limit - 1);

      // Order by template name, then timetable name
      query = query.order('template_name', {
        ascending: true,
        nullsFirst: false
      });
      query = query.order('timetable_name', { ascending: true });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      logger.error('academic/timetables', 'Error fetching templates', error);
      throw error;
    }
  }

  static async deleteTemplate(id: string): Promise<void> {
    try {
      // First check if this is actually a template
      const { data: template, error: fetchError } = (await this.supabase
        .from('timetables')
        .select('is_template, template_name, timetable_name')
        .eq('id', id)
        .single()) as {
        data: { is_template: boolean; template_name?: string; timetable_name: string } | null;
        error: any;
      };

      if (fetchError) throw fetchError;
      if (!template) throw new Error('Template not found');

      if (!template.is_template) {
        throw new Error('This is not a template timetable');
      }

      // Delete the template
      const { error: deleteError } = await this.supabase
        .from('timetables')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      toast.success(
        `Template "${
          template.template_name || template.timetable_name
        }" deleted successfully`,
        {
          duration: 3000,
          position: 'top-center'
        }
      );
    } catch (error) {
      logger.error('academic/timetables', 'Error deleting template', error);
      toast.error('Failed to delete template. Please try again.', {
        duration: 4000,
        position: 'top-center'
      });
      throw error;
    }
  }

  static async getTemplate(id: string): Promise<Timetable> {
    try {
      const { data, error } = await this.supabase
        .from('timetables')
        .select(
          `
          *,
          institution:institution_id(id, name),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name),
          semesters:semester_id(id, semester_name),
          sections:section_id(id, section_name)
        `
        )
        .eq('id', id)
        .eq('is_template', true)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Template not found');

      return data as unknown as Timetable;
    } catch (error) {
      logger.error('academic/timetables', 'Error fetching template', error);
      throw error;
    }
  }

  static async saveAsTemplate(data: CreateTemplateDto): Promise<Timetable> {
    try {
      const templateData = {
        id: randomUUID(),
        institution_id: data.institution_id,
        academic_year_id: data.academic_year_id || null,
        degree_id: data.degree_id || null,
        program_id: data.program_id || null,
        department_id: data.department_id || null,
        semester_id: data.semester_id || null,
        section_id: data.section_id || null,
        timetable_name: data.timetable_name,
        template_name: data.template_name,
        template_description: data.template_description || null,
        template_category: data.template_category || null,
        template_tags: data.template_tags || [],
        timetable_format: data.timetable_format || 'regular',
        periods: data.periods || null,
        timetable_data: data.timetable_data || null,
        selected_days: data.selected_days || [],
        selected_dates: null,
        start_date: null,
        end_date: null,
        is_template: true,
        is_active: true,
        version: 1,
        usage_count: 0,
        created_from_template_id: null,
        created_by: 'system', // You might want to get this from auth context
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: template, error } = (await this.supabase
        .from('timetables')
        .insert(templateData as any)
        .select(
          `
          *,
          institution:institution_id(id, name),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name),
          semesters:semester_id(id, semester_name),
          sections:section_id(id, section_name)
        `
        )
        .single()) as { data: Timetable | null; error: any };

      if (error) throw error;

      return template;
    } catch (error) {
      logger.error('academic/timetables', 'Error saving template', error);
      throw error;
    }
  }

  static async updateTemplate(
    id: string,
    data: UpdateTemplateDto
  ): Promise<Timetable> {
    try {
      const updateData = {
        ...data,
        updated_at: new Date().toISOString()
      };

      const { data: template, error } = (await (this.supabase as any)
        .from('timetables')
        .update(updateData)
        .eq('id', id)
        .eq('is_template', true)
        .select(
          `
          *,
          institution:institution_id(id, name),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name),
          semesters:semester_id(id, semester_name),
          sections:section_id(id, section_name)
        `
        )
        .single()) as { data: Timetable | null; error: any };

      if (error) throw error;
      if (!template) throw new Error('Template not found');

      return template;
    } catch (error) {
      logger.error('academic/timetables', 'Error updating template', error);
      throw error;
    }
  }

  static async duplicateTemplate(
    id: string,
    newName: string
  ): Promise<Timetable> {
    try {
      // First get the template
      const originalTemplate = await this.getTemplate(id);

      const duplicateData = {
        ...originalTemplate,
        id: randomUUID(),
        template_name: newName,
        timetable_name: newName,
        usage_count: 0,
        created_by: 'system', // You might want to get this from auth context
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Remove computed fields
      delete duplicateData.institution;
      delete duplicateData.academic_year;
      delete duplicateData.degree;
      delete duplicateData.program;
      delete duplicateData.department;

      const { data: template, error } = (await this.supabase
        .from('timetables')
        .insert(duplicateData as any)
        .select(
          `
          *,
          institution:institution_id(id, name),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name),
          semesters:semester_id(id, semester_name),
          sections:section_id(id, section_name)
        `
        )
        .single()) as { data: Timetable | null; error: any };

      if (error) throw error;

      return template;
    } catch (error) {
      logger.error('academic/timetables', 'Error duplicating template', error);
      throw error;
    }
  }
}
