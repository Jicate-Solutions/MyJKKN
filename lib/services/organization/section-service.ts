import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  Section,
  CreateSectionDto,
  UpdateSectionDto,
  SectionFilters,
  SectionListResponse
} from '@/types/organizations';

export class SectionService {
  private static supabase = createClientSupabaseClient();

  static async createSection(data: CreateSectionDto): Promise<Section> {
    try {
      const { data: section, error } = await this.supabase
        .from('sections')
        .insert([data])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(`Section name "${data.section_name}" already exists`);
        }
        throw error;
      }

      toast.success('Section created successfully');
      return section;
    } catch (error) {
      console.error('Error creating section:', error);
      throw error;
    }
  }

  static async updateSection(
    id: string,
    data: UpdateSectionDto
  ): Promise<Section> {
    try {
      const { data: section, error } = await this.supabase
        .from('sections')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Section updated successfully');
      return section;
    } catch (error) {
      console.error('Error updating section:', error);
      throw error;
    }
  }

  static async deleteSection(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('sections')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting section:', error);
      throw error;
    }
  }

  static async getSections(
    filters: SectionFilters = {}
  ): Promise<SectionListResponse> {
    try {
      let query = this.supabase
        .from('sections')
        .select('*', { count: 'exact' });

      // Apply filters
      if (filters.search) {
        query = query.ilike('section_name', `%${filters.search}%`);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data: sections, error, count } = await query;

      if (error) throw error;

      return {
        data: sections || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching sections:', error);
      throw error;
    }
  }

  static async getSection(id: string): Promise<Section> {
    try {
      const { data: section, error } = await this.supabase
        .from('sections')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return section;
    } catch (error) {
      console.error('Error fetching section:', error);
      throw error;
    }
  }

  static async getSectionsBySemester(semesterId: string): Promise<Section[]> {
    try {
      const { data: sections, error } = await this.supabase
        .from('sections')
        .select('*')
        .eq('is_active', true)
        .order('section_name');

      if (error) throw error;

      return sections || [];
    } catch (error) {
      console.error('Error fetching sections by semester:', error);
      throw error;
    }
  }
}
