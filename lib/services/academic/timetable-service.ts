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
      // First delete all timetable periods
      const { error: periodsError } = await this.supabase
        .from('timetable_periods')
        .delete()
        .eq('timetable_id', id);

      if (periodsError) throw periodsError;

      // Then delete all timetable slots
      const { error: slotsError } = await this.supabase
        .from('timetable_slots')
        .delete()
        .eq('timetable_id', id);

      if (slotsError) throw slotsError;

      // Finally delete the timetable
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

      // Get related data for each slot (staff, sections, sub-slots)
      if (slots && slots.length > 0) {
        for (const slot of slots) {
          if (slot.is_combined) {
            // For combined slots, get sub-slots with their staff and sections
            const { data: subSlots, error: subSlotsError } = await this.supabase
              .from('timetable_sub_slots')
              .select(
                `
                *,
                course:course_id(id, course_name, course_code)
              `
              )
              .eq('parent_slot_id', slot.id)
              .order('sub_slot_order');

            if (subSlotsError) {
              console.error('Error fetching sub-slots:', subSlotsError);
            } else if (subSlots) {
              // Get staff and sections for each sub-slot
              for (const subSlot of subSlots) {
                // Get staff for this sub-slot
                const { data: subSlotStaff, error: staffError } =
                  await this.supabase
                    .from('timetable_sub_slot_staff')
                    .select(
                      `
                    staff_id,
                    staff:staff_id(id, first_name, last_name)
                  `
                    )
                    .eq('sub_slot_id', subSlot.id);

                if (staffError) {
                  console.error('Error fetching sub-slot staff:', staffError);
                } else {
                  subSlot.staff_members =
                    subSlotStaff?.map((ss) => ss.staff).filter(Boolean) || [];
                }

                // Get sections for this sub-slot
                const { data: subSlotSections, error: sectionsError } =
                  await this.supabase
                    .from('timetable_sub_slot_sections')
                    .select(
                      `
                    section_id,
                    sections:section_id(id, section_name)
                  `
                    )
                    .eq('sub_slot_id', subSlot.id);

                if (sectionsError) {
                  console.error(
                    'Error fetching sub-slot sections:',
                    sectionsError
                  );
                } else {
                  subSlot.sections =
                    subSlotSections?.map((ss) => ss.sections).filter(Boolean) ||
                    [];
                }
              }

              slot.sub_slots = subSlots;
            }
          } else {
            // For regular slots, get staff and sections

            // Get staff members from the junction table
            const { data: slotStaff, error: staffError } = await this.supabase
              .from('timetable_slot_staff')
              .select(
                `
                staff_id,
                staff:staff_id(id, first_name, last_name)
              `
              )
              .eq('timetable_slot_id', slot.id);

            if (staffError) {
              console.error('Error fetching slot staff:', staffError);
            } else {
              slot.staff_members =
                slotStaff?.map((ss) => ss.staff).filter(Boolean) || [];
            }

            // Get sections from the junction table
            const { data: slotSections, error: sectionsError } =
              await this.supabase
                .from('timetable_slot_sections')
                .select(
                  `
                section_id,
                sections:section_id(id, section_name)
              `
                )
                .eq('timetable_slot_id', slot.id);

            if (sectionsError) {
              console.error('Error fetching slot sections:', sectionsError);
            } else {
              slot.sections =
                slotSections?.map((ss) => ss.sections).filter(Boolean) || [];
            }
          }
        }
      }

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

      // Copy period selections to the new template
      const timetablePeriods = await this.getTimetablePeriods(id);
      if (timetablePeriods.length > 0) {
        const newTimetablePeriods = timetablePeriods.map((tp) => ({
          timetable_id: newTemplate.id,
          period_id: tp.period_id,
          sort_order: tp.sort_order
        }));

        const { error: periodsError } = await this.supabase
          .from('timetable_periods')
          .insert(newTimetablePeriods);

        if (periodsError) throw periodsError;
      }

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

      // Copy period selections from the template
      const templatePeriods = await this.getTimetablePeriods(templateId);
      if (templatePeriods.length > 0) {
        const newTimetablePeriods = templatePeriods.map((tp) => ({
          timetable_id: newTimetable.id,
          period_id: tp.period_id,
          sort_order: tp.sort_order
        }));

        const { error: periodsError } = await this.supabase
          .from('timetable_periods')
          .insert(newTimetablePeriods);

        if (periodsError) throw periodsError;
      }

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
          staff_ids: data.staff_ids,
          section_ids: data.section_ids,
          is_break_slot: data.is_break_slot,
          break_description: data.break_description,
          is_combined: data.is_combined,
          sub_slots: data.sub_slots
        });
      }

      // Prepare slot data for insertion
      const slotData = {
        timetable_id: data.timetable_id,
        day_of_week: data.day_of_week,
        period_id: data.period_id,
        course_id: data.is_combined ? null : data.course_id, // No main course for combined slots
        staff_id: data.staff_id, // Keep for backward compatibility
        is_break_slot: data.is_break_slot || false,
        break_description: data.break_description,
        is_combined: data.is_combined || false
      };

      // Insert a new slot
      const { data: slot, error } = await this.supabase
        .from('timetable_slots')
        .insert([slotData])
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

      // Handle combined class with sub-slots
      if (data.is_combined && data.sub_slots && data.sub_slots.length > 0) {
        for (const subSlotData of data.sub_slots) {
          await this.createSubSlot(slot.id, subSlotData);
        }
      } else {
        // Handle regular slot assignments (non-combined)

        // Handle multiple staff assignments
        if (data.staff_ids && data.staff_ids.length > 0) {
          const staffAssignments = data.staff_ids.map((staffId) => ({
            timetable_slot_id: slot.id,
            staff_id: staffId
          }));

          const { error: staffError } = await this.supabase
            .from('timetable_slot_staff')
            .insert(staffAssignments);

          if (staffError) {
            console.error('Error assigning staff to slot:', staffError);
          }
        }

        // Handle multiple section assignments
        if (data.section_ids && data.section_ids.length > 0) {
          const sectionAssignments = data.section_ids.map((sectionId) => ({
            timetable_slot_id: slot.id,
            section_id: sectionId
          }));

          const { error: sectionError } = await this.supabase
            .from('timetable_slot_sections')
            .insert(sectionAssignments);

          if (sectionError) {
            console.error('Error assigning sections to slot:', sectionError);
          }
        }
      }

      // Fetch the complete slot with all relations
      return this.getSlotWithStaff(slot.id);
    } catch (error) {
      console.error('Error creating timetable slot:', error);
      throw error;
    }
  }

  // Create a sub-slot for combined classes
  static async createSubSlot(
    parentSlotId: string,
    subSlotData: any
  ): Promise<void> {
    try {
      // Insert the sub-slot
      const { data: subSlot, error } = await this.supabase
        .from('timetable_sub_slots')
        .insert([
          {
            parent_slot_id: parentSlotId,
            sub_slot_order: subSlotData.sub_slot_order,
            course_id: subSlotData.course_id,
            is_break_slot: subSlotData.is_break_slot || false,
            break_description: subSlotData.break_description
          }
        ])
        .select()
        .single();

      if (error) throw error;

      // Handle staff assignments for this sub-slot
      if (subSlotData.staff_ids && subSlotData.staff_ids.length > 0) {
        const staffAssignments = subSlotData.staff_ids.map(
          (staffId: string) => ({
            sub_slot_id: subSlot.id,
            staff_id: staffId
          })
        );

        const { error: staffError } = await this.supabase
          .from('timetable_sub_slot_staff')
          .insert(staffAssignments);

        if (staffError) {
          console.error('Error assigning staff to sub-slot:', staffError);
        }
      }

      // Handle section assignments for this sub-slot
      if (subSlotData.section_ids && subSlotData.section_ids.length > 0) {
        const sectionAssignments = subSlotData.section_ids.map(
          (sectionId: string) => ({
            sub_slot_id: subSlot.id,
            section_id: sectionId
          })
        );

        const { error: sectionError } = await this.supabase
          .from('timetable_sub_slot_sections')
          .insert(sectionAssignments);

        if (sectionError) {
          console.error('Error assigning sections to sub-slot:', sectionError);
        }
      }
    } catch (error) {
      console.error('Error creating sub-slot:', error);
      throw error;
    }
  }

  static async getSlotWithStaff(slotId: string): Promise<TimetableSlot> {
    try {
      // Get the slot with basic relations
      const { data: slot, error } = await this.supabase
        .from('timetable_slots')
        .select(
          `
          *,
          period:period_id(*),
          course:course_id(id, course_name, course_code),
          staff:staff_id(id, first_name, last_name)
        `
        )
        .eq('id', slotId)
        .single();

      if (error) throw error;

      if (slot.is_combined) {
        // For combined slots, get sub-slots with their staff and sections
        const { data: subSlots, error: subSlotsError } = await this.supabase
          .from('timetable_sub_slots')
          .select(
            `
            *,
            course:course_id(id, course_name, course_code)
          `
          )
          .eq('parent_slot_id', slotId)
          .order('sub_slot_order');

        if (subSlotsError) {
          console.error('Error fetching sub-slots:', subSlotsError);
        } else if (subSlots) {
          // Get staff and sections for each sub-slot
          for (const subSlot of subSlots) {
            // Get staff for this sub-slot
            const { data: subSlotStaff, error: staffError } =
              await this.supabase
                .from('timetable_sub_slot_staff')
                .select(
                  `
                staff_id,
                staff:staff_id(id, first_name, last_name)
              `
                )
                .eq('sub_slot_id', subSlot.id);

            if (staffError) {
              console.error('Error fetching sub-slot staff:', staffError);
            } else {
              subSlot.staff_members =
                subSlotStaff?.map((ss) => ss.staff).filter(Boolean) || [];
            }

            // Get sections for this sub-slot
            const { data: subSlotSections, error: sectionsError } =
              await this.supabase
                .from('timetable_sub_slot_sections')
                .select(
                  `
                section_id,
                sections:section_id(id, section_name)
              `
                )
                .eq('sub_slot_id', subSlot.id);

            if (sectionsError) {
              console.error('Error fetching sub-slot sections:', sectionsError);
            } else {
              subSlot.sections =
                subSlotSections?.map((ss) => ss.sections).filter(Boolean) || [];
            }
          }

          slot.sub_slots = subSlots;
        }
      } else {
        // For regular slots, get staff and sections

        // Get staff members from the junction table
        const { data: slotStaff, error: staffError } = await this.supabase
          .from('timetable_slot_staff')
          .select(
            `
            staff_id,
            staff:staff_id(id, first_name, last_name)
          `
          )
          .eq('timetable_slot_id', slotId);

        if (staffError) {
          console.error('Error fetching slot staff:', staffError);
        } else {
          slot.staff_members =
            slotStaff?.map((ss) => ss.staff).filter(Boolean) || [];
        }

        // Get sections from the junction table
        const { data: slotSections, error: sectionsError } = await this.supabase
          .from('timetable_slot_sections')
          .select(
            `
            section_id,
            sections:section_id(id, section_name)
          `
          )
          .eq('timetable_slot_id', slotId);

        if (sectionsError) {
          console.error('Error fetching slot sections:', sectionsError);
        } else {
          slot.sections =
            slotSections?.map((ss) => ss.sections).filter(Boolean) || [];
        }
      }

      return slot;
    } catch (error) {
      console.error('Error fetching slot with staff:', error);
      throw error;
    }
  }

  static async updateTimetableSlot(
    id: string,
    data: UpdateTimetableSlotDto
  ): Promise<TimetableSlot> {
    try {
      // Prepare update data (exclude complex fields from main table update)
      const { staff_ids, section_ids, sub_slots, ...slotUpdateData } = data;

      const { data: slot, error } = await this.supabase
        .from('timetable_slots')
        .update({
          ...slotUpdateData,
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

      // Handle combined class updates
      if (data.is_combined && sub_slots) {
        // Delete existing sub-slots (CASCADE will handle related records)
        const { error: deleteSubSlotsError } = await this.supabase
          .from('timetable_sub_slots')
          .delete()
          .eq('parent_slot_id', id);

        if (deleteSubSlotsError) {
          console.error(
            'Error deleting existing sub-slots:',
            deleteSubSlotsError
          );
        }

        // Create new sub-slots
        for (const subSlotData of sub_slots) {
          await this.createSubSlot(id, subSlotData);
        }
      } else {
        // Handle regular slot updates (non-combined)

        // Handle multiple staff assignments if provided
        if (staff_ids !== undefined) {
          // First, delete existing staff assignments
          const { error: deleteError } = await this.supabase
            .from('timetable_slot_staff')
            .delete()
            .eq('timetable_slot_id', id);

          if (deleteError) {
            console.error(
              'Error deleting existing staff assignments:',
              deleteError
            );
          }

          // Then, insert new staff assignments
          if (staff_ids.length > 0) {
            const staffAssignments = staff_ids.map((staffId) => ({
              timetable_slot_id: id,
              staff_id: staffId
            }));

            const { error: insertError } = await this.supabase
              .from('timetable_slot_staff')
              .insert(staffAssignments);

            if (insertError) {
              console.error(
                'Error inserting new staff assignments:',
                insertError
              );
            }
          }
        }

        // Handle multiple section assignments if provided
        if (section_ids !== undefined) {
          // First, delete existing section assignments
          const { error: deleteError } = await this.supabase
            .from('timetable_slot_sections')
            .delete()
            .eq('timetable_slot_id', id);

          if (deleteError) {
            console.error(
              'Error deleting existing section assignments:',
              deleteError
            );
          }

          // Then, insert new section assignments
          if (section_ids.length > 0) {
            const sectionAssignments = section_ids.map((sectionId) => ({
              timetable_slot_id: id,
              section_id: sectionId
            }));

            const { error: insertError } = await this.supabase
              .from('timetable_slot_sections')
              .insert(sectionAssignments);

            if (insertError) {
              console.error(
                'Error inserting new section assignments:',
                insertError
              );
            }
          }
        }
      }

      // Return the complete slot with all relations
      return this.getSlotWithStaff(id);
    } catch (error) {
      console.error('Error updating timetable slot:', error);
      throw error;
    }
  }

  static async deleteTimetableSlot(id: string): Promise<void> {
    try {
      // Delete staff assignments (CASCADE should handle this, but let's be explicit)
      const { error: staffError } = await this.supabase
        .from('timetable_slot_staff')
        .delete()
        .eq('timetable_slot_id', id);

      if (staffError) {
        console.error('Error deleting staff assignments:', staffError);
      }

      // Delete section assignments
      const { error: sectionError } = await this.supabase
        .from('timetable_slot_sections')
        .delete()
        .eq('timetable_slot_id', id);

      if (sectionError) {
        console.error('Error deleting section assignments:', sectionError);
      }

      // Delete sub-slots (CASCADE will handle sub-slot staff and sections)
      const { error: subSlotsError } = await this.supabase
        .from('timetable_sub_slots')
        .delete()
        .eq('parent_slot_id', id);

      if (subSlotsError) {
        console.error('Error deleting sub-slots:', subSlotsError);
      }

      // Finally delete the main slot
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
      // Check conflicts in the legacy staff_id field (backward compatibility)
      let legacyQuery = this.supabase
        .from('timetable_slots')
        .select('id')
        .eq('staff_id', staffId)
        .eq('day_of_week', dayOfWeek)
        .eq('period_id', periodId);

      // Exclude current timetable if provided
      if (timetableId) {
        legacyQuery = legacyQuery.neq('timetable_id', timetableId);
      }

      const { data: legacyConflicts, error: legacyError } = await legacyQuery;

      if (legacyError) throw legacyError;

      // Check conflicts in the new many-to-many staff assignments
      let staffAssignmentQuery = this.supabase
        .from('timetable_slot_staff')
        .select(
          `
          timetable_slot_id,
          timetable_slots!inner(
            id,
            timetable_id,
            day_of_week,
            period_id
          )
        `
        )
        .eq('staff_id', staffId)
        .eq('timetable_slots.day_of_week', dayOfWeek)
        .eq('timetable_slots.period_id', periodId);

      // Exclude current timetable if provided
      if (timetableId) {
        staffAssignmentQuery = staffAssignmentQuery.neq(
          'timetable_slots.timetable_id',
          timetableId
        );
      }

      const { data: staffConflicts, error: staffError } =
        await staffAssignmentQuery;

      if (staffError) throw staffError;

      // Return true if conflicts exist in either check
      const hasLegacyConflicts = legacyConflicts && legacyConflicts.length > 0;
      const hasStaffConflicts = staffConflicts && staffConflicts.length > 0;

      return hasLegacyConflicts || hasStaffConflicts;
    } catch (error) {
      console.error('Error checking staff conflicts:', error);
      throw error;
    }
  }

  // Timetable Periods Methods
  static async getTimetablePeriods(timetableId: string): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('timetable_periods')
        .select(
          `
          *,
          period:period_id(*)
        `
        )
        .eq('timetable_id', timetableId)
        .order('sort_order');

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching timetable periods:', error);
      throw error;
    }
  }

  static async saveTimetablePeriods(
    timetableId: string,
    periodIds: string[]
  ): Promise<void> {
    try {
      // First, delete existing timetable periods
      const { error: deleteError } = await this.supabase
        .from('timetable_periods')
        .delete()
        .eq('timetable_id', timetableId);

      if (deleteError) throw deleteError;

      // Then insert new periods with sort order
      if (periodIds.length > 0) {
        const timetablePeriods = periodIds.map((periodId, index) => ({
          timetable_id: timetableId,
          period_id: periodId,
          sort_order: index
        }));

        const { error: insertError } = await this.supabase
          .from('timetable_periods')
          .insert(timetablePeriods);

        if (insertError) throw insertError;
      }
    } catch (error) {
      console.error('Error saving timetable periods:', error);
      throw error;
    }
  }

  // Timetable Days Methods
  static async saveTimetableDays(
    timetableId: string,
    selectedDays: string[]
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('timetables')
        .update({
          selected_days: selectedDays,
          updated_at: new Date().toISOString()
        })
        .eq('id', timetableId);

      if (error) throw error;
    } catch (error) {
      console.error('Error saving timetable days:', error);
      throw error;
    }
  }
}
