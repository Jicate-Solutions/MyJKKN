'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, FileSpreadsheet, Upload, XCircle, AlertTriangle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useBillingParentCategories } from '@/hooks/billing/use-billing-parent-categories';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { ParentCategoryList } from './_components/parent-category-list';
import { ParentCategoryFilters } from './_components/parent-category-filters';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { BillingParentCategoryService } from '@/lib/services/billing/categories/billing-parent-category-service';
import {
  exportParentCategoriesTemplate,
  parseBulkUploadFile,
  mapParentCategoryRow,
  validateParentCategoryRow,
  type BillingCategoryImportError,
  type BillingCategoryUploadSummary,
} from '@/lib/utils/billing/billing-categories-import-export';
import { toast } from 'react-hot-toast';

export default function BillingParentCategoriesPage() {
  const {
    categories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchCategories,
  } = useBillingParentCategories();

  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  const canViewCategories = isSuperAdmin || canAccess('billing.categories', 'view');
  const canCreateCategories = isSuperAdmin || canAccess('billing.categories', 'create');

  const [isUploading, setIsUploading] = useState(false);
  const [errorPopupOpen, setErrorPopupOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<BillingCategoryImportError[]>([]);
  const [uploadSummary, setUploadSummary] = useState<BillingCategoryUploadSummary>({ total: 0, success: 0, failed: 0 });

  const handleTemplateDownload = async () => {
    try {
      const institutions = await OrganizationService.getInstitutionNames(true);
      exportParentCategoriesTemplate(institutions);
    } catch {
      toast.error('Failed to generate template');
    }
  };

  const handleBulkUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setIsUploading(true);
      try {
        const rows = await parseBulkUploadFile(file, mapParentCategoryRow);

        if (rows.length === 0) {
          toast.error('No data rows found in the file');
          return;
        }

        // Fetch reference data once for ID resolution
        const institutions = await OrganizationService.getInstitutionNames(true);
        const institutionMap = new Map(institutions.map((i) => [i.name.toLowerCase(), i.id]));

        // Validate all rows first
        const validationErrors: BillingCategoryImportError[] = [];
        rows.forEach((row, idx) => {
          const rowNum = idx + 2;
          const errs = validateParentCategoryRow(row);
          if (!row.institution_name || !institutionMap.has(row.institution_name.toLowerCase())) {
            errs.push(`Institution "${row.institution_name || '(empty)'}" not found — check Reference Codes sheet`);
          }
          if (errs.length > 0) {
            validationErrors.push({ row: rowNum, name: row.parent_category_name || `Row ${rowNum}`, errors: errs });
          }
        });

        if (validationErrors.length > 0) {
          setImportErrors(validationErrors);
          setUploadSummary({ total: rows.length, success: 0, failed: validationErrors.length });
          setErrorPopupOpen(true);
          return;
        }

        // Insert rows
        let successCount = 0;
        const uploadErrors: BillingCategoryImportError[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowNum = i + 2;
          try {
            await BillingParentCategoryService.createBillingParentCategory({
              institution_id: institutionMap.get(row.institution_name.toLowerCase())!,
              parent_category_name: row.parent_category_name,
              is_active: row.is_active,
            });
            successCount++;
          } catch (err) {
            uploadErrors.push({
              row: rowNum,
              name: row.parent_category_name,
              errors: [err instanceof Error ? err.message : 'Failed to save'],
            });
          }
        }

        setUploadSummary({ total: rows.length, success: successCount, failed: uploadErrors.length });

        if (uploadErrors.length > 0) {
          setImportErrors(uploadErrors);
          setErrorPopupOpen(true);
        }

        if (successCount > 0) {
          fetchCategories();
          if (uploadErrors.length === 0) {
            toast.success(`Successfully uploaded ${successCount} parent ${successCount === 1 ? 'category' : 'categories'}`);
          } else {
            toast.error(`${successCount} uploaded, ${uploadErrors.length} failed — see error details`);
          }
        } else {
          toast.error(`All ${rows.length} rows failed — see error details`);
        }
      } catch (err) {
        toast.error('Failed to process file — check the format and try again');
      } finally {
        setIsUploading(false);
      }
    };
    input.click();
  };

  if (permissionsLoading) {
    return (
      <ContentLayout title='Billing Parent Categories'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewCategories) {
    return (
      <ContentLayout title='Billing Parent Categories'>
        <div className='text-center py-8'>
          <p className='text-destructive'>You don&apos;t have permission to view billing parent categories.</p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Billing Parent Categories'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button variant='outline' onClick={() => fetchCategories()} className='mt-4' disabled={!canViewCategories}>
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Billing Parent Categories'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Parent Categories', href: '/billing/categories/parent-categories' },
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Billing Parent Categories</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage high-level billing categories for the institution
            </p>
          </div>
          <div className='flex flex-wrap gap-2 justify-end'>
            {canCreateCategories && (
              <>
                <Button
                  variant='outline'
                  size='sm'
                  className='text-xs px-3 h-9'
                  onClick={handleTemplateDownload}
                >
                  <FileSpreadsheet className='h-3.5 w-3.5 mr-1.5' />
                  Template
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  className='text-xs px-3 h-9'
                  onClick={handleBulkUpload}
                  disabled={isUploading}
                >
                  <Upload className='h-3.5 w-3.5 mr-1.5' />
                  {isUploading ? 'Uploading…' : 'Bulk Upload'}
                </Button>
              </>
            )}
            {canCreateCategories ? (
              <Button className='h-9' asChild>
                <Link href='/billing/categories/parent-categories/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Add Parent Category
                </Link>
              </Button>
            ) : (
              <Button className='h-9 opacity-50' disabled variant='outline'>
                <Plus className='mr-2 h-4 w-4' />
                Add Parent Category
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <ParentCategoryFilters filters={filters} onFilterChange={updateFilters} />
            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <ParentCategoryList
                categories={categories}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchCategories}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bulk Upload Error Dialog */}
      <AlertDialog open={errorPopupOpen} onOpenChange={setErrorPopupOpen}>
        <AlertDialogContent className='max-w-3xl max-h-[80vh] overflow-y-auto'>
          <AlertDialogHeader>
            <div className='flex items-center gap-3'>
              <div className='h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0'>
                <XCircle className='h-5 w-5 text-red-600 dark:text-red-400' />
              </div>
              <div>
                <AlertDialogTitle className='text-xl font-bold text-red-600 dark:text-red-400'>
                  Upload Errors
                </AlertDialogTitle>
                <AlertDialogDescription className='text-sm text-muted-foreground mt-0.5'>
                  Fix the errors below and re-upload the corrected file
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className='space-y-4'>
            {uploadSummary.total > 0 && (
              <div className='grid grid-cols-3 gap-3'>
                <div className='bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3'>
                  <div className='text-xs text-blue-600 dark:text-blue-400 font-medium mb-1'>Total Rows</div>
                  <div className='text-2xl font-bold text-blue-700 dark:text-blue-300'>{uploadSummary.total}</div>
                </div>
                <div className='bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3'>
                  <div className='text-xs text-green-600 dark:text-green-400 font-medium mb-1'>Successful</div>
                  <div className='text-2xl font-bold text-green-700 dark:text-green-300'>{uploadSummary.success}</div>
                </div>
                <div className='bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3'>
                  <div className='text-xs text-red-600 dark:text-red-400 font-medium mb-1'>Failed</div>
                  <div className='text-2xl font-bold text-red-700 dark:text-red-300'>{uploadSummary.failed}</div>
                </div>
              </div>
            )}

            <div className='bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4'>
              <div className='flex items-center gap-2 mb-1'>
                <AlertTriangle className='h-4 w-4 text-red-600 dark:text-red-400' />
                <span className='font-semibold text-red-800 dark:text-red-200 text-sm'>
                  {importErrors.length} row{importErrors.length !== 1 ? 's' : ''} need attention
                </span>
              </div>
              <p className='text-xs text-red-700 dark:text-red-300'>
                Check the Reference Codes sheet in the template for valid institution names.
              </p>
            </div>

            <div className='space-y-2'>
              {importErrors.map((err, idx) => (
                <div key={idx} className='border border-red-200 dark:border-red-800 rounded-lg p-3 bg-red-50/50 dark:bg-red-900/5'>
                  <div className='flex items-center gap-2 mb-1.5'>
                    <Badge variant='outline' className='text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700'>
                      Row {err.row}
                    </Badge>
                    <span className='font-medium text-sm truncate'>{err.name}</span>
                  </div>
                  <div className='space-y-0.5'>
                    {err.errors.map((e, i) => (
                      <div key={i} className='flex items-start gap-1.5 text-xs'>
                        <XCircle className='h-3 w-3 text-red-500 mt-0.5 flex-shrink-0' />
                        <span className='text-red-700 dark:text-red-300'>{e}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setImportErrors([])}>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
