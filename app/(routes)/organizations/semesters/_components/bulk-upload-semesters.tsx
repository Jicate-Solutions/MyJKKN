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
import { SemesterService } from '@/lib/services/organization/semester-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { CourseService } from '@/lib/services/organization/course-service';

interface Institution {
  id: string;
  counselling_code: string;
}

interface Degree {
  id: string;
  degree_id: string;
  institution_id: string;
}

interface Department {
  id: string;
  department_code: string;
  institution_id: string;
  degree_id: string;
}

interface Program {
  id: string;
  program_id: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
}

interface Course {
  id: string;
  course_code: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

const validateRow = async (
  row: any,
  institutions: Institution[],
  degrees: Degree[],
  departments: Department[],
  programs: Program[],
  courses: Course[]
): Promise<ValidationResult> => {
  const errors: string[] = [];
  const requiredFields = [
    'institution_code',
    'degree_code',
    'department_code',
    'program_id',
    'course_code',
    'semester_code',
    'semester_name',
    'semester_type'
  ];

  // Check required fields
  const missingFields = requiredFields.filter((field) => !row[field]);
  if (missingFields.length > 0) {
    errors.push(`Missing required fields: ${missingFields.join(', ')}`);
  }

  // Validate institution exists
  const institution = institutions.find(
    (i) => i.counselling_code === row.institution_code
  );
  if (!institution) {
    errors.push('Invalid institution code');
  } else {
    // Validate degree exists and belongs to institution
    const degree = degrees.find(
      (d) =>
        d.degree_id === row.degree_code && d.institution_id === institution.id
    );
    if (!degree) {
      errors.push('Invalid degree code for this institution');
    } else {
      // Validate department exists and belongs to institution and degree
      const department = departments.find(
        (d) =>
          d.department_code === row.department_code &&
          d.institution_id === institution.id &&
          d.degree_id === degree.id
      );
      if (!department) {
        errors.push('Invalid department code for this institution and degree');
      } else {
        // Validate program exists and belongs to the hierarchy
        const program = programs.find(
          (p) =>
            p.program_id === row.program_id &&
            p.institution_id === institution.id &&
            p.degree_id === degree.id &&
            p.department_id === department.id
        );
        if (!program) {
          errors.push('Invalid program ID for this department');
        } else {
          // Validate course exists and belongs to the hierarchy
          const course = courses.find(
            (c) =>
              c.course_code === row.course_code &&
              c.institution_id === institution.id &&
              c.degree_id === degree.id &&
              c.department_id === department.id &&
              c.program_id === program.id
          );
          if (!course) {
            errors.push('Invalid course code for this program');
          } else {
            // Add IDs to the row data for later use
            row.institution_id = institution.id;
            row.degree_id = degree.id;
            row.department_id = department.id;
            row.program_id = program.id;
            row.course_id = course.id;
          }
        }
      }
    }
  }

  // Validate semester code format
  if (row.semester_code && !/^[A-Z0-9_-]+$/.test(row.semester_code)) {
    errors.push(
      'Semester code can only contain uppercase letters, numbers, underscores, and hyphens'
    );
  }

  // Validate semester type
  if (
    row.semester_type &&
    !['even', 'odd'].includes(row.semester_type.toLowerCase())
  ) {
    errors.push('Semester type must be either "even" or "odd"');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export default function BulkUploadSemesters() {
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

  const clearFile = () => {
    setSelectedFile(null);
    setPreviewData([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processFile = async (file: File) => {
    try {
      // Fetch required data for validation
      const institutions = await OrganizationService.getInstitutionNames(true);

      // Fetch degrees for each institution
      const degrees = await Promise.all(
        institutions.map(async (inst) => {
          const degreesForInst = await DegreeService.getDegreesByInstitution(
            inst.id
          );
          return degreesForInst.map((d) => ({
            ...d,
            institution_id: inst.id
          }));
        })
      );
      const flattenedDegrees = degrees.flat();

      // Fetch departments for each degree
      const departments = await Promise.all(
        flattenedDegrees.map(async (degree) => {
          const deptsForDegree = await DepartmentService.getDepartmentsByDegree(
            degree.id
          );
          return deptsForDegree.map((d) => ({
            ...d,
            institution_id: degree.institution_id,
            degree_id: degree.id
          }));
        })
      );
      const flattenedDepartments = departments.flat();

      // Fetch programs for each department
      const programs = await Promise.all(
        flattenedDepartments.map(async (dept) => {
          const progsForDept = await ProgramService.getProgramsByDepartment(
            dept.id
          );
          return progsForDept.map((p) => ({
            ...p,
            institution_id: dept.institution_id,
            degree_id: dept.degree_id,
            department_id: dept.id
          }));
        })
      );
      const flattenedPrograms = programs.flat();

      // Fetch courses for each program
      const courses = await Promise.all(
        flattenedPrograms.map(async (prog) => {
          const coursesForProg = await CourseService.getCoursesByProgram(
            prog.id
          );
          return coursesForProg.map((c) => ({
            ...c,
            institution_id: prog.institution_id,
            degree_id: prog.degree_id,
            department_id: prog.department_id,
            program_id: prog.id
          }));
        })
      );
      const flattenedCourses = courses.flat();

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const validatedData = await Promise.all(
        jsonData.map(async (row: any, index) => {
          const validation = await validateRow(
            row,
            institutions,
            flattenedDegrees,
            flattenedDepartments,
            flattenedPrograms,
            flattenedCourses
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
        const semesterData = {
          institution_id: row.institution_id,
          degree_id: row.degree_id,
          department_id: row.department_id,
          program_id: row.program_id,
          course_id: row.course_id,
          semester_code: row.semester_code.toUpperCase(),
          semester_name: row.semester_name,
          semester_type: row.semester_type.toLowerCase(),
          is_active: true
        };

        return SemesterService.createSemester(semesterData)
          .then(() => {
            successCount++;
          })
          .catch((error) => {
            console.error('Error creating semester:', error);
            errorCount++;
          });
      });

      await Promise.all(promises);

      toast.success(
        `Successfully uploaded ${successCount} semesters. ${errorCount} failed.`
      );
      setIsOpen(false);
      clearFile();
      router.refresh();
    } catch (error) {
      console.error('Error uploading semesters:', error);
      toast.error('Error uploading semesters');
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
                      <TableHead>Institution</TableHead>
                      <TableHead>Degree</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Course</TableHead>
                      <TableHead>Semester Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.institution_code}</TableCell>
                        <TableCell>{row.degree_code}</TableCell>
                        <TableCell>{row.department_code}</TableCell>
                        <TableCell>{row.program_id}</TableCell>
                        <TableCell>{row.course_code}</TableCell>
                        <TableCell>{row.semester_code}</TableCell>
                        <TableCell>{row.semester_name}</TableCell>
                        <TableCell>{row.semester_type}</TableCell>
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
