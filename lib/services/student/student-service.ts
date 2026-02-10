// Student Service
// Real Supabase implementation against learners_profiles table
// Replaces the previous stub with actual database queries

import { createServiceRoleClient } from '@/lib/supabase/server';

export interface CreateStudentInput {
  institution_id: string;
  full_name: string;
  email?: string | null;
  phone: string;
  program_id?: string;
  semester_id?: string;
  academic_year?: string;
  admission_id?: string;
  profile_id?: string;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
}

export interface Student {
  id: string;
  institution_id: string;
  student_id: string;
  full_name: string;
  email: string | null;
  phone: string;
  program_id: string | null;
  semester_id: string | null;
  section_id: string | null;
  academic_year: string | null;
  enrollment_status: string;
  admission_id: string | null;
  profile_id: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Split a full name into first_name and last_name.
 * Everything before the first space is first_name; the rest is last_name.
 */
function splitName(fullName: string): { first_name: string; last_name: string } {
  const trimmed = (fullName || '').trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    return { first_name: trimmed || 'Unknown', last_name: '' };
  }
  return {
    first_name: trimmed.slice(0, spaceIdx),
    last_name: trimmed.slice(spaceIdx + 1).trim(),
  };
}

/**
 * Generate an application_id in the format JKKN-YYYY-NNNN
 * where NNNN is a random 4-digit number.
 * Collision is handled by the caller via retry.
 */
function generateApplicationId(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(1000 + Math.random() * 9000); // 1000–9999
  return `JKKN-${year}-${seq}`;
}

/**
 * Map a learners_profiles DB row to the Student interface.
 */
function mapRowToStudent(row: any): Student {
  const firstName = row.first_name || '';
  const lastName = row.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim() || 'Unknown';

  return {
    id: row.id,
    institution_id: row.institution_id || '',
    student_id: row.application_id || row.roll_number || '',
    full_name: fullName,
    email: row.student_email || row.college_email || null,
    phone: row.student_mobile || '',
    program_id: row.program_id || null,
    semester_id: row.semester_id || null,
    section_id: row.section_id || null,
    academic_year: row.academic_year_id || null,
    enrollment_status: row.lifecycle_status || 'active',
    admission_id: row.original_admission_id || null,
    profile_id: row.created_by || null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
  };
}

// ─── Service Class ──────────────────────────────────────────────────

export class StudentService {

  /**
   * Create a new learners_profiles record from an approved admission.
   * - Generates a unique application_id (JKKN-YYYY-NNNN)
   * - Sets lifecycle_status to 'active'
   * - Links back to the admission via original_admission_id
   */
  static async createStudentFromAdmission(
    admissionId: string,
    institutionId: string,
    data: Partial<CreateStudentInput>
  ): Promise<Student | null> {
    try {
      const supabase = createServiceRoleClient();

      // Check if a learner profile already exists for this admission
      const { data: existing } = await supabase
        .from('learners_profiles')
        .select('id')
        .eq('original_admission_id', admissionId)
        .maybeSingle();

      if (existing) {
        console.warn('[student-service] Learner profile already exists for admission:', admissionId);
        // Return the existing record instead of creating a duplicate
        const { data: fullRecord, error: fetchError } = await supabase
          .from('learners_profiles')
          .select('*')
          .eq('id', existing.id)
          .single();

        if (fetchError || !fullRecord) {
          console.error('[student-service] Failed to fetch existing record:', fetchError?.message);
          return null;
        }
        return mapRowToStudent(fullRecord);
      }

      // Split full_name into first/last
      const { first_name, last_name } = splitName(data.full_name || 'Unknown');

      // Generate a unique application_id with retry (up to 3 attempts)
      let applicationId = generateApplicationId();
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        const { data: idCheck } = await supabase
          .from('learners_profiles')
          .select('id')
          .eq('application_id', applicationId)
          .maybeSingle();

        if (!idCheck) break; // No collision, safe to use
        applicationId = generateApplicationId();
        retries++;
      }

      // Build the insert payload
      const insertPayload: Record<string, any> = {
        application_id: applicationId,
        original_admission_id: admissionId,
        migration_source: 'admission',
        lifecycle_status: 'active',
        institution_id: institutionId,
        first_name,
        last_name,
        student_email: data.email || '',
        student_mobile: data.phone || '',
        entry_type: 'admission',
      };

      // Optional academic fields
      if (data.program_id) insertPayload.program_id = data.program_id;
      if (data.semester_id) insertPayload.semester_id = data.semester_id;
      if (data.academic_year) insertPayload.academic_year_id = data.academic_year;
      if (data.profile_id) insertPayload.created_by = data.profile_id;

      // Optional personal fields
      if (data.date_of_birth) insertPayload.date_of_birth = data.date_of_birth;
      if (data.gender) insertPayload.gender = data.gender;
      if (data.address) insertPayload.permanent_address_street = data.address;
      if (data.city) insertPayload.permanent_address_district = data.city;
      if (data.state) insertPayload.permanent_address_state = data.state;
      if (data.pincode) insertPayload.permanent_address_pin_code = data.pincode;

      const { data: created, error } = await supabase
        .from('learners_profiles')
        .insert(insertPayload)
        .select('*')
        .single();

      if (error) {
        console.error('[student-service] Failed to create learner profile:', error.message);
        return null;
      }

      console.log('[student-service] Created learner profile:', created.id, 'from admission:', admissionId);
      return mapRowToStudent(created);
    } catch (error) {
      console.error('[student-service] Error in createStudentFromAdmission:', error);
      return null;
    }
  }

  /**
   * Get a single learner profile by its UUID.
   */
  static async getStudentById(id: string): Promise<Student | null> {
    try {
      const supabase = createServiceRoleClient();

      const { data, error } = await supabase
        .from('learners_profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('[student-service] getStudentById error:', error.message);
        return null;
      }

      return data ? mapRowToStudent(data) : null;
    } catch (error) {
      console.error('[student-service] Error in getStudentById:', error);
      return null;
    }
  }

  /**
   * Find a learner profile by its linked admission ID (original_admission_id).
   */
  static async getStudentByAdmissionId(admissionId: string): Promise<Student | null> {
    try {
      const supabase = createServiceRoleClient();

      const { data, error } = await supabase
        .from('learners_profiles')
        .select('*')
        .eq('original_admission_id', admissionId)
        .maybeSingle();

      if (error) {
        console.error('[student-service] getStudentByAdmissionId error:', error.message);
        return null;
      }

      return data ? mapRowToStudent(data) : null;
    } catch (error) {
      console.error('[student-service] Error in getStudentByAdmissionId:', error);
      return null;
    }
  }

  /**
   * Update a learner profile by its UUID.
   * Maps CreateStudentInput fields to the actual DB columns.
   */
  static async updateStudent(id: string, data: Partial<CreateStudentInput>): Promise<Student | null> {
    try {
      const supabase = createServiceRoleClient();

      // Build the update payload, only including provided fields
      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (data.full_name !== undefined) {
        const { first_name, last_name } = splitName(data.full_name);
        updatePayload.first_name = first_name;
        updatePayload.last_name = last_name;
      }
      if (data.email !== undefined) updatePayload.student_email = data.email || '';
      if (data.phone !== undefined) updatePayload.student_mobile = data.phone || '';
      if (data.institution_id !== undefined) updatePayload.institution_id = data.institution_id;
      if (data.program_id !== undefined) updatePayload.program_id = data.program_id;
      if (data.semester_id !== undefined) updatePayload.semester_id = data.semester_id;
      if (data.academic_year !== undefined) updatePayload.academic_year_id = data.academic_year;
      if (data.profile_id !== undefined) updatePayload.created_by = data.profile_id;
      if (data.date_of_birth !== undefined) updatePayload.date_of_birth = data.date_of_birth;
      if (data.gender !== undefined) updatePayload.gender = data.gender;
      if (data.address !== undefined) updatePayload.permanent_address_street = data.address;
      if (data.city !== undefined) updatePayload.permanent_address_district = data.city;
      if (data.state !== undefined) updatePayload.permanent_address_state = data.state;
      if (data.pincode !== undefined) updatePayload.permanent_address_pin_code = data.pincode;

      const { data: updated, error } = await supabase
        .from('learners_profiles')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('[student-service] updateStudent error:', error.message);
        return null;
      }

      return updated ? mapRowToStudent(updated) : null;
    } catch (error) {
      console.error('[student-service] Error in updateStudent:', error);
      return null;
    }
  }

  /**
   * List learner profiles for an institution with optional filters and pagination.
   * Supports filtering by program, semester, section, lifecycle status, and text search.
   */
  static async getStudentsByInstitution(
    institutionId: string,
    filters?: {
      program_id?: string;
      semester_id?: string;
      section_id?: string;
      enrollment_status?: string;
      search?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ data: Student[]; total: number }> {
    try {
      const supabase = createServiceRoleClient();

      const page = filters?.page ?? 1;
      const limit = filters?.limit ?? 25;
      const offset = (page - 1) * limit;

      // Build the query
      let query = supabase
        .from('learners_profiles')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      // Apply optional filters
      if (filters?.program_id) {
        query = query.eq('program_id', filters.program_id);
      }
      if (filters?.semester_id) {
        query = query.eq('semester_id', filters.semester_id);
      }
      if (filters?.section_id) {
        query = query.eq('section_id', filters.section_id);
      }
      if (filters?.enrollment_status) {
        query = query.eq('lifecycle_status', filters.enrollment_status);
      }

      // Text search across first_name, last_name, student_email, roll_number, application_id
      if (filters?.search) {
        const term = `%${filters.search}%`;
        query = query.or(
          `first_name.ilike.${term},last_name.ilike.${term},student_email.ilike.${term},roll_number.ilike.${term},application_id.ilike.${term},student_mobile.ilike.${term}`
        );
      }

      // Ordering and pagination
      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('[student-service] getStudentsByInstitution error:', error.message);
        return { data: [], total: 0 };
      }

      const students = (data || []).map(mapRowToStudent);
      return { data: students, total: count ?? students.length };
    } catch (error) {
      console.error('[student-service] Error in getStudentsByInstitution:', error);
      return { data: [], total: 0 };
    }
  }
}

// ─── Standalone Function Exports (backward compatibility) ───────────

export async function createStudentFromAdmission(
  admissionId: string,
  institutionId: string,
  data: Partial<CreateStudentInput>
): Promise<Student | null> {
  return StudentService.createStudentFromAdmission(admissionId, institutionId, data);
}

export async function getStudentById(id: string): Promise<Student | null> {
  return StudentService.getStudentById(id);
}

export async function getStudentByAdmissionId(admissionId: string): Promise<Student | null> {
  return StudentService.getStudentByAdmissionId(admissionId);
}
