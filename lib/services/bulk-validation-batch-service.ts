// ============================================
// BULK VALIDATION BATCH SERVICE
// ============================================
// Created: 2025-12-29
// Purpose: Batch validate academic field values before bulk upload
// Usage: Validates all unique values in one go for performance
// ============================================

import { NameToIdResolver, type NameToIdResult } from './name-to-id-resolver';

export interface BatchValidationInput {
  institutionId?: string;
  uniqueValues: {
    institutions?: string[];
    programs?: string[];
    degrees?: string[];
    departments?: string[];
    academicYears?: string[];
    regulations?: string[];
    batches?: string[];
    // Enhanced: Programs with department context for accurate validation
    programsWithContext?: Array<{ department: string; program: string }>;
    semestersWithContext?: Array<{ program: string; semester: string }>;
    sectionsWithContext?: Array<{ program: string; semester: string; section: string }>;
  };
}

export interface FieldValidationResult {
  value: string;
  id: string | null;
  found: boolean;
  error?: string;
  suggestions?: string[];
}

export interface BatchValidationResult {
  institutions: Map<string, FieldValidationResult>;
  programs: Map<string, FieldValidationResult>;
  semesters: Map<string, FieldValidationResult>;
  sections: Map<string, FieldValidationResult>;
  degrees: Map<string, FieldValidationResult>;
  departments: Map<string, FieldValidationResult>;
  academicYears: Map<string, FieldValidationResult>;
  regulations: Map<string, FieldValidationResult>;
  batches: Map<string, FieldValidationResult>;
}

/**
 * Bulk Validation Batch Service
 * Validates all unique academic field values in batch for performance
 * Uses CASCADING validation: Program → Semester → Section
 */
export class BulkValidationBatchService {
  /**
   * Validate all unique values with cascading validation
   * Step 1: Validate Programs (uses institutionId)
   * Step 2: Validate Semesters (uses institutionId + programId from step 1)
   * Step 3: Validate Sections (uses institutionId + semesterId from step 2)
   */
  static async validateBatch(input: BatchValidationInput): Promise<BatchValidationResult> {
    const result: BatchValidationResult = {
      institutions: new Map(),
      programs: new Map(),
      semesters: new Map(),
      sections: new Map(),
      degrees: new Map(),
      departments: new Map(),
      academicYears: new Map(),
      regulations: new Map(),
      batches: new Map()
    };

    // Validate institutions in parallel
    if (input.uniqueValues.institutions && input.uniqueValues.institutions.length > 0) {
      const institutionPromises = input.uniqueValues.institutions.map(async (instName) => {
        const validationResult = await NameToIdResolver.resolveInstitutionId(instName);
        return {
          value: instName,
          result: validationResult
        };
      });

      const institutionResults = await Promise.all(institutionPromises);
      institutionResults.forEach(({ value, result: validationResult }) => {
        result.institutions.set(value, {
          value,
          id: validationResult.id,
          found: validationResult.found,
          error: validationResult.error,
          suggestions: validationResult.suggestions
        });
      });
    }

    // Validate degrees in parallel
    if (input.uniqueValues.degrees && input.uniqueValues.degrees.length > 0) {
      const degreePromises = input.uniqueValues.degrees.map(async (degreeName) => {
        const validationResult = await NameToIdResolver.resolveDegreeId(
          degreeName,
          input.institutionId
        );
        return {
          value: degreeName,
          result: validationResult
        };
      });

      const degreeResults = await Promise.all(degreePromises);
      degreeResults.forEach(({ value, result: validationResult }) => {
        result.degrees.set(value, {
          value,
          id: validationResult.id,
          found: validationResult.found,
          error: validationResult.error,
          suggestions: validationResult.suggestions
        });
      });
    }

    // Validate departments in parallel
    if (input.uniqueValues.departments && input.uniqueValues.departments.length > 0) {
      const deptPromises = input.uniqueValues.departments.map(async (deptName) => {
        const validationResult = await NameToIdResolver.resolveDepartmentId(
          deptName,
          input.institutionId
        );
        return {
          value: deptName,
          result: validationResult
        };
      });

      const deptResults = await Promise.all(deptPromises);
      deptResults.forEach(({ value, result: validationResult }) => {
        result.departments.set(value, {
          value,
          id: validationResult.id,
          found: validationResult.found,
          error: validationResult.error,
          suggestions: validationResult.suggestions
        });
      });
    }

    // STEP 1: Validate programs in parallel (need this first for cascading)
    // ENHANCED: Now supports programsWithContext to include department filtering
    if (input.uniqueValues.programsWithContext && input.uniqueValues.programsWithContext.length > 0) {
      // Use programsWithContext for accurate validation with department filtering
      const programPromises = input.uniqueValues.programsWithContext.map(async (ctx) => {
        // Get department ID from resolved departments
        const departmentResult = result.departments.get(ctx.department);
        const departmentId = departmentResult?.id || undefined;

        console.log(`[batch-validation] Validating program "${ctx.program}" with department "${ctx.department}" (id: ${departmentId})`);

        const validationResult = await NameToIdResolver.resolveProgramId(
          ctx.program,
          input.institutionId,
          departmentId // Pass departmentId for accurate matching
        );
        return {
          key: `${ctx.department}|${ctx.program}`, // Composite key for lookup
          value: ctx.program,
          result: validationResult
        };
      });

      const programResults = await Promise.all(programPromises);
      programResults.forEach(({ key, value, result: validationResult }) => {
        // Store with composite key for accurate lookup during row validation
        result.programs.set(key, {
          value,
          id: validationResult.id,
          found: validationResult.found,
          error: validationResult.error,
          suggestions: validationResult.suggestions
        });
        // Also store with just the program name for backward compatibility
        if (!result.programs.has(value)) {
          result.programs.set(value, {
            value,
            id: validationResult.id,
            found: validationResult.found,
            error: validationResult.error,
            suggestions: validationResult.suggestions
          });
        }
      });
    } else if (input.uniqueValues.programs && input.uniqueValues.programs.length > 0) {
      // Fallback: validate programs without department context (legacy support)
      console.log(`[batch-validation] Warning: Validating programs without department context - may be less accurate`);
      const programPromises = input.uniqueValues.programs.map(async (progName) => {
        const validationResult = await NameToIdResolver.resolveProgramId(
          progName,
          input.institutionId
        );
        return {
          value: progName,
          result: validationResult
        };
      });

      const programResults = await Promise.all(programPromises);
      programResults.forEach(({ value, result: validationResult }) => {
        result.programs.set(value, {
          value,
          id: validationResult.id,
          found: validationResult.found,
          error: validationResult.error,
          suggestions: validationResult.suggestions
        });
      });
    }

    // STEP 2: Validate semesters with program context
    // Key format: "PROGRAM_NAME|SEMESTER_NAME" so we can lookup later
    if (input.uniqueValues.semestersWithContext && input.uniqueValues.semestersWithContext.length > 0) {
      const semesterPromises = input.uniqueValues.semestersWithContext.map(async (ctx) => {
        // Get the program ID from step 1
        const programResult = result.programs.get(ctx.program);
        const programId = programResult?.id || undefined;

        const validationResult = await NameToIdResolver.resolveSemesterId(
          ctx.semester,
          input.institutionId,
          programId // Pass programId for filtering
        );

        return {
          key: `${ctx.program}|${ctx.semester}`, // Composite key
          value: ctx.semester,
          result: validationResult
        };
      });

      const semesterResults = await Promise.all(semesterPromises);
      semesterResults.forEach(({ key, value, result: validationResult }) => {
        result.semesters.set(key, {
          value,
          id: validationResult.id,
          found: validationResult.found,
          error: validationResult.error,
          suggestions: validationResult.suggestions
        });
      });
    }

    // STEP 3: Validate sections with program AND semester context
    // Key format: "PROGRAM_NAME|SEMESTER_NAME|SECTION_NAME"
    if (input.uniqueValues.sectionsWithContext && input.uniqueValues.sectionsWithContext.length > 0) {
      const sectionPromises = input.uniqueValues.sectionsWithContext.map(async (ctx) => {
        // Get the semester ID from step 2
        const semesterKey = `${ctx.program}|${ctx.semester}`;
        const semesterResult = result.semesters.get(semesterKey);
        const semesterId = semesterResult?.id || undefined;

        const validationResult = await NameToIdResolver.resolveSectionId(
          ctx.section,
          input.institutionId,
          semesterId // Pass semesterId for filtering
        );

        return {
          key: `${ctx.program}|${ctx.semester}|${ctx.section}`, // Composite key
          value: ctx.section,
          result: validationResult
        };
      });

      const sectionResults = await Promise.all(sectionPromises);
      sectionResults.forEach(({ key, value, result: validationResult }) => {
        result.sections.set(key, {
          value,
          id: validationResult.id,
          found: validationResult.found,
          error: validationResult.error,
          suggestions: validationResult.suggestions
        });
      });
    }

    // Validate academic years in parallel
    if (input.uniqueValues.academicYears && input.uniqueValues.academicYears.length > 0) {
      const yearPromises = input.uniqueValues.academicYears.map(async (yearName) => {
        const validationResult = await NameToIdResolver.resolveAcademicYearId(
          yearName,
          input.institutionId
        );
        return {
          value: yearName,
          result: validationResult
        };
      });

      const yearResults = await Promise.all(yearPromises);
      yearResults.forEach(({ value, result: validationResult }) => {
        result.academicYears.set(value, {
          value,
          id: validationResult.id,
          found: validationResult.found,
          error: validationResult.error,
          suggestions: validationResult.suggestions
        });
      });
    }

    // Validate regulations in parallel
    if (input.uniqueValues.regulations && input.uniqueValues.regulations.length > 0) {
      const regulationPromises = input.uniqueValues.regulations.map(async (regValue) => {
        const validationResult = await NameToIdResolver.resolveRegulationId(
          regValue,
          input.institutionId
        );
        return {
          value: regValue,
          result: validationResult
        };
      });

      const regulationResults = await Promise.all(regulationPromises);
      regulationResults.forEach(({ value, result: validationResult }) => {
        result.regulations.set(value, {
          value,
          id: validationResult.id,
          found: validationResult.found,
          error: validationResult.error,
          suggestions: validationResult.suggestions
        });
      });
    }

    // Validate batches in parallel
    if (input.uniqueValues.batches && input.uniqueValues.batches.length > 0) {
      const batchPromises = input.uniqueValues.batches.map(async (batchName) => {
        const validationResult = await NameToIdResolver.resolveBatchId(
          batchName,
          input.institutionId
        );
        return {
          value: batchName,
          result: validationResult
        };
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(({ value, result: validationResult }) => {
        result.batches.set(value, {
          value,
          id: validationResult.id,
          found: validationResult.found,
          error: validationResult.error,
          suggestions: validationResult.suggestions
        });
      });
    }

    return result;
  }
}
