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
import { SectionService } from '@/lib/services/organization/section-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  resolvedIds?: {
    institution_id?: string;
    degree_id?: string;
    department_id?: string;
    program_id?: string;
    semester_id?: string;
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
    'section_name'
  ];

  // Check required fields
  const missingFields = requiredFields.filter((field) => !row[field]);
  if (missingFields.length > 0) {
    errors.push(`Missing required fields: ${missingFields.join(', ')}`);
    return { isValid: false, errors };
  }

  try {
    // Step 1: Find institution
    const institutions = await OrganizationService.getInstitutionNames(true);
    const institution = institutions.find(
      (inst) =>
        inst.name.toLowerCase().trim() ===
        row.institution_name.toLowerCase().trim()
    );
    if (!institution) {
      errors.push(`Institution "${row.institution_name}" not found`);
      return { isValid: false, errors };
    }

    // Step 2: Find degree
    const degreesResponse = await DegreeService.getDegrees({
      institution_id: institution.id,
      isActive: true,
      limit: 1000
    });
    const degree = degreesResponse.data.find(
      (deg) =>
        deg.degree_name.toLowerCase().trim() ===
        row.degree_name.toLowerCase().trim()
    );
    if (!degree) {
      errors.push(
        `Degree "${row.degree_name}" not found for institution "${row.institution_name}"`
      );
      return { isValid: false, errors };
    }

    // Step 3: Find department
    const departmentsResponse = await DepartmentService.getDepartments({
      degree_id: degree.id,
      isActive: true,
      limit: 1000
    });
    const department = departmentsResponse.data.find(
      (dept) =>
        dept.department_name.toLowerCase().trim() ===
        row.department_name.toLowerCase().trim()
    );
    if (!department) {
      errors.push(
        `Department "${row.department_name}" not found for degree "${row.degree_name}"`
      );
      return { isValid: false, errors };
    }

    // Step 4: Find program
    const programsResponse = await ProgramService.getPrograms({
      department_id: department.id,
      isActive: true,
      limit: 1000
    });
    const program = programsResponse.data.find(
      (prog) =>
        prog.program_name.toLowerCase().trim() ===
        row.program_name.toLowerCase().trim()
    );
    if (!program) {
      errors.push(
        `Program "${row.program_name}" not found for department "${row.department_name}"`
      );
      return { isValid: false, errors };
    }

    // Step 5: Find semester
    const semestersResponse = await SemesterService.getSemesters({
      program_id: program.id,
      isActive: true,
      limit: 1000
    });
    const semester = semestersResponse.data.find(
      (sem) =>
        sem.semester_name.toLowerCase().trim() ===
        row.semester_name.toLowerCase().trim()
    );
    if (!semester) {
      errors.push(
        `Semester "${row.semester_name}" not found for program "${row.program_name}"`
      );
      return { isValid: false, errors };
    }

    // Step 6: Check if section already exists
    const sectionExists = await SectionService.checkSectionExists(
      institution.id,
      degree.id,
      department.id,
      program.id,
      semester.id,
      row.section_name
    );
    if (sectionExists) {
      errors.push(
        `Section "${row.section_name}" already exists in this semester`
      );
      return { isValid: false, errors };
    }

    return {
      isValid: true,
      errors: [],
      resolvedIds: {
        institution_id: institution.id,
        degree_id: degree.id,
        department_id: department.id,
        program_id: program.id,
        semester_id: semester.id
      }
    };
  } catch (error) {
    console.error('Validation error:', error);
    errors.push('Error validating row data');
    return { isValid: false, errors };
  }
};

export default function BulkUploadSections() {
  const [isOpen, setIsOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
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
      setIsValidating(true);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Process each row with validation
      const validatedData = [];
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i] as any;
        const validation = await validateRow(row);
        validatedData.push({
          ...row,
          rowNumber: i + 2,
          isValid: validation.isValid,
          errors: validation.errors,
          resolvedIds: validation.resolvedIds
        });
      }

      setPreviewData(validatedData);
      setIsOpen(true);
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Error processing file. Please check the file format.');
    } finally {
      setIsValidating(false);
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

      for (const row of validRows) {
        try {
          const sectionData = {
            institution_id: row.resolvedIds.institution_id,
            degree_id: row.resolvedIds.degree_id,
            department_id: row.resolvedIds.department_id,
            program_id: row.resolvedIds.program_id,
            semester_id: row.resolvedIds.semester_id,
            section_name: row.section_name,
            is_active: row.is_active === 'No' ? false : true
          };

          await SectionService.createSection(sectionData);
          successCount++;
        } catch (error) {
          console.error('Error creating section:', error);
          errorCount++;
        }
      }

      toast.success(
        `Successfully uploaded ${successCount} sections. ${errorCount} failed.`
      );
      setIsOpen(false);
      clearFile();
      router.refresh();
    } catch (error) {
      console.error('Error uploading sections:', error);
      toast.error('Error uploading sections');
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
      <DialogContent className='max-w-6xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Bulk Upload Sections</DialogTitle>
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
                disabled={isValidating}
              >
                {isValidating ? 'Processing...' : 'Select Excel File'}
              </Button>
              <p className='mt-2 text-sm text-muted-foreground'>
                Upload a .xlsx file with institution, degree, department,
                program, semester, and section data
              </p>
            </div>
          ) : (
            <div className='space-y-4'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center space-x-2'>
                  <FileText className='h-5 w-5 text-muted-foreground' />
                  <span>{selectedFile.name}</span>
                  {isValidating && (
                    <Badge variant='secondary'>Validating...</Badge>
                  )}
                </div>
                <Button variant='ghost' size='sm' onClick={clearFile}>
                  <X className='h-4 w-4 mr-2' />
                  Clear
                </Button>
              </div>

              {previewData.length > 0 && (
                <div className='rounded-md border max-h-96 overflow-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Institution</TableHead>
                        <TableHead>Degree</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead>Semester</TableHead>
                        <TableHead>Section</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Errors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.map((row) => (
                        <TableRow key={row.rowNumber}>
                          <TableCell>{row.rowNumber}</TableCell>
                          <TableCell className='max-w-[150px] truncate'>
                            {row.institution_name}
                          </TableCell>
                          <TableCell>{row.degree_name}</TableCell>
                          <TableCell className='max-w-[120px] truncate'>
                            {row.department_name}
                          </TableCell>
                          <TableCell>{row.program_name}</TableCell>
                          <TableCell>{row.semester_name}</TableCell>
                          <TableCell>{row.section_name}</TableCell>
                          <TableCell>
                            <Badge
                              variant={row.isValid ? 'default' : 'destructive'}
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
              )}
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
                  isUploading ||
                  isValidating ||
                  !previewData.some((row) => row.isValid)
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
