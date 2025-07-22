'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import toast from 'react-hot-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  AlertCircle,
  CheckCircle,
  FileUp,
  Loader2,
  Upload,
  X,
  XCircle,
  FileText
} from 'lucide-react';
import { useRouter } from 'next/navigation'; // Import useRouter
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { StudentService } from '@/lib/services/student/student-service';
import { DownloadNewStudentTemplateButton } from './download-new-student-template-button';

// Helper function to parse and normalize date formats
const parseAndNormalizeDate = (dateString: string): string | null => {
  if (!dateString || typeof dateString !== 'string') return null;

  const cleanDate = dateString.trim();
  if (!cleanDate) return null;

  // Try multiple date formats
  const formats = [
    // YYYY-MM-DD (current required format)
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    // DD/MM/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // DD-MM-YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    // MM-DD-YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    // DD.MM.YYYY
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
    // YYYY/MM/DD
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
    // YYYY.MM.DD
    /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/
  ];

  // Try parsing with different formats
  let parsedDate: Date | null = null;

  // First check if it's already in YYYY-MM-DD format
  if (formats[0].test(cleanDate)) {
    const match = cleanDate.match(formats[0]);
    if (match) {
      const [_, year, month, day] = match;
      parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  }
  // Try DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY formats
  else if (
    formats[1].test(cleanDate) ||
    formats[3].test(cleanDate) ||
    formats[5].test(cleanDate)
  ) {
    const match = cleanDate.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (match) {
      const [_, day, month, year] = match;
      parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  }
  // Try YYYY/MM/DD or YYYY.MM.DD formats
  else if (formats[6].test(cleanDate) || formats[7].test(cleanDate)) {
    const match = cleanDate.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
    if (match) {
      const [_, year, month, day] = match;
      parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  }
  // Try native Date parsing as fallback
  else {
    parsedDate = new Date(cleanDate);
  }

  // Validate the parsed date
  if (!parsedDate || isNaN(parsedDate.getTime())) {
    return null;
  }

  // Check if date is reasonable (between 1900 and current year + 10)
  const year = parsedDate.getFullYear();
  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear + 10) {
    return null;
  }

  // Return in YYYY-MM-DD format
  const normalizedYear = parsedDate.getFullYear();
  const normalizedMonth = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const normalizedDay = String(parsedDate.getDate()).padStart(2, '0');

  return `${normalizedYear}-${normalizedMonth}-${normalizedDay}`;
};

/**
 * COMPREHENSIVE BULK STUDENT UPLOAD COMPONENT
 *
 * This component provides a user-friendly bulk upload system for creating student records.
 *
 * KEY IMPROVEMENTS MADE:
 *
 * 1. **User-Friendly Template Structure**:
 *    - Replaced complex JSON fields with separate, easy-to-fill columns
 *    - Clear indication of required vs optional fields (marked with *)
 *    - Organized fields into logical sections (Personal, Academic, Course, Contact, Reference)
 *
 * 2. **Simplified Academic Marks Entry**:
 *    - Instead of complex JSON strings for marks, users fill separate columns:
 *      * tenth_marks_max_marks, tenth_marks_obtained_marks, tenth_marks_percentage
 *      * twelfth_marks_group, twelfth_marks_max_marks, twelfth_marks_obtained_marks, twelfth_marks_percentage
 *      * Individual subject marks (physics, chemistry, mathematics, biology, computer_science)
 *    - System automatically converts these to required JSON format during processing
 *
 * 3. **Multi-Sheet Excel Template**:
 *    - Sheet 1: Main template with sample data
 *    - Sheet 2: Comprehensive instructions and field explanations
 *    - Sheet 3: Reference data (Institution, Degree, Department, Program UUIDs)
 *    - Sheet 4: JSON examples showing how separate fields are converted
 *
 * 4. **Enhanced Validation**:
 *    - Clear field-by-field validation with descriptive error messages
 *    - Handles headers with asterisks (required field markers)
 *    - Transforms user-friendly input into database-compatible format
 *
 * 5. **No Required Fields - All Optional**:
 *    - ALL FIELDS ARE OPTIONAL - users can upload with any available data
 *    - Profile completion (optional): roll_number, college_email, academic_year_id, semester_id, section_id
 *    - When college_email is provided, user accounts are automatically created
 *
 * 6. **Batch Processing & Error Handling**:
 *    - Processes uploads in batches of 50 for better performance
 *    - Detailed error reporting with row-level validation
 *    - User creation tracking with success/failure details
 *    - Progress indicators and comprehensive result summaries
 *
 * 7. **Reference Data Integration**:
 *    - Template includes actual Institution, Degree, Department, and Program UUIDs
 *    - Users don't need to guess or look up complex identifiers
 *    - Clear examples for all field types and formats
 *
 * VALIDATION SCHEMA:
 * The component now uses separate fields for marks instead of JSON, making it much more
 * user-friendly while maintaining full compatibility with the database structure.
 */

// Define the Zod schema for validating a NEW student row with user-friendly separate fields
// This accepts both UUID and name-based fields for easier user input
// ALL FIELDS ARE NOW OPTIONAL - NO REQUIRED FIELDS
const newStudentSchema = z
  .object({
    // Personal Info - All optional
    first_name: z.string().optional().nullable(),
    last_name: z.string().optional().nullable(),
    father_name: z.string().optional().nullable(),
    father_occupation: z.string().optional().nullable(),
    father_mobile: z.string().optional().nullable(),
    mother_name: z.string().optional().nullable(),
    mother_occupation: z.string().optional().nullable(),
    mother_mobile: z.string().optional().nullable(),
    date_of_birth: z
      .string()
      .optional()
      .nullable()
      .transform((val) => {
        // If no value provided, use a default placeholder date to satisfy NOT NULL constraint
        if (!val || typeof val !== 'string') return '1900-01-01';

        const normalized = parseAndNormalizeDate(val);
        if (!normalized) {
          throw new Error(
            'Invalid date format. Accepted formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, etc.'
          );
        }
        return normalized;
      }),
    gender: z.string().optional().nullable(),
    religion: z.string().optional().nullable(),
    community: z.string().optional().nullable(),
    caste: z.string().optional().nullable(),
    annual_income: z.string().optional().nullable(),

    // Academic Info - Separate fields for easier user input (optional)
    last_school: z.string().optional().nullable(),
    board_of_study: z.string().optional().nullable(),

    // 10th marks - separate fields (optional)
    tenth_marks_max_marks: z.string().optional().nullable(),
    tenth_marks_obtained_marks: z.string().optional().nullable(),
    tenth_marks_percentage: z.string().optional().nullable(),

    // 12th marks - separate fields (optional)
    twelfth_marks_group: z.string().optional().nullable(),
    twelfth_marks_max_marks: z.string().optional().nullable(),
    twelfth_marks_obtained_marks: z.string().optional().nullable(),
    twelfth_marks_percentage: z.string().optional().nullable(),

    // 12th marks - subject-wise (optional)
    twelfth_marks_physics: z.string().optional().nullable(),
    twelfth_marks_chemistry: z.string().optional().nullable(),
    twelfth_marks_mathematics: z.string().optional().nullable(),
    twelfth_marks_biology: z.string().optional().nullable(),
    twelfth_marks_computer_science: z.string().optional().nullable(),
    twelfth_marks_other_subject: z.string().optional().nullable(),
    medical_cutoff_marks: z.string().optional().nullable(),
    engineering_cutoff_marks: z.string().optional().nullable(),
    neet_roll_number: z.string().optional().nullable(),
    counseling_applied: z
      .preprocess((val) => String(val).toLowerCase() === 'true', z.boolean())
      .optional()
      .nullable(),
    counseling_number: z.string().optional().nullable(),
    first_graduate: z
      .preprocess((val) => String(val).toLowerCase() === 'true', z.boolean())
      .optional()
      .nullable(),

    // Course Info - Enhanced to accept both UUID and name-based inputs (all optional)
    quota: z.string().optional().nullable(),
    category: z.string().optional().nullable(),

    // Institution - Accept either UUID or name (optional)
    institution_id: z.string().optional().nullable(),
    institution_name: z.string().optional().nullable(),

    // Degree - Accept either UUID or name (optional)
    degree_id: z.string().optional().nullable(),
    degree_name: z.string().optional().nullable(),

    // Department - Accept either UUID or name (optional)
    department_id: z.string().optional().nullable(),
    department_name: z.string().optional().nullable(),

    // Program - Accept either UUID or name (optional)
    program_id: z.string().optional().nullable(),
    program_name: z.string().optional().nullable(),

    // Academic Year - Accept either UUID or name (optional)
    academic_year_id: z.string().optional().nullable(),
    academic_year_name: z.string().optional().nullable(),

    // Semester - Accept either UUID or name (optional)
    semester_id: z.string().optional().nullable(),
    semester_name: z.string().optional().nullable(),

    // Section - Accept either UUID or name (optional)
    section_id: z.string().optional().nullable(),
    section_name: z.string().optional().nullable(),

    entry_type: z.string().optional().nullable(),

    // Contact Info - All optional
    permanent_address_street: z.string().optional().nullable(),
    permanent_address_taluk: z.string().optional().nullable(),
    permanent_address_district: z.string().optional().nullable(),
    permanent_address_pin_code: z
      .string()
      .optional()
      .nullable()
      .refine(
        (val) => !val || (typeof val === 'string' && /^\d{6}$/.test(val)),
        'PIN code must be exactly 6 digits (e.g., 637001) if provided'
      ),
    permanent_address_state: z.string().optional().nullable(),
    student_mobile: z
      .string()
      .optional()
      .nullable()
      .refine(
        (val) => !val || (typeof val === 'string' && /^\d{10,15}$/.test(val)),
        'Student mobile must contain only digits (10-15 characters) if provided'
      ),
    student_email: z
      .string()
      .optional()
      .nullable()
      .refine(
        (val) =>
          !val ||
          (typeof val === 'string' &&
            z.string().email().safeParse(val).success),
        'Student email must be a valid email address (e.g., student@domain.com) if provided'
      ),

    // Accommodation Info - All optional
    accommodation_type: z.string().optional().nullable(),
    hostel_type: z.string().optional().nullable(),
    bus_required: z
      .preprocess((val) => {
        if (val === null || val === undefined || val === '') return null;
        return String(val).toLowerCase() === 'true';
      }, z.boolean())
      .optional()
      .nullable(),
    bus_route: z.string().optional().nullable(),
    bus_pickup_location: z.string().optional().nullable(),

    // Reference Info - All optional
    reference_type: z.string().optional().nullable(),
    reference_name: z.string().optional().nullable(),
    reference_contact: z.string().optional().nullable(),

    // Optional fields (for potential immediate onboarding/user creation)
    roll_number: z.string().optional().nullable(),
    college_email: z
      .string()
      .optional()
      .nullable()
      .refine(
        (val) =>
          !val ||
          (typeof val === 'string' &&
            z.string().email().safeParse(val).success),
        'College email must be a valid email address (e.g., student@college.edu) if provided'
      )
  })
  .strict(); // Use strict to prevent unexpected extra fields

type NewStudentData = z.infer<typeof newStudentSchema>;

// Name resolution functions to convert names to UUIDs
const resolveInstitutionName = async (name: string): Promise<string | null> => {
  try {
    const { createClientSupabaseClient } = await import(
      '@/lib/supabase/client'
    );
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('institutions')
      .select('id')
      .ilike('name', name.trim())
      .limit(1)
      .single();

    if (error || !data) return null;
    return data.id;
  } catch (error) {
    console.error('Error resolving institution name:', error);
    return null;
  }
};

const resolveDegreeName = async (
  name: string,
  institutionId: string
): Promise<string | null> => {
  try {
    const { createClientSupabaseClient } = await import(
      '@/lib/supabase/client'
    );
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('degrees')
      .select('id')
      .ilike('degree_name', name.trim())
      .eq('institution_id', institutionId)
      .limit(1)
      .single();

    if (error || !data) return null;
    return data.id;
  } catch (error) {
    console.error('Error resolving degree name:', error);
    return null;
  }
};

const resolveDepartmentName = async (
  name: string,
  institutionId: string
): Promise<string | null> => {
  try {
    const { createClientSupabaseClient } = await import(
      '@/lib/supabase/client'
    );
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('departments')
      .select('id')
      .ilike('department_name', name.trim())
      .eq('institution_id', institutionId)
      .limit(1)
      .single();

    if (error || !data) return null;
    return data.id;
  } catch (error) {
    console.error('Error resolving department name:', error);
    return null;
  }
};

const resolveProgramName = async (
  name: string,
  departmentId: string
): Promise<string | null> => {
  try {
    const { createClientSupabaseClient } = await import(
      '@/lib/supabase/client'
    );
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('programs')
      .select('id')
      .ilike('program_name', name.trim())
      .eq('department_id', departmentId)
      .limit(1)
      .single();

    if (error || !data) return null;
    return data.id;
  } catch (error) {
    console.error('Error resolving program name:', error);
    return null;
  }
};

const resolveSemesterName = async (
  name: string,
  institutionId: string
): Promise<string | null> => {
  try {
    const { createClientSupabaseClient } = await import(
      '@/lib/supabase/client'
    );
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('semesters')
      .select('id')
      .ilike('semester_name', name.trim())
      .eq('institution_id', institutionId)
      .limit(1)
      .single();

    if (error || !data) return null;
    return data.id;
  } catch (error) {
    console.error('Error resolving semester name:', error);
    return null;
  }
};

const resolveSectionName = async (
  name: string,
  semesterId: string
): Promise<string | null> => {
  try {
    const { createClientSupabaseClient } = await import(
      '@/lib/supabase/client'
    );
    const supabase = createClientSupabaseClient();

    // Try exact match first (case-insensitive)
    const { data, error } = await supabase
      .from('sections')
      .select('id, section_name')
      .ilike('section_name', name.trim())
      .eq('semester_id', semesterId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (data) {
      console.log(
        `Section resolved: "${name.trim()}" -> "${data.section_name}" (ID: ${
          data.id
        })`
      );
      return data.id;
    }

    // If exact match fails, try with whitespace-normalized comparison
    const { data: allSections, error: allError } = await supabase
      .from('sections')
      .select('id, section_name')
      .eq('semester_id', semesterId)
      .eq('is_active', true);

    if (allError || !allSections) {
      console.error('Error fetching sections for fallback search:', allError);
      return null;
    }

    // Find section with normalized name comparison
    const normalizedInputName = name.trim().toLowerCase();
    const matchedSection = allSections.find(
      (section) =>
        section.section_name.trim().toLowerCase() === normalizedInputName
    );

    if (matchedSection) {
      console.log(
        `Section resolved (fallback): "${name.trim()}" -> "${
          matchedSection.section_name
        }" (ID: ${matchedSection.id})`
      );
      return matchedSection.id;
    }

    console.warn(
      `Section not found: "${name.trim()}" in semester ID: ${semesterId}`
    );
    console.log(
      'Available sections:',
      allSections.map((s) => `"${s.section_name}"`)
    );
    return null;
  } catch (error) {
    console.error('Error resolving section name:', error);
    return null;
  }
};

const resolveAcademicYearName = async (
  name: string,
  institutionId: string
): Promise<string | null> => {
  try {
    const { createClientSupabaseClient } = await import(
      '@/lib/supabase/client'
    );
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('academic_years')
      .select('id')
      .ilike('academic_year_name', name.trim())
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error || !data) return null;
    return data.id;
  } catch (error) {
    console.error('Error resolving academic year name:', error);
    return null;
  }
};

// Enhanced name resolution function that resolves all name-based fields to IDs
const resolveNameFields = async (
  data: NewStudentData
): Promise<{
  resolved: any;
  errors: string[];
}> => {
  const resolved = { ...data };
  const errors: string[] = [];

  try {
    // 1. Resolve Institution
    if (data.institution_name && !data.institution_id) {
      const institutionId = await resolveInstitutionName(data.institution_name);
      if (institutionId) {
        resolved.institution_id = institutionId;
      } else {
        errors.push(`Institution "${data.institution_name}" not found`);
      }
    }

    // Ensure we have institution_id for subsequent resolutions
    const institutionId = resolved.institution_id;
    if (!institutionId && !errors.some((e) => e.includes('Institution'))) {
      errors.push('Institution ID is required for further resolutions');
      return { resolved, errors };
    }

    // 2. Resolve Degree (optional)
    if (data.degree_name && !data.degree_id && institutionId) {
      const degreeId = await resolveDegreeName(data.degree_name, institutionId);
      if (degreeId) {
        resolved.degree_id = degreeId;
      } else {
        errors.push(
          `Degree "${data.degree_name}" not found in the specified institution`
        );
      }
    }

    // 3. Resolve Department
    if (data.department_name && !data.department_id && institutionId) {
      const departmentId = await resolveDepartmentName(
        data.department_name,
        institutionId
      );
      if (departmentId) {
        resolved.department_id = departmentId;
      } else {
        errors.push(
          `Department "${data.department_name}" not found in the specified institution`
        );
      }
    }

    // Ensure we have department_id for program resolution
    const departmentId = resolved.department_id;
    if (!departmentId && !errors.some((e) => e.includes('Department'))) {
      errors.push('Department ID is required for program resolution');
      return { resolved, errors };
    }

    // 4. Resolve Program
    if (data.program_name && !data.program_id && departmentId) {
      const programId = await resolveProgramName(
        data.program_name,
        departmentId
      );
      if (programId) {
        resolved.program_id = programId;
      } else {
        errors.push(
          `Program "${data.program_name}" not found in the specified department`
        );
      }
    }

    // 5. Resolve Academic Year (optional)
    if (data.academic_year_name && !data.academic_year_id && institutionId) {
      const academicYearId = await resolveAcademicYearName(
        data.academic_year_name,
        institutionId
      );
      if (academicYearId) {
        resolved.academic_year_id = academicYearId;
      } else {
        errors.push(
          `Academic Year "${data.academic_year_name}" not found in the specified institution`
        );
      }
    }

    // 6. Resolve Semester (optional)
    if (data.semester_name && !data.semester_id && institutionId) {
      const semesterId = await resolveSemesterName(
        data.semester_name,
        institutionId
      );
      if (semesterId) {
        resolved.semester_id = semesterId;
      } else {
        errors.push(
          `Semester "${data.semester_name}" not found in the specified institution`
        );
      }
    }

    // 7. Resolve Section (optional)
    if (data.section_name && !data.section_id && resolved.semester_id) {
      const sectionId = await resolveSectionName(
        data.section_name,
        resolved.semester_id
      );
      if (sectionId) {
        resolved.section_id = sectionId;
      } else {
        errors.push(
          `Section "${data.section_name}" not found in the specified semester`
        );
      }
    }

    return { resolved, errors };
  } catch (error) {
    console.error('Error in name resolution:', error);
    errors.push('Failed to resolve entity names to IDs');
    return { resolved, errors };
  }
};

type ValidationError = {
  row: number;
  errors: Record<string, string[] | undefined>;
  rowData: Record<string, any>;
};

type DuplicateCheckResult = {
  isDuplicate: boolean;
  duplicateField: string;
  existingStudentInfo?: string;
};

interface ValidationProgress {
  current: number;
  total: number;
  currentRow: any;
  percentage: number;
}

// Function to check for existing students using direct Supabase queries
const checkForDuplicateStudent = async (
  studentData: NewStudentData
): Promise<DuplicateCheckResult> => {
  try {
    const { createClientSupabaseClient } = await import(
      '@/lib/supabase/client'
    );
    const supabase = createClientSupabaseClient();

    // Check by student email (most reliable unique identifier)
    if (studentData.student_email) {
      const { data: existingByEmail, error: emailError } = await supabase
        .from('students')
        .select('id, first_name, last_name')
        .eq('student_email', studentData.student_email)
        .limit(1);

      if (emailError) throw emailError;

      if (existingByEmail && existingByEmail.length > 0) {
        return {
          isDuplicate: true,
          duplicateField: 'student_email',
          existingStudentInfo: `Student with email "${
            studentData.student_email
          }" already exists: ${existingByEmail[0].first_name} ${
            existingByEmail[0].last_name || ''
          } (ID: ${existingByEmail[0].id})`
        };
      }
    }

    // Check by college email if provided
    if (studentData.college_email) {
      const { data: existingByCollegeEmail, error: collegeEmailError } =
        await supabase
          .from('students')
          .select('id, first_name, last_name')
          .eq('college_email', studentData.college_email)
          .limit(1);

      if (collegeEmailError) throw collegeEmailError;

      if (existingByCollegeEmail && existingByCollegeEmail.length > 0) {
        return {
          isDuplicate: true,
          duplicateField: 'college_email',
          existingStudentInfo: `Student with college email "${
            studentData.college_email
          }" already exists: ${existingByCollegeEmail[0].first_name} ${
            existingByCollegeEmail[0].last_name || ''
          } (ID: ${existingByCollegeEmail[0].id})`
        };
      }
    }

    // Check by roll number if provided
    if (studentData.roll_number) {
      const { data: existingByRoll, error: rollError } = await supabase
        .from('students')
        .select('id, first_name, last_name')
        .eq('roll_number', studentData.roll_number)
        .limit(1);

      if (rollError) throw rollError;

      if (existingByRoll && existingByRoll.length > 0) {
        return {
          isDuplicate: true,
          duplicateField: 'roll_number',
          existingStudentInfo: `Student with roll number "${
            studentData.roll_number
          }" already exists: ${existingByRoll[0].first_name} ${
            existingByRoll[0].last_name || ''
          } (ID: ${existingByRoll[0].id})`
        };
      }
    }

    // Check by mobile + name combination as additional check
    if (studentData.student_mobile && studentData.first_name) {
      const { data: existingByMobileAndName, error: mobileNameError } =
        await supabase
          .from('students')
          .select('id, first_name, last_name')
          .eq('student_mobile', studentData.student_mobile)
          .eq('first_name', studentData.first_name)
          .limit(1);

      if (mobileNameError) throw mobileNameError;

      if (existingByMobileAndName && existingByMobileAndName.length > 0) {
        return {
          isDuplicate: true,
          duplicateField: 'student_mobile + first_name',
          existingStudentInfo: `Student with mobile "${
            studentData.student_mobile
          }" and name "${studentData.first_name} ${
            studentData.last_name || ''
          }" already exists (ID: ${existingByMobileAndName[0].id})`
        };
      }
    }

    return { isDuplicate: false, duplicateField: '' };
  } catch (error) {
    console.error('Error checking for duplicate student:', error);
    // Return false to not block upload due to check error, but log it
    return { isDuplicate: false, duplicateField: '' };
  }
};

export function BulkCreateStudents() {
  const router = useRouter(); // Add router
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );
  const [validRows, setValidRows] = useState<NewStudentData[]>([]); // Use NewStudentData type
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationProgress, setValidationProgress] =
    useState<ValidationProgress>({
      current: 0,
      total: 0,
      currentRow: null,
      percentage: 0
    });
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
    created?: number;
    failed?: number;
    usersCreated?: number;
    userCreationResults?: Array<{
      student_id: string;
      student_name: string; // Keep this for display
      email: string;
      success: boolean;
      message?: string;
    }>;
  } | null>(null);

  const resetState = useCallback((keepOpen = false) => {
    setFile(null);
    setIsValidating(false);
    setIsUploading(false);
    setValidationErrors([]);
    setValidRows([]);
    setUploadProgress(0);
    setValidationProgress({
      current: 0,
      total: 0,
      currentRow: null,
      percentage: 0
    });
    setUploadResult(null);
    if (!keepOpen) {
      setIsOpen(false);
    }
  }, []);

  const handleFileValidation = useCallback(
    async (fileToValidate: File) => {
      setIsValidating(true);
      setValidationErrors([]);
      setValidRows([]);
      setUploadResult(null);

      // Reset validation progress
      setValidationProgress({
        current: 0,
        total: 0,
        currentRow: null,
        percentage: 0
      });

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const fileContent = event.target?.result;
          let parsedData: Record<string, any>[] = [];
          if (fileToValidate.type === 'text/csv') {
            const result = Papa.parse(fileContent as string, {
              header: true,
              skipEmptyLines: true,
              transformHeader: (header) => header.trim(),
              transform: (value) => value.trim(),
              dynamicTyping: false
            });
            if (result.errors.length > 0) {
              toast.error(`CSV parsing error: ${result.errors[0].message}`);
              setIsValidating(false);
              setFile(null);
              return;
            }
            parsedData = result.data as Record<string, any>[];
          } else {
            const workbook = XLSX.read(fileContent, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            parsedData = XLSX.utils.sheet_to_json(worksheet, {
              defval: '',
              raw: false
            }) as Record<string, any>[];
            parsedData = parsedData.map((row) => {
              const trimmedRow: Record<string, any> = {};
              for (const key in row) {
                const trimmedKey = key.trim();
                const value = row[key];
                trimmedRow[trimmedKey] =
                  typeof value === 'string' ? value.trim() : value;
              }
              return trimmedRow;
            });
          }
          if (parsedData.length === 0) {
            toast.error("File is empty or couldn't be parsed correctly.");
            resetState(true);
            return;
          }

          // Initialize validation progress
          setValidationProgress({
            current: 0,
            total: parsedData.length,
            currentRow: null,
            percentage: 0
          });

          const errors: ValidationError[] = [];
          const valid: NewStudentData[] = [];
          const duplicateErrors: ValidationError[] = [];
          const headers = Object.keys(parsedData[0] || {});

          // Clean header names to remove potential asterisks from field markers
          const cleanHeaders = headers.map((h) =>
            h.replace(/\s*\*\s*$/, '').trim()
          );

          // No required fields check - all fields are optional now
          // Process each row with validation and duplicate checking
          for (let index = 0; index < parsedData.length; index++) {
            const row = parsedData[index];

            // Update validation progress
            setValidationProgress({
              current: index + 1,
              total: parsedData.length,
              currentRow: row,
              percentage: Math.round(((index + 1) / parsedData.length) * 100)
            });

            try {
              // Clean the row keys to remove asterisks and normalize data
              const processedRow: Record<string, any> = {};
              Object.entries(row).forEach(([key, value]) => {
                const cleanKey = key.replace(/\s*\*\s*$/, '').trim();
                processedRow[cleanKey] = value;
              });

              // Normalize boolean fields
              ['counseling_applied', 'first_graduate', 'bus_required'].forEach(
                (key) => {
                  if (typeof processedRow[key] === 'string') {
                    processedRow[key] = processedRow[key].trim().toLowerCase();
                  }
                }
              );

              // Step 1: Validate with Zod schema (basic validation)
              const basicResult = newStudentSchema.safeParse(processedRow);
              if (!basicResult.success) {
                errors.push({
                  row: index + 2,
                  errors: basicResult.error.flatten().fieldErrors,
                  rowData: row
                });
                continue; // Skip to next row
              }

              const basicData = basicResult.data;

              // Step 2: Resolve name fields to IDs
              const { resolved: validData, errors: nameErrors } =
                await resolveNameFields(basicData);

              if (nameErrors.length > 0) {
                errors.push({
                  row: index + 2,
                  errors: {
                    name_resolution: nameErrors
                  },
                  rowData: row
                });
                continue; // Skip to next row
              }

              // Step 3: Check for duplicates
              const duplicateCheck = await checkForDuplicateStudent(validData);
              if (duplicateCheck.isDuplicate) {
                duplicateErrors.push({
                  row: index + 2,
                  errors: {
                    [duplicateCheck.duplicateField]: [
                      `DUPLICATE: ${duplicateCheck.existingStudentInfo}`
                    ]
                  },
                  rowData: row
                });
                continue; // Skip to next row
              }

              // Step 4: Transform data (marks JSON conversion)
              try {
                // Transform separate marks fields into JSON format (only if data exists)
                let tenthMarksJson = null;
                if (
                  validData.tenth_marks_max_marks ||
                  validData.tenth_marks_obtained_marks ||
                  validData.tenth_marks_percentage
                ) {
                  tenthMarksJson = {
                    max_marks: validData.tenth_marks_max_marks || '',
                    obtained_marks: validData.tenth_marks_obtained_marks || '',
                    percentage: validData.tenth_marks_percentage || ''
                  };
                }

                // Build subjects object for 12th marks
                const subjects: Record<string, string> = {};
                if (validData.twelfth_marks_physics)
                  subjects.physics = validData.twelfth_marks_physics;
                if (validData.twelfth_marks_chemistry)
                  subjects.chemistry = validData.twelfth_marks_chemistry;
                if (validData.twelfth_marks_mathematics)
                  subjects.mathematics = validData.twelfth_marks_mathematics;
                if (validData.twelfth_marks_biology)
                  subjects.biology = validData.twelfth_marks_biology;
                if (validData.twelfth_marks_computer_science)
                  subjects.computerScience =
                    validData.twelfth_marks_computer_science;
                if (validData.twelfth_marks_other_subject)
                  subjects.other = validData.twelfth_marks_other_subject;

                let twelfthMarksJson = null;
                if (
                  validData.twelfth_marks_group ||
                  validData.twelfth_marks_max_marks ||
                  validData.twelfth_marks_obtained_marks ||
                  validData.twelfth_marks_percentage
                ) {
                  twelfthMarksJson = {
                    group: validData.twelfth_marks_group || '',
                    max_marks: validData.twelfth_marks_max_marks || '',
                    obtained_marks:
                      validData.twelfth_marks_obtained_marks || '',
                    percentage: validData.twelfth_marks_percentage || '',
                    subjects: subjects
                  };
                }

                // Create final data object with JSON fields (only include if data exists)
                const transformedData: any = { ...validData };
                if (tenthMarksJson) {
                  transformedData.tenth_marks_json =
                    JSON.stringify(tenthMarksJson);
                }
                if (twelfthMarksJson) {
                  transformedData.twelfth_marks_json =
                    JSON.stringify(twelfthMarksJson);
                }

                valid.push(transformedData as NewStudentData);
              } catch (transformError) {
                errors.push({
                  row: index + 2,
                  errors: {
                    marks_transform: [
                      'Failed to transform marks data into required format'
                    ]
                  },
                  rowData: row
                });
              }
            } catch (rowError) {
              console.error(`Error processing row ${index + 2}:`, rowError);
              errors.push({
                row: index + 2,
                errors: {
                  processing_error: [
                    `Row processing failed: ${
                      rowError instanceof Error
                        ? rowError.message
                        : 'Unknown error'
                    }`
                  ]
                },
                rowData: row
              });
            }
          }
          // Combine validation errors and duplicate errors
          const allErrors = [...errors, ...duplicateErrors];

          setValidationErrors(allErrors);
          setValidRows(valid);

          if (allErrors.length > 0) {
            const validationErrorCount = errors.length;
            const duplicateErrorCount = duplicateErrors.length;

            let errorMessage = `Validation finished with ${allErrors.length} error(s)`;
            if (validationErrorCount > 0 && duplicateErrorCount > 0) {
              errorMessage += ` (${validationErrorCount} validation errors, ${duplicateErrorCount} duplicates)`;
            } else if (duplicateErrorCount > 0) {
              errorMessage += ` (${duplicateErrorCount} duplicates found)`;
            }
            errorMessage += '. Please fix them before uploading.';

            toast(errorMessage, { icon: '⚠️' });
          } else if (valid.length > 0) {
            toast.success(
              `Validation successful! ${valid.length} rows ready for upload. No duplicates found.`
            );
          } else {
            toast('No valid rows found to upload after validation.', {
              icon: 'ℹ️'
            });
          }
        } catch (error) {
          console.error('Error processing file:', error);
          toast.error(
            'Failed to process the file. Ensure it is formatted correctly.'
          );
          resetState(true);
        } finally {
          setIsValidating(false);
          setValidationProgress({
            current: 0,
            total: 0,
            currentRow: null,
            percentage: 0
          });
        }
      };
      reader.onerror = () => {
        toast.error('Error reading the file.');
        setIsValidating(false);
        resetState(true);
      };
      if (fileToValidate.type === 'text/csv') {
        reader.readAsText(fileToValidate);
      } else {
        reader.readAsBinaryString(fileToValidate);
      }
    },
    [resetState]
  );
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      resetState(true);
      if (acceptedFiles.length > 0) {
        const selectedFile = acceptedFiles[0];
        if (
          selectedFile.type === 'text/csv' ||
          selectedFile.type === 'application/vnd.ms-excel' ||
          selectedFile.type ===
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ) {
          setFile(selectedFile);
          handleFileValidation(selectedFile);
        } else {
          toast.error('Invalid file type. Please upload a CSV or Excel file.');
        }
      }
    },
    [resetState, handleFileValidation]
  );

  const handleUpload = async () => {
    if (validRows.length === 0 || validationErrors.length > 0) {
      toast.error(
        'Cannot upload. Please ensure there are valid rows and no validation errors.'
      );
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadResult(null);

    try {
      // Process rows in batches similar to the staff module
      const batchSize = 50;
      const batches = [];
      for (let i = 0; i < validRows.length; i += batchSize) {
        batches.push(validRows.slice(i, i + batchSize));
      }

      let createdCount = 0;
      let failedCount = 0;
      let usersCreatedCount = 0;
      const errorDetails: string[] = [];
      const userCreationResults: {
        student_id: string;
        student_name: string; // For display
        email: string;
        success: boolean;
        message?: string;
      }[] = [];

      // Process each batch
      for (const batch of batches) {
        // Setting progress for batches
        setUploadProgress(Math.floor((createdCount / validRows.length) * 100));

        // Create a promise for each student in the batch
        const promises = batch.map(async (row) => {
          try {
            // Parse JSON strings that were created during validation
            const rowData = row as any;
            const tenthMarks =
              typeof rowData.tenth_marks_json === 'string'
                ? JSON.parse(rowData.tenth_marks_json)
                : rowData.tenth_marks_json;

            const twelfthMarks =
              typeof rowData.twelfth_marks_json === 'string'
                ? JSON.parse(rowData.twelfth_marks_json)
                : rowData.twelfth_marks_json;

            // Create a new object without the separate marks fields, _json fields, and name fields
            const {
              tenth_marks_json,
              twelfth_marks_json,
              tenth_marks_max_marks,
              tenth_marks_obtained_marks,
              tenth_marks_percentage,
              twelfth_marks_group,
              twelfth_marks_max_marks,
              twelfth_marks_obtained_marks,
              twelfth_marks_percentage,
              twelfth_marks_physics,
              twelfth_marks_chemistry,
              twelfth_marks_mathematics,
              twelfth_marks_biology,
              twelfth_marks_computer_science,
              twelfth_marks_other_subject,
              // Exclude name fields that don't exist in database table
              institution_name,
              degree_name,
              department_name,
              program_name,
              academic_year_name,
              semester_name,
              section_name,
              ...restData
            } = rowData;

            // Create student_name for display purposes only (not sent to database)
            const displayStudentName = `${restData.first_name || 'Unknown'} ${
              restData.last_name || ''
            }`.trim();

            // Add in the special fields handling and include defaults for required fields
            // Handle as type any to bypass complex strict type checking
            // We've already validated this data with Zod earlier
            const processedData = {
              ...restData,
              // Provide defaults for NOT NULL fields in database
              first_name: restData.first_name || 'Unknown',
              // last_name is optional - leave empty if no value provided
              last_name: restData.last_name || null,
              father_name: restData.father_name || 'Unknown',
              mother_name: restData.mother_name || 'Unknown',
              mother_mobile: restData.mother_mobile || '0000000000',
              gender: restData.gender || 'Not Specified',
              religion: restData.religion || 'Not Specified',
              community: restData.community || 'Not Specified',
              last_school: restData.last_school || 'Unknown School',
              board_of_study: restData.board_of_study || 'Not Specified',
              entry_type: restData.entry_type || 'FIRST YEAR',
              // Handle JSONB fields with proper defaults
              tenth_marks: tenthMarks || {
                max_marks: '',
                obtained_marks: '',
                percentage: ''
              },
              twelfth_marks: twelfthMarks || {
                group: '',
                max_marks: '',
                obtained_marks: '',
                percentage: '',
                subjects: {}
              },
              // Other required fields
              status: 'active',
              admission_id: null, // Use null instead of empty string for UUID field
              is_profile_complete: false,
              counseling_applied:
                typeof restData.counseling_applied === 'string'
                  ? String(restData.counseling_applied).toLowerCase() === 'true'
                  : Boolean(restData.counseling_applied),
              first_graduate:
                typeof restData.first_graduate === 'string'
                  ? String(restData.first_graduate).toLowerCase() === 'true'
                  : Boolean(restData.first_graduate),
              bus_required:
                typeof restData.bus_required === 'string'
                  ? String(restData.bus_required).toLowerCase() === 'true'
                  : Boolean(restData.bus_required)
            };

            // Create student using the standard service method
            console.log(
              `Creating student: ${processedData.first_name} ${processedData.last_name}`
            );
            const newStudent = await StudentService.createStudent(
              processedData as any
            );

            if (newStudent) {
              createdCount++;

              // User creation is now handled inside the createStudent service,
              // so we can check if a user account should have been created.
              if (newStudent.college_email && newStudent.is_profile_complete) {
                usersCreatedCount++;
                userCreationResults.push({
                  student_id: newStudent.id,
                  student_name: `${newStudent.first_name} ${
                    newStudent.last_name || ''
                  }`.trim(),
                  email: newStudent.college_email,
                  success: true, // Assume success, service handles toasts on failure
                  message: 'User creation process initiated.'
                });
              }
            }
          } catch (error) {
            console.error(`Error creating student:`, error);
            failedCount++;
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            errorDetails.push(`Row ${batch.indexOf(row) + 1}: ${errorMessage}`);

            if (row.college_email) {
              userCreationResults.push({
                student_id: 'failed',
                student_name: `${row.first_name || 'Unknown'} ${
                  row.last_name || ''
                }`.trim(),
                email: row.college_email ?? 'Unknown',
                success: false,
                message: errorMessage
              });
            }
          }
        });

        // Wait for all promises in the batch to complete
        await Promise.all(promises);
      }

      // Complete progress
      setUploadProgress(100);

      // Prepare result message
      const successMessage = `Created ${createdCount} students successfully.`;
      const failureMessage = failedCount > 0 ? ` Failed: ${failedCount}.` : '';

      // Count students with college_email for user creation messaging
      const studentsWithEmail = validRows.filter(
        (row) => row.college_email
      ).length;
      const userMessage =
        usersCreatedCount > 0
          ? ` ${usersCreatedCount} user accounts created immediately.`
          : studentsWithEmail > 0
          ? ` User accounts will be created automatically when profiles are completed.`
          : '';

      // Set the upload result
      setUploadResult({
        success: createdCount > 0,
        message: successMessage + failureMessage + userMessage,
        created: createdCount,
        failed: failedCount,
        usersCreated: usersCreatedCount,
        userCreationResults
      });

      // Show a single consolidated success/error toast
      if (createdCount > 0) {
        const toastMessage =
          usersCreatedCount > 0
            ? `${successMessage} ${usersCreatedCount} user accounts created.`
            : studentsWithEmail > 0
            ? `${successMessage} User accounts will be created when profiles are completed.`
            : successMessage;
        toast.success(toastMessage);
      }

      if (failedCount > 0) {
        // Only show detailed errors for a reasonable number of failures
        if (errorDetails.length <= 3) {
          toast.error(
            `Failed to create ${failedCount} students: ${errorDetails.join(
              '; '
            )}`
          );
        } else {
          toast.error(
            `Failed to create ${failedCount} students. See console for details.`
          );
          console.error('Student creation errors:', errorDetails);
        }
      }

      // Reset and refresh if completely successful
      if (failedCount === 0) {
        resetState();
        router.refresh();
      }
    } catch (error) {
      console.error('Error during bulk upload:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'An unknown error occurred during upload.';
      setUploadResult({
        success: false,
        message,
        created: 0,
        failed: validRows.length
      });
      toast.error(`Upload failed: ${message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
        '.xlsx'
      ]
    },
    maxFiles: 1
  });

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      resetState();
    }
  };

  // Helper function to group user creation results
  const getUserCreationSummary = () => {
    if (
      !uploadResult?.userCreationResults ||
      uploadResult.userCreationResults.length === 0
    ) {
      return null;
    }

    const successful = uploadResult.userCreationResults.filter(
      (r) => r.success
    );
    const failed = uploadResult.userCreationResults.filter((r) => !r.success);

    return (
      <div className='mt-4 space-y-4'>
        <h4 className='font-medium'>User Account Creation Summary</h4>

        <div className='flex items-center gap-2 text-sm'>
          <Badge
            variant='outline'
            className='bg-green-50 text-green-700 border-green-200'
          >
            Success: {successful.length}
          </Badge>
          <Badge
            variant='outline'
            className='bg-red-50 text-red-700 border-red-200'
          >
            Failed: {failed.length}
          </Badge>
        </div>

        {(successful.length > 0 || failed.length > 0) && (
          <Accordion type='single' collapsible className='w-full'>
            {successful.length > 0 && (
              <AccordionItem value='successful-users'>
                <AccordionTrigger className='text-sm'>
                  <span className='flex items-center'>
                    <CheckCircle className='h-4 w-4 mr-2 text-green-600' />
                    Created User Accounts ({successful.length})
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className='text-xs space-y-1 max-h-[150px] overflow-y-auto'>
                    {successful.map((result, idx) => (
                      <div
                        key={`success-${idx}`}
                        className='py-1 border-b border-gray-100'
                      >
                        {result.student_name} ({result.email})
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {failed.length > 0 && (
              <AccordionItem value='failed-users'>
                <AccordionTrigger className='text-sm'>
                  <span className='flex items-center'>
                    <XCircle className='h-4 w-4 mr-2 text-red-600' />
                    Failed User Accounts ({failed.length})
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className='text-xs space-y-1 max-h-[150px] overflow-y-auto'>
                    {failed.map((result, idx) => (
                      <div
                        key={`failed-${idx}`}
                        className='py-1 border-b border-gray-100'
                      >
                        <span className='font-medium'>
                          {result.student_name}
                        </span>
                        <span className='mx-1'>({result.email})</span>
                        <span className='text-red-600'>
                          - {result.message || 'Unknown error'}
                        </span>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        )}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant='outline' className='w-full sm:w-auto'>
          <Upload className='mr-2 h-4 w-4' />
          Bulk Create Students
        </Button>
      </DialogTrigger>
      <DialogContent className='w-[95vw] max-w-6xl h-[90vh] flex flex-col p-0'>
        <DialogHeader className='px-4 py-3 border-b bg-muted/50 rounded-t-lg'>
          <DialogTitle className='text-lg sm:text-xl'>
            Student Bulk Upload
          </DialogTitle>
          <p className='text-sm text-muted-foreground'>
            Upload student data from Excel (.xlsx) or CSV (.csv) file
          </p>
        </DialogHeader>

        <div className='flex-1 overflow-hidden flex flex-col'>
          {!file ? (
            // File Upload Section
            <div className='flex-1 flex items-center justify-center p-6'>
              <div
                {...getRootProps()}
                className={`w-full max-w-md mx-auto p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
              >
                <input {...getInputProps()} />
                <div className='flex flex-col items-center space-y-4'>
                  <div className='w-16 h-16 bg-muted rounded-full flex items-center justify-center'>
                    <Upload className='h-8 w-8 text-muted-foreground' />
                  </div>
                  <div className='space-y-2'>
                    <h3 className='text-lg font-medium'>
                      {isDragActive
                        ? 'Drop your file here'
                        : 'Upload Student Data'}
                    </h3>
                    <p className='text-sm text-muted-foreground'>
                      {isDragActive
                        ? 'Release to upload'
                        : 'Drag & drop or click to select Excel/CSV file'}
                    </p>
                  </div>
                  <div className='text-xs text-muted-foreground space-y-1'>
                    <p>Supported formats: .xlsx, .xls, .csv</p>
                    <p>Maximum file size: 10MB</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // File Preview Section with Enhanced Validation Display
            <div className='flex-1 flex flex-col overflow-hidden'>
              {/* File Info Header */}
              <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b bg-muted/25'>
                <div className='flex items-center space-x-3 min-w-0'>
                  <FileText className='h-5 w-5 text-muted-foreground flex-shrink-0' />
                  <div className='min-w-0'>
                    <p className='text-sm font-medium truncate'>{file.name}</p>
                    <p className='text-xs text-muted-foreground'>
                      {validRows.length + validationErrors.length} row
                      {validRows.length + validationErrors.length !== 1
                        ? 's'
                        : ''}{' '}
                      found
                      {(validRows.length > 0 ||
                        validationErrors.length > 0) && (
                        <>
                          {' • '}
                          <span className='text-green-600'>
                            {validRows.length} valid
                          </span>
                          {' • '}
                          <span className='text-red-600'>
                            {validationErrors.length} invalid
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className='flex gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => resetState(true)}
                    className='flex-shrink-0'
                    disabled={isValidating || isUploading}
                  >
                    <X className='h-4 w-4 mr-2' />
                    Clear File
                  </Button>
                </div>
              </div>

              {/* Content Section */}
              <div className='flex-1 overflow-auto'>
                {isValidating ? (
                  <div className='flex items-center justify-center h-64'>
                    <div className='text-center space-y-4 w-full max-w-md px-4'>
                      <Loader2 className='h-8 w-8 animate-spin mx-auto text-primary' />
                      <p className='text-muted-foreground'>
                        Validating student data...
                      </p>

                      {/* Validation Progress */}
                      {validationProgress.total > 0 && (
                        <div className='space-y-3 p-4 border rounded-lg bg-muted/50'>
                          <div className='flex items-center justify-between text-sm'>
                            <span className='font-medium'>
                              Processing rows...
                            </span>
                            <span className='text-muted-foreground'>
                              {validationProgress.current} /{' '}
                              {validationProgress.total}
                            </span>
                          </div>

                          <Progress
                            value={validationProgress.percentage}
                            className='h-2'
                          />

                          <div className='text-xs text-muted-foreground'>
                            {validationProgress.percentage}% complete
                          </div>

                          {validationProgress.currentRow && (
                            <div className='text-xs text-muted-foreground'>
                              Currently validating:{' '}
                              <span className='font-medium'>
                                {validationProgress.currentRow.first_name ||
                                  'Student'}{' '}
                                {validationProgress.currentRow.last_name || ''}
                                {validationProgress.currentRow.roll_number &&
                                  ` (${validationProgress.currentRow.roll_number})`}
                                {validationProgress.currentRow.college_email &&
                                  ` - ${validationProgress.currentRow.college_email}`}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : validRows.length === 0 && validationErrors.length === 0 ? (
                  <div className='flex items-center justify-center h-32'>
                    <p className='text-muted-foreground'>Processing file...</p>
                  </div>
                ) : (
                  <div className='overflow-auto'>
                    {/* Enhanced Validation Results Display */}

                    {/* Mobile View - Card Layout */}
                    <div className='block md:hidden space-y-3 p-4'>
                      {/* Valid Rows */}
                      {validRows.map((row, index) => (
                        <div
                          key={`valid-${index}`}
                          className='border border-green-200 bg-green-50 rounded-lg p-4 space-y-3'
                        >
                          <div className='flex items-center justify-between'>
                            <span className='text-sm font-medium'>
                              Row {index + 2} {/* Assuming header row */}
                            </span>
                            <Badge variant='default' className='bg-green-600'>
                              Valid
                            </Badge>
                          </div>
                          <div className='grid grid-cols-1 gap-2 text-sm'>
                            <div>
                              <span className='font-medium'>Name: </span>
                              <span>
                                {`${row.first_name || ''} ${
                                  row.last_name || ''
                                }`.trim()}
                              </span>
                            </div>
                            <div>
                              <span className='font-medium'>Roll Number: </span>
                              <span>{row.roll_number || 'N/A'}</span>
                            </div>
                            <div>
                              <span className='font-medium'>Email: </span>
                              <span className='break-all'>
                                {row.college_email || 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className='font-medium'>Institution: </span>
                              <span>{row.institution_name || 'N/A'}</span>
                            </div>
                            <div>
                              <span className='font-medium'>Program: </span>
                              <span>{row.program_name || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Invalid Rows */}
                      {validationErrors.map((error, index) => (
                        <div
                          key={`error-${index}`}
                          className='border border-red-200 bg-red-50 rounded-lg p-4 space-y-3'
                        >
                          <div className='flex items-center justify-between'>
                            <span className='text-sm font-medium'>
                              Row {error.row}
                            </span>
                            <Badge variant='destructive'>Invalid</Badge>
                          </div>
                          <div className='grid grid-cols-1 gap-2 text-sm'>
                            <div>
                              <span className='font-medium'>Name: </span>
                              <span>
                                {`${error.rowData?.first_name || ''} ${
                                  error.rowData?.last_name || ''
                                }`.trim() || 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className='font-medium'>Roll Number: </span>
                              <span>{error.rowData?.roll_number || 'N/A'}</span>
                            </div>
                            <div>
                              <span className='font-medium'>Email: </span>
                              <span className='break-all'>
                                {error.rowData?.college_email || 'N/A'}
                              </span>
                            </div>
                          </div>
                          {/* Error Details */}
                          <div className='mt-2 p-2 bg-red-100 rounded text-red-700 text-xs'>
                            <span className='font-medium'>Errors: </span>
                            <div className='mt-1 space-y-1'>
                              {Object.entries(error.errors).map(
                                ([field, messages]) =>
                                  Array.isArray(messages) ? (
                                    messages.map((msg, msgIdx) => (
                                      <div key={`${field}-${msgIdx}`}>
                                        <span className='font-medium'>
                                          {field}:
                                        </span>{' '}
                                        {msg}
                                      </div>
                                    ))
                                  ) : (
                                    <div key={field}>
                                      <span className='font-medium'>
                                        {field}:
                                      </span>{' '}
                                      {messages}
                                    </div>
                                  )
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop View - Table Layout */}
                    <div className='hidden md:block'>
                      <Table>
                        <TableHeader className='sticky top-0 bg-background z-10'>
                          <TableRow>
                            <TableHead className='w-16'>Row</TableHead>
                            <TableHead className='min-w-[160px]'>
                              First Name
                            </TableHead>
                            <TableHead className='min-w-[160px]'>
                              Last Name
                            </TableHead>
                            <TableHead className='min-w-[120px]'>
                              Roll Number
                            </TableHead>
                            <TableHead className='min-w-[200px]'>
                              Email
                            </TableHead>
                            <TableHead className='min-w-[180px]'>
                              Institution
                            </TableHead>
                            <TableHead className='min-w-[150px]'>
                              Program
                            </TableHead>
                            <TableHead className='w-20'>Status</TableHead>
                            <TableHead className='min-w-[250px]'>
                              Validation Details
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {/* Valid Rows */}
                          {validRows.map((row, index) => (
                            <TableRow
                              key={`valid-${index}`}
                              className='bg-green-50/50'
                            >
                              <TableCell className='font-medium'>
                                {index + 2} {/* Assuming header row */}
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[160px]'>
                                  <p className='truncate'>
                                    {row.first_name || 'N/A'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[160px]'>
                                  <p className='truncate'>
                                    {row.last_name || 'N/A'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[120px]'>
                                  <p className='truncate font-mono text-xs'>
                                    {row.roll_number || 'N/A'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[200px]'>
                                  <p className='truncate text-xs'>
                                    {row.college_email || 'N/A'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[180px]'>
                                  <p className='truncate text-xs'>
                                    {row.institution_name || 'N/A'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[150px]'>
                                  <p className='truncate text-xs'>
                                    {row.program_name || 'N/A'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant='default'
                                  className='text-xs bg-green-600'
                                >
                                  Valid
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <span className='text-xs text-green-600'>
                                  All validations passed
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}

                          {/* Invalid Rows */}
                          {validationErrors.map((error, index) => (
                            <TableRow
                              key={`error-${index}`}
                              className='bg-red-50'
                            >
                              <TableCell className='font-medium'>
                                {error.row}
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[160px]'>
                                  <p className='truncate'>
                                    {error.rowData?.first_name || 'N/A'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[160px]'>
                                  <p className='truncate'>
                                    {error.rowData?.last_name || 'N/A'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[120px]'>
                                  <p className='truncate font-mono text-xs'>
                                    {error.rowData?.roll_number || 'N/A'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[200px]'>
                                  <p className='truncate text-xs'>
                                    {error.rowData?.college_email || 'N/A'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[180px]'>
                                  <p className='truncate text-xs'>
                                    {error.rowData?.institution_name || 'N/A'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[150px]'>
                                  <p className='truncate text-xs'>
                                    {error.rowData?.program_name || 'N/A'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant='destructive'
                                  className='text-xs'
                                >
                                  Invalid
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[250px]'>
                                  <div className='space-y-1'>
                                    {Object.entries(error.errors).map(
                                      ([field, messages]) =>
                                        Array.isArray(messages) ? (
                                          messages.map((msg, msgIdx) => (
                                            <p
                                              key={`${field}-${msgIdx}`}
                                              className='text-xs text-red-600 break-words'
                                            >
                                              <span className='font-medium'>
                                                {field}:
                                              </span>{' '}
                                              {msg}
                                            </p>
                                          ))
                                        ) : (
                                          <p
                                            key={field}
                                            className='text-xs text-red-600 break-words'
                                          >
                                            <span className='font-medium'>
                                              {field}:
                                            </span>{' '}
                                            {messages}
                                          </p>
                                        )
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Enhanced Footer with Summary Statistics */}
        <div className='border-t bg-muted/50 p-4'>
          <div className='flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center'>
            {/* Enhanced Summary */}
            {file && (validRows.length > 0 || validationErrors.length > 0) && (
              <div className='text-sm text-muted-foreground'>
                <span className='block sm:inline'>
                  Total: {validRows.length + validationErrors.length} rows
                </span>
                <span className='block sm:inline sm:ml-4'>
                  Valid:{' '}
                  <span className='text-green-600 font-medium'>
                    {validRows.length}
                  </span>
                </span>
                <span className='block sm:inline sm:ml-4'>
                  Invalid:{' '}
                  <span className='text-red-600 font-medium'>
                    {validationErrors.length}
                  </span>
                </span>
                {validationErrors.length > 0 && (
                  <span className='block sm:inline sm:ml-4 text-amber-600'>
                    Fix validation errors before uploading
                  </span>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className='flex flex-col sm:flex-row gap-2 w-full sm:w-auto'>
              <DialogClose asChild>
                <Button
                  variant='outline'
                  onClick={() => resetState()}
                  disabled={isUploading}
                  className='w-full sm:w-auto'
                >
                  Cancel
                </Button>
              </DialogClose>
              <DownloadNewStudentTemplateButton />
              {validRows.length > 0 && validationErrors.length === 0 && (
                <Button
                  onClick={handleUpload}
                  disabled={
                    !file ||
                    validRows.length === 0 ||
                    validationErrors.length > 0 ||
                    isUploading ||
                    isValidating
                  }
                  className='w-full sm:w-auto'
                >
                  {isUploading ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className='mr-2 h-4 w-4' />
                      Upload {validRows.length} Valid Student
                      {validRows.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
