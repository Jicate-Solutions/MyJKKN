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
import { UploadCloud, X, CheckCircle, AlertCircle, FileText, Download } from 'lucide-react';
import { AdmissionService } from '@/lib/services/admission/admission-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

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

// Lookup functions for converting names to IDs
const lookupInstitutionId = async (institutionName: string): Promise<string | null> => {
  if (!institutionName?.trim()) return null;

  const supabase = createClientSupabaseClient();
  const trimmedName = institutionName.trim();

  const { data, error } = await supabase
    .from('institutions')
    .select('id, name')
    .ilike('name', trimmedName)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[admission/bulk-upload] Institution lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[admission/bulk-upload] Institution not found:', trimmedName);
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
    .maybeSingle();

  if (error) {
    console.error('[admission/bulk-upload] Program lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[admission/bulk-upload] Program not found:', trimmedName);
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
    .maybeSingle();

  if (error) {
    console.error('[admission/bulk-upload] Degree lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[admission/bulk-upload] Degree not found:', trimmedName);
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
    .maybeSingle();

  if (error) {
    console.error('[admission/bulk-upload] Department lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[admission/bulk-upload] Department not found:', trimmedName);
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
    .maybeSingle();

  if (error) {
    console.error('[admission/bulk-upload] Academic Year lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[admission/bulk-upload] Academic Year not found:', trimmedName);
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
    .maybeSingle();

  if (error) {
    console.error('[admission/bulk-upload] Semester lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[admission/bulk-upload] Semester not found:', trimmedName);
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
    .maybeSingle();

  if (error) {
    console.error('[admission/bulk-upload] Section lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[admission/bulk-upload] Section not found:', trimmedName);
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
    .maybeSingle();

  if (error) {
    console.error('[admission/bulk-upload] Regulation lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[admission/bulk-upload] Regulation not found:', trimmedName);
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
    .maybeSingle();

  if (error) {
    console.error('[admission/bulk-upload] Batch lookup error:', {
      searchTerm: trimmedName,
      error
    });
    return null;
  }

  if (!data) {
    console.warn('[admission/bulk-upload] Batch not found:', trimmedName);
    return null;
  }

  return data.id;
};

export default function BulkUploadAdmissions({ onSuccess }: { onSuccess?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [processedRows, setProcessedRows] = useState<ProcessedRow[]>([]);
  const [showResults, setShowResults] = useState(false);

  // Column mapping for admission data
  const getColumnMapping = () => ({
    // Basic Details
    'enquiry_date': ['Enquiry Date', 'enquirydate', 'enquiry_date'],
    'first_name': ['First Name', '* First Name', 'firstname', 'first_name', 'name'],
    'last_name': ['Last Name', 'lastname', 'last_name', 'surname'],
    'father_name': ['Father Name', '* Father Name', 'fathername', 'father_name', 'father'],
    'father_occupation': ['Father Occupation', 'fatheroccupation', 'father_occupation'],
    'father_mobile': ['Father Mobile', 'fathermobile', 'father_mobile', 'father_phone'],
    'mother_name': ['Mother Name', '* Mother Name', 'mothername', 'mother_name', 'mother'],
    'mother_occupation': ['Mother Occupation', 'motheroccupation', 'mother_occupation'],
    'mother_mobile': ['Mother Mobile', 'mothermobile', 'mother_mobile', 'mother_phone'],
    'date_of_birth': ['Date of Birth', '* Date of Birth', 'dateofbirth', 'date_of_birth', 'dob', 'birth_date'],
    'gender': ['Gender', '* Gender', 'sex'],
    'religion': ['Religion'],
    'community': ['Community'],
    'caste': ['Caste'],
    'annual_income': ['Annual Income', 'annualincome', 'annual_income', 'income'],

    // Academic Information
    'last_school': ['Last School', '* Last School', 'lastschool', 'last_school', 'school'],
    'board_of_study': ['Board of Study', '* Board of Study', 'boardofstudy', 'board_of_study', 'board'],
    'tenth_max_marks': ['10th Max Marks', '10th Maximum Marks', 'tenth_max_marks', '10max'],
    'tenth_obtained_marks': ['10th Obtained Marks', '10th Marks', 'tenth_obtained_marks', '10obtained'],
    'tenth_percentage': ['10th Percentage', 'tenth_percentage', '10percentage', '10%'],
    'twelfth_group': ['12th Group', 'twelfth_group', '12group', 'group'],
    'twelfth_max_marks': ['12th Max Marks', '12th Maximum Marks', 'twelfth_max_marks', '12max'],
    'twelfth_obtained_marks': ['12th Obtained Marks', '12th Marks', 'twelfth_obtained_marks', '12obtained'],
    'twelfth_percentage': ['12th Percentage', 'twelfth_percentage', '12percentage', '12%'],
    'neet_roll_number': ['NEET Roll Number', 'neetrollnumber', 'neet_roll_number', 'neet'],
    'neet_score': ['NEET Score', 'neetscore', 'neet_score'],
    'medical_cutoff_marks': ['Medical Cutoff Marks', 'medicalcutoffmarks', 'medical_cutoff_marks'],
    'engineering_cutoff_marks': ['Engineering Cutoff Marks', 'engineeringcutoffmarks', 'engineering_cutoff_marks'],
    'counseling_applied': ['Counseling Applied', 'counselingapplied', 'counseling_applied'],
    'counseling_number': ['Counseling Number', 'counselingnumber', 'counseling_number'],
    'first_graduate': ['First Graduate', 'firstgraduate', 'first_graduate'],
    'aadhar_number': ['Aadhar Number', 'aadharnumber', 'aadhar_number', 'aadhaar'],

    // Course Selection
    'quota': ['Quota'],
    'category': ['Category'],
    'institution': ['Institution', '* Institution', 'college'],
    'degree': ['Degree'],
    'department': ['Department'],
    'program': ['Program', '* Program', 'course'],
    'entry_type': ['Entry Type', '* Entry Type', 'entrytype', 'entry_type'],
    'academic_year': ['Academic Year', 'academicyear', 'academic_year', 'year'],
    'semester': ['Semester', 'sem'],
    'section': ['Section', 'sec'],
    'regulation': ['Regulation', 'reg'],
    'batch': ['Batch'],
    'roll_number': ['Roll Number', 'rollnumber', 'roll_number', 'roll'],
    'register_number': ['Register Number', 'registernumber', 'register_number', 'regno'],

    // Contact Details
    'permanent_address_street': ['Permanent Address Street', '* Permanent Address Street', 'address', 'street', 'permanent_address'],
    'permanent_address_taluk': ['Permanent Address Taluk', 'taluk'],
    'permanent_address_district': ['Permanent Address District', '* Permanent Address District', 'district'],
    'permanent_address_pin_code': ['Permanent Address Pin Code', '* Permanent Address Pin Code', 'pincode', 'pin', 'postal_code'],
    'permanent_address_state': ['Permanent Address State', '* Permanent Address State', 'state'],
    'student_mobile': ['Student Mobile', '* Student Mobile', 'studentmobile', 'student_mobile', 'mobile', 'phone'],
    'student_email': ['Student Email', '* Student Email', 'studentemail', 'student_email', 'email', 'personal_email'],
    'college_email': ['College Email', '* College Email', 'collegeemail', 'college_email', 'institutional_email', 'institute_email'],

    // Accommodation
    'accommodation_type': ['Accommodation Type', '* Accommodation Type', 'accommodationtype', 'accommodation_type'],
    'hostel_type': ['Hostel Type', 'hosteltype', 'hostel_type'],
    'food_type': ['Food Type', 'foodtype', 'food_type'],
    'bus_required': ['Bus Required', 'busrequired', 'bus_required'],
    'bus_route': ['Bus Route', 'busroute', 'bus_route'],
    'bus_pickup_location': ['Bus Pickup Location', 'buspickuplocation', 'bus_pickup_location'],
    'reference_type': ['Reference Type', 'referencetype', 'reference_type'],
    'reference_name': ['Reference Name', 'referencename', 'reference_name'],
    'reference_contact': ['Reference Contact', 'referencecontact', 'reference_contact']
  });

  const validateRowData = (row: any, rowIndex: number): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // REQUIRED FIELDS - Essential for admission records
    if (!row.first_name?.trim()) {
      errors.push('First Name is required');
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
        errors.push('Invalid Date of Birth format');
      }
    }

    if (!row.gender?.trim()) {
      errors.push('Gender is required');
    }

    // Contact Information - Required
    if (!row.student_mobile?.trim()) {
      errors.push('Student Mobile is required');
    } else if (!/^\d{10}$/.test(row.student_mobile.replace(/\D/g, ''))) {
      errors.push('Invalid mobile number format');
    }

    if (!row.student_email?.trim()) {
      errors.push('Student Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.student_email)) {
      errors.push('Invalid Student Email format');
    }

    if (!row.college_email?.trim()) {
      errors.push('College Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.college_email)) {
      errors.push('Invalid College Email format');
    } else if (!row.college_email.toLowerCase().endsWith('@jkkn.ac.in')) {
      errors.push('College Email must use @jkkn.ac.in domain');
    }

    // Academic Information - Optional (last_school and board_of_study are optional to match form behavior)

    // Address Information - Required
    if (!row.permanent_address_street?.trim()) {
      errors.push('Permanent Address Street is required');
    }

    if (!row.permanent_address_district?.trim()) {
      errors.push('Permanent Address District is required');
    }

    if (!row.permanent_address_pin_code?.trim()) {
      errors.push('Permanent Address Pin Code is required');
    } else if (!/^\d{6}$/.test(row.permanent_address_pin_code.trim())) {
      errors.push('Invalid Pin Code format (should be 6 digits)');
    }

    if (!row.permanent_address_state?.trim()) {
      errors.push('Permanent Address State is required');
    }

    // Course Selection - Required
    if (!row.institution_id) {
      const institutionName = row.institution || 'N/A';
      errors.push(`Institution "${institutionName}" not found in database. Please check spelling and ensure it exists in Organization > Institutions.`);
    }

    if (!row.program_id) {
      const programName = row.program || 'N/A';
      errors.push(`Program "${programName}" not found in database. Please check spelling and ensure it exists in Organization > Programs.`);
    }

    if (!row.degree_id && row.degree?.trim()) {
      const degreeName = row.degree;
      errors.push(`Degree "${degreeName}" not found in database. Please check spelling and ensure it exists in Organization > Degrees.`);
    }

    if (!row.department_id && row.department?.trim()) {
      const departmentName = row.department;
      errors.push(`Department "${departmentName}" not found in database. Please check spelling and ensure it exists in Organization > Departments.`);
    }

    if (!row.entry_type?.trim()) {
      errors.push('Entry Type is required');
    }

    if (!row.accommodation_type?.trim()) {
      errors.push('Accommodation Type is required');
    }

    // Validate specific field values
    if (row.gender && !['MALE', 'FEMALE', 'OTHER'].includes(row.gender.toUpperCase())) {
      errors.push('Gender must be MALE, FEMALE, or OTHER');
    }

    if (row.entry_type && !['FIRST YEAR', 'LATERAL ENTRY'].includes(row.entry_type.toUpperCase())) {
      errors.push('Entry Type must be FIRST YEAR or LATERAL ENTRY');
    }

    if (row.accommodation_type && !['DAY SCHOLAR', 'HOSTEL'].includes(row.accommodation_type.toUpperCase())) {
      errors.push('Accommodation Type must be DAY SCHOLAR or HOSTEL');
    }

    if (row.quota && !['GOVERNMENT', 'MANAGEMENT', 'NRI'].includes(row.quota.toUpperCase())) {
      errors.push('Quota must be GOVERNMENT, MANAGEMENT, or NRI');
    }

    if (row.category && !['GENERAL', 'OBC', 'SC', 'ST', 'OTHER'].includes(row.category.toUpperCase())) {
      errors.push('Category must be GENERAL, OBC, SC, ST, or OTHER');
    }

    // Validate mobile numbers
    if (row.father_mobile?.trim() && !/^\d{10}$/.test(row.father_mobile.replace(/\D/g, ''))) {
      errors.push('Invalid Father Mobile format');
    }

    if (row.mother_mobile?.trim() && !/^\d{10}$/.test(row.mother_mobile.replace(/\D/g, ''))) {
      errors.push('Invalid Mother Mobile format');
    }

    // Warnings for missing important but optional fields
    if (!row.father_mobile?.trim()) {
      warnings.push('Father Mobile not provided');
    }

    if (!row.mother_mobile?.trim()) {
      warnings.push('Mother Mobile not provided');
    }

    if (!row.religion?.trim()) {
      warnings.push('Religion not provided');
    }

    if (!row.community?.trim()) {
      warnings.push('Community not provided');
    }

    if (!row.annual_income?.trim()) {
      warnings.push('Annual Income not provided');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  };

  const mapRowData = async (row: any) => {
    const columnMapping = getColumnMapping();
    const mappedData: any = {};

    // Debug: Log available columns in the first row
    if (Object.keys(mappedData).length === 0) {
      console.log('Available columns in Excel:', Object.keys(row));
    }

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

    // Debug: Log successful mappings
    console.log('Mapped data for validation:', {
      first_name: mappedData.first_name,
      institution: mappedData.institution,
      program: mappedData.program,
      originalRow: Object.keys(row)
    });

    // Lookup IDs from names
    const institutionId = await lookupInstitutionId(mappedData.institution);
    const programId = await lookupProgramId(mappedData.program);
    const degreeId = await lookupDegreeId(mappedData.degree);
    const departmentId = await lookupDepartmentId(mappedData.department);
    const academicYearId = await lookupAcademicYearId(mappedData.academic_year);
    const semesterId = await lookupSemesterId(mappedData.semester);
    const sectionId = await lookupSectionId(mappedData.section);
    const regulationId = await lookupRegulationId(mappedData.regulation);
    const batchId = await lookupBatchId(mappedData.batch);

    // Log lookup results for debugging
    console.log('Name-to-ID lookups:', {
      institution: mappedData.institution,
      institutionId,
      program: mappedData.program,
      programId
    });

    // Format the data for API
    return {
      first_name: mappedData.first_name?.toString().trim().toUpperCase() || '',
      last_name: mappedData.last_name?.toString().trim().toUpperCase() || '',
      father_name: mappedData.father_name?.toString().trim().toUpperCase() || '',
      father_occupation: mappedData.father_occupation?.toString().trim().toUpperCase() || '',
      father_mobile: mappedData.father_mobile?.toString().replace(/\D/g, '') || '',
      mother_name: mappedData.mother_name?.toString().trim().toUpperCase() || '',
      mother_occupation: mappedData.mother_occupation?.toString().trim().toUpperCase() || '',
      mother_mobile: mappedData.mother_mobile?.toString().replace(/\D/g, '') || '',
      date_of_birth: mappedData.date_of_birth ? new Date(mappedData.date_of_birth).toISOString().split('T')[0] : '',
      gender: mappedData.gender?.toString().trim().toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase()) || '',
      religion: mappedData.religion?.toString().trim().toUpperCase() || '',
      community: mappedData.community?.toString().trim().toUpperCase() || '',
      caste: mappedData.caste?.toString().trim().toUpperCase() || '',
      annual_income: mappedData.annual_income?.toString() || '',
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
      aadhar_number: mappedData.aadhar_number?.toString() || '',
      quota: mappedData.quota?.toString().trim().toUpperCase() || '',
      category: mappedData.category?.toString().trim().toUpperCase() || '',
      entry_type: mappedData.entry_type?.toString().trim().toUpperCase() || '',
      permanent_address_street: mappedData.permanent_address_street?.toString().trim().toUpperCase() || '',
      permanent_address_taluk: mappedData.permanent_address_taluk?.toString().trim().toUpperCase() || '',
      permanent_address_district: mappedData.permanent_address_district?.toString().trim().toUpperCase() || '',
      permanent_address_pin_code: mappedData.permanent_address_pin_code?.toString() || '',
      permanent_address_state: mappedData.permanent_address_state?.toString().trim().toUpperCase() || '',
      student_mobile: mappedData.student_mobile?.toString().replace(/\D/g, '') || '',
      student_email: mappedData.student_email?.toString().trim().toLowerCase() || '',
      college_email: mappedData.college_email?.toString().trim().toLowerCase() || '',
      accommodation_type: mappedData.accommodation_type?.toString().trim().toUpperCase() || '',
      hostel_type: mappedData.hostel_type?.toString().trim().toUpperCase() || '',
      food_type: mappedData.food_type?.toString().trim().toUpperCase() || '',
      bus_required: Boolean(mappedData.bus_required),
      bus_route: mappedData.bus_route?.toString().trim().toUpperCase() || '',
      bus_pickup_location: mappedData.bus_pickup_location?.toString().trim().toUpperCase() || '',
      reference_type: mappedData.reference_type?.toString().trim().toUpperCase() || '',
      reference_name: mappedData.reference_name?.toString().trim().toUpperCase() || '',
      reference_contact: mappedData.reference_contact?.toString() || '',

      // Institution and Program mappings - Convert names to IDs
      // Use null instead of empty string for failed lookups (PostgreSQL requires valid UUID or null, not empty string)
      institution_id: institutionId || null,
      degree_id: degreeId || null,
      department_id: departmentId || null,
      program_id: programId || null,
      academic_year_id: academicYearId || null,
      semester_id: semesterId || null,
      section_id: sectionId || null,
      regulation_id: regulationId || null,
      batch_id: batchId || null,

      // Additional text fields
      roll_number: mappedData.roll_number?.toString().trim() || '',
      register_number: mappedData.register_number?.toString().trim() || '',

      // Store original names for validation error messages
      institution: mappedData.institution?.toString().trim() || '',
      degree: mappedData.degree?.toString().trim() || '',
      department: mappedData.department?.toString().trim() || '',
      program: mappedData.program?.toString().trim() || '',

      status: 'pending'
    };
  };

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
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        toast.error('The uploaded file contains no data');
        return;
      }

      console.log('Parsed Excel data:', jsonData.slice(0, 2)); // Log first 2 rows for debugging

      // Process and validate data (now async to handle lookups)
      const processedData = [];

      for (let index = 0; index < jsonData.length; index++) {
        const row = jsonData[index];
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
      console.error('Error processing file:', error);
      toast.error('Failed to process file. Please check the format.');
    } finally {
      setProcessing(false);
    }
  };

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
          const { institution, degree, department, program, ...admissionData } = item.mappedData;

          // Try to create admission
          await AdmissionService.createAdmission(admissionData);

          results.push({
            rowNumber: item.rowNumber,
            data: item.originalData,
            status: 'success',
            message: 'Successfully created admission'
          });
          successCount++;

        } catch (error: any) {
          console.error(`Error creating admission for row ${item.rowNumber}:`, error);
          results.push({
            rowNumber: item.rowNumber,
            data: item.originalData,
            status: 'error',
            message: error.message || 'Failed to create admission'
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
        toast.success(`Successfully uploaded ${successCount} admissions`);
      } else if (successCount > 0 && errorCount > 0) {
        toast.success(`Uploaded ${successCount} admissions. ${errorCount} failed.`);
      } else {
        toast.error(`Upload failed. ${errorCount} records had errors.`);
      }

      // Call onSuccess callback if provided
      if (successCount > 0 && onSuccess) {
        onSuccess();
      }

    } catch (error) {
      console.error('Bulk upload error:', error);
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(100);
    }
  };

  const downloadTemplate = () => {
    const templateData = [{
      'First Name': '',
      'Last Name': '',
      'Father Name': '',
      'Father Occupation': '',
      'Father Mobile': '',
      'Mother Name': '',
      'Mother Occupation': '',
      'Mother Mobile': '',
      'Date of Birth': '2000-01-01',
      'Gender': 'MALE/FEMALE',
      'Religion': '',
      'Community': '',
      'Caste': '',
      'Annual Income': '',
      'Last School': '',
      'Board of Study': '',
      '10th Max Marks': '',
      '10th Obtained Marks': '',
      '10th Percentage': '',
      '12th Group': '',
      '12th Max Marks': '',
      '12th Obtained Marks': '',
      '12th Percentage': '',
      'NEET Roll Number': '',
      'NEET Score': '',
      'Medical Cutoff Marks': '',
      'Engineering Cutoff Marks': '',
      'Counseling Applied': 'TRUE/FALSE',
      'Counseling Number': '',
      'First Graduate': 'TRUE/FALSE',
      'Aadhar Number': '',
      'Quota': 'GOVERNMENT/MANAGEMENT/NRI',
      'Category': 'GENERAL/OBC/SC/ST/OTHER',
      'Institution': '',
      'Degree': '',
      'Department': '',
      'Program': '',
      'Entry Type': 'FIRST YEAR/LATERAL ENTRY',
      'Academic Year': '',
      'Semester': '',
      'Section': '',
      'Regulation': '',
      'Batch': '',
      'Roll Number': '',
      'Register Number': '',
      'Permanent Address Street': '',
      'Permanent Address Taluk': '',
      'Permanent Address District': '',
      'Permanent Address Pin Code': '',
      'Permanent Address State': '',
      'Student Mobile': '',
      'Student Email': '',
      'College Email': '',
      'Accommodation Type': 'DAY SCHOLAR/HOSTEL',
      'Hostel Type': '',
      'Food Type': 'VEG/NON-VEG',
      'Bus Required': 'TRUE/FALSE',
      'Bus Route': '',
      'Bus Pickup Location': '',
      'Reference Type': '',
      'Reference Name': '',
      'Reference Contact': ''
    }];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Admission Template');
    XLSX.writeFile(wb, 'admission-template.xlsx');
    toast.success('Template downloaded successfully');
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline'>
          <UploadCloud className='mr-2 h-4 w-4' />
          Bulk Upload
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-4xl max-h-[80vh] flex flex-col'>
        <DialogHeader className='px-4 py-3 border-b bg-muted/50 rounded-t-lg'>
          <DialogTitle className='text-lg sm:text-xl'>
            Admission Bulk Upload
          </DialogTitle>
          <DialogDescription>
            Upload admission records from Excel or CSV file
          </DialogDescription>
        </DialogHeader>

        <div className='flex-1 overflow-hidden flex flex-col'>
          {!selectedFile ? (
            // File Upload Section
            <div className='flex-1 flex items-center justify-center p-6'>
              <div className='flex flex-col items-center justify-center max-w-md mx-auto text-center space-y-4'>
                <input
                  type='file'
                  accept='.xlsx,.csv'
                  onChange={handleFileSelect}
                  className='hidden'
                  ref={fileInputRef}
                />
                <div className='w-16 h-16 bg-muted rounded-full flex items-center justify-center'>
                  <UploadCloud className='h-8 w-8 text-muted-foreground' />
                </div>
                <div className='space-y-2'>
                  <h3 className='text-lg font-medium'>Upload Excel/CSV File</h3>
                  <p className='text-sm text-muted-foreground'>
                    Select a file containing admission data
                  </p>
                </div>
                <div className='flex gap-2'>
                  <Button
                    size='lg'
                    onClick={() => fileInputRef.current?.click()}
                    disabled={processing}
                  >
                    <UploadCloud className='mr-2 h-4 w-4' />
                    {processing ? 'Processing...' : 'Choose File'}
                  </Button>
                  <Button
                    size='lg'
                    variant='outline'
                    onClick={downloadTemplate}
                  >
                    <Download className='mr-2 h-4 w-4' />
                    Download Template
                  </Button>
                </div>
                <p className='text-xs text-muted-foreground'>
                  Supports Excel (.xlsx) and CSV files
                </p>
              </div>
            </div>
          ) : (
            // Preview and Results Section
            <div className='flex-1 overflow-hidden flex flex-col p-4 space-y-4'>
              {/* File Info */}
              <div className='flex items-center justify-between p-3 bg-muted rounded-lg'>
                <div className='flex items-center gap-3'>
                  <FileText className='h-5 w-5 text-muted-foreground' />
                  <div>
                    <p className='font-medium'>{selectedFile.name}</p>
                    <p className='text-sm text-muted-foreground'>
                      {previewData.length} records loaded
                    </p>
                  </div>
                </div>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={resetUpload}
                >
                  <X className='h-4 w-4' />
                </Button>
              </div>

              {/* Progress Bar */}
              {uploading && (
                <div className='space-y-2'>
                  <div className='h-2 w-full rounded-full bg-secondary'>
                    <div
                      className='h-full rounded-full bg-primary transition-all duration-300'
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className='text-xs text-center text-muted-foreground'>
                    Processing {uploadProgress}%...
                  </p>
                </div>
              )}

              {/* Results */}
              {showResults && (
                <div className='flex-1 overflow-y-auto space-y-2'>
                  <h4 className='font-medium'>Upload Results</h4>
                  <div className='space-y-1 max-h-60 overflow-y-auto'>
                    {processedRows.map((row) => (
                      <div
                        key={row.rowNumber}
                        className={`flex items-center gap-3 p-2 rounded text-sm ${
                          row.status === 'success'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {row.status === 'success' ? (
                          <CheckCircle className='h-4 w-4' />
                        ) : (
                          <AlertCircle className='h-4 w-4' />
                        )}
                        <div className='flex-1'>
                          <p className='font-medium'>Row {row.rowNumber}</p>
                          <p className='text-xs'>{row.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation Preview */}
              {previewData.length > 0 && !showResults && (
                <div className='flex-1 overflow-y-auto space-y-2'>
                  <h4 className='font-medium'>Data Preview & Validation</h4>
                  <div className='space-y-1 max-h-60 overflow-y-auto'>
                    {previewData.slice(0, 10).map((item) => (
                      <div
                        key={item.rowNumber}
                        className={`flex items-center gap-3 p-2 rounded text-sm ${
                          item.validation.isValid
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {item.validation.isValid ? (
                          <CheckCircle className='h-4 w-4' />
                        ) : (
                          <AlertCircle className='h-4 w-4' />
                        )}
                        <div className='flex-1'>
                          <p className='font-medium'>
                            Row {item.rowNumber}: {item.mappedData.first_name} {item.mappedData.last_name}
                          </p>
                          {item.validation.errors.length > 0 && (
                            <p className='text-xs'>Errors: {item.validation.errors.join(', ')}</p>
                          )}
                          {item.validation.warnings.length > 0 && (
                            <p className='text-xs text-yellow-600'>Warnings: {item.validation.warnings.join(', ')}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {previewData.length > 10 && (
                      <p className='text-xs text-muted-foreground text-center'>
                        ...and {previewData.length - 10} more records
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className='px-4 py-3 border-t bg-muted/50 rounded-b-lg'>
          {selectedFile && !showResults && (
            <>
              <Button
                variant='outline'
                onClick={resetUpload}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploading || previewData.length === 0}
              >
                {uploading ? 'Uploading...' : `Upload ${previewData.length} Records`}
              </Button>
            </>
          )}
          {showResults && (
            <Button onClick={resetUpload}>
              Upload Another File
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}