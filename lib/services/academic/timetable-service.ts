import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  Timetable,
  TimetableSlot,
  CreateTimetableDto,
  UpdateTimetableDto,
  TimetableFilters,
  TimetableListResponse,
  CreateTimetableSlotDto,
  UpdateTimetableSlotDto
} from '@/types/academics';

export class TimetableService {
  private static supabase = createClientSupabaseClient();

  static async createTimetable(data: CreateTimetableDto): Promise<Timetable> {
    try {
      const { data: timetable, error } = await this.supabase
        .from('timetables')
        .insert([
          {
            ...data,
            version: 1, // Initial version is always 1
            is_active: data.is_active !== undefined ? data.is_active : true,
            is_template:
              data.is_template !== undefined ? data.is_template : false
          }
        ])
        .select()
        .single();

      if (error) {
        throw error;
      }

      toast.success('Timetable created successfully');
      return timetable;
    } catch (error) {
      console.error('Error creating timetable:', error);
      throw error;
    }
  }

  static async updateTimetable(
    id: string,
    data: UpdateTimetableDto
  ): Promise<Timetable> {
    try {
      const { data: timetable, error } = await this.supabase
        .from('timetables')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Timetable updated successfully');
      return timetable;
    } catch (error) {
      console.error('Error updating timetable:', error);
      throw error;
    }
  }

  static async deleteTimetable(id: string): Promise<void> {
    try {
      // First delete all timetable slots
      const { error: slotsError } = await this.supabase
        .from('timetable_slots')
        .delete()
        .eq('timetable_id', id);

      if (slotsError) throw slotsError;

      // Then delete the timetable
      const { error } = await this.supabase
        .from('timetables')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Timetable deleted successfully');
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

    // Process deletions sequentially
    for (const id of ids) {
      try {
        await this.deleteTimetable(id);
        success.push(id);
      } catch (error) {
        console.error(`Error deleting timetable ${id}:`, error);
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
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

      // Get all slots for this timetable
      const { data: slots, error: slotsError } = await this.supabase
        .from('timetable_slots')
        .select(
          `
          *,
          period:period_id(*),
          course:course_id(id, course_name, course_code),
          staff:staff_id(id, first_name, last_name)
        `
        )
        .eq('timetable_id', id)
        .order('day_of_week');

      if (slotsError) throw slotsError;

      // Sort slots by period start time after fetching
      const sortedSlots = slots
        ? [...slots].sort((a, b) => {
            if (a.day_of_week !== b.day_of_week) {
              return a.day_of_week.localeCompare(b.day_of_week);
            }

            // Then sort by period start time if days are the same
            const aStartTime = a.period?.start_time || '';
            const bStartTime = b.period?.start_time || '';
            return aStartTime.localeCompare(bStartTime);
          })
        : [];

      return {
        ...timetable,
        slots: sortedSlots
      };
    } catch (error) {
      console.error('Error fetching timetable:', error);
      throw error;
    }
  }

  static async saveTimetableAsTemplate(
    id: string,
    templateName: string
  ): Promise<Timetable> {
    try {
      // Get the current timetable
      const timetable = await this.getTimetable(id);

      // Create a new timetable as a template
      const { data: newTemplate, error } = await this.supabase
        .from('timetables')
        .insert([
          {
            institution_id: timetable.institution_id,
            academic_year_id: timetable.academic_year_id,
            degree_id: timetable.degree_id,
            program_id: timetable.program_id,
            department_id: timetable.department_id,
            semester: timetable.semester,
            section: timetable.section,
            timetable_name: timetable.timetable_name,
            version: 1,
            is_active: true,
            is_template: true,
            template_name: templateName
          }
        ])
        .select()
        .single();

      if (error) throw error;

      // Copy all slots to the new template
      if (timetable.slots && timetable.slots.length > 0) {
        const newSlots = timetable.slots.map((slot) => ({
          timetable_id: newTemplate.id,
          day_of_week: slot.day_of_week,
          period_id: slot.period_id,
          course_id: slot.course_id,
          staff_id: slot.staff_id,
          is_break_slot: slot.is_break_slot,
          break_description: slot.break_description
        }));

        const { error: slotsError } = await this.supabase
          .from('timetable_slots')
          .insert(newSlots);

        if (slotsError) throw slotsError;
      }

      toast.success('Timetable saved as template successfully');
      return this.getTimetable(newTemplate.id);
    } catch (error) {
      console.error('Error saving timetable as template:', error);
      throw error;
    }
  }

  static async createTimetableFromTemplate(
    templateId: string,
    newTimetableData: CreateTimetableDto
  ): Promise<Timetable> {
    try {
      // Create a new timetable
      const { data: newTimetable, error } = await this.supabase
        .from('timetables')
        .insert([
          {
            ...newTimetableData,
            version: 1,
            is_active: true,
            is_template: false
          }
        ])
        .select()
        .single();

      if (error) throw error;

      // Get all slots from the template
      const { data: templateSlots, error: slotsError } = await this.supabase
        .from('timetable_slots')
        .select('*')
        .eq('timetable_id', templateId);

      if (slotsError) throw slotsError;

      if (templateSlots && templateSlots.length > 0) {
        const newSlots = templateSlots.map((slot) => ({
          timetable_id: newTimetable.id,
          day_of_week: slot.day_of_week,
          period_id: slot.period_id,
          course_id: slot.course_id,
          staff_id: slot.staff_id,
          is_break_slot: slot.is_break_slot,
          break_description: slot.break_description
        }));

        const { error: insertError } = await this.supabase
          .from('timetable_slots')
          .insert(newSlots);

        if (insertError) throw insertError;
      }

      toast.success('Timetable created from template successfully');
      return this.getTimetable(newTimetable.id);
    } catch (error) {
      console.error('Error creating timetable from template:', error);
      throw error;
    }
  }

  // Timetable Slots Methods
  static async createTimetableSlot(
    data: CreateTimetableSlotDto
  ): Promise<TimetableSlot> {
    try {
      // Check for existing slot at the same day and period
      const { data: existing, error: checkError } = await this.supabase
        .from('timetable_slots')
        .select('*')
        .eq('timetable_id', data.timetable_id)
        .eq('day_of_week', data.day_of_week)
        .eq('period_id', data.period_id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        // Update the existing slot
        return this.updateTimetableSlot(existing.id, {
          course_id: data.course_id,
          staff_id: data.staff_id,
          is_break_slot: data.is_break_slot,
          break_description: data.break_description
        });
      }

      // Insert a new slot
      const { data: slot, error } = await this.supabase
        .from('timetable_slots')
        .insert([data])
        .select(
          `
          *,
          period:period_id(*),
          course:course_id(id, course_name, course_code),
          staff:staff_id(id, first_name, last_name)
        `
        )
        .single();

      if (error) throw error;

      return slot;
    } catch (error) {
      console.error('Error creating timetable slot:', error);
      throw error;
    }
  }

  static async updateTimetableSlot(
    id: string,
    data: UpdateTimetableSlotDto
  ): Promise<TimetableSlot> {
    try {
      const { data: slot, error } = await this.supabase
        .from('timetable_slots')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(
          `
          *,
          period:period_id(*),
          course:course_id(id, course_name, course_code),
          staff:staff_id(id, first_name, last_name)
        `
        )
        .single();

      if (error) throw error;

      return slot;
    } catch (error) {
      console.error('Error updating timetable slot:', error);
      throw error;
    }
  }

  static async deleteTimetableSlot(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('timetable_slots')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting timetable slot:', error);
      throw error;
    }
  }

  static async getTimetableSlotsByDay(
    timetableId: string,
    dayOfWeek: string
  ): Promise<TimetableSlot[]> {
    try {
      const { data: slots, error } = await this.supabase
        .from('timetable_slots')
        .select(
          `
          *,
          period:period_id(*),
          course:course_id(id, course_name, course_code),
          staff:staff_id(id, first_name, last_name)
        `
        )
        .eq('timetable_id', timetableId)
        .eq('day_of_week', dayOfWeek)
        .order('period.start_time', { ascending: true });

      if (error) throw error;

      return slots || [];
    } catch (error) {
      console.error('Error fetching timetable slots by day:', error);
      throw error;
    }
  }

  // Check for scheduling conflicts
  static async checkStaffConflicts(
    staffId: string,
    dayOfWeek: string,
    periodId: string,
    timetableId?: string
  ): Promise<boolean> {
    try {
      let query = this.supabase
        .from('timetable_slots')
        .select('id')
        .eq('staff_id', staffId)
        .eq('day_of_week', dayOfWeek)
        .eq('period_id', periodId);

      // Exclude current timetable if provided
      if (timetableId) {
        query = query.neq('timetable_id', timetableId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Return true if conflicts exist
      return data && data.length > 0;
    } catch (error) {
      console.error('Error checking staff conflicts:', error);
      throw error;
    }
  }
}
