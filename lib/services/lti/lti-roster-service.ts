/**
 * LTI Roster Service
 * Handles roster management for LTI Names and Roles Provisioning Service (NRPS)
 *
 * Provides student/faculty rosters to external tools (MATLAB) so they can:
 * - Enroll students in courses automatically
 * - Display correct names and emails
 * - Filter by section/class
 *
 * LTI NRPS Specification:
 * - Returns context membership (students + faculty)
 * - Includes user IDs, names, emails, roles
 * - Supports pagination for large rosters
 *
 * Created: 2026-01-12
 */

import { createClient } from '@/lib/supabase/server';
import { LtiRoleService } from './lti-role-service';
import { LtiError, LTI_ERROR_CODES } from '@/types/lti';

// LTI NRPS Member
export interface LtiMember {
  status: 'Active' | 'Inactive';
  name: string;
  given_name?: string;
  family_name?: string;
  email: string;
  user_id: string;
  roles: string[]; // LTI role URIs
  lis_person_sourcedid?: string; // Student ID / Roll Number
}

// LTI NRPS Context
export interface LtiContext {
  id: string;
  label: string;
  title: string;
}

// LTI NRPS Response
export interface LtiNrpsResponse {
  id: string; // Context ID
  context: LtiContext;
  members: LtiMember[];
}

// Roster Filters
export interface RosterFilters {
  institutionId: string;
  programId?: string;
  semesterId?: string;
  sectionId?: string;
  lifecycle_status?: string;
  limit?: number;
  offset?: number;
}

export class LtiRosterService {
  /**
   * Get roster for a specific context (program/semester/section)
   */
  static async getRosterForContext(
    filters: RosterFilters
  ): Promise<LtiMember[]> {
    const supabase = await createClient();

    // Build query
    let query = supabase
      .from('learners_profiles')
      .select(
        `
        id,
        user_id,
        first_name,
        last_name,
        college_email,
        roll_number,
        lifecycle_status,
        program_id,
        semester_id,
        section_id,
        programs (name),
        semesters (name),
        sections (name)
      `
      )
      .eq('institution_id', filters.institutionId);

    // Apply filters
    if (filters.programId) {
      query = query.eq('program_id', filters.programId);
    }

    if (filters.semesterId) {
      query = query.eq('semester_id', filters.semesterId);
    }

    if (filters.sectionId) {
      query = query.eq('section_id', filters.sectionId);
    }

    // Only active students by default
    const status = filters.lifecycle_status || 'active';
    query = query.eq('lifecycle_status', status);

    // Must have valid email
    query = query.not('college_email', 'is', null);

    // Pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 100) - 1);
    }

    // Order by name
    query = query.order('first_name').order('last_name');

    const { data, error } = await query;

    if (error) {
      console.error('[LTI Roster Service] Error fetching roster:', error);
      throw new LtiError(
        LTI_ERROR_CODES.DATABASE_ERROR,
        'Failed to fetch roster',
        500
      );
    }

    // Map to LTI members
    const members: LtiMember[] = data.map((learner: any) => {
      return {
        status: learner.lifecycle_status === 'active' ? 'Active' : 'Inactive',
        name: `${learner.first_name} ${learner.last_name}`,
        given_name: learner.first_name,
        family_name: learner.last_name,
        email: learner.college_email,
        user_id: learner.user_id,
        roles: LtiRoleService.mapRoleToLti('student'), // All learners are students
        lis_person_sourcedid: learner.roll_number || undefined
      };
    });

    return members;
  }

  /**
   * Get faculty for a context (optional - for instructor roster)
   */
  static async getFacultyForContext(
    institutionId: string,
    programId?: string,
    semesterId?: string,
    sectionId?: string
  ): Promise<LtiMember[]> {
    const supabase = await createClient();

    // TODO: Implement faculty assignment to sections
    // For now, return empty array as faculty assignment system not yet implemented

    return [];
  }

  /**
   * Build context information from IDs
   */
  static async buildContextFromIds(
    institutionId: string,
    programId?: string,
    semesterId?: string,
    sectionId?: string
  ): Promise<LtiContext> {
    const supabase = await createClient();

    let contextLabel = '';
    let contextTitle = '';

    // Fetch program
    if (programId) {
      const { data: program } = await supabase
        .from('programs')
        .select('name, code')
        .eq('id', programId)
        .single();

      if (program) {
        contextLabel = program.code || program.name;
        contextTitle = program.name;
      }
    }

    // Fetch semester
    if (semesterId) {
      const { data: semester } = await supabase
        .from('semesters')
        .select('name')
        .eq('id', semesterId)
        .single();

      if (semester) {
        contextLabel += semester.name ? `-${semester.name}` : '';
        contextTitle += semester.name ? ` - ${semester.name}` : '';
      }
    }

    // Fetch section
    if (sectionId) {
      const { data: section } = await supabase
        .from('sections')
        .select('name')
        .eq('id', sectionId)
        .single();

      if (section) {
        contextLabel += section.name ? `-${section.name}` : '';
        contextTitle += section.name ? ` - Section ${section.name}` : '';
      }
    }

    // Generate context ID
    const contextId = this.generateContextId(
      institutionId,
      programId,
      semesterId,
      sectionId
    );

    return {
      id: contextId,
      label: contextLabel || 'Unknown Context',
      title: contextTitle || 'Unknown Context'
    };
  }

  /**
   * Generate context ID from components
   */
  static generateContextId(
    institutionId: string,
    programId?: string,
    semesterId?: string,
    sectionId?: string
  ): string {
    const parts = [institutionId];

    if (programId) parts.push(programId);
    if (semesterId) parts.push(semesterId);
    if (sectionId) parts.push(sectionId);

    return parts.join('_');
  }

  /**
   * Parse context ID into components
   */
  static parseContextId(contextId: string): {
    institutionId: string;
    programId?: string;
    semesterId?: string;
    sectionId?: string;
  } {
    const parts = contextId.split('_');

    return {
      institutionId: parts[0],
      programId: parts[1],
      semesterId: parts[2],
      sectionId: parts[3]
    };
  }

  /**
   * Get complete roster (students + faculty) for context
   */
  static async getCompleteRoster(
    filters: RosterFilters
  ): Promise<LtiNrpsResponse> {
    // Get students
    const students = await this.getRosterForContext(filters);

    // Get faculty (TODO: implement when faculty assignment is ready)
    const faculty = await this.getFacultyForContext(
      filters.institutionId,
      filters.programId,
      filters.semesterId,
      filters.sectionId
    );

    // Combine members
    const members = [...students, ...faculty];

    // Build context
    const context = await this.buildContextFromIds(
      filters.institutionId,
      filters.programId,
      filters.semesterId,
      filters.sectionId
    );

    const contextId = this.generateContextId(
      filters.institutionId,
      filters.programId,
      filters.semesterId,
      filters.sectionId
    );

    return {
      id: contextId,
      context,
      members
    };
  }

  /**
   * Get roster statistics
   */
  static async getRosterStats(filters: RosterFilters): Promise<{
    total: number;
    active: number;
    inactive: number;
  }> {
    const supabase = await createClient();

    let query = supabase
      .from('learners_profiles')
      .select('lifecycle_status', { count: 'exact', head: true })
      .eq('institution_id', filters.institutionId);

    if (filters.programId) {
      query = query.eq('program_id', filters.programId);
    }

    if (filters.semesterId) {
      query = query.eq('semester_id', filters.semesterId);
    }

    if (filters.sectionId) {
      query = query.eq('section_id', filters.sectionId);
    }

    const [totalResult, activeResult] = await Promise.all([
      query,
      supabase
        .from('learners_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('institution_id', filters.institutionId)
        .eq('lifecycle_status', 'active')
    ]);

    const total = totalResult.count || 0;
    const active = activeResult.count || 0;

    return {
      total,
      active,
      inactive: total - active
    };
  }
}
