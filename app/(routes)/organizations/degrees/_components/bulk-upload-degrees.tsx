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
import { DegreeService } from '@/lib/services/degree-service';
import { OrganizationService } from '@/lib/services/organization-service';

const validateRow = async (row: any, institutions: any[]) => {
  const requiredFields = [
    'institution_code',
    'degree_id',
    'degree_name',
    'degree_type'
  ];

  const missingFields = requiredFields.filter((field) => !row[field]);

  if (missingFields.length > 0) {
    return {
      isValid: false,
      errors: `Missing required fields: ${missingFields.join(', ')}`
    };
  }

  // Validate degree_type
  const validTypes = ['ug', 'pg'];
  if (!validTypes.includes(row.degree_type)) {
    return {
      isValid: false,
      errors: 'Invalid degree type. Must be one of: ug, pg'
    };
  }

  // Validate institution_code exists
  const institution = institutions.find(
    (i) => i.counselling_code === row.institution_code
  );
  if (!institution) {
    return {
      isValid: false,
      errors: 'Invalid institution code'
    };
  }

  // Add institution_id to the row data for later use
  row.institution_id = institution.id;

  return { isValid: true, errors: null };
};

export default function BulkUploadDegrees() {
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

      // First fetch all institutions for validation
      const institutions = await OrganizationService.getInstitutionNames(true);

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Validate and format data
      const validatedData = await Promise.all(
        jsonData.map(async (row: any, index) => {
          const validation = await validateRow(row, institutions);
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
          const degreeData = {
            institution_id: row.institution_id,
            degree_id: row.degree_id.toUpperCase(),
            degree_name: row.degree_name,
            degree_type: row.degree_type,
            is_active: true
          };

          return DegreeService.createDegree(degreeData)
            .then(() => {
              successCount++;
            })
            .catch((error) => {
              console.error('Error creating degree:', error);
              errorCount++;
            });
        });

        await Promise.all(promises);
      }

      toast.success(
        `Successfully uploaded ${successCount} degrees. ${errorCount} failed.`
      );
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Error uploading degrees:', error);
      toast.error('Error uploading degrees');
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
                  <TableHead>Institution</TableHead>
                  <TableHead>Degree ID</TableHead>
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
                    <TableCell>{row.degree_id}</TableCell>
                    <TableCell>{row.degree_name}</TableCell>
                    <TableCell>{row.degree_type}</TableCell>
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
