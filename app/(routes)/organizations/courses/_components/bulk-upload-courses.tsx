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
import { OrganizationService } from '@/lib/services/organization/organization-service';

interface Institution {
  id: string;
  counselling_code: string;
  name: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  resolvedIds?: {
    institution_id?: string;
  };
}

const validateRow = async (
  row: any,
  institutions: Institution[]
): Promise<ValidationResult> => {
  const errors: string[] = [];
  const requiredFields = ['institution_name', 'course_code', 'course_name'];

  // Check required fields
  const missingFields = requiredFields.filter((field) => {
    const value = row[field];
    return !value || (typeof value === 'string' && value.trim() === '');
  });
  if (missingFields.length > 0) {
    errors.push(`Missing required fields: ${missingFields.join(', ')}`);
  }

  // Validate institution by name (case-insensitive)
  const institution = institutions.find(
    (i) =>
      i.name.toLowerCase().trim() === row.institution_name?.toLowerCase().trim()
  );
  if (!institution) {
    const validInstitutions = institutions
      .slice(0, 3)
      .map((i) => `${i.name}`)
      .join('; ');
    errors.push(
      `Institution "${row.institution_name}" not found. Valid examples: ${validInstitutions}`
    );
    return {
      isValid: false,
      errors
    };
  }

  // Validate course code format - convert to string first
  if (row.course_code) {
    const courseCodeStr = String(row.course_code).trim().toUpperCase();
    if (courseCodeStr === '') {
      errors.push('Course code cannot be empty or whitespace only');
    } else if (!/^[A-Z0-9_-]+$/.test(courseCodeStr)) {
      errors.push(
        'Course code can only contain uppercase letters, numbers, underscores, and hyphens'
      );
    }
  }

  // Validate course name
  if (row.course_name) {
    const courseNameStr = String(row.course_name).trim();
    if (courseNameStr === '') {
      errors.push('Course name cannot be empty or whitespace only');
    }
  }

  // Check if course code already exists for this institution
  if (institution && row.course_code) {
    try {
      const existingCourses = await CourseService.getCourses({
        institution_id: institution.id,
        isActive: true,
        limit: 1000
      });

      const courseCodeStr = String(row.course_code).trim().toUpperCase();
      const duplicateCourse = existingCourses.data.find(
        (course) => course.course_code.toUpperCase() === courseCodeStr
      );

      if (duplicateCourse) {
        errors.push(
          `Course code "${courseCodeStr}" already exists in ${institution.name}`
        );
      }
    } catch (error) {
      console.error('Error checking for duplicate courses:', error);
      // Don't fail validation for this, just log it
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    resolvedIds: institution ? { institution_id: institution.id } : undefined
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

      // If no institutions, show error
      if (institutions.length === 0) {
        toast.error('No active institutions found. Please create them first.');
        return;
      }

      // Log sample valid institution names to help users
      console.log('Valid institution examples:');
      institutions.slice(0, 3).forEach((inst) => {
        console.log(`Institution: ${inst.name} (${inst.counselling_code})`);
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
          // Log row data types for debugging
          console.log(`Row ${index + 2}:`, {
            institution_name: typeof row.institution_name,
            course_code: typeof row.course_code,
            course_name: typeof row.course_name,
            values: row
          });

          const validation = await validateRow(row, institutions);
          return {
            ...row,
            rowNumber: index + 2,
            isValid: validation.isValid,
            errors: validation.errors,
            resolvedIds: validation.resolvedIds
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
          institution_id: row.resolvedIds?.institution_id,
          course_code: String(row.course_code || '')
            .trim()
            .toUpperCase(),
          course_name: String(row.course_name || '').trim(),
          is_active: true
        };

        return CourseService.createCourse(courseData, false)
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
                  Make sure to use our template with valid institution names
                </p>
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
                        incorrect institution names.
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
                        Download Template with Valid Names
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
                      <TableHead>Institution Name</TableHead>
                      <TableHead>Course Code</TableHead>
                      <TableHead>Course Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.institution_name}</TableCell>
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
