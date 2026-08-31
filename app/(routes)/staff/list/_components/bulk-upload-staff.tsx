'use client';
/**
 * BulkUploadStaff Component
 *
 * This component handles bulk upload of staff data from Excel files.
 *
 * KEY VALIDATION RULES:
 * - Email + Institution combination must be unique (enforced by database constraint 'staff_institution_email_key')
 * - Staff ID is NOT taken from the sheet. Since 2026-08-28 trg_staff_autonumber generates it
 *   on insert (DCH001 teaching / NOTDCH001 non-teaching) and discards any supplied value.
 * - Same email can exist for different institutions, but not within the same institution
 *
 * VALIDATION PROCESS:
 * 1. Pre-upload validation checks for duplicates within the file and against existing database records
 * 2. Institution-specific email validation prevents constraint violations
 * 3. Clear error messages guide users to fix data issues before upload
 */


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
import { normalizeStaffName } from '@/lib/utils/staff-name';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { RoleService } from '@/lib/services/roles/role-service';
import {
  validateEmail,
  validatePhone,
  parseFlexibleDate as validateDate
} from '@/lib/utils/staff-field-validators';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  valid_institution_id: string;
  valid_department_id: string;
  valid_category_id: string;
  valid_role_key: string;
  converted_date_of_birth?: string;
  converted_date_of_joining?: string;
  login_enabled: boolean;
}

// Updated: 2026-04-16 — Narrowed blocklist to only 'student' and 'guest' per user request.
// Students are onboarded via the learners module (not staff), and 'guest' is a placeholder.
// SECURITY NOTE: privileged roles (super_admin, administrator, admission, counselor) are
// now assignable via bulk upload. Treat the bulk upload dialog as a privileged action —
// gate page-level access behind super_admin/admin and audit upload history.
const RESERVED_BULK_ROLE_KEYS = new Set([
  'student',
  'guest'
]);

// View-only / labour staff use synthetic emails at this domain. The bulk-upload
// must reject any user-supplied @nolog.jkkn.local value — those are generated
// server-side only and accepting them from a spreadsheet would let users forge
// uniqueness collisions or bypass the OAuth gate.
const NOLOG_DOMAIN = 'nolog.jkkn.local';

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
  departmentIdMap: Map<string, { name: string; institution_id: string }>,
  // Added: 2026-04-14 - look up categories by id to check is_teaching
  categoryTeachingMap: Map<string, boolean>,
  // Added: 2026-04-14 - valid role_keys (from custom_roles)
  validRoleKeys: Set<string>,
  // Added: 2026-05-15 - per-category login default for view-only staff
  categoryAllowsLoginMap: Map<string, boolean>
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

  // Note: loginEnabled is resolved AFTER category resolution below, but the
  // existing flow validates email BEFORE category. We defer the actual email
  // required-check until after we know the category, then push errors. For
  // format-only checks we can do them now since they apply to any non-empty value.
  if (row.email && !validateEmail(row.email)) {
    errors.push('Invalid email format');
  }
  if (row.email && String(row.email).toLowerCase().trim().endsWith(`@${NOLOG_DOMAIN}`)) {
    errors.push(`Cannot manually provide a @${NOLOG_DOMAIN} email — leave blank for view-only staff`);
  }

  if (row.institution_email) {
    row.institution_email = row.institution_email.toLowerCase().trim();
    if (row.institution_email.endsWith(`@${NOLOG_DOMAIN}`)) {
      errors.push(`Cannot manually provide a @${NOLOG_DOMAIN} institution email — leave blank for view-only staff`);
    } else if (!validateEmail(row.institution_email)) {
      errors.push('Invalid institution email format');
    } else if (!row.institution_email.endsWith('@jkkn.ac.in')) {
      errors.push('Institution email must use @jkkn.ac.in domain (e.g., staff@jkkn.ac.in)');
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

  // Get or validate category (RESOLVED FIRST so we know is_teaching for dept check)
  let valid_category_id = '';
  if (row.category_id) {
    if (categoryMap.has(row.category_id)) {
      valid_category_id = row.category_id;
    } else {
      errors.push(`Invalid category ID: ${row.category_id}`);
    }
  } else if (row.category_name) {
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

  const isTeachingRow = valid_category_id
    ? categoryTeachingMap.get(valid_category_id) === true
    : false;

  // Resolve login_enabled: explicit row override → category default → true.
  // For view-only rows (login_enabled=false) the server generates synthetic
  // @nolog.jkkn.local emails when the input emails are blank, so we don't
  // require them here. For login-enabled rows, both emails must be present.
  // Added: 2026-05-15
  const categoryAllowsLogin = valid_category_id
    ? categoryAllowsLoginMap.get(valid_category_id) ?? true
    : true;
  const loginEnabledRaw = String(row.login_enabled ?? '').toLowerCase().trim();
  const loginEnabled =
    loginEnabledRaw === ''
      ? categoryAllowsLogin
      : loginEnabledRaw === 'true' || loginEnabledRaw === '1' || loginEnabledRaw === 'yes';

  if (loginEnabled) {
    if (!row.email) {
      errors.push('Email is required for login-enabled staff');
    }
    // institution_email stays optional even for login-enabled (existing behaviour):
    // the service falls back to email when not provided.
  }
  // For !loginEnabled, no email is required — synthetic emails are generated server-side.

  // Get or validate department — REQUIRED only for teaching categories.
  let valid_department_id = '';
  if (row.department_id) {
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
  } else if (isTeachingRow) {
    // Only teaching categories require a department.
    errors.push('Either department_id or department_name is required for teaching staff');
  }

  // If non-teaching, drop any supplied department_id (DB trigger will also clear it).
  if (!isTeachingRow) {
    valid_department_id = '';
  }

  // Validate role_key — REQUIRED, must exist, must not be reserved.
  let valid_role_key = '';
  if (!row.role_key) {
    errors.push('role_key is required');
  } else {
    const rk = String(row.role_key).trim();
    if (RESERVED_BULK_ROLE_KEYS.has(rk)) {
      errors.push(`Role "${rk}" cannot be assigned via staff bulk upload`);
    } else if (!validRoleKeys.has(rk)) {
      errors.push(`Invalid role_key: "${rk}"`);
    } else {
      valid_role_key = rk;
    }
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

  // No Staff ID check: since 2026-08-28 the database generates it on insert and
  // ignores anything supplied, so a sheet value can neither collide nor be used.
  // This block used to cost one extra query per row to validate a field that is
  // now discarded.

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
    valid_role_key,
    converted_date_of_birth,
    converted_date_of_joining,
    login_enabled: loginEnabled
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
      const [categoriesResult, institutions, departmentsData, rolesData] =
        await Promise.all([
          CategoryService.getCategories({ isActive: true, limit: 100 }),
          // Updated: 2026-04-16 — Pass entityType='all' so staff can be uploaded
          // against companies and offices (e.g., 'Jicate Solutions'), not just
          // educational institutions. The institutions table stores three entity
          // types and staff legitimately work at all three.
          OrganizationService.getInstitutionNames(true, undefined, 'all'),
          DepartmentService.getDepartments({ isActive: true, limit: 1000 }),
          RoleService.getStaffAssignableRoles()
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
      // Added: 2026-04-14 - is_teaching lookup + role_key allow-list
      const categoryTeachingMap = new Map<string, boolean>(
        categoriesResult.data.map((cat) => [cat.id, (cat as any).is_teaching === true])
      );
      // Added: 2026-05-15 - per-category login default for view-only staff.
      // Categories where allows_login=false make new staff default to login_enabled=false.
      const categoryAllowsLoginMap = new Map<string, boolean>(
        categoriesResult.data.map((cat) => [cat.id, (cat as any).allows_login !== false])
      );
      const validRoleKeys = new Set<string>(rolesData.map((r) => r.role_key));

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

      // Pick the data sheet, not the prose sheet. The downloaded template ships
      // with sheets in this order: [Instructions, Format Examples, Template,
      // Filled Example]. Reading SheetNames[0] grabs Instructions and produces
      // rows with no recognizable headers, causing every required-field
      // validation to fire on every row.
      const REQUIRED_HEADER = 'first_name';
      const pickDataSheet = (): XLSX.WorkSheet => {
        const named = ['Template', 'Filled Example'];
        for (const name of named) {
          if (workbook.Sheets[name]) {
            const headers = (XLSX.utils.sheet_to_json(workbook.Sheets[name], {
              header: 1
            })[0] ?? []) as string[];
            if (headers.includes(REQUIRED_HEADER)) return workbook.Sheets[name];
          }
        }
        for (const name of workbook.SheetNames) {
          const sheet = workbook.Sheets[name];
          const headers = (XLSX.utils.sheet_to_json(sheet, {
            header: 1
          })[0] ?? []) as string[];
          if (headers.includes(REQUIRED_HEADER)) return sheet;
        }
        return workbook.Sheets[workbook.SheetNames[0]];
      };

      const worksheet = pickDataSheet();
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const firstRowKeys = jsonData[0] ? Object.keys(jsonData[0] as object) : [];
      if (jsonData.length > 0 && !firstRowKeys.includes(REQUIRED_HEADER)) {
        toast.error(
          'Could not find a data sheet with the expected columns. Make sure your file has a "Template" sheet (or a sheet whose first row contains "first_name", "last_name", etc.). Re-download the template if unsure.'
        );
        return;
      }

      // Check if file is empty
      if (jsonData.length === 0) {
        toast.error('The uploaded file contains no data');
        return;
      }

      // Show a toast message for the user while validation is in progress
      toast.loading('Validating data...');

      // Validate each row
      const validatedData = await Promise.all(
        jsonData.map(async (rawRow: any, index) => {
          // Canonicalise names BEFORE validation and preview so the operator
          // sees exactly what will be stored. The DB normalises regardless
          // (trg_normalize_staff_names), so without this the preview would
          // show "Anil Kumar " and the saved record "ANIL KUMAR" — a silent
          // mismatch the user only discovers after importing.
          const row: any = {
            ...rawRow,
            first_name: normalizeStaffName(rawRow.first_name),
            last_name: normalizeStaffName(rawRow.last_name),
          };
          const validation = await validateRow(
            row,
            categoryNames,
            institutionMap,
            departmentsData.data,
            categoryMap,
            institutionIdMap,
            departmentIdMap,
            categoryTeachingMap,
            validRoleKeys,
            categoryAllowsLoginMap
          );

          return {
            ...row,
            rowNumber: index + 2, // Excel row number (1-indexed, with header)
            isValid: validation.isValid,
            errors: validation.errors,
            // Use validated IDs
            institution_id: validation.valid_institution_id || '',
            department_id: validation.valid_department_id || null,
            category_id: validation.valid_category_id || '',
            role_key: validation.valid_role_key || '',
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
            converted_date_of_joining: validation.converted_date_of_joining,
            // 2026-05-15: propagate login_enabled so handleUpload can forward
            // it to the service layer (where synthetic emails are generated).
            login_enabled: validation.login_enabled
          };
        })
      );

      // Two rows can no longer claim the same Staff ID: the database issues each
      // one from a per-institution counter, so duplicates within the file are
      // impossible by construction.

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
      // Surface the actual error so users (and support) know what went wrong.
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('auth') || msg.includes('Auth') || msg.includes('401')) {
        toast.error('Authentication error — please refresh the page and try again.');
      } else if (msg.includes('permission') || msg.includes('row-level security')) {
        toast.error('Permission error — you may not have access to load reference data. Contact admin.');
      } else if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
        toast.error('Network error — check your connection and try again.');
      } else {
        toast.error(`Error processing file: ${msg.slice(0, 200)}`);
      }
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
          // Updated: 2026-04-16 — department_id is legitimately null for non-teaching
          // staff (validation drops it when category is not teaching). Only gate on
          // category_id + institution_id here; earlier validation already enforced
          // department-required-for-teaching.
          if (!row.category_id || !row.institution_id) {
            errorCount++;
            errorDetails.push(`Row ${row.rowNumber}: Missing required IDs`);
            return Promise.resolve(); // Skip this row
          }

          // 2026-05-15: for view-only rows, leave email + institution_email
          // blank so the service generates synthetic @nolog.jkkn.local values
          // deterministically (re-uploads stay idempotent). For login-enabled
          // rows, keep the historical fallback (institution_email defaults to
          // email when not provided).
          const isViewOnly = row.login_enabled === false;
          const staffData = {
            first_name: row.first_name,
            last_name: row.last_name,
            gender: row.gender.toLowerCase(),
            date_of_birth: row.converted_date_of_birth || row.date_of_birth,
            marital_status: row.marital_status?.toLowerCase(),
            blood_group: row.blood_group,
            email: isViewOnly ? (row.email || undefined) : row.email,
            // Institution email is optional for ALL staff (BUG-003989).
            // Don't fall back to personal email — it won't be @jkkn.ac.in.
            institution_email: row.institution_email || undefined,
            phone: row.phone,
            // staff_id deliberately absent — trg_staff_autonumber issues it.
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
            // Fixed: 2026-04-16 — role_key was validated but never forwarded to
            // StaffService.createStaff, causing every bulk-upload row to fail with
            // "role_key is required" even though the CSV column was valid.
            role_key: row.role_key,
            is_active: row.is_active === 'false' ? false : true,
            // 2026-05-15: per-row override for view-only labour staff
            login_enabled: row.login_enabled
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
                  // Unreachable in normal operation — the generator checks the
                  // code is free before returning it. Kept so the constraint
                  // never surfaces as "Unknown error" if that ever changes.
                  errorMessage = 'Generated Staff ID collided; please retry this row';
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
      }
      // When ALL rows fail, keep the dialog open so the user can see
      // validation details and fix data before retrying (BUG-003890).
    } catch (error) {
      console.error('Error uploading staff:', error);
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`Upload failed: ${msg.slice(0, 200)}`);
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
