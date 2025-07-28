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
import { OrganizationService } from '@/lib/services/organization/organization-service';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

const validateRow = (row: any): ValidationResult => {
  const errors: string[] = [];
  const requiredFields = [
    'name',
    'counselling_code',
    'institution_type',
    'category',
    'timetable_type',
    'accredited_by',
    'address_line1',
    'city',
    'state',
    'country',
    'pin_code',
    'email',
    'phone'
  ];

  // Check required fields
  const missingFields = requiredFields.filter((field) => !row[field]);
  if (missingFields.length > 0) {
    errors.push(`Missing required fields: ${missingFields.join(', ')}`);
  }

  // Validate email format
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    errors.push('Invalid email format');
  }

  // Validate phone format
  if (row.phone && !/^\+?[0-9\s-()]{10,}$/.test(row.phone)) {
    errors.push('Invalid phone number format');
  }

  // Validate PIN code
  if (row.pin_code && !/^\d{6}$/.test(row.pin_code)) {
    errors.push('PIN code must be 6 digits');
  }

  // Validate institution type
  const validTypes = ['self', 'autonomous', 'aided'];
  if (row.institution_type && !validTypes.includes(row.institution_type)) {
    errors.push(
      'Invalid institution type. Must be one of: self, autonomous, aided'
    );
  }

  // Validate category
  const validCategories = ['ug', 'pg', 'ug_pg'];
  if (row.category && !validCategories.includes(row.category)) {
    errors.push('Invalid category. Must be one of: ug, pg, ug_pg');
  }

  // Validate timetable_type
  const validTimetableTypes = ['day_order', 'week_order'];
  if (row.timetable_type && !validTimetableTypes.includes(row.timetable_type)) {
    errors.push(
      `Invalid timetable type. Must be one of: ${validTimetableTypes.join(
        ', '
      )}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export default function BulkUploadInstitutions() {
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
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const validatedData = jsonData.map((row: any, index) => {
        const validation = validateRow(row);
        return {
          ...row,
          rowNumber: index + 2,
          isValid: validation.isValid,
          errors: validation.errors
        };
      });

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
        const institutionData = {
          name: row.name,
          counselling_code: row.counselling_code.toUpperCase(),
          institution_type: row.institution_type,
          category: row.category,
          timetable_type: row.timetable_type,
          accredited_by: row.accredited_by,
          address_line1: row.address_line1,
          address_line2: row.address_line2 || '',
          address_line3: row.address_line3 || null,
          city: row.city,
          state: row.state,
          country: row.country,
          pin_code: row.pin_code,
          email: row.email,
          phone: row.phone,
          website: row.website || null,
          is_active: true
        };

        return OrganizationService.createInstitution(institutionData)
          .then(() => {
            successCount++;
          })
          .catch((error) => {
            console.error('Error creating institution:', error);
            errorCount++;
          });
      });

      await Promise.all(promises);

      toast.success(
        `Successfully uploaded ${successCount} institutions. ${errorCount} failed.`
      );
      setIsOpen(false);
      clearFile();
      router.refresh();
    } catch (error) {
      console.error('Error uploading institutions:', error);
      toast.error('Error uploading institutions');
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
                      <TableHead>Code</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Timetable</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.counselling_code}</TableCell>
                        <TableCell>{row.institution_type}</TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell>{row.timetable_type}</TableCell>
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
