import { createClientSupabaseClient } from '@/lib/supabase/client';
import { randomUUID } from 'crypto';
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
  TemplateFilters,
  TemplateListResponse,
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateFromTemplateDto,
  DayOfWeek
} from '@/types/academics';
import toast from 'react-hot-toast';

export class TimetableService {
  private static supabase = createClientSupabaseClient();

  // Check if a timetable already exists for the given semester and section with overlapping date periods
  static async checkExistingTimetable(data: {
    institution_id: string;
    academic_year_id: string;
    degree_id: string;
    program_id: string;
    department_id: string;
    semester: string;
    section?: string;
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
      let query = this.supabase
        .from('timetables')
        .select('*')
        .eq('institution_id', data.institution_id)
        .eq('academic_year_id', data.academic_year_id)
        .eq('degree_id', data.degree_id)
        .eq('program_id', data.program_id)
        .eq('department_id', data.department_id)
        .eq('semester', data.semester)
        .eq('is_active', true);

      // Handle section parameter correctly
      if (data.section) {
        query = query.eq('section', data.section);
      } else {
        query = query.is('section', null);
      }

      const { data: existingTimetables, error } = await query;

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
            return {
              exists: true,
              existingTimetable: existing,
              message: `A timetable already exists for ${data.semester}${
                data.section ? ` - Section ${data.section}` : ''
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
      console.error('Error checking existing timetable:', error);
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
        semester: data.semester.toString(), // Ensure string type
        section: data.section || undefined, // Handle optional section
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
        semester,
        section,
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

      const timetableData = {
        institution_id,
        academic_year_id,
        degree_id,
        program_id,
        department_id,
        semester,
        section,
        timetable_name,
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

      const { data: timetable, error } = await this.supabase
        .from('timetables')
        .insert([
          {
            ...timetableData,
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
      // If updating dates, check for conflicts with existing timetables
      if (data.start_date && data.end_date) {
        // Get current timetable info
        const { data: currentTimetable, error: fetchError } =
          await this.supabase
            .from('timetables')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // Check for date overlap with other timetables (excluding current one)
        const existingCheck = await this.checkExistingTimetable({
          institution_id: currentTimetable.institution_id,
          academic_year_id: currentTimetable.academic_year_id,
          degree_id: currentTimetable.degree_id,
          program_id: currentTimetable.program_id,
          department_id: currentTimetable.department_id,
          semester: currentTimetable.semester.toString(), // Ensure string type
          section: currentTimetable.section || undefined, // Handle optional section
          start_date: data.start_date,
          end_date: data.end_date
        });

        // Filter out the current timetable from conflicts
        if (
          existingCheck.exists &&
          existingCheck.existingTimetable?.id !== id
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
      }

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
    isBatch: boolean = false,
    suppressToast: boolean = false
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
        if (!suppressToast) {
          toast.error('Failed to update timetable slot.');
        }
        throw error;
      }

      if (!suppressToast) {
        toast.success('Timetable slot updated successfully!');
      }
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
    isBatch: boolean = false,
    suppressToast: boolean = false
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
        if (!suppressToast) {
          toast.error('Failed to delete timetable slot.');
        }
        throw error;
      }

      if (!suppressToast) {
        toast.success('Timetable slot deleted successfully!');
      }
    } catch (error) {
      console.error('Error in deleteTimetableSlot:', error);
      throw error;
    }
  }

  static async deleteSlotsForDateRange(
    timetableId: string,
    dateRange: { start: string; end: string },
    periods: { id: string }[]
  ): Promise<void> {
    try {
      console.log(
        'Deleting slots for date range:',
        dateRange,
        'periods:',
        periods
      );

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

      console.log(
        `Successfully processed slot deletions for ${dates.length} dates and ${periods.length} periods`
      );
    } catch (error) {
      console.error('Error in deleteSlotsForDateRange:', error);
      throw error;
    }
  }

  static async deleteSlotsForRemovedDates(
    timetableId: string,
    removedDates: string[],
    periods: { id: string }[]
  ): Promise<void> {
    try {
      console.log(
        'Deleting slots for removed dates:',
        removedDates,
        'periods:',
        periods
      );

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
      const results = await Promise.allSettled(deletePromises);

      // Count successful deletions
      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      console.log(
        `Slot deletion completed: ${successful} successful, ${failed} failed (expected for non-existent slots)`
      );
    } catch (error) {
      console.error('Error in deleteSlotsForRemovedDates:', error);
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

  // Template Operations
  static async saveTimetableAsTemplate(
    timetableId: string,
    templateName: string,
    templateDescription?: string
  ): Promise<void> {
    try {
      // Get the current timetable
      const { data: timetable, error: fetchError } = await this.supabase
        .from('timetables')
        .select('*')
        .eq('id', timetableId)
        .single();

      if (fetchError) throw fetchError;

      // Update the timetable to mark it as a template
      const { error: updateError } = await this.supabase
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
      console.error('Error saving timetable as template:', error);
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
      const { data: template, error: templateError } = await this.supabase
        .from('timetables')
        .select('*')
        .eq('id', templateId)
        .eq('is_template', true)
        .single();

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
          semester: timetableData.semester.toString(),
          section: timetableData.section || undefined,
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

      const { data: newTimetable, error: createError } = await this.supabase
        .from('timetables')
        .insert([newTimetableData])
        .select('*')
        .single();

      if (createError) {
        console.error('Error creating timetable from template:', createError);
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
      await this.supabase
        .from('timetables')
        .update({
          usage_count: (template.usage_count || 0) + 1
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
      console.error('Error creating timetable from template:', error);
      throw error;
    }
  }

  static async getTemplates(
    filters: TemplateFilters = {}
  ): Promise<TemplateListResponse> {
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
      console.error('Error fetching templates:', error);
      throw error;
    }
  }

  static async deleteTemplate(id: string): Promise<void> {
    try {
      // First check if this is actually a template
      const { data: template, error: fetchError } = await this.supabase
        .from('timetables')
        .select('is_template, template_name, timetable_name')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

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
      console.error('Error deleting template:', error);
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
          department:department_id(id, department_name)
        `
        )
        .eq('id', id)
        .eq('is_template', true)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Template not found');

      return data;
    } catch (error) {
      console.error('Error fetching template:', error);
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
        semester: data.semester?.toString() || null,
        section: data.section || null,
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

      const { data: template, error } = await this.supabase
        .from('timetables')
        .insert(templateData)
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
        .single();

      if (error) throw error;

      return template;
    } catch (error) {
      console.error('Error saving template:', error);
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

      const { data: template, error } = await this.supabase
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
          department:department_id(id, department_name)
        `
        )
        .single();

      if (error) throw error;
      if (!template) throw new Error('Template not found');

      return template;
    } catch (error) {
      console.error('Error updating template:', error);
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

      const { data: template, error } = await this.supabase
        .from('timetables')
        .insert(duplicateData)
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
        .single();

      if (error) throw error;

      return template;
    } catch (error) {
      console.error('Error duplicating template:', error);
      throw error;
    }
  }
}
