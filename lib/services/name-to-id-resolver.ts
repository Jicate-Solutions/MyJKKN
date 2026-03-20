// ============================================
// NAME TO ID RESOLVER SERVICE
// ============================================
// Created: 2025-01-26
// Purpose: Convert display names to database IDs for bulk operations
// Usage: Resolves Institution, Degree, Department, Program, Semester, Section, Academic Year, Regulation, Batch names to IDs
// ============================================

import { createClient } from '@supabase/supabase-js';

// Create admin client for database operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export interface NameToIdResult {
  id: string | null;
  found: boolean;
  error?: string;
  suggestions?: string[]; // Suggested values when not found
}

/**
 * Extract semester number from various formats
 * "II YEAR III SEMESTER" → "3"
 * "Semester 5" → "5"
 * "I SEM" → "1"
 */
function extractSemesterNumber(semesterName: string): string | null {
  // Roman to Arabic mapping
  const romanMap: Record<string, string> = {
    'I': '1', 'II': '2', 'III': '3', 'IV': '4',
    'V': '5', 'VI': '6', 'VII': '7', 'VIII': '8'
  };

  // Try to find roman numerals (prioritize last occurrence for "II YEAR III SEMESTER")
  const romanMatches = semesterName.match(/\b(I|II|III|IV|V|VI|VII|VIII)\b/g);
  if (romanMatches && romanMatches.length > 0) {
    // Use last match (for "II YEAR III SEMESTER", use "III")
    return romanMap[romanMatches[romanMatches.length - 1]] || null;
  }

  // Try to find Arabic numerals
  const arabicMatch = semesterName.match(/\b(\d+)\b/);
  if (arabicMatch) {
    return arabicMatch[1];
  }

  return null;
}

/**
 * Generate academic year format variations
 * "2025-2026" → ["2025-2026", "2025-26", "AY 2025-26", "AY 2025-2026"]
 */
function generateYearFormats(yearName: string): string[] {
  const formats: string[] = [yearName]; // Include original

  // Extract year numbers (e.g., "2025-2026" or "2025-26")
  const yearMatch = yearName.match(/(\d{4})\s*-\s*(\d{2,4})/);
  if (yearMatch) {
    const startYear = yearMatch[1]; // e.g., "2025"
    const endYear = yearMatch[2]; // e.g., "2026" or "26"

    // Convert 2-digit to 4-digit if needed
    const fullEndYear = endYear.length === 2 ? startYear.substring(0, 2) + endYear : endYear;
    const shortEndYear = fullEndYear.substring(2);

    // Generate variations
    formats.push(`${startYear}-${fullEndYear}`); // 2025-2026
    formats.push(`${startYear}-${shortEndYear}`); // 2025-26
    formats.push(`AY ${startYear}-${fullEndYear}`); // AY 2025-2026
    formats.push(`AY ${startYear}-${shortEndYear}`); // AY 2025-26
    formats.push(`${startYear}${fullEndYear}`); // 20252026
  }

  return [...new Set(formats)]; // Remove duplicates
}

/**
 * Calculate similarity score between search term and candidate
 * Returns a score from 0-100
 */
function calculateSimilarity(search: string, candidate: string): number {
  const searchLower = search.toLowerCase().trim();
  const candidateLower = candidate.toLowerCase().trim();
  let score = 0;

  // Exact match (case-insensitive)
  if (searchLower === candidateLower) return 100;

  // Contains as whole word (with word boundaries)
  const wordRegex = new RegExp(`\\b${searchLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (wordRegex.test(candidate)) {
    score += 80;
  }
  // Starts with search term
  else if (candidateLower.startsWith(searchLower)) {
    score += 70;
  }
  // Contains as substring
  else if (candidateLower.includes(searchLower)) {
    score += 60;
  }

  // Length similarity bonus
  const lengthDiff = Math.abs(search.length - candidate.length);
  if (lengthDiff <= 5) {
    score += 10;
  }

  return score;
}

/**
 * Find top suggestions from a list of candidates
 */
function findTopSuggestions(searchTerm: string, candidates: string[], maxSuggestions = 5): string[] {
  const scored = candidates
    .map(candidate => ({
      value: candidate,
      score: calculateSimilarity(searchTerm, candidate)
    }))
    .filter(item => item.score > 50) // Only include reasonable matches
    .sort((a, b) => b.score - a.score) // Sort by score descending
    .slice(0, maxSuggestions); // Take top N

  return scored.map(item => item.value);
}

/**
 * Name to ID Resolver Service
 * Converts human-readable names to database UUIDs
 */
export class NameToIdResolver {
  /**
   * Resolve Degree name to ID using FLEXIBLE matching
   * Matches "UNDERGRADUATE" to "B.E", "UG", "BE", etc.
   * @param degreeName - The degree name (e.g., "UNDERGRADUATE", "B.E", "Bachelor of Engineering")
   * @param institutionId - Optional institution filter
   */
  static async resolveDegreeId(degreeName: string, institutionId?: string): Promise<NameToIdResult> {
    if (!degreeName || degreeName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      console.log(`[name-to-id] 🔍 Resolving Degree ID for: "${degreeName}"`);

      // Try EXACT match first
      let query = supabaseAdmin
        .from('degrees')
        .select('id, degree_name')
        .ilike('degree_name', degreeName.trim());

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      let { data, error } = await query.single();

      // If exact match fails, try PATTERN match or KEYWORD match
      if (error || !data) {
        console.log(`[name-to-id] 🔄 Exact match failed, trying flexible match...`);

        // Map common degree keywords
        const degreeKeywords: Record<string, string[]> = {
          'UNDERGRADUATE': ['B.E', 'BE', 'B.TECH', 'BTECH', 'UG', 'BACHELOR'],
          'POSTGRADUATE': ['M.E', 'ME', 'M.TECH', 'MTECH', 'PG', 'MASTER'],
          'DIPLOMA': ['DIPLOMA', 'DIP'],
          'DOCTORATE': ['PHD', 'PH.D', 'DOCTORATE']
        };

        const normalizedInput = degreeName.toUpperCase().trim();
        let searchTerms = [degreeName];

        // Find matching keywords
        for (const [key, keywords] of Object.entries(degreeKeywords)) {
          if (normalizedInput.includes(key) || keywords.some(kw => normalizedInput.includes(kw))) {
            searchTerms = [...searchTerms, ...keywords];
            break;
          }
        }

        // Try pattern matching with keywords
        for (const term of searchTerms) {
          let patternQuery = supabaseAdmin
            .from('degrees')
            .select('id, degree_name')
            .ilike('degree_name', `%${term}%`);

          if (institutionId) {
            patternQuery = patternQuery.eq('institution_id', institutionId);
          }

          const patternResult = await patternQuery.limit(1).single();
          if (patternResult.data) {
            data = patternResult.data;
            error = null;
            console.log(`[name-to-id] ✅ Found degree via pattern match with "${term}":`, data);
            break;
          }
        }
      }

      if (error || !data) {
        console.error(`[name-to-id] ❌ Degree not found:`, degreeName);
        return { id: null, found: false, error: `Degree "${degreeName}" not found` };
      }

      console.log(`[name-to-id] ✅ Degree found:`, data);
      return { id: data.id, found: true };
    } catch (error) {
      console.error(`[name-to-id] ❌ Exception in resolveDegreeId:`, error);
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Department name to ID
   * @param departmentName - The department name (e.g., "Computer Science and Engineering")
   * @param institutionId - Optional institution filter
   */
  static async resolveDepartmentId(departmentName: string, institutionId?: string): Promise<NameToIdResult> {
    if (!departmentName || departmentName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      console.log(`[name-to-id] 🔍 Resolving Department ID for: "${departmentName}"`);
      console.log(`[name-to-id] 📋 Query params:`, { departmentName: departmentName.trim(), institutionId });

      // Build query with institution filter
      let query = supabaseAdmin
        .from('departments')
        .select('id, department_name, institution_id');

      // Apply exact match first
      query = query.ilike('department_name', departmentName.trim());

      // CRITICAL: Apply institution filter if provided (prevents multiple matches)
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      // Use .maybeSingle() instead of .single() to handle multiple matches gracefully
      const { data, error } = await query.maybeSingle();

      // If exact match with institution filter succeeds, return it
      if (data && !error) {
        console.log(`[name-to-id] ✅ Department found:`, data);
        return { id: data.id, found: true };
      }

      // If no exact match, try to get all matches to provide suggestions
      const { data: allMatches, error: allError } = await supabaseAdmin
        .from('departments')
        .select('id, department_name, institution_id')
        .ilike('department_name', `%${departmentName.trim()}%`)
        .limit(10);

      if (allError || !allMatches || allMatches.length === 0) {
        console.error(`[name-to-id] ❌ Department not found:`, departmentName);
        return {
          id: null,
          found: false,
          error: `Department "${departmentName}" not found`
        };
      }

      // If we have matches, provide them as suggestions
      const suggestions = allMatches.map(d => d.department_name);
      console.warn(`[name-to-id] ⚠️ Multiple departments found for "${departmentName}". Suggestions:`, suggestions);

      return {
        id: null,
        found: false,
        error: `Department "${departmentName}" not found`,
        suggestions: suggestions
      };
    } catch (error) {
      console.error(`[name-to-id] ❌ Exception in resolveDepartmentId:`, error);
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Program name to ID using FLEXIBLE matching
   * Matches "CSE" to "(BE) CSE", "(ME) CSE", etc.
   * @param programName - The program name (e.g., "CSE" or "(BE) CSE")
   * @param institutionId - Optional institution filter
   * @param departmentId - Optional department filter
   */
  static async resolveProgramId(programName: string, institutionId?: string, departmentId?: string): Promise<NameToIdResult> {
    if (!programName || programName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      console.log(`[name-to-id] 🔍 Resolving Program ID for: "${programName}"`);
      console.log(`[name-to-id] 📋 Query params:`, { programName: programName.trim(), institutionId, departmentId });

      // Try EXACT match first
      let query = supabaseAdmin
        .from('programs')
        .select('id, program_name')
        .ilike('program_name', programName.trim());

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      if (departmentId) {
        query = query.eq('department_id', departmentId);
      }

      let { data, error } = await query.single();

      // If exact match fails, try PATTERN match (CONTAINS)
      if (error || !data) {
        console.log(`[name-to-id] 🔄 Exact match failed, trying pattern match...`);

        let patternQuery = supabaseAdmin
          .from('programs')
          .select('id, program_name')
          .ilike('program_name', `%${programName.trim()}%`);

        if (institutionId) {
          patternQuery = patternQuery.eq('institution_id', institutionId);
        }

        if (departmentId) {
          patternQuery = patternQuery.eq('department_id', departmentId);
        }

        const patternResult = await patternQuery.limit(1).single();
        data = patternResult.data;
        error = patternResult.error;
      }

      if (error) {
        console.error(`[name-to-id] ❌ Program query error:`, error);
        console.error(`[name-to-id] 💡 Trying to find similar programs in database...`);

        // Try to find all programs to get suggestions
        let suggestionQuery = supabaseAdmin
          .from('programs')
          .select('program_name');

        if (institutionId) {
          suggestionQuery = suggestionQuery.eq('institution_id', institutionId);
        }
        if (departmentId) {
          suggestionQuery = suggestionQuery.eq('department_id', departmentId);
        }

        const { data: allPrograms } = await suggestionQuery.limit(50);
        const programNames = allPrograms?.map(p => p.program_name) || [];
        const suggestions = findTopSuggestions(programName, programNames);

        console.log(`[name-to-id] 📚 Suggestions:`, suggestions);
        return {
          id: null,
          found: false,
          error: `Program "${programName}" not found in database. Please check the program name.`,
          suggestions
        };
      }

      if (!data) {
        console.error(`[name-to-id] ❌ No program found matching "${programName}"`);

        // Get suggestions
        let suggestionQuery = supabaseAdmin
          .from('programs')
          .select('program_name');

        if (institutionId) {
          suggestionQuery = suggestionQuery.eq('institution_id', institutionId);
        }
        if (departmentId) {
          suggestionQuery = suggestionQuery.eq('department_id', departmentId);
        }

        const { data: allPrograms } = await suggestionQuery.limit(50);
        const programNames = allPrograms?.map(p => p.program_name) || [];
        const suggestions = findTopSuggestions(programName, programNames);

        return {
          id: null,
          found: false,
          error: `Program "${programName}" not found in database. Please check the program name.`,
          suggestions
        };
      }

      console.log(`[name-to-id] ✅ Program found:`, data);
      return { id: data.id, found: true };
    } catch (error) {
      console.error(`[name-to-id] ❌ Exception in resolveProgramId:`, error);
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Semester name to ID using FLEXIBLE matching
   * Matches "II YEAR III SEMESTER" to "Semester 3", "CSE-SEM-3", etc.
   * @param semesterName - The semester name (e.g., "II YEAR III SEMESTER" or "Semester 3")
   * @param institutionId - Optional institution filter
   * @param programId - Optional program filter
   */
  static async resolveSemesterId(semesterName: string, institutionId?: string, programId?: string): Promise<NameToIdResult> {
    if (!semesterName || semesterName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      console.log(`[name-to-id] 🔍 Resolving Semester ID for: "${semesterName}"`);
      console.log(`[name-to-id] 📋 Query params:`, { semesterName: semesterName.trim(), institutionId, programId });

      // Try EXACT match first
      let query = supabaseAdmin
        .from('semesters')
        .select('id, semester_name, semester_code')
        .ilike('semester_name', semesterName.trim());

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      if (programId) {
        query = query.eq('program_id', programId);
      }

      let { data, error } = await query.single();

      // If exact match fails, try NUMBER-BASED match
      if (error || !data) {
        console.log(`[name-to-id] 🔄 Exact match failed, trying number-based match...`);

        const semesterNum = extractSemesterNumber(semesterName);
        console.log(`[name-to-id] 🔢 Extracted semester number: ${semesterNum}`);

        if (semesterNum) {
          // Try matching semester_name or semester_code containing the number
          let numberQuery = supabaseAdmin
            .from('semesters')
            .select('id, semester_name, semester_code')
            .or(`semester_name.ilike.%${semesterNum}%,semester_code.ilike.%${semesterNum}%`);

          if (institutionId) {
            numberQuery = numberQuery.eq('institution_id', institutionId);
          }

          if (programId) {
            numberQuery = numberQuery.eq('program_id', programId);
          }

          const numberResult = await numberQuery.limit(1).single();
          data = numberResult.data;
          error = numberResult.error;
        }
      }

      if (error) {
        console.error(`[name-to-id] ❌ Semester query error:`, error);

        // Try to find all semesters to get suggestions
        let suggestionQuery = supabaseAdmin
          .from('semesters')
          .select('semester_name');

        if (institutionId) {
          suggestionQuery = suggestionQuery.eq('institution_id', institutionId);
        }
        if (programId) {
          suggestionQuery = suggestionQuery.eq('program_id', programId);
        }

        const { data: allSemesters } = await suggestionQuery.limit(50);
        const semesterNames = allSemesters?.map(s => s.semester_name) || [];
        const suggestions = findTopSuggestions(semesterName, semesterNames);

        console.log(`[name-to-id] 📚 Suggestions:`, suggestions);
        return {
          id: null,
          found: false,
          error: `Semester "${semesterName}" not found in database. Please check the semester name.`,
          suggestions
        };
      }

      if (!data) {
        console.error(`[name-to-id] ❌ No semester found matching "${semesterName}"`);

        // Get suggestions
        let suggestionQuery = supabaseAdmin
          .from('semesters')
          .select('semester_name');

        if (institutionId) {
          suggestionQuery = suggestionQuery.eq('institution_id', institutionId);
        }
        if (programId) {
          suggestionQuery = suggestionQuery.eq('program_id', programId);
        }

        const { data: allSemesters } = await suggestionQuery.limit(50);
        const semesterNames = allSemesters?.map(s => s.semester_name) || [];
        const suggestions = findTopSuggestions(semesterName, semesterNames);

        return {
          id: null,
          found: false,
          error: `Semester "${semesterName}" not found in database. Please check the semester name.`,
          suggestions
        };
      }

      console.log(`[name-to-id] ✅ Semester found:`, data);
      return { id: data.id, found: true };
    } catch (error) {
      console.error(`[name-to-id] ❌ Exception in resolveSemesterId:`, error);
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Section name to ID
   * @param sectionName - The section name (e.g., "A Section")
   * @param institutionId - Optional institution filter
   * @param semesterId - Optional semester filter
   */
  static async resolveSectionId(sectionName: string, institutionId?: string, semesterId?: string): Promise<NameToIdResult> {
    if (!sectionName || sectionName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      console.log(`[name-to-id] 🔍 Resolving Section ID for: "${sectionName}"`);
      console.log(`[name-to-id] 📋 Query params:`, { sectionName: sectionName.trim(), institutionId, semesterId });

      let query = supabaseAdmin
        .from('sections')
        .select('id, section_name')
        .ilike('section_name', sectionName.trim());

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      if (semesterId) {
        query = query.eq('semester_id', semesterId);
      }

      const { data, error } = await query.single();

      if (error) {
        console.error(`[name-to-id] ❌ Section query error:`, error);

        // Try to find all sections to get suggestions
        let suggestionQuery = supabaseAdmin
          .from('sections')
          .select('section_name');

        if (institutionId) {
          suggestionQuery = suggestionQuery.eq('institution_id', institutionId);
        }
        if (semesterId) {
          suggestionQuery = suggestionQuery.eq('semester_id', semesterId);
        }

        const { data: allSections } = await suggestionQuery.limit(50);
        const sectionNames = allSections?.map(s => s.section_name) || [];
        const suggestions = findTopSuggestions(sectionName, sectionNames);

        console.log(`[name-to-id] 📚 Suggestions:`, suggestions);
        return {
          id: null,
          found: false,
          error: `Section "${sectionName}" not found in database. Please check the section name.`,
          suggestions
        };
      }

      if (!data) {
        console.error(`[name-to-id] ❌ No section found matching "${sectionName}"`);

        // Get suggestions
        let suggestionQuery = supabaseAdmin
          .from('sections')
          .select('section_name');

        if (institutionId) {
          suggestionQuery = suggestionQuery.eq('institution_id', institutionId);
        }
        if (semesterId) {
          suggestionQuery = suggestionQuery.eq('semester_id', semesterId);
        }

        const { data: allSections } = await suggestionQuery.limit(50);
        const sectionNames = allSections?.map(s => s.section_name) || [];
        const suggestions = findTopSuggestions(sectionName, sectionNames);

        return {
          id: null,
          found: false,
          error: `Section "${sectionName}" not found in database. Please check the section name.`,
          suggestions
        };
      }

      console.log(`[name-to-id] ✅ Section found:`, data);
      return { id: data.id, found: true };
    } catch (error) {
      console.error(`[name-to-id] ❌ Exception in resolveSectionId:`, error);
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Academic Year name to ID using FLEXIBLE matching
   * Matches "2025-2026" to "2025-26", "AY 2025-26", etc.
   * @param yearName - The academic year name (e.g., "2025-2026", "2025-26", "AY 2025-26")
   * @param institutionId - Optional institution filter
   */
  static async resolveAcademicYearId(yearName: string, institutionId?: string): Promise<NameToIdResult> {
    if (!yearName || yearName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      console.log(`[name-to-id] 🔍 Resolving Academic Year ID for: "${yearName}"`);

      // Try EXACT match first
      let query = supabaseAdmin
        .from('academic_years')
        .select('id, academic_year_name')
        .ilike('academic_year_name', yearName.trim());

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      let { data, error } = await query.single();

      // If exact match fails, try multiple FORMAT variations
      if (error || !data) {
        console.log(`[name-to-id] 🔄 Exact match failed, trying format variations...`);

        const yearFormats = generateYearFormats(yearName);
        console.log(`[name-to-id] 📅 Generated year formats:`, yearFormats);

        for (const format of yearFormats) {
          let formatQuery = supabaseAdmin
            .from('academic_years')
            .select('id, academic_year_name')
            .ilike('academic_year_name', format);

          if (institutionId) {
            formatQuery = formatQuery.eq('institution_id', institutionId);
          }

          const formatResult = await formatQuery.limit(1).single();
          if (formatResult.data) {
            data = formatResult.data;
            error = null;
            console.log(`[name-to-id] ✅ Found academic year via format "${format}":`, data);
            break;
          }
        }

        // If still not found, try PATTERN matching (contains any year number)
        if (!data) {
          const yearNumbers = yearName.match(/\d{4}/g);
          if (yearNumbers && yearNumbers.length > 0) {
            console.log(`[name-to-id] 🔄 Trying pattern match with year: ${yearNumbers[0]}`);

            let patternQuery = supabaseAdmin
              .from('academic_years')
              .select('id, academic_year_name')
              .ilike('academic_year_name', `%${yearNumbers[0]}%`);

            if (institutionId) {
              patternQuery = patternQuery.eq('institution_id', institutionId);
            }

            const patternResult = await patternQuery.limit(1).single();
            if (patternResult.data) {
              data = patternResult.data;
              error = null;
              console.log(`[name-to-id] ✅ Found academic year via pattern:`, data);
            }
          }
        }
      }

      if (error || !data) {
        console.error(`[name-to-id] ❌ Academic Year not found:`, yearName);
        return { id: null, found: false, error: `Academic Year "${yearName}" not found` };
      }

      console.log(`[name-to-id] ✅ Academic Year found:`, data);
      return { id: data.id, found: true };
    } catch (error) {
      console.error(`[name-to-id] ❌ Exception in resolveAcademicYearId:`, error);
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Regulation code/year to ID
   * @param regulationValue - The regulation code or year (e.g., "R2021", "R-2021", or "2021")
   * @param institutionId - Optional institution filter
   */
  static async resolveRegulationId(regulationValue: string, institutionId?: string): Promise<NameToIdResult> {
    if (!regulationValue || regulationValue.trim() === '') {
      return { id: null, found: false };
    }

    try {
      const trimmedValue = regulationValue.trim().toUpperCase();

      // Extract year from regulation value (e.g., "R2021" -> "2021", "R-2021" -> "2021")
      const yearMatch = trimmedValue.match(/(\d{4})/);
      const year = yearMatch ? yearMatch[1] : null;

      // Build flexible matching patterns
      // "R2021" should match "R2021", "R-2021", "REG-2021", etc.
      let query = supabaseAdmin
        .from('regulations')
        .select('id, regulation_code, regulation_year')
        .eq('is_active', true);

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error || !data || data.length === 0) {
        return { id: null, found: false, error: `Regulation "${regulationValue}" not found` };
      }

      // Find best match: exact code match, then year match
      let bestMatch = data.find(r =>
        r.regulation_code?.toUpperCase() === trimmedValue ||
        r.regulation_code?.toUpperCase().replace(/-/g, '') === trimmedValue.replace(/-/g, '')
      );

      if (!bestMatch && year) {
        bestMatch = data.find(r => r.regulation_year === year);
      }

      if (!bestMatch) {
        const suggestions = data.slice(0, 3).map(r => r.regulation_code);
        return { id: null, found: false, error: `Regulation "${regulationValue}" not found`, suggestions };
      }

      return { id: bestMatch.id, found: true };
    } catch (error) {
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Batch name to ID
   * @param batchName - The batch name (e.g., "2021-2025") or batch code (e.g., "UGB24")
   * @param institutionId - Optional institution filter
   */
  static async resolveBatchId(batchName: string, institutionId?: string): Promise<NameToIdResult> {
    if (!batchName || batchName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      const trimmedValue = batchName.trim();

      let query = supabaseAdmin
        .from('batches')
        .select('id, batch_name, batch_code')
        .eq('is_active', true);

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error || !data || data.length === 0) {
        return { id: null, found: false, error: `Batch "${batchName}" not found` };
      }

      // Find best match: exact batch_name match, then batch_code match
      let bestMatch = data.find(b =>
        b.batch_name?.toLowerCase() === trimmedValue.toLowerCase() ||
        b.batch_code?.toLowerCase() === trimmedValue.toLowerCase()
      );

      if (!bestMatch) {
        // Try partial match
        bestMatch = data.find(b =>
          b.batch_name?.toLowerCase().includes(trimmedValue.toLowerCase()) ||
          b.batch_code?.toLowerCase().includes(trimmedValue.toLowerCase())
        );
      }

      if (!bestMatch) {
        const suggestions = data.slice(0, 3).map(b => b.batch_name);
        return { id: null, found: false, error: `Batch "${batchName}" not found`, suggestions };
      }

      return { id: bestMatch.id, found: true };
    } catch (error) {
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Resolve Institution name to ID
   * @param institutionName - The institution name (e.g., "JKKN College of Engineering")
   */
  static async resolveInstitutionId(institutionName: string): Promise<NameToIdResult> {
    if (!institutionName || institutionName.trim() === '') {
      return { id: null, found: false };
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('institutions')
        .select('id')
        .ilike('name', institutionName.trim())
        .single();

      if (error || !data) {
        return { id: null, found: false, error: `Institution "${institutionName}" not found` };
      }

      return { id: data.id, found: true };
    } catch (error) {
      return { id: null, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
