'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
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

const validateRow = (row: any) => {
  const requiredFields = [
    'name',
    'counselling_code',
    'institution_type',
    'category',
    'accredited_by',
    'address_line1',
    'city',
    'state',
    'country',
    'pin_code',
    'email',
    'phone'
  ];

  const missingFields = requiredFields.filter((field) => !row[field]);

  if (missingFields.length > 0) {
    return {
      isValid: false,
      errors: `Missing required fields: ${missingFields.join(', ')}`
    };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(row.email)) {
    return {
      isValid: false,
      errors: 'Invalid email format'
    };
  }

  // Validate phone format
  const phoneRegex = /^\+?[0-9\s-()]{10,}$/;
  if (!phoneRegex.test(row.phone)) {
    return {
      isValid: false,
      errors: 'Invalid phone number format'
    };
  }

  // Validate PIN code
  const pinCodeRegex = /^\d{6}$/;
  if (!pinCodeRegex.test(row.pin_code)) {
    return {
      isValid: false,
      errors: 'PIN code must be 6 digits'
    };
  }

  // Validate institution type
  const validTypes = ['self', 'autonomous', 'aided'];
  if (!validTypes.includes(row.institution_type)) {
    return {
      isValid: false,
      errors:
        'Invalid institution type. Must be one of: self, autonomous, aided'
    };
  }

  // Validate category
  const validCategories = ['ug', 'pg', 'ug_pg'];
  if (!validCategories.includes(row.category)) {
    return {
      isValid: false,
      errors: 'Invalid category. Must be one of: ug, pg, ug_pg'
    };
  }

  return { isValid: true, errors: null };
};

export default function BulkUploadInstitutions() {
  const [isOpen, setIsOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const router = useRouter();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith('.xlsx')) {
        toast.error('Please upload an Excel (.xlsx) file');
        return;
      }

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Validate and format data
      const validatedData = jsonData.map((row: any, index) => {
        const validation = validateRow(row);
        return {
          ...row,
          rowNumber: index + 2, // +2 because Excel starts at 1 and we skip header
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

  const handleUpload = async () => {
    try {
      setIsUploading(true);

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

      for (const batch of batches) {
        const promises = batch.map((row) => {
          const institutionData = {
            name: row.name,
            counselling_code: row.counselling_code,
            institution_type: row.institution_type,
            category: row.category,
            accredited_by: row.accredited_by,
            address_line1: row.address_line1,
            address_line2: row.address_line2 || null,
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
      }

      toast.success(
        `Successfully uploaded ${successCount} institutions. ${errorCount} failed.`
      );
      setIsOpen(false);
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
        <div className='relative'>
          <Button variant='outline' className='w-full sm:w-auto'>
            <Upload className='mr-2 h-4 w-4' />
            Bulk Upload
          </Button>
          <Input
            type='file'
            accept='.xlsx'
            onChange={handleFileUpload}
            className='absolute inset-0 opacity-0 cursor-pointer'
          />
        </div>
      </DialogTrigger>
      <DialogContent className='max-w-4xl max-h-[80vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Preview Bulk Upload</DialogTitle>
        </DialogHeader>

        <div className='mt-4'>
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Email</TableHead>
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
                    <TableCell>{row.email}</TableCell>
                    <TableCell>
                      <Badge variant={row.isValid ? 'success' : 'destructive'}>
                        {row.isValid ? 'Valid' : 'Invalid'}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-destructive'>
                      {row.errors}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className='mt-4 flex justify-end space-x-2'>
            <Button
              variant='outline'
              onClick={() => setIsOpen(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={isUploading || !previewData.some((row) => row.isValid)}
            >
              {isUploading ? 'Uploading...' : 'Upload Valid Rows'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
