'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Upload, X, FileText, FileDown, AlertTriangle } from 'lucide-react';
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
import { CourseService } from '@/lib/services/organization/course-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';

interface Institution {
  id: string;
  counselling_code: string;
  name: string;
}

interface Department {
  id: string;
  department_code: string;
  institution_id: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

const validateRow = async (
  row: any,
  institutions: Institution[],
  departments: Department[]
): Promise<ValidationResult> => {
  const errors: string[] = [];
  const requiredFields = [
    'institution_id',
    'department_id',
    'course_code',
    'course_name'
  ];

  // Check required fields
  const missingFields = requiredFields.filter((field) => !row[field]);
  if (missingFields.length > 0) {
    errors.push(`Missing required fields: ${missingFields.join(', ')}`);
  }

  // Validate institution exists - check if the institution ID exists in our list
  const institution = institutions.find((i) => i.id === row.institution_id);
  if (!institution) {
    const validInstitutions = institutions
      .slice(0, 3)
      .map((i) => `${i.name} (${i.id})`)
      .join('; ');
    errors.push(`Invalid institution ID. Valid examples: ${validInstitutions}`);
    return {
      isValid: false,
      errors
    };
  }

  // Validate department exists and belongs to institution
  const department = departments.find(
    (d) => d.id === row.department_id && d.institution_id === row.institution_id
  );

  if (!department) {
    // Find departments for this institution to suggest
    const validDepartments = departments
      .filter((d) => d.institution_id === row.institution_id)
      .slice(0, 3)
      .map((d) => `${d.department_code} (${d.id})`)
      .join('; ');

    if (validDepartments) {
      errors.push(
        `Invalid department ID for this institution. Valid departments for this institution: ${validDepartments}`
      );
    } else {
      // Just check if the department ID exists at all (might be for a different institution)
      const departmentExists = departments.find(
        (d) => d.id === row.department_id
      );
      if (departmentExists) {
        errors.push(
          `Department ID exists but belongs to a different institution (${departmentExists.institution_id}). Please use a department ID that belongs to institution ${row.institution_id}`
        );
      } else {
        errors.push(
          `Invalid department ID. This department ID doesn't exist in the system.`
        );
      }
    }
  }

  // Validate course code format
  if (row.course_code && !/^[A-Z0-9_-]+$/.test(row.course_code)) {
    errors.push(
      'Course code can only contain uppercase letters, numbers, underscores, and hyphens'
    );
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export default function BulkUploadCourses() {
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
      // Fetch required data for validation
      const institutions = await OrganizationService.getInstitutionNames(true);
      console.log('Fetched institutions:', institutions.length);

      // Fetch ALL active departments for validation (set a high limit)
      const { data: allDepartments } = await DepartmentService.getDepartments({
        isActive: true,
        limit: 10000 // Fetch up to 10,000 departments
      });

      console.log('Fetched departments:', allDepartments.length);

      // If no institutions or departments, show error
      if (institutions.length === 0 || allDepartments.length === 0) {
        toast.error(
          'No active institutions or departments found. Please create them first.'
        );
        return;
      }

      // Convert departments to format needed for validation
      const departmentsWithProperStructure = allDepartments.map((dept) => ({
        id: dept.id,
        department_code: dept.department_code || '', // Ensure department_code exists
        institution_id: dept.institution_id
      }));

      // Log sample valid institution and department IDs to help users
      console.log('Valid institution and department examples:');
      institutions.slice(0, 3).forEach((inst) => {
        console.log(`Institution: ${inst.name} (${inst.id})`);
        const depts = departmentsWithProperStructure
          .filter((d) => d.institution_id === inst.id)
          .slice(0, 2);

        depts.forEach((d) => {
          console.log(`  - Department: ${d.department_code} (${d.id})`);
        });
      });

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);

      // Get the template sheet (should be the second sheet after instructions)
      const sheetName =
        workbook.SheetNames.length > 1
          ? workbook.SheetNames[1]
          : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        toast.error('No data found in the uploaded file');
        return;
      }

      // Validate each row
      const validatedData = await Promise.all(
        jsonData.map(async (row: any, index) => {
          const validation = await validateRow(
            row,
            institutions,
            departmentsWithProperStructure
          );
          return {
            ...row,
            rowNumber: index + 2,
            isValid: validation.isValid,
            errors: validation.errors
          };
        })
      );

      setPreviewData(validatedData);
      setIsOpen(true);
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
      const validRows = previewData.filter((row) => row.isValid);

      if (validRows.length === 0) {
        toast.error('No valid data to upload');
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      const promises = validRows.map((row) => {
        const courseData = {
          institution_id: row.institution_id,
          department_id: row.department_id,
          course_code: row.course_code.toUpperCase(),
          course_name: row.course_name,
          is_active: true
        };

        return CourseService.createCourse(courseData)
          .then(() => {
            successCount++;
          })
          .catch((error) => {
            console.error('Error creating course:', error);
            errorCount++;
          });
      });

      await Promise.all(promises);

      toast.success(
        `Successfully uploaded ${successCount} courses. ${errorCount} failed.`
      );
      setIsOpen(false);
      clearFile();
      router.refresh();
    } catch (error) {
      console.error('Error uploading courses:', error);
      toast.error('Error uploading courses');
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
              <div className='mt-4 flex items-center gap-2 border border-amber-300 bg-amber-50 p-3 rounded-md'>
                <AlertTriangle className='h-5 w-5 text-amber-500' />
                <p className='text-sm text-amber-700'>
                  Make sure to use our template with valid institution and
                  department IDs
                </p>
              </div>
              <div className='mt-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() =>
                    (window.location.href = '/organizations/courses/template')
                  }
                >
                  <FileDown className='mr-2 h-4 w-4' />
                  Download Template First
                </Button>
              </div>
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

              {previewData.some((row) => !row.isValid) && (
                <div className='border border-destructive bg-destructive/10 p-3 rounded-md'>
                  <div className='flex items-start gap-2'>
                    <AlertTriangle className='h-5 w-5 text-destructive flex-shrink-0 mt-0.5' />
                    <div>
                      <p className='font-medium text-destructive'>
                        Validation errors detected
                      </p>
                      <p className='text-sm text-muted-foreground mt-1'>
                        Some rows contain invalid data. These issues must be
                        fixed before uploading. The most common issue is using
                        incorrect institution or department IDs.
                      </p>
                      <Button
                        variant='outline'
                        size='sm'
                        className='mt-2'
                        onClick={() => {
                          setIsOpen(false);
                          window.location.href =
                            '/organizations/courses/template';
                        }}
                      >
                        <FileDown className='mr-2 h-4 w-4' />
                        Download Template with Valid IDs
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Institution ID</TableHead>
                      <TableHead>Department ID</TableHead>
                      <TableHead>Course Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.institution_id}</TableCell>
                        <TableCell>{row.department_id}</TableCell>
                        <TableCell>{row.course_code}</TableCell>
                        <TableCell>{row.course_name}</TableCell>
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
