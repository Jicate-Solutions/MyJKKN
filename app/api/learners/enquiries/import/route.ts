// app/api/learners/enquiries/import/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import {
  mapLabelToValue,
  getValidLabels
} from '@/lib/utils/mappings/enquiry-excel-mappings';

/**
 * POST /api/learners/enquiries/import
 *
 * Imports enquiries from an Excel file with comprehensive validation
 *
 * Features:
 * - Excel file parsing (59 columns)
 * - Row-by-row validation
 * - 12+ enum field mapping
 * - 6-level hierarchical FK validation (Institution → Degree → Dept → Prog → Sem → Sect)
 * - Duplicate email detection (file + database)
 * - Detailed error reporting with row numbers
 */

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface ImportError {
  row: number;
  field?: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  totalRows: number;
  errors: ImportError[];
  duplicateEmails?: string[];
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Safely extract cell value from Excel cell
 */
function getCellValue(cellValue: any): string {
  if (cellValue === null || cellValue === undefined) return '';
  if (typeof cellValue === 'object') {
    if (cellValue.richText) {
      return cellValue.richText.map((t: any) => t.text).join('');
    }
    if (cellValue.text) return String(cellValue.text);
    if (cellValue.result !== undefined) return String(cellValue.result);
    return '';
  }
  return String(cellValue).trim();
}

/**
 * Parse date from Excel (handles multiple formats)
 */
function parseDate(value: any): string | null {
  if (!value) return null;

  const str = String(value).trim();
  if (!str) return null;

  // Try YYYY-MM-DD format first
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Try DD/MM/YYYY or DD-MM-YYYY
  const parts = str.split(/[/-]/);
  if (parts.length === 3) {
    const [day, month, year] = parts;
    if (year.length === 4) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Parse a single Excel row into enquiry object
 */
function parseExcelRow(row: any[], rowNumber: number): {
  data: any | null;
  errors: ImportError[];
} {
  const errors: ImportError[] = [];

  // Extract values from columns (0-indexed)
  const firstName = getCellValue(row[0]);
  const lastName = getCellValue(row[1]);
  const dobStr = getCellValue(row[2]);
  const genderLabel = getCellValue(row[3]);
  const religionLabel = getCellValue(row[4]);
  const communityLabel = getCellValue(row[5]);
  const caste = getCellValue(row[6]);
  const aadharNumber = getCellValue(row[7]);
  const bloodGroupLabel = getCellValue(row[8]);

  const fatherName = getCellValue(row[9]);
  const fatherOccupation = getCellValue(row[10]);
  const fatherMobile = getCellValue(row[11]);
  const motherName = getCellValue(row[12]);
  const motherOccupation = getCellValue(row[13]);
  const motherMobile = getCellValue(row[14]);
  const annualIncome = getCellValue(row[15]);

  const institution = getCellValue(row[16]);
  const degree = getCellValue(row[17]);
  const department = getCellValue(row[18]);
  const program = getCellValue(row[19]);
  const semester = getCellValue(row[20]);
  const section = getCellValue(row[21]);
  const academicYear = getCellValue(row[22]);
  const admissionYear = getCellValue(row[23]);

  const studentMobile = getCellValue(row[24]);
  const collegeEmail = getCellValue(row[25]);
  const studentEmail = getCellValue(row[26]);

  const addressStreet = getCellValue(row[27]);
  const addressTaluk = getCellValue(row[28]);
  const addressDistrict = getCellValue(row[29]);
  const addressPinCode = getCellValue(row[30]);
  const addressState = getCellValue(row[31]);

  const entryTypeLabel = getCellValue(row[32]);
  const scholarshipTypeLabel = getCellValue(row[33]);

  const accommodationTypeLabel = getCellValue(row[34]);
  const hostelTypeLabel = getCellValue(row[35]);
  const foodTypeLabel = getCellValue(row[36]);

  const lastSchool = getCellValue(row[37]);
  const boardOfStudyLabel = getCellValue(row[38]);
  const tenthMaxMarks = getCellValue(row[39]);
  const tenthObtainedMarks = getCellValue(row[40]);
  const tenthPercentage = getCellValue(row[41]);
  const twelfthGroupLabel = getCellValue(row[42]);
  const twelfthMaxMarks = getCellValue(row[43]);
  const twelfthObtainedMarks = getCellValue(row[44]);
  const twelfthPercentage = getCellValue(row[45]);

  const medicalCutoff = getCellValue(row[46]);
  const engineeringCutoff = getCellValue(row[47]);
  const neetRollNumber = getCellValue(row[48]);
  const neetScore = getCellValue(row[49]);

  const counselingAppliedLabel = getCellValue(row[50]);
  const quotaLabel = getCellValue(row[51]);
  const category = getCellValue(row[52]);

  const busRequiredLabel = getCellValue(row[53]);
  const busRoute = getCellValue(row[54]);
  const busPickupLocation = getCellValue(row[55]);

  const referenceType = getCellValue(row[56]);
  const referenceName = getCellValue(row[57]);
  const referenceContact = getCellValue(row[58]);

  // Skip completely empty rows
  if (!firstName && !lastName && !studentMobile && !studentEmail) {
    return { data: null, errors: [] };
  }

  // ============================================================
  // VALIDATE REQUIRED FIELDS
  // ============================================================

  if (!firstName) {
    errors.push({ row: rowNumber, field: 'first_name', message: 'First Name is required' });
  }
  if (!lastName) {
    errors.push({ row: rowNumber, field: 'last_name', message: 'Last Name is required' });
  }

  // Date of Birth
  const dateOfBirth = parseDate(dobStr);
  if (!dobStr) {
    errors.push({ row: rowNumber, field: 'date_of_birth', message: 'Date of Birth is required' });
  } else if (!dateOfBirth) {
    errors.push({ row: rowNumber, field: 'date_of_birth', message: `Invalid date format: "${dobStr}". Use YYYY-MM-DD` });
  }

  // Validate enum fields
  const gender = mapLabelToValue(genderLabel, 'gender');
  if (!genderLabel) {
    errors.push({ row: rowNumber, field: 'gender', message: 'Gender is required' });
  } else if (!gender) {
    errors.push({ row: rowNumber, field: 'gender', message: `Invalid Gender: "${genderLabel}". Valid: ${getValidLabels('gender').join(', ')}` });
  }

  const religion = mapLabelToValue(religionLabel, 'religion');
  if (!religionLabel) {
    errors.push({ row: rowNumber, field: 'religion', message: 'Religion is required' });
  } else if (!religion) {
    errors.push({ row: rowNumber, field: 'religion', message: `Invalid Religion: "${religionLabel}". Valid: ${getValidLabels('religion').join(', ')}` });
  }

  const community = mapLabelToValue(communityLabel, 'community');
  if (!communityLabel) {
    errors.push({ row: rowNumber, field: 'community', message: 'Community is required' });
  } else if (!community) {
    errors.push({ row: rowNumber, field: 'community', message: `Invalid Community: "${communityLabel}". Valid: ${getValidLabels('community').join(', ')}` });
  }

  if (!caste) {
    errors.push({ row: rowNumber, field: 'caste', message: 'Caste is required' });
  }

  // Optional blood group
  let bloodGroup: string | undefined;
  if (bloodGroupLabel) {
    bloodGroup = mapLabelToValue(bloodGroupLabel, 'bloodGroup') as string | undefined;
    if (!bloodGroup) {
      errors.push({ row: rowNumber, field: 'blood_group', message: `Invalid Blood Group: "${bloodGroupLabel}"` });
    }
  }

  // Parent information
  if (!fatherName) {
    errors.push({ row: rowNumber, field: 'father_name', message: 'Father Name is required' });
  }
  if (!fatherMobile) {
    errors.push({ row: rowNumber, field: 'father_mobile', message: 'Father Mobile is required' });
  } else if (!/^\d{10}$/.test(fatherMobile.replace(/\D/g, ''))) {
    errors.push({ row: rowNumber, field: 'father_mobile', message: 'Father Mobile must be 10 digits' });
  }

  if (!motherName) {
    errors.push({ row: rowNumber, field: 'mother_name', message: 'Mother Name is required' });
  }
  if (!motherMobile) {
    errors.push({ row: rowNumber, field: 'mother_mobile', message: 'Mother Mobile is required' });
  } else if (!/^\d{10}$/.test(motherMobile.replace(/\D/g, ''))) {
    errors.push({ row: rowNumber, field: 'mother_mobile', message: 'Mother Mobile must be 10 digits' });
  }

  // Academic assignment (6-level hierarchy)
  if (!institution) {
    errors.push({ row: rowNumber, field: 'institution', message: 'Institution is required' });
  }
  if (!degree) {
    errors.push({ row: rowNumber, field: 'degree', message: 'Degree is required' });
  }
  if (!department) {
    errors.push({ row: rowNumber, field: 'department', message: 'Department is required' });
  }
  if (!program) {
    errors.push({ row: rowNumber, field: 'program', message: 'Program is required' });
  }
  if (!semester) {
    errors.push({ row: rowNumber, field: 'semester', message: 'Semester is required' });
  }
  if (!section) {
    errors.push({ row: rowNumber, field: 'section', message: 'Section is required' });
  }
  if (!academicYear) {
    errors.push({ row: rowNumber, field: 'academic_year', message: 'Academic Year is required' });
  }

  // Contact details
  if (!studentMobile) {
    errors.push({ row: rowNumber, field: 'student_mobile', message: 'Student Mobile is required' });
  } else if (!/^\d{10}$/.test(studentMobile.replace(/\D/g, ''))) {
    errors.push({ row: rowNumber, field: 'student_mobile', message: 'Student Mobile must be 10 digits' });
  }

  // College email is OPTIONAL for enquiries (required for profiles)
  // Student email is REQUIRED
  if (!studentEmail) {
    errors.push({ row: rowNumber, field: 'student_email', message: 'Student Email is required' });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail)) {
    errors.push({ row: rowNumber, field: 'student_email', message: 'Invalid Student Email format' });
  }

  // Address
  if (!addressStreet) {
    errors.push({ row: rowNumber, field: 'address_street', message: 'Address Street is required' });
  }
  if (!addressDistrict) {
    errors.push({ row: rowNumber, field: 'address_district', message: 'Address District is required' });
  }
  if (!addressPinCode) {
    errors.push({ row: rowNumber, field: 'address_pin_code', message: 'Address Pin Code is required' });
  } else if (!/^\d{6}$/.test(addressPinCode.replace(/\D/g, ''))) {
    errors.push({ row: rowNumber, field: 'address_pin_code', message: 'Pin Code must be 6 digits' });
  }
  if (!addressState) {
    errors.push({ row: rowNumber, field: 'address_state', message: 'Address State is required' });
  }

  // Entry type
  const entryType = mapLabelToValue(entryTypeLabel, 'entryType');
  if (!entryTypeLabel) {
    errors.push({ row: rowNumber, field: 'entry_type', message: 'Entry Type is required' });
  } else if (!entryType) {
    errors.push({ row: rowNumber, field: 'entry_type', message: `Invalid Entry Type: "${entryTypeLabel}". Valid: ${getValidLabels('entryType').join(', ')}` });
  }

  // Scholarship type
  const scholarshipType = mapLabelToValue(scholarshipTypeLabel, 'scholarshipType');
  if (!scholarshipTypeLabel) {
    errors.push({ row: rowNumber, field: 'scholarship_type', message: 'Scholarship Type is required' });
  } else if (!scholarshipType) {
    errors.push({ row: rowNumber, field: 'scholarship_type', message: `Invalid Scholarship Type: "${scholarshipTypeLabel}"` });
  }

  // Accommodation type
  const accommodationType = mapLabelToValue(accommodationTypeLabel, 'accommodation');
  if (!accommodationTypeLabel) {
    errors.push({ row: rowNumber, field: 'accommodation_type', message: 'Accommodation Type is required' });
  } else if (!accommodationType) {
    errors.push({ row: rowNumber, field: 'accommodation_type', message: `Invalid Accommodation Type: "${accommodationTypeLabel}". Valid: ${getValidLabels('accommodation').join(', ')}` });
  }

  // Optional hostel type
  let hostelType: string | undefined;
  if (hostelTypeLabel) {
    hostelType = mapLabelToValue(hostelTypeLabel, 'hostelType') as string | undefined;
    if (!hostelType) {
      errors.push({ row: rowNumber, field: 'hostel_type', message: `Invalid Hostel Type: "${hostelTypeLabel}"` });
    }
  }

  // Optional food type
  let foodType: string | undefined;
  if (foodTypeLabel) {
    foodType = mapLabelToValue(foodTypeLabel, 'foodType') as string | undefined;
    if (!foodType) {
      errors.push({ row: rowNumber, field: 'food_type', message: `Invalid Food Type: "${foodTypeLabel}"` });
    }
  }

  // Previous education
  if (!lastSchool) {
    errors.push({ row: rowNumber, field: 'last_school', message: 'Last School is required' });
  }

  const boardOfStudy = mapLabelToValue(boardOfStudyLabel, 'boardOfStudy');
  if (!boardOfStudyLabel) {
    errors.push({ row: rowNumber, field: 'board_of_study', message: 'Board of Study is required' });
  } else if (!boardOfStudy) {
    errors.push({ row: rowNumber, field: 'board_of_study', message: `Invalid Board of Study: "${boardOfStudyLabel}"` });
  }

  // 10th marks
  if (!tenthMaxMarks) {
    errors.push({ row: rowNumber, field: 'tenth_max_marks', message: '10th Max Marks is required' });
  }
  if (!tenthObtainedMarks) {
    errors.push({ row: rowNumber, field: 'tenth_obtained_marks', message: '10th Obtained Marks is required' });
  }
  if (!tenthPercentage) {
    errors.push({ row: rowNumber, field: 'tenth_percentage', message: '10th Percentage is required' });
  }

  // 12th marks
  const twelfthGroup = mapLabelToValue(twelfthGroupLabel, 'twelfthGroup');
  if (!twelfthGroupLabel) {
    errors.push({ row: rowNumber, field: 'twelfth_group', message: '12th Group is required' });
  } else if (!twelfthGroup) {
    errors.push({ row: rowNumber, field: 'twelfth_group', message: `Invalid 12th Group: "${twelfthGroupLabel}". Valid: ${getValidLabels('twelfthGroup').join(', ')}` });
  }

  if (!twelfthMaxMarks) {
    errors.push({ row: rowNumber, field: 'twelfth_max_marks', message: '12th Max Marks is required' });
  }
  if (!twelfthObtainedMarks) {
    errors.push({ row: rowNumber, field: 'twelfth_obtained_marks', message: '12th Obtained Marks is required' });
  }
  if (!twelfthPercentage) {
    errors.push({ row: rowNumber, field: 'twelfth_percentage', message: '12th Percentage is required' });
  }

  // Optional fields
  let counselingApplied: boolean | undefined;
  if (counselingAppliedLabel) {
    const mapped = mapLabelToValue(counselingAppliedLabel, 'boolean');
    counselingApplied = mapped === true;
  }

  let quota: string | undefined;
  if (quotaLabel) {
    quota = mapLabelToValue(quotaLabel, 'quota') as string | undefined;
    if (!quota) {
      errors.push({ row: rowNumber, field: 'quota', message: `Invalid Quota: "${quotaLabel}"` });
    }
  }

  let busRequired: boolean | undefined;
  if (busRequiredLabel) {
    const mapped = mapLabelToValue(busRequiredLabel, 'boolean');
    busRequired = mapped === true;
  }

  if (errors.length > 0) {
    return { data: null, errors };
  }

  // Build tenth_marks JSONB
  const tenthMarks = {
    max_marks: parseInt(tenthMaxMarks, 10) || 0,
    obtained_marks: parseInt(tenthObtainedMarks, 10) || 0,
    percentage: parseFloat(tenthPercentage) || 0
  };

  // Build twelfth_marks JSONB
  const twelfthMarks = {
    group: twelfthGroup,
    max_marks: parseInt(twelfthMaxMarks, 10) || 0,
    obtained_marks: parseInt(twelfthObtainedMarks, 10) || 0,
    percentage: parseFloat(twelfthPercentage) || 0
  };

  return {
    data: {
      // Personal
      first_name: firstName.toUpperCase(),
      last_name: lastName.toUpperCase(),
      date_of_birth: dateOfBirth,
      gender: gender as string,
      religion: religion as string,
      community: community as string,
      caste: caste.toUpperCase(),
      aadhar_number: aadharNumber || null,
      blood_group: bloodGroup || null,

      // Parent
      father_name: fatherName.toUpperCase(),
      father_occupation: fatherOccupation || null,
      father_mobile: fatherMobile.replace(/\D/g, ''),
      mother_name: motherName.toUpperCase(),
      mother_occupation: motherOccupation || null,
      mother_mobile: motherMobile.replace(/\D/g, ''),
      annual_income: annualIncome ? parseFloat(annualIncome) : null,

      // Academic (names for validation, IDs will be resolved later - 6-level hierarchy)
      institution_name: institution,
      degree_name: degree,
      department_name: department,
      program_name: program,
      semester_name: semester,
      section_name: section,
      academic_year_name: academicYear,
      admission_year: admissionYear || null,

      // Contact
      student_mobile: studentMobile.replace(/\D/g, ''),
      college_email: collegeEmail || null,
      student_email: studentEmail.toLowerCase(),

      // Address
      permanent_address_street: addressStreet,
      permanent_address_taluk: addressTaluk || null,
      permanent_address_district: addressDistrict,
      permanent_address_pin_code: addressPinCode.replace(/\D/g, ''),
      permanent_address_state: addressState,

      // Entry & Scholarship
      entry_type: entryType as string,
      scholarship_type: scholarshipType as string,

      // Accommodation
      accommodation_type: accommodationType as string,
      hostel_type: hostelType || null,
      food_type: foodType || null,

      // Education
      last_school: lastSchool,
      board_of_study: boardOfStudy as string,
      tenth_marks: tenthMarks,
      twelfth_marks: twelfthMarks,

      // Entrance exams (optional)
      medical_cutoff_marks: medicalCutoff ? parseFloat(medicalCutoff) : null,
      engineering_cutoff_marks: engineeringCutoff ? parseFloat(engineeringCutoff) : null,
      neet_roll_number: neetRollNumber || null,
      neet_score: neetScore ? parseFloat(neetScore) : null,

      // Counseling
      counseling_applied: counselingApplied || false,
      quota: quota || null,
      category: category || null,

      // Transport
      bus_required: busRequired || false,
      bus_route: busRoute || null,
      bus_pickup_location: busPickupLocation || null,

      // Reference
      reference_type: referenceType || null,
      reference_name: referenceName || null,
      reference_contact: referenceContact || null
    },
    errors: []
  };
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(request: NextRequest): Promise<NextResponse<ImportResult>> {
  try {
    // ============================================================
    // 1. AUTHENTICATION
    // ============================================================
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: 1,
        totalRows: 0,
        errors: [{ row: 0, message: 'Unauthorized' }]
      }, { status: 401 });
    }

    // ============================================================
    // 2. PARSE FILE
    // ============================================================
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: 1,
        totalRows: 0,
        errors: [{ row: 0, message: 'No file provided' }]
      }, { status: 400 });
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: 1,
        totalRows: 0,
        errors: [{ row: 0, message: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)' }]
      }, { status: 400 });
    }

    // Parse Excel file
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Get rows as array of arrays
    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: ''
    });

    // Skip header row
    const dataRows = rows.slice(1).filter(row =>
      row.some(cell => cell !== null && cell !== undefined && cell !== '')
    );

    if (dataRows.length === 0) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: 1,
        totalRows: 0,
        errors: [{ row: 0, message: 'No data rows found in the file' }]
      }, { status: 400 });
    }

    console.log(`[enquiries/import] Processing ${dataRows.length} rows`);

    // ============================================================
    // 3. PARSE AND VALIDATE ROWS
    // ============================================================
    const allErrors: ImportError[] = [];
    const validRows: { rowNumber: number; data: any }[] = [];
    const emailMap = new Map<string, number[]>(); // Track duplicate emails

    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2; // +2 for header row and 0-based index
      const row = dataRows[i];

      const { data, errors } = parseExcelRow(row, rowNumber);

      if (errors.length > 0) {
        allErrors.push(...errors);
        continue;
      }

      if (!data) continue; // Empty row

      // Track duplicate emails within file
      const email = data.student_email.toLowerCase();
      if (!emailMap.has(email)) {
        emailMap.set(email, []);
      }
      emailMap.get(email)!.push(rowNumber);

      validRows.push({ rowNumber, data });
    }

    // ============================================================
    // 4. CHECK DUPLICATE EMAILS WITHIN FILE
    // ============================================================
    const duplicateEmails: string[] = [];
    emailMap.forEach((rowNumbers, email) => {
      if (rowNumbers.length > 1) {
        duplicateEmails.push(`Email "${email}" appears in rows: ${rowNumbers.join(', ')}`);
        // Mark all duplicate rows as errors
        rowNumbers.forEach(rowNum => {
          allErrors.push({
            row: rowNum,
            field: 'student_email',
            message: `Duplicate email "${email}" found in this file`
          });
        });
      }
    });

    if (duplicateEmails.length > 0) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: allErrors.length,
        totalRows: dataRows.length,
        errors: allErrors,
        duplicateEmails
      });
    }

    // If there are validation errors, stop here
    if (allErrors.length > 0) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: allErrors.length,
        totalRows: dataRows.length,
        errors: allErrors
      });
    }

    // ============================================================
    // 5. VALIDATE HIERARCHICAL RELATIONSHIPS (5 LEVELS)
    // ============================================================
    const validatedRows: {
      rowNumber: number;
      data: any;
      institutionId: string;
      departmentId: string;
      programId: string;
      semesterId: string;
      sectionId: string;
      academicYearId: string;
    }[] = [];

    for (const { rowNumber, data } of validRows) {
      // Level 1: Validate institution exists
      const { data: institution, error: instError } = await supabase
        .from('institutions')
        .select('id')
        .eq('name', data.institution_name)
        .eq('is_active', true)
        .maybeSingle();

      if (instError || !institution) {
        allErrors.push({
          row: rowNumber,
          field: 'institution',
          message: `Institution "${data.institution_name}" not found`
        });
        continue;
      }

      // Level 2: Validate degree exists AND belongs to institution
      const { data: degree, error: degError } = await supabase
        .from('degrees')
        .select('id')
        .eq('degree_name', data.degree_name)
        .eq('institution_id', institution.id)
        .eq('is_active', true)
        .maybeSingle();

      if (degError || !degree) {
        allErrors.push({
          row: rowNumber,
          field: 'degree',
          message: `Degree "${data.degree_name}" not found for institution "${data.institution_name}"`
        });
        continue;
      }

      // Level 3: Validate department exists AND belongs to degree
      const { data: department, error: deptError } = await supabase
        .from('departments')
        .select('id')
        .eq('department_name', data.department_name)
        .eq('degree_id', degree.id)
        .eq('is_active', true)
        .maybeSingle();

      if (deptError || !department) {
        allErrors.push({
          row: rowNumber,
          field: 'department',
          message: `Department "${data.department_name}" not found for degree "${data.degree_name}"`
        });
        continue;
      }

      // Level 4: Validate program exists AND belongs to department
      const { data: program, error: progError } = await supabase
        .from('programs')
        .select('id')
        .eq('program_name', data.program_name)
        .eq('department_id', department.id)
        .eq('is_active', true)
        .maybeSingle();

      if (progError || !program) {
        allErrors.push({
          row: rowNumber,
          field: 'program',
          message: `Program "${data.program_name}" not found for department "${data.department_name}"`
        });
        continue;
      }

      // Level 5: Validate semester exists AND belongs to program
      const { data: semester, error: semError } = await supabase
        .from('semesters')
        .select('id')
        .eq('semester_name', data.semester_name)
        .eq('program_id', program.id)
        .eq('is_active', true)
        .maybeSingle();

      if (semError || !semester) {
        allErrors.push({
          row: rowNumber,
          field: 'semester',
          message: `Semester "${data.semester_name}" not found for program "${data.program_name}"`
        });
        continue;
      }

      // Level 6: Validate section exists AND belongs to semester
      const { data: section, error: sectError } = await supabase
        .from('sections')
        .select('id')
        .eq('section_name', data.section_name)
        .eq('semester_id', semester.id)
        .eq('is_active', true)
        .maybeSingle();

      if (sectError || !section) {
        allErrors.push({
          row: rowNumber,
          field: 'section',
          message: `Section "${data.section_name}" not found for semester "${data.semester_name}"`
        });
        continue;
      }

      // Validate academic year
      const { data: academicYear, error: ayError } = await supabase
        .from('academic_years')
        .select('id')
        .eq('academic_year_name', data.academic_year_name)
        .eq('is_active', true)
        .maybeSingle();

      if (ayError || !academicYear) {
        allErrors.push({
          row: rowNumber,
          field: 'academic_year',
          message: `Academic Year "${data.academic_year_name}" not found`
        });
        continue;
      }

      // Check for duplicate email in database
      const { data: existingLearner } = await supabase
        .from('learners_profiles')
        .select('id, college_email, student_email')
        .or(`college_email.eq.${data.student_email},student_email.eq.${data.student_email}`)
        .maybeSingle();

      if (existingLearner) {
        allErrors.push({
          row: rowNumber,
          field: 'student_email',
          message: `Email "${data.student_email}" already exists in database`
        });
        continue;
      }

      validatedRows.push({
        rowNumber,
        data,
        institutionId: institution.id,
        departmentId: department.id,
        programId: program.id,
        semesterId: semester.id,
        sectionId: section.id,
        academicYearId: academicYear.id
      });
    }

    // If there are validation errors, stop here
    if (allErrors.length > 0) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: allErrors.length,
        totalRows: dataRows.length,
        errors: allErrors
      });
    }

    console.log(`[enquiries/import] Validated ${validatedRows.length} rows, inserting...`);

    // ============================================================
    // 6. INSERT VALID ROWS (BATCH INSERT)
    // ============================================================
    const insertData = validatedRows.map(({ data, institutionId, departmentId, programId, semesterId, sectionId, academicYearId }) => ({
      // Personal
      first_name: data.first_name,
      last_name: data.last_name,
      date_of_birth: data.date_of_birth,
      gender: data.gender,
      religion: data.religion,
      community: data.community,
      caste: data.caste,
      aadhar_number: data.aadhar_number,
      blood_group: data.blood_group,

      // Parent
      father_name: data.father_name,
      father_occupation: data.father_occupation,
      father_mobile: data.father_mobile,
      mother_name: data.mother_name,
      mother_occupation: data.mother_occupation,
      mother_mobile: data.mother_mobile,
      annual_income: data.annual_income,

      // Academic (use resolved IDs)
      institution_id: institutionId,
      department_id: departmentId,
      program_id: programId,
      semester_id: semesterId,
      section_id: sectionId,
      academic_year_id: academicYearId,
      admission_year: data.admission_year,

      // Contact
      student_mobile: data.student_mobile,
      college_email: data.college_email,
      student_email: data.student_email,

      // Address
      permanent_address_street: data.permanent_address_street,
      permanent_address_taluk: data.permanent_address_taluk,
      permanent_address_district: data.permanent_address_district,
      permanent_address_pin_code: data.permanent_address_pin_code,
      permanent_address_state: data.permanent_address_state,

      // Entry & Scholarship
      entry_type: data.entry_type,
      scholarship_type: data.scholarship_type,

      // Accommodation
      accommodation_type: data.accommodation_type,
      hostel_type: data.hostel_type,
      food_type: data.food_type,

      // Education
      last_school: data.last_school,
      board_of_study: data.board_of_study,
      tenth_marks: data.tenth_marks,
      twelfth_marks: data.twelfth_marks,

      // Entrance exams
      medical_cutoff_marks: data.medical_cutoff_marks,
      engineering_cutoff_marks: data.engineering_cutoff_marks,
      neet_roll_number: data.neet_roll_number,
      neet_score: data.neet_score,

      // Counseling
      counseling_applied: data.counseling_applied,
      quota: data.quota,
      category: data.category,

      // Transport
      bus_required: data.bus_required,
      bus_route: data.bus_route,
      bus_pickup_location: data.bus_pickup_location,

      // Reference
      reference_type: data.reference_type,
      reference_name: data.reference_name,
      reference_contact: data.reference_contact,

      // IMPORTANT: Enquiries start with lifecycle_status='enquiry'
      lifecycle_status: 'enquiry',
      is_profile_complete: false,
      created_by: user.id,
      updated_by: user.id
    }));

    const { data: insertedLearners, error: insertError } = await supabase
      .from('learners_profiles')
      .insert(insertData)
      .select('id');

    if (insertError) {
      console.error('[enquiries/import] Insert error:', insertError);
      return NextResponse.json({
        success: false,
        successCount: 0,
        errorCount: 1,
        totalRows: dataRows.length,
        errors: [{ row: 0, message: `Database error: ${insertError.message}` }]
      }, { status: 500 });
    }

    const successCount = insertedLearners?.length || 0;
    console.log(`[enquiries/import] ✅ Successfully inserted ${successCount} enquiries`);

    // ============================================================
    // 7. RETURN RESULT
    // ============================================================
    return NextResponse.json({
      success: true,
      successCount,
      errorCount: 0,
      totalRows: dataRows.length,
      errors: []
    });

  } catch (error) {
    console.error('[enquiries/import] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      successCount: 0,
      errorCount: 1,
      totalRows: 0,
      errors: [{ row: 0, message: `Server error: ${errorMessage}` }]
    }, { status: 500 });
  }
}
