'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Upload, X, FileText, AlertTriangle } from 'lucide-react';
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
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { CourseService } from '@/lib/services/organization/course-service';
import DownloadCourseMappingTemplateButton from './download-course-mapping-template';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  resolvedIds?: {
    institution_id: string;
    degree_id: string;
    department_id: string;
    program_id: string;
    semester_id: string;
    course_id: string;
  };
}

const validateRow = async (row: any): Promise<ValidationResult> => {
  const errors: string[] = [];
  const requiredFields = [
    'institution_name',
    'degree_name',
    'department_name',
    'program_name',
    'semester_name',
    'course_code'
  ];

  for (const field of requiredFields) {
    if (!row[field] || String(row[field]).trim() === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (errors.length > 0) return { isValid: false, errors };

  try {
    const institution = await OrganizationService.getInstitutionByName(
      row.institution_name
    );
    if (!institution) {
      errors.push('Institution not found.');
      return { isValid: false, errors };
    }
    const institution_id = institution.id;

    const degrees = await DegreeService.getDegreeByName(
      row.degree_name,
      institution_id
    );
    if (!degrees) {
      errors.push('Degree not found for the institution.');
      return { isValid: false, errors };
    }
    const degree_id = degrees.id;

    const departments = await DepartmentService.getDepartmentByName(
      row.department_name,
      degree_id
    );
    if (!departments) {
      errors.push('Department not found for the degree.');
      return { isValid: false, errors };
    }
    const department_id = departments.id;

    const programs = await ProgramService.getProgramByName(
      row.program_name,
      department_id
    );
    if (!programs) {
      errors.push('Program not found for the department.');
      return { isValid: false, errors };
    }
    const program_id = programs.id;

    const semesters = await SemesterService.getSemesterByName(
      row.semester_name,
      program_id
    );
    if (!semesters) {
      errors.push('Semester not found for the program.');
      return { isValid: false, errors };
    }
    const semester_id = semesters.id;

    const courses = await CourseService.getCourseByCode(
      row.course_code,
      institution_id
    );
    if (!courses) {
      errors.push('Course not found for the institution.');
      return { isValid: false, errors };
    }
    const course_id = courses.id;

    const isMapped = await CourseMappingService.isCourseMapped(
      course_id,
      semester_id
    );
    if (isMapped) {
      errors.push('Course is already mapped to this semester.');
      return { isValid: false, errors };
    }

    return {
      isValid: true,
      errors: [],
      resolvedIds: {
        institution_id,
        degree_id,
        department_id,
        program_id,
        semester_id,
        course_id
      }
    };
  } catch (error) {
    console.error('Validation error:', error);
    errors.push('An unexpected error occurred during validation.');
    return { isValid: false, errors };
  }
};

export default function BulkUploadCourseMappings() {
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
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[1]; // Assuming template is the second sheet
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        toast.error('No data found in the file.');
        return;
      }

      const validatedData = await Promise.all(
        jsonData.map(async (row: any, index) => {
          const validation = await validateRow(row);
          return {
            ...row,
            rowNumber: index + 2,
            ...validation
          };
        })
      );

      setPreviewData(validatedData);
      setIsOpen(true);
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Error processing file. Please check the format.');
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
        toast.error('No valid data to upload.');
        return;
      }

      const results = await CourseMappingService.bulkCreateCourseMappings(
        validRows.map((row) => ({
          ...row.resolvedIds,
          is_active: true
        }))
      );

      toast.success(
        `Successfully uploaded ${results.successCount} mappings. ${results.errorCount} failed.`
      );
      setIsOpen(false);
      clearFile();
      router.refresh();
    } catch (error) {
      console.error('Error uploading mappings:', error);
      toast.error('Error uploading mappings.');
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
          <DialogTitle>Bulk Upload Course Mappings</DialogTitle>
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
                Only .xlsx files are supported.
              </p>
              <div className='mt-4'>
                <DownloadCourseMappingTemplateButton />
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
                        Invalid rows will be skipped. Please fix them in your
                        Excel file and re-upload.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Course Code</TableHead>
                      <TableHead>Semester</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.course_code}</TableCell>
                        <TableCell>{row.semester_name}</TableCell>
                        <TableCell>{row.program_name}</TableCell>
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
