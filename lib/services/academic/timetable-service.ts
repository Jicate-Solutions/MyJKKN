import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery
} from '@/lib/auth/api-institution-filter';
import type {
  Timetable,
  CreateTimetableDto,
  UpdateTimetableDto,
  TimetableFilters,
  TimetableListResponse,
  DayOfWeek
} from '@/types/academics';

export class TimetableService {
  private static supabase = createClientSupabaseClient();

  // Check if a timetable already exists for the given semester and section
  static async checkExistingTimetable(data: {
    institution_id: string;
    academic_year_id: string;
    degree_id: string;
    program_id: string;
    department_id: string;
    semester: string;
    section?: string;
  }): Promise<{
    exists: boolean;
    existingTimetable?: Timetable;
    message?: string;
  }> {
    try {
      const { data: existingTimetables, error } = await this.supabase
        .from('timetables')
        .select('*')
        .eq('institution_id', data.institution_id)
        .eq('academic_year_id', data.academic_year_id)
        .eq('degree_id', data.degree_id)
        .eq('program_id', data.program_id)
        .eq('department_id', data.department_id)
        .eq('semester', data.semester)
        .eq('section', data.section || null)
        .eq('is_active', true)
        .limit(1);

      if (error) throw error;

      if (existingTimetables && existingTimetables.length > 0) {
        const existing = existingTimetables[0];
        return {
          exists: true,
          existingTimetable: existing,
          message: `A timetable already exists for ${data.semester}${
            data.section ? ` - Section ${data.section}` : ''
          }. Timetable name: "${
            existing.timetable_name
          }". Please use a different section or deactivate the existing timetable first.`
        };
      }

      return { exists: false };
    } catch (error) {
      console.error('Error checking existing timetable:', error);
      throw error;
    }
  }

  static async createTimetable(data: CreateTimetableDto): Promise<Timetable> {
    try {
      // Check for existing active timetable for the same context
      const { data: existing, error: checkError } = await this.supabase
        .from('timetables')
        .select('id, timetable_name')
        .eq('institution_id', data.institution_id)
        .eq('academic_year_id', data.academic_year_id)
        .eq('program_id', data.program_id)
        .eq('semester', data.semester)
        .eq('section', data.section || '')
        .eq('is_active', true)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        // Ignore 'PGRST116' (No rows found)
        console.error('Error checking for existing timetable:', checkError);
        toast.error('Failed to validate timetable. Please try again.', {
          duration: 4000,
          position: 'top-center'
        });
        throw new Error('Failed to check for existing timetable.');
      }

      if (existing) {
        // Show detailed error toast
        const sectionText = data.section ? ` and Section ${data.section}` : '';
        toast.error(
          `⚠️ Duplicate Timetable Detected!\n\nA timetable "${existing.timetable_name}" already exists for Semester ${data.semester}${sectionText}.\n\nOnly one active timetable is allowed per semester.`,
          {
            duration: 6000,
            position: 'top-center',
            style: {
              background: '#FEF2F2',
              color: '#991B1B',
              border: '1px solid #FCA5A5'
            }
          }
        );
        throw new Error(
          `An active timetable named "${existing.timetable_name}" already exists for this semester and section.`
        );
      }

      // Proceed with creating the new timetable
      const { data: timetable, error } = await this.supabase
        .from('timetables')
        .insert([
          {
            ...data,
            created_by: (await this.supabase.auth.getUser()).data.user?.id
          }
        ])
        .select('*')
        .single();

      if (error) {
        console.error('Error creating timetable:', error);
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

      // Show success toast
      const sectionText = data.section ? ` - Section ${data.section}` : '';

      return timetable;
    } catch (error) {
      console.error('Error in createTimetable service:', error);
      throw error;
    }
  }

  static async updateTimetable(
    id: string,
    data: UpdateTimetableDto
  ): Promise<Timetable> {
    try {
      // Filter out undefined values and constraint-related fields
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      // Only include fields that are explicitly provided and not part of the unique constraint
      const allowedFields = [
        'timetable_format',
        'start_date',
        'end_date',
        'selected_dates',
        'timetable_name',
        'selected_days'
      ];

      for (const field of allowedFields) {
        if (data[field as keyof UpdateTimetableDto] !== undefined) {
          updateData[field] = data[field as keyof UpdateTimetableDto];
        }
      }

      const { data: timetable, error } = await this.supabase
        .from('timetables')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error(
            '⚠️ Cannot update: This configuration would create a duplicate timetable.\n\nOnly one active timetable is allowed per semester.',
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

      toast.success('✅ Timetable configuration saved successfully!', {
        duration: 3000,
        position: 'top-center',
        style: {
          background: '#F0FDF4',
          color: '#166534'
        }
      });
      return timetable;
    } catch (error) {
      console.error('Error updating timetable:', error);
      throw error;
    }
  }

  static async deleteTimetable(id: string, showToast = true): Promise<void> {
    try {
      // First check if this timetable has any attendance records
      const { data: attendanceRecords, error: attendanceCheckError } =
        await this.supabase
          .from('student_attendance')
          .select('id')
          .eq('timetable_id', id)
          .limit(1);

      if (attendanceCheckError) {
        console.error(
          'Error checking attendance records:',
          attendanceCheckError
        );
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

      if (showToast) {
        toast.success('Timetable deleted successfully');
      }
    } catch (error) {
      console.error('Error deleting timetable:', error);
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
        console.error(`Error deleting timetable ${id}:`, error);
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

  static async getTimetables(
    filters: TimetableFilters = {}
  ): Promise<TimetableListResponse> {
    try {
      let query = this.supabase.from('timetables').select(
        `
          *,
          institution:institution_id(id, name),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name)
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
        query = query.eq('semester', filters.semester);
      }

      if (filters.section) {
        query = query.eq('section', filters.section);
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.is_template !== undefined) {
        query = query.eq('is_template', filters.is_template);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const start = (page - 1) * limit;

      query = query.range(start, start + limit - 1);

      // Default order by timetable_name
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
      console.error('Error fetching timetables:', error);
      throw error;
    }
  }

  static async getTimetable(id: string): Promise<Timetable> {
    try {
      const { data: timetable, error } = await this.supabase
        .from('timetables')
        .select(
          `
          *,
          institution:institution_id(id, name),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return timetable;
    } catch (error) {
      console.error('Error fetching timetable:', error);
      throw error;
    }
  }

  static async getTimetableSlots(
    timetableId: string,
    day?: DayOfWeek,
    date?: string
  ): Promise<any[]> {
    try {
      if (day || date) {
        const { data, error } = await this.supabase.rpc(
          'get_timetable_slots_for_day_or_date',
          {
            p_timetable_id: timetableId,
            p_day_of_week: day || null,
            p_slot_date: date || null
          }
        );

        if (error) {
          console.error('Error in getTimetableSlots:', error);
          throw error;
        }

        return data.map((item: any) => item.slot);
      } else {
        // New logic to fetch all slots if no day or date is provided
        const { data, error } = await this.supabase.rpc(
          'get_all_timetable_slots',
          {
            p_timetable_id: timetableId
          }
        );

        if (error) {
          console.error('Error in getTimetableSlots (all):', error);
          throw error;
        }
        return data.map((item: any) => item.slot);
      }
    } catch (error) {
      console.error('Error fetching timetable slots:', error);
      throw error;
    }
  }

  static async getTimetableByDate(
    institutionId: string,
    sectionId: string,
    date: string
  ): Promise<any> {
    try {
      const { data, error } = await this.supabase.rpc('get_timetable_by_date', {
        p_institution_id: institutionId,
        p_section_id: sectionId,
        p_date: date
      });

      if (error) {
        console.error('Error fetching timetable by date:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in getTimetableByDate:', error);
      throw error;
    }
  }

  static async updateTimetableSlot(
    timetableId: string,
    day: string,
    periodId: string,
    slotData: any,
    isBatch: boolean = false
  ): Promise<any> {
    try {
      console.log('TimetableService.updateTimetableSlot - inputs:', {
        timetableId,
        day,
        periodId,
        slotData,
        isBatch
      });

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

      console.log('TimetableService.updateTimetableSlot - payload:', payload);

      const { data, error } = await this.supabase.rpc(
        'update_timetable_slot',
        payload
      );

      if (error) {
        console.error('Error updating timetable slot:', error);
        toast.error('Failed to update timetable slot.');
        throw error;
      }

      toast.success('Timetable slot updated successfully!');
      return data;
    } catch (error) {
      console.error('Error in updateTimetableSlot:', error);
      throw error;
    }
  }

  static async deleteTimetableSlot(
    timetableId: string,
    day: string,
    periodId: string,
    isBatch: boolean = false
  ): Promise<void> {
    try {
      const { error } = await this.supabase.rpc('delete_timetable_slot', {
        p_timetable_id: timetableId,
        p_day_of_week: day,
        p_period_id: periodId,
        p_is_batch: isBatch
      });

      if (error) {
        console.error('Error deleting timetable slot:', error);
        toast.error('Failed to delete timetable slot.');
        throw error;
      }

      toast.success('Timetable slot deleted successfully!');
    } catch (error) {
      console.error('Error in deleteTimetableSlot:', error);
      throw error;
    }
  }

  static async saveTimetablePeriods(
    timetableId: string,
    periodIds: string[]
  ): Promise<void> {
    try {
      // First, fetch the full period objects from the period IDs
      const { data: periodsData, error: periodsError } = await this.supabase
        .from('periods')
        .select('*')
        .in('id', periodIds);

      if (periodsError) {
        console.error('Error fetching period data:', periodsError);
        throw periodsError;
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
      const { error } = await this.supabase
        .from('timetables')
        .update({ periods: orderedPeriods })
        .eq('id', timetableId);

      if (error) {
        console.error('Error saving timetable periods:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in saveTimetablePeriods:', error);
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
      console.error('Error fetching institution timetable type:', error);
      return 'week_order'; // Default fallback
    }
  }
}
