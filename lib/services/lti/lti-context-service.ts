/**
 * LTI Context Service
 *
 * Builds LTI context claims for course/class assignments
 * Queries academic hierarchy (program, semester, section)
 *
 * Created: 2026-01-12
 */

import { createClient } from '@/lib/supabase/server';
import {
  LtiContext,
  LtiError,
  LTI_ERROR_CODES
} from '@/types/lti';

interface AcademicContext {
  institutionId: string;
  programId?: string;
  semesterId?: string;
  sectionId?: string;
  academicYearId?: string;
}

interface ContextDetails {
  institutionName?: string;
  programName?: string;
  programCode?: string;
  semesterName?: string;
  semesterNumber?: number;
  sectionName?: string;
  academicYearName?: string;
}

export class LtiContextService {
  /**
   * Build LTI context claim from academic context
   */
  static async buildContextClaim(
    academicContext: AcademicContext
  ): Promise<LtiContext | null> {
    const {
      institutionId,
      programId,
      semesterId,
      sectionId,
      academicYearId
    } = academicContext;

    // If no academic context provided, return null (optional claim)
    if (!programId && !semesterId && !sectionId) {
      return null;
    }

    try {
      // Fetch context details from database
      const details = await this.fetchContextDetails(academicContext);

      // Generate context ID
      const contextId = this.generateContextId(academicContext);

      // Generate context label (short form)
      const contextLabel = this.generateContextLabel(details);

      // Generate context title (full descriptive name)
      const contextTitle = this.generateContextTitle(details);

      // Build LTI context claim
      const context: LtiContext = {
        id: contextId,
        label: contextLabel,
        title: contextTitle,
        type: ['http://purl.imsglobal.org/vocab/lis/v2/course#CourseSection']
      };

      return context;
    } catch (error) {
      console.error('[LTI Context Service] Failed to build context claim:', error);
      throw new LtiError(
        'Failed to build LTI context claim',
        LTI_ERROR_CODES.INVALID_CONTEXT,
        500,
        error
      );
    }
  }

  /**
   * Fetch context details from database
   */
  private static async fetchContextDetails(
    academicContext: AcademicContext
  ): Promise<ContextDetails> {
    const supabase = await createClient();
    const details: ContextDetails = {};

    try {
      // Fetch institution
      if (academicContext.institutionId) {
        const { data: institution } = await supabase
          .from('institutions')
          .select('name')
          .eq('id', academicContext.institutionId)
          .single();

        if (institution) {
          details.institutionName = institution.name;
        }
      }

      // Fetch program
      if (academicContext.programId) {
        const { data: program } = await supabase
          .from('programs')
          .select('name, code')
          .eq('id', academicContext.programId)
          .single();

        if (program) {
          details.programName = program.name;
          details.programCode = program.code;
        }
      }

      // Fetch semester
      if (academicContext.semesterId) {
        const { data: semester } = await supabase
          .from('semesters')
          .select('name, semester_number')
          .eq('id', academicContext.semesterId)
          .single();

        if (semester) {
          details.semesterName = semester.name;
          details.semesterNumber = semester.semester_number;
        }
      }

      // Fetch section
      if (academicContext.sectionId) {
        const { data: section } = await supabase
          .from('sections')
          .select('name')
          .eq('id', academicContext.sectionId)
          .single();

        if (section) {
          details.sectionName = section.name;
        }
      }

      // Fetch academic year
      if (academicContext.academicYearId) {
        const { data: academicYear } = await supabase
          .from('academic_years')
          .select('year_name')
          .eq('id', academicContext.academicYearId)
          .single();

        if (academicYear) {
          details.academicYearName = academicYear.year_name;
        }
      }

      return details;
    } catch (error) {
      console.error('[LTI Context Service] Failed to fetch context details:', error);
      return details; // Return partial details
    }
  }

  /**
   * Generate context ID (unique identifier for this context)
   * Format: {program_id}_{semester_id}_{section_id}
   */
  private static generateContextId(academicContext: AcademicContext): string {
    const parts = [
      academicContext.programId || 'no-program',
      academicContext.semesterId || 'no-semester',
      academicContext.sectionId || 'no-section'
    ];

    return parts.join('_');
  }

  /**
   * Generate context label (short form)
   * Format: "CSE-S3-A" or "CSE-Semester 3-A"
   */
  private static generateContextLabel(details: ContextDetails): string {
    const parts: string[] = [];

    if (details.programCode) {
      parts.push(details.programCode);
    } else if (details.programName) {
      parts.push(details.programName);
    }

    if (details.semesterNumber) {
      parts.push(`S${details.semesterNumber}`);
    } else if (details.semesterName) {
      parts.push(details.semesterName);
    }

    if (details.sectionName) {
      parts.push(details.sectionName);
    }

    return parts.length > 0 ? parts.join('-') : 'General';
  }

  /**
   * Generate context title (full descriptive name)
   * Format: "Computer Science - Semester 3 - Section A"
   */
  private static generateContextTitle(details: ContextDetails): string {
    const parts: string[] = [];

    if (details.programName) {
      parts.push(details.programName);
    }

    if (details.semesterName) {
      parts.push(details.semesterName);
    }

    if (details.sectionName) {
      parts.push(`Section ${details.sectionName}`);
    }

    if (details.academicYearName) {
      parts.push(`(${details.academicYearName})`);
    }

    return parts.length > 0 ? parts.join(' - ') : 'General Course';
  }

  /**
   * Build custom MyJKKN institution claim
   */
  static async buildInstitutionClaim(institutionId: string): Promise<any> {
    const supabase = await createClient();

    try {
      const { data: institution, error } = await supabase
        .from('institutions')
        .select('id, name, code, type')
        .eq('id', institutionId)
        .single();

      if (error || !institution) {
        console.warn('[LTI Context Service] Institution not found:', institutionId);
        return null;
      }

      return {
        id: institution.id,
        name: institution.name,
        code: institution.code,
        type: institution.type
      };
    } catch (error) {
      console.error('[LTI Context Service] Failed to build institution claim:', error);
      return null;
    }
  }

  /**
   * Build custom MyJKKN learner claim
   */
  static async buildLearnerClaim(learnerProfileId: string): Promise<any> {
    const supabase = await createClient();

    try {
      const { data: learner, error } = await supabase
        .from('learners_profiles')
        .select(`
          id,
          first_name,
          last_name,
          registration_number,
          lifecycle_status,
          program:programs(id, name, code),
          semester:semesters(id, name, semester_number),
          section:sections(id, name)
        `)
        .eq('id', learnerProfileId)
        .single();

      if (error || !learner) {
        console.warn('[LTI Context Service] Learner profile not found:', learnerProfileId);
        return null;
      }

      return {
        id: learner.id,
        registrationNumber: learner.registration_number,
        lifecycleStatus: learner.lifecycle_status,
        program: learner.program,
        semester: learner.semester,
        section: learner.section
      };
    } catch (error) {
      console.error('[LTI Context Service] Failed to build learner claim:', error);
      return null;
    }
  }

  /**
   * Build custom MyJKKN academic claim
   */
  static buildAcademicClaim(academicContext: AcademicContext): any {
    return {
      programId: academicContext.programId || null,
      semesterId: academicContext.semesterId || null,
      sectionId: academicContext.sectionId || null,
      academicYearId: academicContext.academicYearId || null
    };
  }

  /**
   * Validate academic context
   */
  static validateAcademicContext(academicContext: AcademicContext): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!academicContext.institutionId) {
      errors.push('Institution ID is required');
    }

    // If any academic field is provided, validate hierarchy
    if (academicContext.programId || academicContext.semesterId || academicContext.sectionId) {
      // If section is provided, program and semester must also be provided
      if (academicContext.sectionId && (!academicContext.programId || !academicContext.semesterId)) {
        errors.push('Program and semester are required when section is provided');
      }

      // If semester is provided, program must also be provided
      if (academicContext.semesterId && !academicContext.programId) {
        errors.push('Program is required when semester is provided');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get learner's current academic context
   */
  static async getLearnerAcademicContext(
    learnerProfileId: string
  ): Promise<AcademicContext | null> {
    const supabase = await createClient();

    try {
      const { data: learner, error } = await supabase
        .from('learners_profiles')
        .select('institution_id, program_id, semester_id, section_id, academic_year_id')
        .eq('id', learnerProfileId)
        .single();

      if (error || !learner) {
        console.warn('[LTI Context Service] Learner profile not found:', learnerProfileId);
        return null;
      }

      return {
        institutionId: learner.institution_id,
        programId: learner.program_id,
        semesterId: learner.semester_id,
        sectionId: learner.section_id,
        academicYearId: learner.academic_year_id
      };
    } catch (error) {
      console.error('[LTI Context Service] Failed to get learner context:', error);
      return null;
    }
  }
}
