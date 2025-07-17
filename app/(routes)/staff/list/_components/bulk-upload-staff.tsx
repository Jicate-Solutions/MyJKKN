/**
 * BulkUploadStaff Component
 *
 * This component handles bulk upload of staff data from Excel files.
 *
 * KEY VALIDATION RULES:
 * - Email + Institution combination must be unique (enforced by database constraint 'staff_institution_email_key')
 * - Staff ID must be globally unique (enforced by database constraint 'staff_staff_id_key')
 * - Same email can exist for different institutions, but not within the same institution
 *
 * VALIDATION PROCESS:
 * 1. Pre-upload validation checks for duplicates within the file and against existing database records
 * 2. Institution-specific email validation prevents constraint violations
 * 3. Clear error messages guide users to fix data issues before upload
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter, usePathname } from 'next/navigation';
import { Upload, X, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CategoryService } from '@/lib/services/staff/category-service';
import { StaffService } from '@/lib/services/staff/staff-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  valid_institution_id: string;
  valid_department_id: string;
  valid_category_id: string;
  converted_date_of_birth?: string;
  converted_date_of_joining?: string;
}

const validateEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const validatePhone = (phone: string) => {
  return /^\+?[\d\s-()]{10,}$/.test(phone);
};

const validateDate = (date: string | number) => {
  if (!date)
    return { isValid: false, convertedDate: '', error: 'Date is required' };

  // Handle Excel serial dates (numbers)
  if (
    typeof date === 'number' ||
    (!isNaN(Number(date)) && Number(date) > 1000)
  ) {
    try {
      // Excel serial date: days since January 1, 1900
      const excelEpoch = new Date(1900, 0, 1);
      const serialNumber = Number(date);

      // Excel incorrectly treats 1900 as a leap year, so subtract 1 for dates after Feb 28, 1900
      const adjustedSerial =
        serialNumber > 59 ? serialNumber - 1 : serialNumber;
      const convertedDate = new Date(
        excelEpoch.getTime() + (adjustedSerial - 1) * 24 * 60 * 60 * 1000
      );

      if (!isNaN(convertedDate.getTime())) {
        const year = convertedDate.getFullYear();
        const month = (convertedDate.getMonth() + 1)
          .toString()
          .padStart(2, '0');
        const day = convertedDate.getDate().toString().padStart(2, '0');

        // Check reasonable date range
        const currentYear = new Date().getFullYear();
        if (year < 1900 || year > currentYear + 1) {
          return {
            isValid: false,
            convertedDate: '',
            error: `Year must be between 1900 and ${
              currentYear + 1
            }. Got: ${year}`
          };
        }

        return {
          isValid: true,
          convertedDate: `${year}-${month}-${day}`,
          error: ''
        };
      }
    } catch (error) {
      // Fall through to text parsing
    }
  }

  // Remove any extra whitespace
  const cleanDate = date.toString().trim();

  // Common date formats to try
  const dateFormats = [
    // ISO format (preferred)
    { regex: /^\d{4}-\d{2}-\d{2}$/, format: 'YYYY-MM-DD' },
    // DD/MM/YYYY or DD-MM-YYYY
    {
      regex: /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
      format: 'DD/MM/YYYY or DD-MM-YYYY'
    },
    // MM/DD/YYYY or MM-DD-YYYY
    {
      regex: /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
      format: 'MM/DD/YYYY or MM-DD-YYYY'
    },
    // DD.MM.YYYY
    { regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, format: 'DD.MM.YYYY' },
    // YYYY/MM/DD
    {
      regex: /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/,
      format: 'YYYY/MM/DD or YYYY-MM-DD'
    }
  ];

  let convertedDate = '';
  let validDate = null;

  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    validDate = new Date(cleanDate);
    if (!isNaN(validDate.getTime())) {
      convertedDate = cleanDate;
    }
  }

  // If ISO format didn't work, try other formats
  if (!convertedDate) {
    // Try DD/MM/YYYY, DD-MM-YYYY format
    const ddmmyyyy = cleanDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmmyyyy) {
      const day = ddmmyyyy[1].padStart(2, '0');
      const month = ddmmyyyy[2].padStart(2, '0');
      const year = ddmmyyyy[3];

      // Create date and validate
      const testDate = new Date(`${year}-${month}-${day}`);
      if (
        !isNaN(testDate.getTime()) &&
        testDate.getFullYear() == parseInt(year) &&
        testDate.getMonth() + 1 == parseInt(month) &&
        testDate.getDate() == parseInt(day)
      ) {
        convertedDate = `${year}-${month}-${day}`;
        validDate = testDate;
      }
    }

    // Try MM/DD/YYYY, MM-DD-YYYY format if DD/MM/YYYY didn't work
    if (!convertedDate) {
      const mmddyyyy = cleanDate.match(
        /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/
      );
      if (mmddyyyy) {
        const month = mmddyyyy[1].padStart(2, '0');
        const day = mmddyyyy[2].padStart(2, '0');
        const year = mmddyyyy[3];

        // Create date and validate
        const testDate = new Date(`${year}-${month}-${day}`);
        if (
          !isNaN(testDate.getTime()) &&
          testDate.getFullYear() == parseInt(year) &&
          testDate.getMonth() + 1 == parseInt(month) &&
          testDate.getDate() == parseInt(day)
        ) {
          convertedDate = `${year}-${month}-${day}`;
          validDate = testDate;
        }
      }
    }

    // Try DD.MM.YYYY format
    if (!convertedDate) {
      const ddmmyyyy_dot = cleanDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (ddmmyyyy_dot) {
        const day = ddmmyyyy_dot[1].padStart(2, '0');
        const month = ddmmyyyy_dot[2].padStart(2, '0');
        const year = ddmmyyyy_dot[3];

        // Create date and validate
        const testDate = new Date(`${year}-${month}-${day}`);
        if (
          !isNaN(testDate.getTime()) &&
          testDate.getFullYear() == parseInt(year) &&
          testDate.getMonth() + 1 == parseInt(month) &&
          testDate.getDate() == parseInt(day)
        ) {
          convertedDate = `${year}-${month}-${day}`;
          validDate = testDate;
        }
      }
    }

    // Try YYYY/MM/DD format
    if (!convertedDate) {
      const yyyymmdd_slash = cleanDate.match(
        /^(\d{4})[\/](\d{1,2})[\/](\d{1,2})$/
      );
      if (yyyymmdd_slash) {
        const year = yyyymmdd_slash[1];
        const month = yyyymmdd_slash[2].padStart(2, '0');
        const day = yyyymmdd_slash[3].padStart(2, '0');

        // Create date and validate
        const testDate = new Date(`${year}-${month}-${day}`);
        if (
          !isNaN(testDate.getTime()) &&
          testDate.getFullYear() == parseInt(year) &&
          testDate.getMonth() + 1 == parseInt(month) &&
          testDate.getDate() == parseInt(day)
        ) {
          convertedDate = `${year}-${month}-${day}`;
          validDate = testDate;
        }
      }
    }
  }

  // Additional validation for reasonable date ranges
  if (validDate && convertedDate) {
    const currentYear = new Date().getFullYear();
    const dateYear = validDate.getFullYear();

    // Check if year is reasonable (between 1900 and current year + 1)
    if (dateYear < 1900 || dateYear > currentYear + 1) {
      return {
        isValid: false,
        convertedDate: '',
        error: `Year must be between 1900 and ${
          currentYear + 1
        }. Got: ${dateYear}`
      };
    }

    return {
      isValid: true,
      convertedDate,
      error: ''
    };
  }

  // If all formats failed, provide helpful error message
  const supportedFormats = [
    'YYYY-MM-DD (e.g., 2023-12-25)',
    'DD/MM/YYYY (e.g., 25/12/2023)',
    'DD-MM-YYYY (e.g., 25-12-2023)',
    'MM/DD/YYYY (e.g., 12/25/2023)',
    'MM-DD-YYYY (e.g., 12-25-2023)',
    'DD.MM.YYYY (e.g., 25.12.2023)',
    'YYYY/MM/DD (e.g., 2023/12/25)'
  ];

  return {
    isValid: false,
    convertedDate: '',
    error: `Invalid date format: "${cleanDate}". Supported formats: ${supportedFormats.join(
      ', '
    )}`
  };
};

const validateRow = async (
  row: any,
  categoryNames: string[],
  institutionMap: Map<string, { id: string; counselling_code: string }>,
  departmentsData: {
    id: string;
    department_name: string;
    institution_id: string;
  }[],
  categoryMap: Map<string, string>,
  institutionIdMap: Map<string, string>,
  departmentIdMap: Map<string, { name: string; institution_id: string }>
): Promise<ValidationResult> => {
  const errors: string[] = [];

  // Required fields
  if (!row.first_name) errors.push('First name is required');
  if (!row.last_name) errors.push('Last name is required');
  if (!row.gender) errors.push('Gender is required');
  if (!['male', 'female', 'bigender'].includes(row.gender?.toLowerCase())) {
    errors.push('Invalid gender value');
  }

  // Validate and convert date of birth
  let converted_date_of_birth = '';
  if (!row.date_of_birth) {
    errors.push('Date of birth is required');
  } else {
    const dateValidation = validateDate(row.date_of_birth);
    if (!dateValidation.isValid) {
      errors.push(`Date of birth: ${dateValidation.error}`);
    } else {
      converted_date_of_birth = dateValidation.convertedDate;
    }
  }

  if (!row.email) {
    errors.push('Email is required');
  } else if (!validateEmail(row.email)) {
    errors.push('Invalid email format');
  }

  if (row.institution_email) {
    row.institution_email = row.institution_email.toLowerCase().trim();
    if (!validateEmail(row.institution_email)) {
      errors.push('Invalid institution email format');
    }
  }

  if (!row.phone) {
    errors.push('Phone is required');
  } else if (!validatePhone(row.phone)) {
    errors.push('Invalid phone format');
  }

  // Validate and convert date of joining
  let converted_date_of_joining = '';
  if (!row.date_of_joining) {
    errors.push('Date of joining is required');
  } else {
    const dateValidation = validateDate(row.date_of_joining);
    if (!dateValidation.isValid) {
      errors.push(`Date of joining: ${dateValidation.error}`);
    } else {
      converted_date_of_joining = dateValidation.convertedDate;
    }
  }

  if (!row.designation) errors.push('Designation is required');

  // Get or validate institution
  let valid_institution_id = '';
  if (row.institution_id) {
    // Check if the institution ID is valid
    if (institutionIdMap.has(row.institution_id)) {
      valid_institution_id = row.institution_id;
    } else {
      errors.push(`Invalid institution ID: ${row.institution_id}`);
    }
  } else if (row.institution_name) {
    // Try to get institution ID from name
    if (institutionMap.has(row.institution_name)) {
      valid_institution_id = institutionMap.get(row.institution_name)?.id || '';
    } else {
      errors.push(`Invalid institution name: ${row.institution_name}`);
    }
  } else {
    errors.push('Either institution_id or institution_name is required');
  }

  // Get or validate department
  let valid_department_id = '';
  if (row.department_id) {
    // Check if the department ID is valid
    if (departmentIdMap.has(row.department_id)) {
      const dept = departmentIdMap.get(row.department_id);
      if (
        dept &&
        (valid_institution_id === '' ||
          dept.institution_id === valid_institution_id)
      ) {
        valid_department_id = row.department_id;
      } else if (valid_institution_id !== '') {
        errors.push(
          `Department ${row.department_id} does not belong to the selected institution`
        );
      }
    } else {
      errors.push(`Invalid department ID: ${row.department_id}`);
    }
  } else if (row.department_name) {
    if (valid_institution_id) {
      const validDepartment = departmentsData.find(
        (dept) =>
          dept.department_name === row.department_name &&
          dept.institution_id === valid_institution_id
      );
      if (validDepartment) {
        valid_department_id = validDepartment.id;
      } else {
        errors.push(
          `Department "${row.department_name}" not found in selected institution`
        );
      }
    } else {
      errors.push('Cannot validate department without a valid institution');
    }
  } else {
    errors.push('Either department_id or department_name is required');
  }

  // Get or validate category
  let valid_category_id = '';
  if (row.category_id) {
    // Check if the category ID is valid
    if (categoryMap.has(row.category_id)) {
      valid_category_id = row.category_id;
    } else {
      errors.push(`Invalid category ID: ${row.category_id}`);
    }
  } else if (row.category_name) {
    // Try to get category ID from name
    const categoryId = categoryNames.includes(row.category_name)
      ? [...categoryMap.entries()].find(
          ([id, name]) => name === row.category_name
        )?.[0]
      : undefined;

    if (categoryId) {
      valid_category_id = categoryId;
    } else {
      errors.push(`Invalid category name: ${row.category_name}`);
    }
  } else {
    errors.push('Either category_id or category_name is required');
  }

  // Optional field validations
  if (
    row.marital_status &&
    !['single', 'married', 'divorced', 'widow'].includes(
      row.marital_status?.toLowerCase()
    )
  ) {
    errors.push('Invalid marital status value');
  }
  if (
    row.blood_group &&
    !['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'A1+', 'A1B'].includes(
      row.blood_group
    )
  ) {
    errors.push('Invalid blood group value');
  }

  // Check for existing email within the same institution
  if (row.email && valid_institution_id) {
    try {
      // Clear any potential cached results
      const { data: existing } = await StaffService.getStaff({
        search: row.email,
        institution_id: valid_institution_id,
        limit: 1
      });

      // More precise email matching to avoid false positives
      const exactMatch = existing.find(
        (staff) =>
          staff.email.toLowerCase().trim() === row.email.toLowerCase().trim() &&
          staff.institution_id === valid_institution_id
      );

      if (exactMatch) {
        errors.push(
          `Email '${row.email}' already exists for this institution (Staff ID: ${exactMatch.staff_id})`
        );
      }
    } catch (error) {
      console.error('Error checking email existence:', error);
      // Don't fail the validation due to search errors - allow upload to proceed
      console.log(
        `Skipping email validation for ${row.email} due to search error`
      );
    }
  }

  // Check for existing staff ID
  if (row.staff_id) {
    try {
      const { data: existing } = await StaffService.getStaff({
        search: row.staff_id,
        limit: 1
      });
      if (existing.length > 0 && existing[0].staff_id === row.staff_id) {
        errors.push('Staff ID already exists');
      }
    } catch (error) {
      console.error('Error checking staff ID existence:', error);
    }
  }

  // Check for existing email across all institutions
  if (row.institution_email) {
    try {
      // Clear any potential cached results
      const { data: existing } = await StaffService.getStaff({
        search: row.institution_email,
        limit: 1
      });

      // More precise email matching to avoid false positives
      const exactMatch = existing.find(
        (staff) =>
          staff.institution_email?.toLowerCase().trim() ===
          row.institution_email.toLowerCase().trim()
      );

      if (exactMatch) {
        errors.push(
          `Institution Email '${row.institution_email}' already exists (Staff ID: ${exactMatch.staff_id})`
        );
      }
    } catch (error) {
      console.error('Error checking institution email existence:', error);
      // Don't fail the validation due to search errors - allow upload to proceed
      console.log(
        `Skipping institution email validation for ${row.institution_email} due to search error`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    valid_institution_id,
    valid_department_id,
    valid_category_id,
    converted_date_of_birth,
    converted_date_of_joining
  };
};

export default function BulkUploadStaff() {
  const [isOpen, setIsOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Add cache clearing function to prevent validation issues
  const clearValidationCache = () => {
    // Clear any potential client-side cache
    if (typeof window !== 'undefined') {
      // Force React Query cache invalidation
      router.refresh();
    }
  };

  useEffect(() => {
    if (!isOpen && uploadSuccess) {
      setUploadSuccess(false);
      // Remove router.refresh() - React Query will handle data refresh automatically
    }
  }, [isOpen, uploadSuccess]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx')) {
      toast.error('Please upload an Excel (.xlsx) file');
      return;
    }

    setSelectedFile(file);
    await processFile(file);
  };

  const processFile = async (file: File) => {
    try {
      // Load validation data
      const [categoriesResult, institutions, departmentsData] =
        await Promise.all([
          CategoryService.getCategories({ isActive: true, limit: 100 }),
          OrganizationService.getInstitutionNames(true),
          DepartmentService.getDepartments({ isActive: true, limit: 1000 })
        ]);

      // Create category maps
      const categoryNames = categoriesResult.data.map(
        (cat) => cat.category_name
      );
      const categoryMap = new Map(
        categoriesResult.data.map((cat) => [cat.id, cat.category_name])
      );
      const categoryNameToIdMap = new Map(
        categoriesResult.data.map((cat) => [cat.category_name, cat.id])
      );

      // Create institution maps
      const institutionMap = new Map(
        institutions.map((inst) => [
          inst.name,
          { id: inst.id, counselling_code: inst.counselling_code }
        ])
      );
      const institutionIdMap = new Map(
        institutions.map((inst) => [inst.id, inst.name])
      );

      // Create department maps
      const departmentIdMap = new Map(
        departmentsData.data.map((dept) => [
          dept.id,
          { name: dept.department_name, institution_id: dept.institution_id }
        ])
      );

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Check if file is empty
      if (jsonData.length === 0) {
        toast.error('The uploaded file contains no data');
        return;
      }

      // Show a toast message for the user while validation is in progress
      toast.loading('Validating data...');

      // Validate each row
      const validatedData = await Promise.all(
        jsonData.map(async (row: any, index) => {
          const validation = await validateRow(
            row,
            categoryNames,
            institutionMap,
            departmentsData.data,
            categoryMap,
            institutionIdMap,
            departmentIdMap
          );

          return {
            ...row,
            rowNumber: index + 2, // Excel row number (1-indexed, with header)
            isValid: validation.isValid,
            errors: validation.errors,
            // Use validated IDs
            institution_id: validation.valid_institution_id || '',
            department_id: validation.valid_department_id || '',
            category_id: validation.valid_category_id || '',
            // Keep reference to name fields for display purposes
            institution_name:
              row.institution_name ||
              institutionIdMap.get(row.institution_id) ||
              '',
            department_name:
              row.department_name ||
              departmentIdMap.get(row.department_id)?.name ||
              '',
            category_name:
              row.category_name || categoryMap.get(row.category_id) || '',
            converted_date_of_birth: validation.converted_date_of_birth,
            converted_date_of_joining: validation.converted_date_of_joining
          };
        })
      );

      // Check for duplicate staff IDs within the uploaded data
      const staffIdCounts = new Map<string, number[]>();
      validatedData.forEach((row, index) => {
        if (row.staff_id && row.staff_id.trim()) {
          const staffId = row.staff_id.trim().toLowerCase();
          if (!staffIdCounts.has(staffId)) {
            staffIdCounts.set(staffId, []);
          }
          staffIdCounts.get(staffId)!.push(row.rowNumber);
        }
      });

      // Mark duplicate staff IDs as invalid
      validatedData.forEach((row) => {
        if (row.staff_id && row.staff_id.trim()) {
          const staffId = row.staff_id.trim().toLowerCase();
          const occurrences = staffIdCounts.get(staffId) || [];
          if (occurrences.length > 1) {
            row.isValid = false;
            row.errors.push(
              `Duplicate staff ID found in rows: ${occurrences.join(', ')}`
            );
          }
        }
      });

      // Check for duplicate emails within the uploaded data (per institution)
      const emailInstitutionCounts = new Map<string, number[]>();
      validatedData.forEach((row) => {
        if (row.email && row.email.trim() && row.institution_id) {
          const emailInstitutionKey = `${row.email.trim().toLowerCase()}|${
            row.institution_id
          }`;
          if (!emailInstitutionCounts.has(emailInstitutionKey)) {
            emailInstitutionCounts.set(emailInstitutionKey, []);
          }
          emailInstitutionCounts.get(emailInstitutionKey)!.push(row.rowNumber);
        }
      });

      // Mark duplicate email+institution combinations as invalid
      validatedData.forEach((row) => {
        if (row.email && row.email.trim() && row.institution_id) {
          const emailInstitutionKey = `${row.email.trim().toLowerCase()}|${
            row.institution_id
          }`;
          const occurrences =
            emailInstitutionCounts.get(emailInstitutionKey) || [];
          if (occurrences.length > 1) {
            row.isValid = false;
            row.errors.push(
              `Duplicate email for this institution found in rows: ${occurrences.join(
                ', '
              )}`
            );
          }
        }
      });

      // Remove loading toast
      toast.dismiss();

      // Show validation summary
      const validCount = validatedData.filter((row) => row.isValid).length;
      const invalidCount = validatedData.length - validCount;

      if (invalidCount > 0) {
        toast.error(
          `Found ${invalidCount} invalid records. Please review before uploading.`
        );
      } else {
        toast.success(`All ${validCount} records are valid. Ready to upload.`);
      }

      setPreviewData(validatedData);
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Error processing file. Please check the file format.');
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setPreviewData([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    try {
      setIsUploading(true);
      setUploadSuccess(false);

      // Filter valid rows
      const validRows = previewData.filter((row) => row.isValid);

      if (validRows.length === 0) {
        toast.error('No valid data to upload');
        return;
      }

      // Process rows in batches
      const batchSize = 50;
      const batches = [];
      for (let i = 0; i < validRows.length; i += batchSize) {
        batches.push(validRows.slice(i, i + batchSize));
      }

      let successCount = 0;
      let errorCount = 0;
      const errorDetails: string[] = [];

      // Dismiss any existing toasts to prevent individual success messages
      toast.dismiss();

      for (const batch of batches) {
        const promises = batch.map((row) => {
          // Validate IDs one more time as a safeguard
          if (!row.category_id || !row.institution_id || !row.department_id) {
            errorCount++;
            errorDetails.push(`Row ${row.rowNumber}: Missing required IDs`);
            return Promise.resolve(); // Skip this row
          }

          const staffData = {
            first_name: row.first_name,
            last_name: row.last_name,
            gender: row.gender.toLowerCase(),
            date_of_birth: row.converted_date_of_birth || row.date_of_birth,
            marital_status: row.marital_status?.toLowerCase(),
            blood_group: row.blood_group,
            email: row.email,
            institution_email: row.institution_email || row.email,
            phone: row.phone,
            staff_id: row.staff_id,
            profile_picture: row.profile_picture || '',
            address: row.address,
            state: row.state,
            district: row.district,
            pincode: row.pincode,
            date_of_joining:
              row.converted_date_of_joining || row.date_of_joining,
            designation: row.designation,
            category_id: row.category_id,
            institution_id: row.institution_id,
            department_id: row.department_id,
            is_active: row.is_active === 'false' ? false : true
          };

          return StaffService.createStaff(staffData, true) // suppressToast = true for bulk upload
            .then(() => {
              successCount++;
              // Individual toasts are now suppressed at service level
            })
            .catch((error) => {
              console.error(
                `Error creating staff at row ${row.rowNumber}:`,
                error
              );
              errorCount++;

              // Handle specific database constraint errors
              let errorMessage = 'Unknown error';
              if (error && typeof error === 'object' && error.message) {
                const msg = error.message.toLowerCase();

                if (msg.includes('staff_institution_email_key')) {
                  errorMessage = `Email '${row.email}' already exists for this institution`;
                } else if (msg.includes('staff_staff_id_key')) {
                  errorMessage = `Staff ID '${row.staff_id}' already exists`;
                } else if (
                  msg.includes('duplicate key value violates unique constraint')
                ) {
                  // Extract constraint name for better error messages
                  const constraintMatch = error.message.match(/"([^"]+)"/);
                  if (constraintMatch) {
                    const constraint = constraintMatch[1];
                    if (constraint.includes('email')) {
                      errorMessage = `Email already exists`;
                    } else if (constraint.includes('staff_id')) {
                      errorMessage = `Staff ID already exists`;
                    } else {
                      errorMessage = `Duplicate data violates database constraint`;
                    }
                  } else {
                    errorMessage = 'Duplicate data found';
                  }
                } else {
                  errorMessage = error.message;
                }
              }

              errorDetails.push(`Row ${row.rowNumber}: ${errorMessage}`);
              // Individual toasts are now suppressed at service level
            });
        });

        await Promise.all(promises);
      }

      // Show detailed error report if any errors occurred
      if (errorCount > 0) {
        console.error('Upload errors:', errorDetails);

        // Special handling for many duplicate emails
        const duplicateEmailErrors = errorDetails.filter((detail) =>
          detail.includes('already exists for this institution')
        );

        if (duplicateEmailErrors.length > 10) {
          toast.error(
            `Found ${duplicateEmailErrors.length} duplicate emails for this institution. Please export existing staff data to compare and remove duplicates from your file.`,
            { duration: 8000 }
          );
        } else if (errorDetails.length <= 3) {
          toast.error(
            `Uploaded ${successCount} staff members. ${errorCount} failed: ${errorDetails.join(
              '; '
            )}`
          );
        } else {
          toast.error(
            `Uploaded ${successCount} staff members. ${errorCount} failed. See console for details.`
          );
        }
      } else {
        toast.success(`Successfully uploaded ${successCount} staff members.`);
      }

      // Set upload success flag if any staff were successfully uploaded
      if (successCount > 0) {
        setUploadSuccess(true);

        // Close dialog immediately without router.refresh()
        // The parent component will handle data refresh via React Query
        setIsOpen(false);
        clearFile();
      } else {
        setIsOpen(false);
        clearFile();
      }
    } catch (error) {
      console.error('Error uploading staff:', error);
      toast.error('Error uploading staff members');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDialogChange = (open: boolean) => {
    setIsOpen(open);
    // Remove router.refresh() - React Query will handle data refresh automatically
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogTrigger asChild>
        <Button variant='outline' className='w-full sm:w-auto'>
          <Upload className='mr-2 h-4 w-4' />
          Bulk Upload
        </Button>
      </DialogTrigger>
      <DialogContent className='w-[95vw] max-w-6xl h-[90vh] flex flex-col p-0'>
        <DialogHeader className='px-4 py-3 border-b bg-muted/50 rounded-t-lg'>
          <DialogTitle className='text-lg sm:text-xl'>
            Staff Bulk Upload
          </DialogTitle>
          <p className='text-sm text-muted-foreground'>
            Upload staff data from Excel file (.xlsx format)
          </p>
        </DialogHeader>

        <div className='flex-1 overflow-hidden flex flex-col'>
          {!selectedFile ? (
            // File Upload Section
            <div className='flex-1 flex items-center justify-center p-6'>
              <div className='flex flex-col items-center justify-center max-w-md mx-auto text-center space-y-4'>
                <input
                  type='file'
                  accept='.xlsx'
                  onChange={handleFileSelect}
                  className='hidden'
                  ref={fileInputRef}
                />
                <div className='w-16 h-16 bg-muted rounded-full flex items-center justify-center'>
                  <Upload className='h-8 w-8 text-muted-foreground' />
                </div>
                <div className='space-y-2'>
                  <h3 className='text-lg font-medium'>Upload Excel File</h3>
                  <p className='text-sm text-muted-foreground'>
                    Select a .xlsx file containing staff data
                  </p>
                </div>
                <Button
                  size='lg'
                  onClick={() => fileInputRef.current?.click()}
                  className='w-full max-w-xs'
                >
                  <Upload className='mr-2 h-4 w-4' />
                  Choose File
                </Button>
                <p className='text-xs text-muted-foreground'>
                  Only Excel (.xlsx) files are supported
                </p>
              </div>
            </div>
          ) : (
            // File Preview Section
            <div className='flex-1 flex flex-col overflow-hidden'>
              {/* File Info Header */}
              <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b bg-muted/25'>
                <div className='flex items-center space-x-3 min-w-0'>
                  <FileText className='h-5 w-5 text-muted-foreground flex-shrink-0' />
                  <div className='min-w-0'>
                    <p className='text-sm font-medium truncate'>
                      {selectedFile.name}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {previewData.length} row
                      {previewData.length !== 1 ? 's' : ''} found
                      {previewData.length > 0 && (
                        <>
                          {' • '}
                          <span className='text-green-600'>
                            {previewData.filter((row) => row.isValid).length}{' '}
                            valid
                          </span>
                          {' • '}
                          <span className='text-red-600'>
                            {previewData.filter((row) => !row.isValid).length}{' '}
                            invalid
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={clearFile}
                  className='flex-shrink-0'
                >
                  <X className='h-4 w-4 mr-2' />
                  Clear File
                </Button>
              </div>

              {/* Table Section */}
              <div className='flex-1 overflow-auto'>
                {previewData.length === 0 ? (
                  <div className='flex items-center justify-center h-32'>
                    <p className='text-muted-foreground'>Processing file...</p>
                  </div>
                ) : (
                  <div className='overflow-auto'>
                    {/* Mobile View - Card Layout */}
                    <div className='block md:hidden space-y-3 p-4'>
                      {previewData.map((row) => (
                        <div
                          key={row.rowNumber}
                          className={`border rounded-lg p-4 space-y-3 ${
                            row.isValid
                              ? 'border-green-200 bg-green-50'
                              : 'border-red-200 bg-red-50'
                          }`}
                        >
                          <div className='flex items-center justify-between'>
                            <span className='text-sm font-medium'>
                              Row {row.rowNumber}
                            </span>
                            <Badge
                              variant={row.isValid ? 'default' : 'destructive'}
                            >
                              {row.isValid ? 'Valid' : 'Invalid'}
                            </Badge>
                          </div>

                          <div className='grid grid-cols-1 gap-2 text-sm'>
                            <div>
                              <span className='font-medium'>Name: </span>
                              <span>{`${row.first_name} ${row.last_name}`}</span>
                            </div>
                            <div>
                              <span className='font-medium'>Email: </span>
                              <span className='break-all'>{row.email}</span>
                            </div>
                            <div>
                              <span className='font-medium'>Institution: </span>
                              <span className='break-words'>
                                {row.institution_name}
                              </span>
                            </div>
                            <div>
                              <span className='font-medium'>Department: </span>
                              <span className='break-words'>
                                {row.department_name}
                              </span>
                            </div>
                            <div>
                              <span className='font-medium'>Category: </span>
                              <span className='break-words'>
                                {row.category_name}
                              </span>
                            </div>

                            {row.errors && row.errors.length > 0 && (
                              <div className='mt-2 p-2 bg-red-100 rounded text-red-700 text-xs'>
                                <span className='font-medium'>Errors: </span>
                                <div className='mt-1 space-y-1'>
                                  {row.errors.map(
                                    (error: string, index: number) => (
                                      <div key={index}>• {error}</div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
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
                              Name
                            </TableHead>
                            <TableHead className='min-w-[200px]'>
                              Email
                            </TableHead>
                            <TableHead className='min-w-[180px]'>
                              Institution
                            </TableHead>
                            <TableHead className='min-w-[150px]'>
                              Department
                            </TableHead>
                            <TableHead className='min-w-[120px]'>
                              Category
                            </TableHead>
                            <TableHead className='w-20'>Status</TableHead>
                            <TableHead className='min-w-[250px]'>
                              Errors
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewData.map((row) => (
                            <TableRow
                              key={row.rowNumber}
                              className={row.isValid ? '' : 'bg-red-50'}
                            >
                              <TableCell className='font-medium'>
                                {row.rowNumber}
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[160px]'>
                                  <p className='truncate'>{`${row.first_name} ${row.last_name}`}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[200px]'>
                                  <p className='truncate'>{row.email}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[180px]'>
                                  <p className='truncate'>
                                    {row.institution_name}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[150px]'>
                                  <p className='truncate'>
                                    {row.department_name}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[120px]'>
                                  <p className='truncate'>
                                    {row.category_name}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    row.isValid ? 'default' : 'destructive'
                                  }
                                  className='text-xs'
                                >
                                  {row.isValid ? 'Valid' : 'Invalid'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className='max-w-[250px]'>
                                  {row.errors && row.errors.length > 0 ? (
                                    <div className='space-y-1'>
                                      {row.errors.map(
                                        (error: string, index: number) => (
                                          <p
                                            key={index}
                                            className='text-xs text-red-600 break-words'
                                          >
                                            • {error}
                                          </p>
                                        )
                                      )}
                                    </div>
                                  ) : (
                                    <span className='text-xs text-muted-foreground'>
                                      No errors
                                    </span>
                                  )}
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

        {/* Footer Actions */}
        <div className='border-t bg-muted/50 p-4'>
          <div className='flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center'>
            {/* Summary */}
            {selectedFile && previewData.length > 0 && (
              <div className='text-sm text-muted-foreground'>
                <span className='block sm:inline'>
                  Total: {previewData.length} rows
                </span>
                <span className='block sm:inline sm:ml-4'>
                  Valid:{' '}
                  <span className='text-green-600 font-medium'>
                    {previewData.filter((row) => row.isValid).length}
                  </span>
                </span>
                <span className='block sm:inline sm:ml-4'>
                  Invalid:{' '}
                  <span className='text-red-600 font-medium'>
                    {previewData.filter((row) => !row.isValid).length}
                  </span>
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className='flex flex-col sm:flex-row gap-2 w-full sm:w-auto'>
              <Button
                variant='outline'
                onClick={() => {
                  setIsOpen(false);
                  clearFile();
                }}
                disabled={isUploading}
                className='w-full sm:w-auto'
              >
                Cancel
              </Button>
              {selectedFile && previewData.some((row) => row.isValid) && (
                <Button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className='w-full sm:w-auto'
                >
                  {isUploading ? (
                    <>
                      <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2'></div>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className='mr-2 h-4 w-4' />
                      Upload {
                        previewData.filter((row) => row.isValid).length
                      }{' '}
                      Valid Row
                      {previewData.filter((row) => row.isValid).length !== 1
                        ? 's'
                        : ''}
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
