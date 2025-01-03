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
import { CategoryService } from '@/lib/services/staff/category-service';

const validateRow = async (row: any, rowNumber: number) => {
  // Check required fields
  if (!row.category_name) {
    return {
      isValid: false,
      errors: 'Category name is required'
    };
  }

  // Validate category name length
  if (row.category_name.length < 2) {
    return {
      isValid: false,
      errors: 'Category name must be at least 2 characters long'
    };
  }

  try {
    // Check if category name already exists
    const { data } = await CategoryService.getCategories({
      search: row.category_name,
      page: 1,
      limit: 1
    });

    if (
      data.length > 0 &&
      data[0].category_name.toLowerCase() === row.category_name.toLowerCase()
    ) {
      return {
        isValid: false,
        errors: 'Category name already exists'
      };
    }
  } catch (error) {
    console.error('Error checking category existence:', error);
  }

  return {
    isValid: true,
    errors: null
  };
};

export default function BulkUploadCategories() {
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

      // Validate each row
      const validatedData = await Promise.all(
        jsonData.map(async (row: any, index) => {
          const validation = await validateRow(row, index + 2);
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
          const categoryData = {
            category_name: row.category_name,
            description: row.description || null,
            is_active: true
          };

          return CategoryService.createCategory(categoryData)
            .then(() => {
              successCount++;
            })
            .catch((error) => {
              console.error('Error creating category:', error);
              errorCount++;
            });
        });

        await Promise.all(promises);
      }

      toast.success(
        `Successfully uploaded ${successCount} categories. ${errorCount} failed.`
      );
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Error uploading categories:', error);
      toast.error('Error uploading categories');
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
                  <TableHead>Category Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewData.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>{row.category_name}</TableCell>
                    <TableCell>{row.description || 'N/A'}</TableCell>
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
