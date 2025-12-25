// ============================================
// BULK UPLOAD ENQUIRIES COMPONENT
// ============================================
// Created: 2025-01-22
// Purpose: Bulk upload learner enquiries from Excel/CSV with validation
// Based on: bulk-upload-admissions.tsx
// ============================================

'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UploadCloud, X, CheckCircle, AlertCircle, FileText, Download, TrendingUp } from 'lucide-react';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface ProcessedRow {
  rowNumber: number;
  data: any;
  status: 'success' | 'error' | 'warning';
  message: string;
}

// ============================================
// LOOKUP FUNCTIONS - Convert names to IDs
// ============================================

const lookupInstitutionId = async (institutionName: string): Promise<string | null> => {
  if (!institutionName?.trim()) return null;

  const supabase = createClientSupabaseClient();
  const trimmedName = institutionName.trim();

  const { data, error } = await supabase
    .from('institutions')
    .select('id, name')
    .ilike('name', trimmedName)
    .limit(1)
    .maybeSingle() as { data: { id: string; name: string } | null; error: any };

  if (error) {
    console.error('[enquiries/bulk-upload] Institution lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[enquiries/bulk-upload] Institution not found:', trimmedName);
    return null;
  }

  return data.id;
};

const lookupProgramId = async (programName: string): Promise<string | null> => {
  if (!programName?.trim()) return null;

  const supabase = createClientSupabaseClient();
  const trimmedName = programName.trim();

  const { data, error } = await supabase
    .from('programs')
    .select('id, program_name')
    .ilike('program_name', trimmedName)
    .limit(1)
    .maybeSingle() as { data: { id: string; program_name: string } | null; error: any };

  if (error) {
    console.error('[enquiries/bulk-upload] Program lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[enquiries/bulk-upload] Program not found:', trimmedName);
    return null;
  }

  return data.id;
};

const lookupDegreeId = async (degreeName: string): Promise<string | null> => {
  if (!degreeName?.trim()) return null;

  const supabase = createClientSupabaseClient();
  const trimmedName = degreeName.trim();

  const { data, error } = await supabase
    .from('degrees')
    .select('id, degree_name')
    .ilike('degree_name', trimmedName)
    .limit(1)
    .maybeSingle() as { data: { id: string; degree_name: string } | null; error: any };

  if (error) {
    console.error('[enquiries/bulk-upload] Degree lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[enquiries/bulk-upload] Degree not found:', trimmedName);
    return null;
  }

  return data.id;
};

const lookupDepartmentId = async (departmentName: string): Promise<string | null> => {
  if (!departmentName?.trim()) return null;

  const supabase = createClientSupabaseClient();
  const trimmedName = departmentName.trim();

  const { data, error } = await supabase
    .from('departments')
    .select('id, department_name')
    .ilike('department_name', trimmedName)
    .limit(1)
    .maybeSingle() as { data: { id: string; department_name: string } | null; error: any };

  if (error) {
    console.error('[enquiries/bulk-upload] Department lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[enquiries/bulk-upload] Department not found:', trimmedName);
    return null;
  }

  return data.id;
};

const lookupAcademicYearId = async (academicYearName: string): Promise<string | null> => {
  if (!academicYearName?.trim()) return null;

  const supabase = createClientSupabaseClient();
  const trimmedName = academicYearName.trim();

  const { data, error } = await supabase
    .from('academic_years')
    .select('id, academic_year_name')
    .ilike('academic_year_name', trimmedName)
    .limit(1)
    .maybeSingle() as { data: { id: string; academic_year_name: string } | null; error: any };

  if (error) {
    console.error('[enquiries/bulk-upload] Academic Year lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[enquiries/bulk-upload] Academic Year not found:', trimmedName);
    return null;
  }

  return data.id;
};

const lookupSemesterId = async (semesterName: string): Promise<string | null> => {
  if (!semesterName?.trim()) return null;

  const supabase = createClientSupabaseClient();
  const trimmedName = semesterName.trim();

  const { data, error } = await supabase
    .from('semesters')
    .select('id, semester_name')
    .ilike('semester_name', trimmedName)
    .limit(1)
    .maybeSingle() as { data: { id: string; semester_name: string } | null; error: any };

  if (error) {
    console.error('[enquiries/bulk-upload] Semester lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[enquiries/bulk-upload] Semester not found:', trimmedName);
    return null;
  }

  return data.id;
};

const lookupSectionId = async (sectionName: string): Promise<string | null> => {
  if (!sectionName?.trim()) return null;

  const supabase = createClientSupabaseClient();
  const trimmedName = sectionName.trim();

  const { data, error } = await supabase
    .from('sections')
    .select('id, section_name')
    .ilike('section_name', trimmedName)
    .limit(1)
    .maybeSingle() as { data: { id: string; section_name: string } | null; error: any };

  if (error) {
    console.error('[enquiries/bulk-upload] Section lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[enquiries/bulk-upload] Section not found:', trimmedName);
    return null;
  }

  return data.id;
};

const lookupRegulationId = async (regulationName: string): Promise<string | null> => {
  if (!regulationName?.trim()) return null;

  const supabase = createClientSupabaseClient();
  const trimmedName = regulationName.trim();

  const { data, error } = await supabase
    .from('regulations')
    .select('id, regulation_code')
    .ilike('regulation_code', trimmedName)
    .limit(1)
    .maybeSingle() as { data: { id: string; regulation_code: string } | null; error: any };

  if (error) {
    console.error('[enquiries/bulk-upload] Regulation lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[enquiries/bulk-upload] Regulation not found:', trimmedName);
    return null;
  }

  return data.id;
};

const lookupBatchId = async (batchName: string): Promise<string | null> => {
  if (!batchName?.trim()) return null;

  const supabase = createClientSupabaseClient();
  const trimmedName = batchName.trim();

  const { data, error } = await supabase
    .from('batches')
    .select('id, batch_name')
    .ilike('batch_name', trimmedName)
    .limit(1)
    .maybeSingle() as { data: { id: string; batch_name: string } | null; error: any };

  if (error) {
    console.error('[enquiries/bulk-upload] Batch lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[enquiries/bulk-upload] Batch not found:', trimmedName);
    return null;
  }

  return data.id;
};

export default function BulkUploadEnquiries({ onSuccess }: { onSuccess?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [processedRows, setProcessedRows] = useState<ProcessedRow[]>([]);
  const [showResults, setShowResults] = useState(false);

  // ============================================
  // COLUMN MAPPING - Flexible column names
  // ============================================
  const getColumnMapping = () => ({
    // SECTION 1: REQUIRED - Basic Details
    'first_name': ['* First Name', 'First Name', 'firstname', 'first_name', 'name'],
    'last_name': ['* Last Name', 'Last Name', 'lastname', 'last_name', 'surname'],
    'father_name': ['* Father Name', 'Father Name', 'fathername', 'father_name', 'father'],
    'mother_name': ['* Mother Name', 'Mother Name', 'mothername', 'mother_name', 'mother'],
    'date_of_birth': ['* Date of Birth', 'Date of Birth', 'dateofbirth', 'date_of_birth', 'dob', 'birth_date'],
    'gender': ['* Gender', 'Gender', 'sex'],
    'religion': ['* Religion', 'Religion'],
    'community': ['* Community', 'Community'],
    'caste': ['* Caste', 'Caste'],

    // SECTION 2: REQUIRED - Academic & Enrollment (supports both old and new column names)
    'institution': ['* Institution (Use NAME)', '* Institution', 'Institution', 'college'],
    'degree': ['* Degree (Use NAME)', '* Degree', 'Degree'],
    'department': ['* Department (Use NAME)', '* Department', 'Department', 'dept'],
    'program': ['* Program (Use NAME)', '* Program', 'Program', 'course'],
    'academic_year': ['* Academic Year (Use NAME)', '* Academic Year', 'Academic Year', 'academicyear', 'academic_year', 'year'],
    'semester': ['* Semester (Use NAME)', '* Semester', 'Semester', 'sem'],
    'section': ['* Section (Use NAME)', '* Section', 'Section', 'sec'],
    'entry_type': ['* Entry Type', 'Entry Type', 'entrytype', 'entry_type'],
    'first_graduate': ['* First Graduate', 'First Graduate', 'firstgraduate', 'first_graduate'],

    // SECTION 3: REQUIRED - Contact Details
    'student_mobile': ['* Student Mobile', 'Student Mobile', 'studentmobile', 'student_mobile', 'mobile', 'phone'],
    'permanent_address_street': ['* Permanent Address Street', 'Permanent Address Street', 'address', 'street', 'permanent_address'],
    'permanent_address_district': ['* Permanent Address District', 'Permanent Address District', 'district'],
    'permanent_address_state': ['* Permanent Address State', 'Permanent Address State', 'state'],
    'permanent_address_pin_code': ['* Permanent Address Pin Code', 'Permanent Address Pin Code', 'pincode', 'pin', 'postal_code'],
    'accommodation_type': ['* Accommodation Type', 'Accommodation Type', 'accommodationtype', 'accommodation_type'],

    // SECTION 4: OPTIONAL BUT IMPORTANT - For User Creation
    'college_email': ['College Email (for user login)', 'College Email', 'collegeemail', 'college_email', 'institutional_email', 'institute_email'],
    'student_email': ['Student Email', 'studentemail', 'student_email', 'email', 'personal_email'],
    'permanent_address_taluk': ['Permanent Address Taluk', 'taluk'],

    // SECTION 5: OPTIONAL - Additional Family Details
    'father_occupation': ['Father Occupation', 'fatheroccupation', 'father_occupation'],
    'father_mobile': ['Father Mobile', 'fathermobile', 'father_mobile', 'father_phone'],
    'mother_occupation': ['Mother Occupation', 'motheroccupation', 'mother_occupation'],
    'mother_mobile': ['Mother Mobile', 'mothermobile', 'mother_mobile', 'mother_phone'],
    'annual_income': ['Annual Income', 'annualincome', 'annual_income', 'income'],

    // SECTION 6: OPTIONAL - Academic Marks
    'last_school': ['Last School', 'lastschool', 'last_school', 'school'],
    'board_of_study': ['Board of Study', 'boardofstudy', 'board_of_study', 'board'],
    'tenth_max_marks': ['10th Max Marks', '10th Maximum Marks', 'tenth_max_marks', '10max'],
    'tenth_obtained_marks': ['10th Obtained Marks', '10th Marks', 'tenth_obtained_marks', '10obtained'],
    'tenth_percentage': ['10th Percentage', 'tenth_percentage', '10percentage', '10%'],
    'twelfth_group': ['12th Group', 'twelfth_group', '12group', 'group'],
    'twelfth_max_marks': ['12th Max Marks', '12th Maximum Marks', 'twelfth_max_marks', '12max'],
    'twelfth_obtained_marks': ['12th Obtained Marks', '12th Marks', 'twelfth_obtained_marks', '12obtained'],
    'twelfth_percentage': ['12th Percentage', 'twelfth_percentage', '12percentage', '12%'],

    // SECTION 7: OPTIONAL - Entrance Exams
    'neet_roll_number': ['NEET Roll Number', 'neetrollnumber', 'neet_roll_number', 'neet'],
    'neet_score': ['NEET Score', 'neetscore', 'neet_score'],
    'medical_cutoff_marks': ['Medical Cutoff Marks', 'medicalcutoffmarks', 'medical_cutoff_marks'],
    'engineering_cutoff_marks': ['Engineering Cutoff Marks', 'engineeringcutoffmarks', 'engineering_cutoff_marks'],
    'counseling_applied': ['Counseling Applied', 'counselingapplied', 'counseling_applied'],
    'counseling_number': ['Counseling Number', 'counselingnumber', 'counseling_number'],

    // SECTION 8: OPTIONAL - Accommodation & Transport
    'hostel_type': ['Hostel Type', 'hosteltype', 'hostel_type'],
    'food_type': ['Food Type', 'foodtype', 'food_type'],
    'bus_required': ['Bus Required', 'busrequired', 'bus_required'],
    'bus_route': ['Bus Route', 'busroute', 'bus_route'],
    'bus_pickup_location': ['Bus Pickup Location', 'buspickuplocation', 'bus_pickup_location'],

    // SECTION 9: OPTIONAL - Others
    'aadhar_number': ['Aadhar Number', 'aadharnumber', 'aadhar_number', 'aadhaar'],
    'blood_group': ['Blood Group', 'bloodgroup', 'blood_group'],
    'quota': ['Quota'],
    'category': ['Category'],
    'roll_number': ['Roll Number', 'rollnumber', 'roll_number', 'roll'],
    'register_number': ['Register Number', 'registernumber', 'register_number', 'regno'],
    'regulation': ['Regulation', 'reg'],
    'batch': ['Batch'],
    'reference_type': ['Reference Type', 'referencetype', 'reference_type'],
    'reference_name': ['Reference Name', 'referencename', 'reference_name'],
    'reference_contact': ['Reference Contact', 'referencecontact', 'reference_contact'],
    'enquiry_date': ['Enquiry Date', 'enquirydate', 'enquiry_date'],
  });

  // ============================================
  // VALIDATION FUNCTION
  // ============================================
  const validateRowData = (row: any, rowIndex: number): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // REQUIRED FIELDS - Basic Details
    if (!row.first_name?.trim()) {
      errors.push('First Name is required');
    }

    if (!row.last_name?.trim()) {
      errors.push('Last Name is required');
    }

    if (!row.father_name?.trim()) {
      errors.push('Father Name is required');
    }

    if (!row.mother_name?.trim()) {
      errors.push('Mother Name is required');
    }

    if (!row.date_of_birth) {
      errors.push('Date of Birth is required');
    } else {
      // Validate date format
      const date = new Date(row.date_of_birth);
      if (isNaN(date.getTime())) {
        errors.push('Invalid Date of Birth format (use YYYY-MM-DD)');
      }
    }

    if (!row.gender?.trim()) {
      errors.push('Gender is required');
    } else if (!['MALE', 'FEMALE', 'OTHER'].includes(row.gender.toUpperCase())) {
      errors.push('Gender must be MALE, FEMALE, or OTHER');
    }

    if (!row.religion?.trim()) {
      errors.push('Religion is required');
    }

    if (!row.community?.trim()) {
      errors.push('Community is required');
    }

    if (!row.caste?.trim()) {
      errors.push('Caste is required');
    }

    // REQUIRED FIELDS - Academic & Enrollment
    if (!row.institution_id) {
      const institutionName = row.institution || 'N/A';
      errors.push(`Institution "${institutionName}" not found. Check spelling and ensure it exists in Organization > Institutions.`);
    }

    if (!row.degree_id) {
      const degreeName = row.degree || 'N/A';
      errors.push(`Degree "${degreeName}" not found. Check spelling and ensure it exists in Organization > Degrees.`);
    }

    if (!row.department_id) {
      const departmentName = row.department || 'N/A';
      errors.push(`Department "${departmentName}" not found. Check spelling and ensure it exists in Organization > Departments.`);
    }

    if (!row.program_id) {
      const programName = row.program || 'N/A';
      errors.push(`Program "${programName}" not found. Check spelling and ensure it exists in Organization > Programs.`);
    }

    if (!row.academic_year_id) {
      const yearName = row.academic_year || 'N/A';
      errors.push(`Academic Year "${yearName}" not found. Check spelling and ensure it exists in Organization > Academic Years.`);
    }

    if (!row.semester_id) {
      const semesterName = row.semester || 'N/A';
      errors.push(`Semester "${semesterName}" not found. Check spelling and ensure it exists in Organization > Semesters.`);
    }

    if (!row.section_id) {
      const sectionName = row.section || 'N/A';
      errors.push(`Section "${sectionName}" not found. Check spelling and ensure it exists in Organization > Sections.`);
    }

    if (!row.entry_type?.trim()) {
      errors.push('Entry Type is required');
    } else if (!['FIRST YEAR', 'LATERAL ENTRY'].includes(row.entry_type.toUpperCase())) {
      errors.push('Entry Type must be FIRST YEAR or LATERAL ENTRY');
    }

    if (typeof row.first_graduate !== 'boolean') {
      errors.push('First Graduate is required (use TRUE or FALSE)');
    }

    // REQUIRED FIELDS - Contact Details
    if (!row.student_mobile?.trim()) {
      errors.push('Student Mobile is required');
    } else if (!/^\d{10}$/.test(row.student_mobile.replace(/\D/g, ''))) {
      errors.push('Invalid Student Mobile format (must be 10 digits)');
    }

    if (!row.permanent_address_street?.trim()) {
      errors.push('Permanent Address Street is required');
    }

    if (!row.permanent_address_district?.trim()) {
      errors.push('Permanent Address District is required');
    }

    if (!row.permanent_address_state?.trim()) {
      errors.push('Permanent Address State is required');
    }

    if (!row.permanent_address_pin_code?.trim()) {
      errors.push('Permanent Address Pin Code is required');
    } else if (!/^\d{6}$/.test(row.permanent_address_pin_code.trim())) {
      errors.push('Invalid Pin Code format (must be 6 digits)');
    }

    if (!row.accommodation_type?.trim()) {
      errors.push('Accommodation Type is required');
    } else if (!['DAY SCHOLAR', 'HOSTEL'].includes(row.accommodation_type.toUpperCase())) {
      errors.push('Accommodation Type must be DAY SCHOLAR or HOSTEL');
    }

    // OPTIONAL BUT IMPORTANT - Validation for College Email (if provided)
    if (row.college_email?.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.college_email)) {
        errors.push('Invalid College Email format');
      } else if (!row.college_email.toLowerCase().endsWith('@jkkn.ac.in')) {
        warnings.push('College Email should use @jkkn.ac.in domain for user account creation');
      }
    } else {
      warnings.push('College Email not provided - user account cannot be created without it');
    }

    // Validate Student Email if provided
    if (row.student_email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.student_email)) {
      errors.push('Invalid Student Email format');
    }

    // Validate mobile numbers if provided
    if (row.father_mobile?.trim() && !/^\d{10}$/.test(row.father_mobile.replace(/\D/g, ''))) {
      errors.push('Invalid Father Mobile format (must be 10 digits)');
    }

    if (row.mother_mobile?.trim() && !/^\d{10}$/.test(row.mother_mobile.replace(/\D/g, ''))) {
      errors.push('Invalid Mother Mobile format (must be 10 digits)');
    }

    // Warnings for missing important optional fields
    if (!row.father_mobile?.trim()) {
      warnings.push('Father Mobile not provided');
    }

    if (!row.mother_mobile?.trim()) {
      warnings.push('Mother Mobile not provided');
    }

    if (!row.student_email?.trim()) {
      warnings.push('Student Email not provided');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  };

  // ============================================
  // MAP ROW DATA - Convert Excel row to API format
  // ============================================
  const mapRowData = async (row: any) => {
    const columnMapping = getColumnMapping();
    const mappedData: any = {};

    // Map columns to our expected format
    Object.entries(columnMapping).forEach(([targetKey, possibleKeys]) => {
      for (const key of possibleKeys) {
        const value = row[key] || row[key.toLowerCase()] || row[key.toUpperCase()];
        if (value !== undefined && value !== null && value !== '') {
          mappedData[targetKey] = value;
          break;
        }
      }
    });

    // Lookup IDs from names (async)
    const institutionId = await lookupInstitutionId(mappedData.institution);
    const programId = await lookupProgramId(mappedData.program);
    const degreeId = await lookupDegreeId(mappedData.degree);
    const departmentId = await lookupDepartmentId(mappedData.department);
    const academicYearId = await lookupAcademicYearId(mappedData.academic_year);
    const semesterId = await lookupSemesterId(mappedData.semester);
    const sectionId = await lookupSectionId(mappedData.section);
    const regulationId = await lookupRegulationId(mappedData.regulation);
    const batchId = await lookupBatchId(mappedData.batch);

    // Format data for API (following LearnerProfile structure)
    return {
      // Basic Details - Convert to UPPERCASE
      first_name: mappedData.first_name?.toString().trim().toUpperCase() || '',
      last_name: mappedData.last_name?.toString().trim().toUpperCase() || '',
      father_name: mappedData.father_name?.toString().trim().toUpperCase() || '',
      father_occupation: mappedData.father_occupation?.toString().trim().toUpperCase() || '',
      father_mobile: mappedData.father_mobile?.toString().replace(/\D/g, '') || '',
      mother_name: mappedData.mother_name?.toString().trim().toUpperCase() || '',
      mother_occupation: mappedData.mother_occupation?.toString().trim().toUpperCase() || '',
      mother_mobile: mappedData.mother_mobile?.toString().replace(/\D/g, '') || '',
      date_of_birth: mappedData.date_of_birth ? new Date(mappedData.date_of_birth).toISOString().split('T')[0] : '',
      gender: mappedData.gender?.toString().trim().toUpperCase() || '',
      religion: mappedData.religion?.toString().trim().toUpperCase() || '',
      community: mappedData.community?.toString().trim().toUpperCase() || '',
      caste: mappedData.caste?.toString().trim().toUpperCase() || '',
      aadhar_number: mappedData.aadhar_number?.toString() || '',
      blood_group: mappedData.blood_group?.toString().toUpperCase() || '',
      annual_income: mappedData.annual_income?.toString() || '',

      // Academic Information
      last_school: mappedData.last_school?.toString().trim().toUpperCase() || '',
      board_of_study: mappedData.board_of_study?.toString().trim().toUpperCase() || '',
      tenth_marks: {
        max_marks: mappedData.tenth_max_marks?.toString() || '',
        obtained_marks: mappedData.tenth_obtained_marks?.toString() || '',
        percentage: mappedData.tenth_percentage?.toString() || ''
      },
      twelfth_marks: {
        group: mappedData.twelfth_group?.toString().trim().toUpperCase() || '',
        max_marks: mappedData.twelfth_max_marks?.toString() || '',
        obtained_marks: mappedData.twelfth_obtained_marks?.toString() || '',
        percentage: mappedData.twelfth_percentage?.toString() || '',
        subjects: {}
      },
      medical_cutoff_marks: mappedData.medical_cutoff_marks?.toString() || '',
      engineering_cutoff_marks: mappedData.engineering_cutoff_marks?.toString() || '',
      neet_roll_number: mappedData.neet_roll_number?.toString() || '',
      neet_score: mappedData.neet_score?.toString() || '',
      counseling_applied: Boolean(mappedData.counseling_applied),
      counseling_number: mappedData.counseling_number?.toString() || '',
      first_graduate: Boolean(mappedData.first_graduate),
      quota: mappedData.quota?.toString().trim().toUpperCase() || '',
      category: mappedData.category?.toString().trim().toUpperCase() || '',
      entry_type: mappedData.entry_type?.toString().trim().toUpperCase() || '',

      // Course Selection - Store IDs
      institution_id: institutionId || null,
      degree_id: degreeId || null,
      department_id: departmentId || null,
      program_id: programId || null,
      academic_year_id: academicYearId || null,
      semester_id: semesterId || null,
      section_id: sectionId || null,
      regulation_id: regulationId || null,
      batch_id: batchId || null,
      roll_number: mappedData.roll_number?.toString().trim() || '',
      register_number: mappedData.register_number?.toString().trim() || '',
      college_email: mappedData.college_email?.toString().trim().toLowerCase() || '',

      // Contact Details
      student_mobile: mappedData.student_mobile?.toString().replace(/\D/g, '') || '',
      student_email: mappedData.student_email?.toString().trim().toLowerCase() || '',
      permanent_address_street: mappedData.permanent_address_street?.toString().trim().toUpperCase() || '',
      permanent_address_taluk: mappedData.permanent_address_taluk?.toString().trim().toUpperCase() || '',
      permanent_address_district: mappedData.permanent_address_district?.toString().trim().toUpperCase() || '',
      permanent_address_pin_code: mappedData.permanent_address_pin_code?.toString() || '',
      permanent_address_state: mappedData.permanent_address_state?.toString().trim().toUpperCase() || '',

      // Accommodation Preferences
      accommodation_type: mappedData.accommodation_type?.toString().trim().toUpperCase() || '',
      hostel_type: mappedData.hostel_type?.toString().trim().toUpperCase() || '',
      food_type: mappedData.food_type?.toString().trim().toUpperCase() || '',
      bus_required: Boolean(mappedData.bus_required),
      bus_route: mappedData.bus_route?.toString().trim().toUpperCase() || '',
      bus_pickup_location: mappedData.bus_pickup_location?.toString().trim().toUpperCase() || '',
      reference_type: mappedData.reference_type?.toString().trim().toUpperCase() || '',
      reference_name: mappedData.reference_name?.toString().trim().toUpperCase() || '',
      reference_contact: mappedData.reference_contact?.toString() || '',
      enquiry_date: mappedData.enquiry_date || new Date().toISOString().split('T')[0],

      // Store original names for validation error messages
      institution: mappedData.institution?.toString().trim() || '',
      degree: mappedData.degree?.toString().trim() || '',
      department: mappedData.department?.toString().trim() || '',
      program: mappedData.program?.toString().trim() || '',
      academic_year: mappedData.academic_year?.toString().trim() || '',
      semester: mappedData.semester?.toString().trim() || '',
      section: mappedData.section?.toString().trim() || '',

      // Set default lifecycle status to 'enquiry' (CRITICAL - NOT creating users immediately)
      lifecycle_status: 'enquiry' as const,
      is_profile_complete: false,
    };
  };

  // ============================================
  // FILE HANDLING
  // ============================================
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.csv')) {
      toast.error('Please upload an Excel (.xlsx) or CSV file');
      return;
    }

    setSelectedFile(file);
    await processFile(file);
  };

  const processFile = async (file: File) => {
    setProcessing(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);

      // Find the "Enquiry Template" sheet (or use second sheet as fallback)
      let worksheet;
      const templateSheetName = workbook.SheetNames.find(name =>
        name.includes('Enquiry Template') || name.includes('Template')
      );

      if (templateSheetName) {
        worksheet = workbook.Sheets[templateSheetName];
        console.log('[enquiries/bulk-upload] Reading from sheet:', templateSheetName);
      } else {
        // Fallback: If multi-sheet workbook, use second sheet; otherwise use first
        const sheetIndex = workbook.SheetNames.length > 1 ? 1 : 0;
        worksheet = workbook.Sheets[workbook.SheetNames[sheetIndex]];
        console.log('[enquiries/bulk-upload] Reading from sheet:', workbook.SheetNames[sheetIndex]);
      }

      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        toast.error('The uploaded file contains no data');
        return;
      }

      console.log('[enquiries/bulk-upload] Parsed Excel data:', jsonData.slice(0, 2));

      // Process and validate data (async for lookups)
      const processedData: any[] = [];

      for (let index = 0; index < jsonData.length; index++) {
        const row = jsonData[index] as any;

        // Skip completely empty rows (all required fields are empty)
        const hasAnyData =
          row['* First Name'] ||
          row['* Last Name'] ||
          row['* Institution (Use NAME)'] ||
          row['* Institution'] ||
          row['* Program (Use NAME)'] ||
          row['* Program'];

        if (!hasAnyData) {
          console.log(`[enquiries/bulk-upload] Skipping empty row ${index + 1}`);
          continue;
        }

        const mappedData = await mapRowData(row);
        const validation = validateRowData(mappedData, index + 1);

        processedData.push({
          rowNumber: index + 1,
          originalData: row,
          mappedData,
          validation
        });
      }

      setPreviewData(processedData);
      toast.success(`Loaded ${jsonData.length} records for preview`);

    } catch (error) {
      console.error('[enquiries/bulk-upload] Error processing file:', error);
      toast.error('Failed to process file. Please check the format.');
    } finally {
      setProcessing(false);
    }
  };

  // ============================================
  // UPLOAD HANDLER
  // ============================================
  const handleUpload = async () => {
    if (!previewData.length) {
      toast.error('No data to upload');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setShowResults(false);
    setProcessedRows([]);

    const results: ProcessedRow[] = [];
    let successCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < previewData.length; i++) {
        const item = previewData[i];
        const progress = ((i + 1) / previewData.length) * 100;
        setUploadProgress(Math.round(progress));

        try {
          // Skip rows with validation errors
          if (!item.validation.isValid) {
            results.push({
              rowNumber: item.rowNumber,
              data: item.originalData,
              status: 'error',
              message: `Validation failed: ${item.validation.errors.join(', ')}`
            });
            errorCount++;
            continue;
          }

          // Remove validation-only fields before sending to API
          const {
            institution,
            degree,
            department,
            program,
            academic_year,
            semester,
            section,
            ...enquiryData
          } = item.mappedData;

          // Create enquiry
          await LearnerProfileService.createLearnerProfile(enquiryData as any);

          results.push({
            rowNumber: item.rowNumber,
            data: item.originalData,
            status: 'success',
            message: `Successfully created enquiry for ${item.mappedData.first_name} ${item.mappedData.last_name}`
          });
          successCount++;

        } catch (error: any) {
          console.error(`[enquiries/bulk-upload] Error creating enquiry for row ${item.rowNumber}:`, error);
          results.push({
            rowNumber: item.rowNumber,
            data: item.originalData,
            status: 'error',
            message: error.message || 'Failed to create enquiry'
          });
          errorCount++;
        }

        // Small delay to prevent overwhelming the database
        if (i < previewData.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      setProcessedRows(results);
      setShowResults(true);

      // Show final results
      if (successCount > 0 && errorCount === 0) {
        toast.success(`Successfully uploaded ${successCount} enquiries`);
      } else if (successCount > 0 && errorCount > 0) {
        toast.success(`Uploaded ${successCount} enquiries. ${errorCount} failed.`);
      } else {
        toast.error(`Upload failed. ${errorCount} records had errors.`);
      }

      // Call onSuccess callback if provided
      if (successCount > 0 && onSuccess) {
        onSuccess();
      }

    } catch (error) {
      console.error('[enquiries/bulk-upload] Bulk upload error:', error);
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(100);
    }
  };

  // ============================================
  // TEMPLATE DOWNLOAD - Ordered Fields
  // ============================================
  const downloadTemplate = () => {
    try {

    // ============================================
    // INFORMATION SHEET - Detailed Instructions
    // ============================================
    const infoData = [
      // Header
      { 'A': '📋 ENQUIRY BULK UPLOAD - INFORMATION & INSTRUCTIONS', 'B': '', 'C': '' },
      { 'A': '', 'B': '', 'C': '' },

      // Overview
      { 'A': '📖 OVERVIEW', 'B': '', 'C': '' },
      { 'A': 'This template is used to bulk upload student enquiries to the MyJKKN system.', 'B': '', 'C': '' },
      { 'A': 'Please read all instructions carefully before filling the template.', 'B': '', 'C': '' },
      { 'A': '', 'B': '', 'C': '' },

      // Important Notes
      { 'A': '⚠️ IMPORTANT NOTES', 'B': '', 'C': '' },
      { 'A': '1. All fields marked with * are REQUIRED', 'B': '', 'C': '' },
      { 'A': '2. Use EXACT NAMES from your database (not IDs) for Institution, Degree, Department, Program, etc.', 'B': '', 'C': '' },
      { 'A': '3. Check the sample data row for correct format examples', 'B': '', 'C': '' },
      { 'A': '4. Delete the sample data row (row 2 in Template sheet) before uploading OR update it with real data', 'B': '', 'C': '' },
      { 'A': '5. All uploaded enquiries will have status "Enquiry" by default', 'B': '', 'C': '' },
      { 'A': '6. User accounts are NOT created during upload - only after manual approval', 'B': '', 'C': '' },
      { 'A': '', 'B': '', 'C': '' },

      // Field Guide Header
      { 'A': '📝 FIELD-BY-FIELD GUIDE', 'B': '', 'C': '' },
      { 'A': '', 'B': '', 'C': '' },

      // SECTION 1
      { 'A': '▶ SECTION 1: REQUIRED - Basic Details', 'B': '', 'C': '' },
      { 'A': 'Field Name', 'B': 'Format/Valid Values', 'C': 'Example' },
      { 'A': '* First Name', 'B': 'Text (will be converted to UPPERCASE)', 'C': 'RAJESH' },
      { 'A': '* Last Name', 'B': 'Text (will be converted to UPPERCASE)', 'C': 'KUMAR' },
      { 'A': '* Father Name', 'B': 'Text (will be converted to UPPERCASE)', 'C': 'SURESH KUMAR' },
      { 'A': '* Mother Name', 'B': 'Text (will be converted to UPPERCASE)', 'C': 'LAKSHMI DEVI' },
      { 'A': '* Date of Birth', 'B': 'YYYY-MM-DD format', 'C': '2005-06-15' },
      { 'A': '* Gender', 'B': 'MALE, FEMALE, or OTHER', 'C': 'MALE' },
      { 'A': '* Religion', 'B': 'Hindu, Christian, Muslim, etc.', 'C': 'Hindu' },
      { 'A': '* Community', 'B': 'BC, MBC, SC, ST, OC, etc.', 'C': 'BC' },
      { 'A': '* Caste', 'B': 'Your caste name', 'C': 'Vanniyar' },
      { 'A': '', 'B': '', 'C': '' },

      // SECTION 2
      { 'A': '▶ SECTION 2: REQUIRED - Academic & Enrollment', 'B': '', 'C': '' },
      { 'A': '⚠️ IMPORTANT: Use EXACT names as they appear in your database!', 'B': '', 'C': '' },
      { 'A': 'Field Name', 'B': 'Format/Valid Values', 'C': 'Example' },
      { 'A': '* Institution', 'B': 'Full institution name from database', 'C': 'JKKN College of Engineering' },
      { 'A': '* Degree', 'B': 'Degree name from database', 'C': 'Undergraduate' },
      { 'A': '* Department', 'B': 'Full department name from database', 'C': 'Computer Science and Engineering' },
      { 'A': '* Program', 'B': 'Program name from database', 'C': 'B.E. COMPUTER SCIENCE AND ENGINEERING' },
      { 'A': '* Academic Year', 'B': 'Year in format YYYY-YYYY', 'C': '2024-2025' },
      { 'A': '* Semester', 'B': 'Semester name from database', 'C': 'Semester 1' },
      { 'A': '* Section', 'B': 'Section name from database', 'C': 'A' },
      { 'A': '* Entry Type', 'B': 'FIRST YEAR or LATERAL ENTRY', 'C': 'FIRST YEAR' },
      { 'A': '* First Graduate', 'B': 'TRUE or FALSE', 'C': 'TRUE' },
      { 'A': '', 'B': '', 'C': '' },

      // SECTION 3
      { 'A': '▶ SECTION 3: REQUIRED - Contact Details', 'B': '', 'C': '' },
      { 'A': 'Field Name', 'B': 'Format/Valid Values', 'C': 'Example' },
      { 'A': '* Student Mobile', 'B': '10-digit mobile number', 'C': '9876543210' },
      { 'A': '* Permanent Address Street', 'B': 'Full street address', 'C': '123, Main Street, Gandhi Nagar' },
      { 'A': '* Permanent Address District', 'B': 'District name', 'C': 'Namakkal' },
      { 'A': '* Permanent Address State', 'B': 'State name', 'C': 'Tamil Nadu' },
      { 'A': '* Permanent Address Pin Code', 'B': '6-digit pin code', 'C': '637001' },
      { 'A': '* Accommodation Type', 'B': 'DAY SCHOLAR or HOSTEL', 'C': 'HOSTEL' },
      { 'A': '', 'B': '', 'C': '' },

      // SECTION 4
      { 'A': '▶ SECTION 4: OPTIONAL - For User Account Creation', 'B': '', 'C': '' },
      { 'A': '✅ Fill these fields to enable auto user creation after approval', 'B': '', 'C': '' },
      { 'A': 'Field Name', 'B': 'Format/Valid Values', 'C': 'Example' },
      { 'A': 'College Email', 'B': 'Must end with @jkkn.ac.in', 'C': 'rajesh.kumar@jkkn.ac.in' },
      { 'A': 'Student Email', 'B': 'Personal email address', 'C': 'rajesh.kumar2005@gmail.com' },
      { 'A': 'Permanent Address Taluk', 'B': 'Taluk/Tehsil name', 'C': 'Namakkal' },
      { 'A': '', 'B': '', 'C': '' },
      { 'A': '📌 User Creation Requirements:', 'B': '', 'C': '' },
      { 'A': '  1. College Email must be provided and end with @jkkn.ac.in', 'B': '', 'C': '' },
      { 'A': '  2. Academic Year, Semester, and Section must be assigned', 'B': '', 'C': '' },
      { 'A': '  3. Status must be changed to "Approved" via bulk status update', 'B': '', 'C': '' },
      { 'A': '  4. User account will be created automatically when all conditions are met', 'B': '', 'C': '' },
      { 'A': '', 'B': '', 'C': '' },

      // Other sections summary
      { 'A': '▶ SECTION 5: OPTIONAL - Family Details', 'B': '', 'C': '' },
      { 'A': 'Father Occupation, Father Mobile, Mother Occupation, Mother Mobile, Annual Income', 'B': '', 'C': '' },
      { 'A': '', 'B': '', 'C': '' },

      { 'A': '▶ SECTION 6: OPTIONAL - Academic Marks', 'B': '', 'C': '' },
      { 'A': 'Last School, Board of Study, 10th Marks, 12th Marks, Percentage', 'B': '', 'C': '' },
      { 'A': '', 'B': '', 'C': '' },

      { 'A': '▶ SECTION 7: OPTIONAL - Entrance Exams', 'B': '', 'C': '' },
      { 'A': 'NEET Roll Number, NEET Score, Cutoff Marks, Counseling Details', 'B': '', 'C': '' },
      { 'A': '', 'B': '', 'C': '' },

      { 'A': '▶ SECTION 8: OPTIONAL - Accommodation & Transport', 'B': '', 'C': '' },
      { 'A': 'Hostel Type, Food Type, Bus Required, Bus Route, Bus Pickup Location', 'B': '', 'C': '' },
      { 'A': '', 'B': '', 'C': '' },

      { 'A': '▶ SECTION 9: OPTIONAL - Others', 'B': '', 'C': '' },
      { 'A': 'Field Name', 'B': 'Format/Valid Values', 'C': 'Example' },
      { 'A': 'Aadhar Number', 'B': '12-digit Aadhar number', 'C': '123456789012' },
      { 'A': 'Blood Group', 'B': 'A+, B+, O+, AB+, A-, B-, O-, AB-', 'C': 'O+' },
      { 'A': 'Quota', 'B': 'GOVERNMENT, MANAGEMENT, or NRI', 'C': 'GOVERNMENT' },
      { 'A': 'Category', 'B': 'GENERAL, OBC, SC, ST, or OTHER', 'C': 'OBC' },
      { 'A': 'Roll Number', 'B': 'Student roll number', 'C': 'CSE001' },
      { 'A': 'Register Number', 'B': 'Register number', 'C': 'REG2024001' },
      { 'A': 'Regulation', 'B': 'Regulation year', 'C': '2021' },
      { 'A': 'Batch', 'B': 'Batch year', 'C': '2024' },
      { 'A': 'Reference Type', 'B': 'DIRECT APPLICATION, JKKN STAFF, CURRENT/FORMER STUDENT, EDUCATIONAL CONSULTANT, SOCIAL MEDIA, OTHERS', 'C': 'SOCIAL MEDIA' },
      { 'A': 'Reference Name', 'B': 'Name of person who referred (if applicable)', 'C': 'John Doe' },
      { 'A': 'Reference Contact', 'B': 'Contact number of reference', 'C': '9876543210' },
      { 'A': 'Enquiry Date', 'B': 'YYYY-MM-DD format', 'C': new Date().toISOString().split('T')[0] },
      { 'A': '', 'B': '', 'C': '' },

      // Common Errors
      { 'A': '❌ COMMON ERRORS TO AVOID', 'B': '', 'C': '' },
      { 'A': '', 'B': '', 'C': '' },
      { 'A': 'Error', 'B': 'Wrong', 'C': 'Correct' },
      { 'A': 'Institution name mismatch', 'B': 'JKKN Engineering College', 'C': 'Use EXACT name from your database' },
      { 'A': 'Program name not matching', 'B': 'B.E CSE', 'C': 'Use full name: B.E Computer Science and Engineering' },
      { 'A': 'Using IDs instead of names', 'B': 'inst_123 or prog_456', 'C': 'Use full names, not IDs' },
      { 'A': 'Wrong date format', 'B': '15/06/2005 or 15-06-2005', 'C': '2005-06-15 (YYYY-MM-DD)' },
      { 'A': 'Invalid gender value', 'B': 'M or F', 'C': 'MALE or FEMALE' },
      { 'A': 'Invalid boolean value', 'B': 'Yes or No', 'C': 'TRUE or FALSE' },
      { 'A': 'Wrong email domain', 'B': '@gmail.com for college email', 'C': '@jkkn.ac.in (for college email)' },
      { 'A': 'Missing required fields', 'B': 'Leaving * fields empty', 'C': 'Fill all * marked fields' },
      { 'A': 'Uploading sample data as-is', 'B': 'Not deleting/updating row 2', 'C': 'Delete sample row OR update with real data' },
      { 'A': '', 'B': '', 'C': '' },

      // Upload Steps
      { 'A': '📤 UPLOAD STEPS', 'B': '', 'C': '' },
      { 'A': '', 'B': '', 'C': '' },
      { 'A': 'Step 1', 'B': 'Go to the "Enquiry Template" sheet', 'C': '' },
      { 'A': 'Step 2', 'B': 'Delete row 2 (sample data) OR update it with real data', 'C': '' },
      { 'A': 'Step 3', 'B': '🎯 USE DROPDOWNS! Click on Institution/Degree/Program cells to see dropdown arrow', 'C': '' },
      { 'A': '', 'B': '   • Institution, Degree, Department, Program = Click cell → dropdown appears', 'C': '' },
      { 'A': '', 'B': '   • Academic Year, Semester, Section = Click cell → dropdown appears', 'C': '' },
      { 'A': '', 'B': '   • Gender, Entry Type, First Graduate, Accommodation = Click cell → dropdown appears', 'C': '' },
      { 'A': 'Step 4', 'B': '💡 TIP: If dropdown doesn\'t show all options, check lookup sheets (tabs at bottom)', 'C': '' },
      { 'A': 'Step 5', 'B': 'Fill all required (*) fields using dropdowns', 'C': '' },
      { 'A': 'Step 6', 'B': 'Save the file', 'C': '' },
      { 'A': 'Step 7', 'B': 'Upload in MyJKKN bulk upload dialog', 'C': '' },
      { 'A': 'Step 8', 'B': 'Review validation results - all names should match now!', 'C': '' },
      { 'A': 'Step 9', 'B': 'If any errors, go back to lookup sheets and copy exact names', 'C': '' },
      { 'A': 'Step 10', 'B': 'Click "Upload Valid Records" to save to database', 'C': '' },
      { 'A': '', 'B': '', 'C': '' },

      // Support
      { 'A': '📞 NEED HELP?', 'B': '', 'C': '' },
      { 'A': 'If you encounter any issues or need assistance:', 'B': '', 'C': '' },
      { 'A': '• Check the validation error messages carefully', 'B': '', 'C': '' },
      { 'A': '• Ensure all required fields are filled', 'B': '', 'C': '' },
      { 'A': '• Verify academic field names match exactly with database', 'B': '', 'C': '' },
      { 'A': '• Contact your system administrator for support', 'B': '', 'C': '' },
    ];

    // Sample data row with realistic example
    const sampleDataRow = {
      // SECTION 1: REQUIRED - Basic Details
      '* First Name': 'Rajesh',
      '* Last Name': 'Kumar',
      '* Father Name': 'Suresh Kumar',
      '* Mother Name': 'Lakshmi Devi',
      '* Date of Birth': '2005-06-15',
      '* Gender': 'MALE',
      '* Religion': 'Hindu',
      '* Community': 'BC',
      '* Caste': 'Vanniyar',

      // SECTION 2: REQUIRED - Academic & Enrollment
      '* Institution (Use NAME)': 'JKKN College of Engineering and Technology',
      '* Degree (Use NAME)': 'Undergraduate',
      '* Department (Use NAME)': 'Computer Science and Engineering',
      '* Program (Use NAME)': '	(BE) CSE',
      '* Academic Year (Use NAME)': '2024-2025',
      '* Semester (Use NAME)': '	Semester 1',
      '* Section (Use NAME)': 'A',
      '* Entry Type': 'FIRST YEAR',
      '* First Graduate': 'TRUE',

      // SECTION 3: REQUIRED - Contact Details
      '* Student Mobile': '9876543210',
      '* Permanent Address Street': '123, Main Street, Gandhi Nagar',
      '* Permanent Address District': 'Namakkal',
      '* Permanent Address State': 'Tamil Nadu',
      '* Permanent Address Pin Code': '637001',
      '* Accommodation Type': 'HOSTEL',

      // SECTION 4: OPTIONAL - For User Account Creation
      'College Email (for user login)': 'rajesh.kumar@jkkn.ac.in',
      'Student Email': 'rajesh.kumar2005@gmail.com',
      'Permanent Address Taluk': 'Namakkal',

      // SECTION 5: OPTIONAL - Family Details
      'Father Occupation': 'Business',
      'Father Mobile': '9876543211',
      'Mother Occupation': 'Homemaker',
      'Mother Mobile': '9876543212',
      'Annual Income': '500000',

      // SECTION 6: OPTIONAL - Academic Marks
      'Last School': 'Government Higher Secondary School',
      'Board of Study': 'State Board',
      '10th Max Marks': '500',
      '10th Obtained Marks': '450',
      '10th Percentage': '90',
      '12th Group': 'Science',
      '12th Max Marks': '600',
      '12th Obtained Marks': '540',
      '12th Percentage': '90',

      // SECTION 7: OPTIONAL - Entrance Exams
      'NEET Roll Number': '',
      'NEET Score': '',
      'Medical Cutoff Marks': '',
      'Engineering Cutoff Marks': '175',
      'Counseling Applied': 'TRUE',
      'Counseling Number': 'TNEA123456',

      // SECTION 8: OPTIONAL - Accommodation & Transport
      'Hostel Type': 'Boys Hostel A',
      'Food Type': 'VEG',
      'Bus Required': 'FALSE',
      'Bus Route': '',
      'Bus Pickup Location': '',

      // SECTION 9: OPTIONAL - Others
      'Aadhar Number': '123456789012',
      'Blood Group': 'O+',
      'Quota': 'GOVERNMENT',
      'Category': 'OBC',
      'Roll Number': '',
      'Register Number': '',
      'Regulation': '2021',
      'Batch': '2024',
      'Reference Type': 'Website',
      'Reference Name': '',
      'Reference Contact': '',
      'Enquiry Date': new Date().toISOString().split('T')[0],
    };

    // Empty template row for users to fill
    const emptyRow = {
      // SECTION 1: REQUIRED - Basic Details
      '* First Name': '',
      '* Last Name': '',
      '* Father Name': '',
      '* Mother Name': '',
      '* Date of Birth': '',
      '* Gender': '',
      '* Religion': '',
      '* Community': '',
      '* Caste': '',

      // SECTION 2: REQUIRED - Academic & Enrollment
      '* Institution (Use NAME)': '',
      '* Degree (Use NAME)': '',
      '* Department (Use NAME)': '',
      '* Program (Use NAME)': '',
      '* Academic Year (Use NAME)': '',
      '* Semester (Use NAME)': '',
      '* Section (Use NAME)': '',
      '* Entry Type': '',
      '* First Graduate': '',

      // SECTION 3: REQUIRED - Contact Details
      '* Student Mobile': '',
      '* Permanent Address Street': '',
      '* Permanent Address District': '',
      '* Permanent Address State': '',
      '* Permanent Address Pin Code': '',
      '* Accommodation Type': '',

      // SECTION 4: OPTIONAL - For User Account Creation
      'College Email (for user login)': '',
      'Student Email': '',
      'Permanent Address Taluk': '',

      // SECTION 5: OPTIONAL - Family Details
      'Father Occupation': '',
      'Father Mobile': '',
      'Mother Occupation': '',
      'Mother Mobile': '',
      'Annual Income': '',

      // SECTION 6: OPTIONAL - Academic Marks
      'Last School': '',
      'Board of Study': '',
      '10th Max Marks': '',
      '10th Obtained Marks': '',
      '10th Percentage': '',
      '12th Group': '',
      '12th Max Marks': '',
      '12th Obtained Marks': '',
      '12th Percentage': '',

      // SECTION 7: OPTIONAL - Entrance Exams
      'NEET Roll Number': '',
      'NEET Score': '',
      'Medical Cutoff Marks': '',
      'Engineering Cutoff Marks': '',
      'Counseling Applied': '',
      'Counseling Number': '',

      // SECTION 8: OPTIONAL - Accommodation & Transport
      'Hostel Type': '',
      'Food Type': '',
      'Bus Required': '',
      'Bus Route': '',
      'Bus Pickup Location': '',

      // SECTION 9: OPTIONAL - Others
      'Aadhar Number': '',
      'Blood Group': '',
      'Quota': '',
      'Category': '',
      'Roll Number': '',
      'Register Number': '',
      'Regulation': '',
      'Batch': '',
      'Reference Type': '',
      'Reference Name': '',
      'Reference Contact': '',
      'Enquiry Date': '',
    };

    // ============================================
    // TEMPLATE SHEET - Clean template with sample data
    // ============================================
    // Only include sample data row - users can add their own rows in Excel
    const templateData = [sampleDataRow];

    const wsTemplate = XLSX.utils.json_to_sheet(templateData);


    // Set column widths for better readability
    const columnWidths = [
      { wch: 20 }, // First Name
      { wch: 20 }, // Last Name
      { wch: 25 }, // Father Name
      { wch: 25 }, // Mother Name
      { wch: 15 }, // Date of Birth
      { wch: 15 }, // Gender
      { wch: 15 }, // Religion
      { wch: 15 }, // Community
      { wch: 15 }, // Caste
      { wch: 40 }, // Institution
      { wch: 20 }, // Degree
      { wch: 40 }, // Department
      { wch: 30 }, // Program
      { wch: 20 }, // Academic Year
      { wch: 20 }, // Semester
      { wch: 15 }, // Section
      { wch: 20 }, // Entry Type
      { wch: 15 }, // First Graduate
      { wch: 15 }, // Student Mobile
      { wch: 35 }, // Permanent Address Street
      { wch: 20 }, // District
      { wch: 20 }, // State
      { wch: 12 }, // Pin Code
      { wch: 20 }, // Accommodation Type
      { wch: 35 }, // College Email
      { wch: 30 }, // Student Email
      { wch: 20 }, // Taluk
    ];
    wsTemplate['!cols'] = columnWidths;

    // ============================================
    // INFORMATION SHEET - Create worksheet
    // ============================================
    const wsInfo = XLSX.utils.json_to_sheet(infoData);

    // Set column widths for information sheet
    wsInfo['!cols'] = [
      { wch: 80 }, // Column A - wide for instructions
      { wch: 50 }, // Column B - for format/values
      { wch: 50 }, // Column C - for examples
    ];

    // ============================================
    // CREATE WORKBOOK WITH SHEETS
    // ============================================
    const wb = XLSX.utils.book_new();

    // Add Information sheet first (so users see it when opening)
    XLSX.utils.book_append_sheet(wb, wsInfo, '📖 Information');

    // Add Template sheet second
    XLSX.utils.book_append_sheet(wb, wsTemplate, 'Enquiry Template');

    // Download the file
    XLSX.writeFile(wb, 'enquiry-bulk-upload-template.xlsx');

    toast.success('Template downloaded successfully!');

    } catch (error) {
      console.error('[bulk-upload] Error generating template:', error);
      toast.error('Failed to generate template. Please try again.');
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setPreviewData([]);
    setProcessedRows([]);
    setShowResults(false);
    setUploadProgress(0);
    setUploading(false);
    setProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Calculate statistics for preview
  const validRows = previewData.filter(item => item.validation.isValid);
  const invalidRows = previewData.filter(item => !item.validation.isValid);
  const warningRows = previewData.filter(item => item.validation.warnings.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline'>
          <UploadCloud className='mr-2 h-4 w-4' />
          Bulk Upload
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-5xl h-[90vh] flex flex-col p-0'>
        <DialogHeader className='px-6 py-4 border-b bg-muted/50 flex-shrink-0'>
          <div className='flex items-start justify-between gap-4'>
            <div className='flex-1'>
              <DialogTitle className='text-xl flex items-center gap-2'>
                <UploadCloud className='h-5 w-5' />
                Bulk Upload Enquiries
              </DialogTitle>
              <DialogDescription className='mt-1.5'>
                Upload learner enquiries from Excel or CSV file. Records will be created with &quot;Enquiry&quot; status.
              </DialogDescription>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={downloadTemplate}
              className='flex-shrink-0'
            >
              <Download className='mr-2 h-4 w-4' />
              Download Template
            </Button>
          </div>
        </DialogHeader>

        <div className='flex-1 overflow-y-auto min-h-0'>
          {!selectedFile ? (
            // File Upload Section
            <div className='flex items-center justify-center p-6 md:p-8'>
              <div className='flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-6 w-full'>
                <input
                  type='file'
                  accept='.xlsx,.csv'
                  onChange={handleFileSelect}
                  className='hidden'
                  ref={fileInputRef}
                />

                {/* Important Notice */}
                <Alert className='text-left w-full'>
                  <Info className='h-4 w-4' />
                  <AlertTitle>Before You Upload</AlertTitle>
                  <AlertDescription className='space-y-2'>
                    <p className='font-medium'>All uploaded records will have status = &quot;Enquiry&quot;</p>
                    <p className='text-sm'>To create user accounts:</p>
                    <ol className='text-sm list-decimal list-inside space-y-1 pl-2'>
                      <li>Upload enquiries using this tool</li>
                      <li>Review and verify the records</li>
                      <li>Use &quot;Bulk Actions&quot; to change status to &quot;Approved&quot;</li>
                      <li>System will auto-activate and create user accounts if profile is complete</li>
                    </ol>
                  </AlertDescription>
                </Alert>

                <div className='w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0'>
                  <UploadCloud className='h-10 w-10 text-primary' />
                </div>

                <div className='space-y-3'>
                  <h3 className='text-lg font-semibold'>Upload Excel/CSV File</h3>
                  <p className='text-sm text-muted-foreground'>
                    Select a file containing learner enquiry data with required fields
                  </p>
                </div>

                <Button
                  size='lg'
                  onClick={() => fileInputRef.current?.click()}
                  disabled={processing}
                  className='w-full sm:w-auto'
                >
                  <UploadCloud className='mr-2 h-5 w-5' />
                  {processing ? 'Processing...' : 'Choose File'}
                </Button>

                <p className='text-xs text-muted-foreground'>
                  Supports Excel (.xlsx) and CSV files • Click &quot;Download Template&quot; above to get started
                </p>
              </div>
            </div>
          ) : (
            // Preview and Results Section
            <div className='p-4 md:p-6 space-y-4 md:space-y-6'>
              {/* File Info & Statistics */}
              <div className='space-y-4'>
                <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-muted rounded-lg'>
                  <div className='flex items-center gap-3 min-w-0 flex-1'>
                    <FileText className='h-6 w-6 text-muted-foreground flex-shrink-0' />
                    <div className='min-w-0 flex-1'>
                      <p className='font-semibold truncate'>{selectedFile.name}</p>
                      <p className='text-sm text-muted-foreground'>
                        {previewData.length} records loaded
                      </p>
                    </div>
                  </div>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={resetUpload}
                    disabled={uploading}
                    className='flex-shrink-0'
                  >
                    <X className='h-4 w-4' />
                  </Button>
                </div>

                {/* Statistics Cards */}
                {!showResults && previewData.length > 0 && (
                  <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4'>
                    <Card>
                      <CardHeader className='pb-3'>
                        <CardDescription>Valid Records</CardDescription>
                        <CardTitle className='text-2xl md:text-3xl text-green-600'>
                          {validRows.length}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className='pb-3'>
                        <CardDescription>Invalid Records</CardDescription>
                        <CardTitle className='text-2xl md:text-3xl text-red-600'>
                          {invalidRows.length}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className='pb-3'>
                        <CardDescription>With Warnings</CardDescription>
                        <CardTitle className='text-2xl md:text-3xl text-yellow-600'>
                          {warningRows.length}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              {uploading && (
                <div className='space-y-3'>
                  <Progress value={uploadProgress} className='h-3' />
                  <p className='text-sm text-center text-muted-foreground flex items-center justify-center gap-2'>
                    <TrendingUp className='h-4 w-4 animate-pulse' />
                    Processing {uploadProgress}%...
                  </p>
                </div>
              )}

              {/* Results */}
              {showResults && (
                <div className='space-y-3'>
                  <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3'>
                    <h4 className='font-semibold text-lg'>Upload Results</h4>
                    <div className='flex flex-wrap gap-2'>
                      <Badge variant='outline' className='bg-green-50 text-green-700 border-green-200'>
                        <CheckCircle className='mr-1 h-3 w-3' />
                        {processedRows.filter(r => r.status === 'success').length} Success
                      </Badge>
                      <Badge variant='outline' className='bg-red-50 text-red-700 border-red-200'>
                        <AlertCircle className='mr-1 h-3 w-3' />
                        {processedRows.filter(r => r.status === 'error').length} Errors
                      </Badge>
                    </div>
                  </div>

                  <div className='space-y-2 max-h-[400px] overflow-y-auto border rounded-lg p-3 bg-muted/20'>
                    {processedRows.map((row) => (
                      <div
                        key={row.rowNumber}
                        className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
                          row.status === 'success'
                            ? 'bg-green-50 text-green-800 border border-green-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                        }`}
                      >
                        {row.status === 'success' ? (
                          <CheckCircle className='h-5 w-5 mt-0.5 flex-shrink-0' />
                        ) : (
                          <AlertCircle className='h-5 w-5 mt-0.5 flex-shrink-0' />
                        )}
                        <div className='flex-1 min-w-0'>
                          <p className='font-semibold'>Row {row.rowNumber}</p>
                          <p className='text-xs break-words'>{row.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation Preview */}
              {previewData.length > 0 && !showResults && (
                <div className='space-y-3'>
                  <h4 className='font-semibold text-lg'>Data Preview & Validation</h4>
                  <div className='space-y-2 max-h-[400px] overflow-y-auto border rounded-lg p-3 bg-muted/20'>
                    {previewData.slice(0, 15).map((item) => (
                      <div
                        key={item.rowNumber}
                        className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
                          item.validation.isValid
                            ? 'bg-green-50 text-green-800 border border-green-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                        }`}
                      >
                        {item.validation.isValid ? (
                          <CheckCircle className='h-5 w-5 mt-0.5 flex-shrink-0' />
                        ) : (
                          <AlertCircle className='h-5 w-5 mt-0.5 flex-shrink-0' />
                        )}
                        <div className='flex-1 min-w-0'>
                          <p className='font-semibold'>
                            Row {item.rowNumber}: {item.mappedData.first_name} {item.mappedData.last_name}
                          </p>
                          {item.validation.errors.length > 0 && (
                            <p className='text-xs mt-1 break-words'>
                              <span className='font-medium'>Errors:</span> {item.validation.errors.join(', ')}
                            </p>
                          )}
                          {item.validation.warnings.length > 0 && (
                            <p className='text-xs mt-1 text-yellow-700 break-words'>
                              <span className='font-medium'>Warnings:</span> {item.validation.warnings.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {previewData.length > 15 && (
                      <p className='text-xs text-muted-foreground text-center py-2'>
                        ...and {previewData.length - 15} more records
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className='px-4 md:px-6 py-4 border-t bg-muted/50 flex-shrink-0'>
          {selectedFile && !showResults && (
            <div className='flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:justify-end'>
              <Button
                variant='outline'
                onClick={resetUpload}
                disabled={uploading}
                className='w-full sm:w-auto'
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploading || previewData.length === 0 || validRows.length === 0}
                className='w-full sm:w-auto'
              >
                {uploading ? (
                  <>
                    <TrendingUp className='mr-2 h-4 w-4 animate-pulse' />
                    Uploading...
                  </>
                ) : (
                  <>
                    <UploadCloud className='mr-2 h-4 w-4' />
                    Upload {validRows.length} Valid Record{validRows.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          )}
          {showResults && (
            <Button onClick={resetUpload} className='w-full sm:w-auto'>
              <UploadCloud className='mr-2 h-4 w-4' />
              Upload Another File
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
