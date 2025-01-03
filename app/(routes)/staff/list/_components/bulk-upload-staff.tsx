'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
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
}

const validateEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const validatePhone = (phone: string) => {
  return /^\+?[\d\s-()]{10,}$/.test(phone);
};

const validateDate = (date: string) => {
  if (!date) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(date)) return false;
  const d = new Date(date);
  return d instanceof Date && !isNaN(d.getTime());
};

const validateRow = async (
  row: any,
  categoryNames: string[],
  institutionMap: Map<string, { id: string; counselling_code: string }>,
  departmentsData: {
    id: string;
    department_name: string;
    institution_id: string;
  }[]
): Promise<ValidationResult> => {
  const errors: string[] = [];

  // Required fields
  if (!row.first_name) errors.push('First name is required');
  if (!row.last_name) errors.push('Last name is required');
  if (!row.gender) errors.push('Gender is required');
  if (!['male', 'female', 'bigender'].includes(row.gender?.toLowerCase())) {
    errors.push('Invalid gender value');
  }
  if (!row.date_of_birth) {
    errors.push('Date of birth is required');
  } else if (!validateDate(row.date_of_birth)) {
    errors.push('Invalid date of birth format (use YYYY-MM-DD)');
  }
  if (!row.email) {
    errors.push('Email is required');
  } else if (!validateEmail(row.email)) {
    errors.push('Invalid email format');
  }
  if (!row.phone) {
    errors.push('Phone is required');
  } else if (!validatePhone(row.phone)) {
    errors.push('Invalid phone format');
  }
  if (!row.date_of_joining) {
    errors.push('Date of joining is required');
  } else if (!validateDate(row.date_of_joining)) {
    errors.push('Invalid date of joining format (use YYYY-MM-DD)');
  }
  if (!row.designation) errors.push('Designation is required');

  // Institution validation
  if (!row.institution_name) {
    errors.push('Institution name is required');
  } else if (!institutionMap.has(row.institution_name)) {
    errors.push('Invalid institution name');
  }

  // Department validation
  if (!row.department_name) {
    errors.push('Department name is required');
  } else {
    const institution = institutionMap.get(row.institution_name);
    if (institution) {
      const validDepartment = departmentsData.find(
        (dept) =>
          dept.department_name === row.department_name &&
          dept.institution_id === institution.id
      );
      if (!validDepartment) {
        errors.push(
          `Department ${row.department_name} not found in institution ${row.institution_name}`
        );
      }
    }
  }

  // Category validation
  if (!row.category_name) {
    errors.push('Category name is required');
  } else if (!categoryNames.includes(row.category_name)) {
    errors.push('Invalid category name');
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
    !['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(
      row.blood_group
    )
  ) {
    errors.push('Invalid blood group value');
  }

  // Check for existing email
  if (row.email) {
    try {
      const { data: existing } = await StaffService.getStaff({
        search: row.email,
        limit: 1
      });
      if (
        existing.length > 0 &&
        existing[0].email.toLowerCase() === row.email.toLowerCase()
      ) {
        errors.push('Email already exists');
      }
    } catch (error) {
      console.error('Error checking email existence:', error);
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

  return {
    isValid: errors.length === 0,
    errors
  };
};

export default function BulkUploadStaff() {
  const [isOpen, setIsOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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

      const categoryNames = categoriesResult.data.map(
        (cat) => cat.category_name
      );
      const institutionMap = new Map(
        institutions.map((inst) => [
          inst.name,
          { id: inst.id, counselling_code: inst.counselling_code }
        ])
      );

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Validate each row
      const validatedData = await Promise.all(
        jsonData.map(async (row: any, index) => {
          const validation = await validateRow(
            row,
            categoryNames,
            institutionMap,
            departmentsData.data
          );

          // Get IDs if row is valid
          let institution_id = '';
          let department_id = '';

          if (validation.isValid) {
            const institution = institutionMap.get(row.institution_name);
            if (institution) {
              institution_id = institution.id;
              const department = departmentsData.data.find(
                (dept) =>
                  dept.department_name === row.department_name &&
                  dept.institution_id === institution.id
              );
              if (department) {
                department_id = department.id;
              }
            }
          }

          return {
            ...row,
            rowNumber: index + 2,
            isValid: validation.isValid,
            errors: validation.errors,
            institution_id,
            department_id
          };
        })
      );

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

      // Filter valid rows
      const validRows = previewData.filter((row) => row.isValid);

      if (validRows.length === 0) {
        toast.error('No valid data to upload');
        return;
      }

      // Get categories map for ID lookup
      const { data: categories } = await CategoryService.getCategories({
        isActive: true,
        limit: 100
      });
      const categoryMap = new Map(
        categories.map((cat) => [cat.category_name, cat.id])
      );

      // Process rows in batches
      const batchSize = 50;
      const batches = [];
      for (let i = 0; i < validRows.length; i += batchSize) {
        batches.push(validRows.slice(i, i + batchSize));
      }

      let successCount = 0;
      let errorCount = 0;

      for (const batch of batches) {
        const promises = batch.map((row) => {
          const categoryId = categoryMap.get(row.category_name);
          if (!categoryId) {
            errorCount++;
            return Promise.reject(
              new Error(`Category not found: ${row.category_name}`)
            );
          }

          const staffData = {
            first_name: row.first_name,
            last_name: row.last_name,
            gender: row.gender.toLowerCase(),
            date_of_birth: row.date_of_birth,
            marital_status: row.marital_status?.toLowerCase(),
            blood_group: row.blood_group,
            email: row.email,
            phone: row.phone,
            staff_id: row.staff_id,
            address: row.address,
            state: row.state,
            district: row.district,
            pincode: row.pincode,
            date_of_joining: row.date_of_joining,
            designation: row.designation,
            category_id: categoryId,
            institution_id: row.institution_id,
            department_id: row.department_id,
            is_active: true
          };

          return StaffService.createStaff(staffData)
            .then(() => {
              successCount++;
            })
            .catch((error) => {
              console.error('Error creating staff:', error);
              errorCount++;
            });
        });

        await Promise.all(promises);
      }

      toast.success(
        `Successfully uploaded ${successCount} staff members. ${errorCount} failed.`
      );
      setIsOpen(false);
      clearFile();
      router.refresh();
    } catch (error) {
      console.error('Error uploading staff:', error);
      toast.error('Error uploading staff members');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' className='w-full sm:w-auto'>
          <Upload className='mr-2 h-4 w-4' />
          Bulk Upload
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-4xl max-h-[80vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Preview Bulk Upload</DialogTitle>
        </DialogHeader>

        <div className='mt-4'>
          {!selectedFile ? (
            <div className='flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg'>
              <input
                type='file'
                accept='.xlsx'
                onChange={handleFileSelect}
                className='hidden'
                ref={fileInputRef}
              />
              <Upload className='h-8 w-8 mb-4 text-muted-foreground' />
              <Button
                variant='secondary'
                onClick={() => fileInputRef.current?.click()}
              >
                Select Excel File
              </Button>
              <p className='mt-2 text-sm text-muted-foreground'>
                Only .xlsx files are supported
              </p>
            </div>
          ) : (
            <div className='space-y-4'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center space-x-2'>
                  <FileText className='h-5 w-5 text-muted-foreground' />
                  <span>{selectedFile.name}</span>
                </div>
                <Button variant='ghost' size='sm' onClick={clearFile}>
                  <X className='h-4 w-4 mr-2' />
                  Clear
                </Button>
              </div>

              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{`${row.first_name} ${row.last_name}`}</TableCell>
                        <TableCell>{row.email}</TableCell>
                        <TableCell>{row.institution_name}</TableCell>
                        <TableCell>{row.department_name}</TableCell>
                        <TableCell>{row.category_name}</TableCell>
                        <TableCell>
                          <Badge
                            variant={row.isValid ? 'success' : 'destructive'}
                          >
                            {row.isValid ? 'Valid' : 'Invalid'}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-destructive max-w-[200px] truncate'>
                          {row.errors?.join(', ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className='mt-4 flex justify-end space-x-2'>
            <Button
              variant='outline'
              onClick={() => {
                setIsOpen(false);
                clearFile();
              }}
              disabled={isUploading}
            >
              Cancel
            </Button>
            {selectedFile && (
              <Button
                onClick={handleUpload}
                disabled={
                  isUploading || !previewData.some((row) => row.isValid)
                }
              >
                {isUploading ? 'Uploading...' : 'Upload Valid Rows'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
