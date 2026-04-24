'use client';

import { useEffect, useState } from 'react';
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
import { useBillingItemCategories } from '@/hooks/billing/use-billing-item-categories';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { ItemCategoryList } from './_components/item-category-list';
import { ItemCategoryFilters } from './_components/item-category-filters';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { BillingParentCategoryService } from '@/lib/services/billing/categories/billing-parent-category-service';
import { BillingSubCategoryService } from '@/lib/services/billing/categories/billing-sub-category-service';
import { BillingItemCategoryService } from '@/lib/services/billing/categories/billing-item-category-service';
import {
  exportItemCategoriesTemplate,
  parseBulkUploadFile,
  mapItemCategoryRow,
  validateItemCategoryRow,
  type BillingCategoryImportError,
  type BillingCategoryUploadSummary,
} from '@/lib/utils/billing/billing-categories-import-export';
import { toast } from 'react-hot-toast';

export default function BillingItemCategoriesPage() {
  const {
    itemCategories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchItemCategories,
  } = useBillingItemCategories();

  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  const canViewItemCategories = isSuperAdmin || canAccess('billing.categories', 'view');
  const canCreateItemCategories = isSuperAdmin || canAccess('billing.categories', 'create');

  const [isUploading, setIsUploading] = useState(false);
  const [errorPopupOpen, setErrorPopupOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<BillingCategoryImportError[]>([]);
  const [uploadSummary, setUploadSummary] = useState<BillingCategoryUploadSummary>({ total: 0, success: 0, failed: 0 });

  useEffect(() => {
    fetchItemCategories();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTemplateDownload = async () => {
    try {
      const [institutions, parentCatsResult, subCatsResult] = await Promise.all([
        OrganizationService.getInstitutionNames(true),
        BillingParentCategoryService.getBillingParentCategories({ limit: 100, isActive: true }),
        BillingSubCategoryService.getBillingSubCategories({ limit: 500, isActive: true }),
      ]);
      exportItemCategoriesTemplate(institutions, parentCatsResult.data, subCatsResult.data);
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
        const rows = await parseBulkUploadFile(file, mapItemCategoryRow);

        if (rows.length === 0) {
          toast.error('No data rows found in the file');
          return;
        }

        // Fetch all reference data once for ID resolution
        const [institutions, parentCatsResult, subCatsResult] = await Promise.all([
          OrganizationService.getInstitutionNames(true),
          BillingParentCategoryService.getBillingParentCategories({ limit: 500 }),
          BillingSubCategoryService.getBillingSubCategories({ limit: 1000 }),
        ]);

        const institutionMap = new Map(institutions.map((i) => [i.name.toLowerCase(), i.id]));
        // parentMap: "institutionName|parentCategoryName" → parent_category_id
        const parentMap = new Map(
          parentCatsResult.data.map((p) => [
            `${(p.institution?.name ?? '').toLowerCase()}|${p.parent_category_name.toLowerCase()}`,
            p.id,
          ])
        );
        // subMap: "parentCategoryId|subCategoryName" → sub_category_id
        const subMap = new Map(
          subCatsResult.data.map((s) => [
            `${s.parent_category_id}|${s.sub_category_name.toLowerCase()}`,
            s.id,
          ])
        );

        // Validate all rows first
        const validationErrors: BillingCategoryImportError[] = [];
        rows.forEach((row, idx) => {
          const rowNum = idx + 2;
          const errs = validateItemCategoryRow(row);

          const institutionId = institutionMap.get(row.institution_name.toLowerCase());
          if (row.institution_name && !institutionId) {
            errs.push(`Institution "${row.institution_name}" not found — check Reference Codes sheet`);
          }

          const parentKey = `${row.institution_name.toLowerCase()}|${row.parent_category_name.toLowerCase()}`;
          const parentId = parentMap.get(parentKey);
          if (row.parent_category_name && !parentId) {
            errs.push(`Parent Category "${row.parent_category_name}" not found under institution "${row.institution_name}"`);
          }

          if (parentId && row.sub_category_name) {
            const subKey = `${parentId}|${row.sub_category_name.toLowerCase()}`;
            if (!subMap.has(subKey)) {
              errs.push(`Sub Category "${row.sub_category_name}" not found under parent "${row.parent_category_name}"`);
            }
          }

          if (errs.length > 0) {
            validationErrors.push({ row: rowNum, name: row.item_category_name || `Row ${rowNum}`, errors: errs });
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
          const institutionId = institutionMap.get(row.institution_name.toLowerCase())!;
          const parentKey = `${row.institution_name.toLowerCase()}|${row.parent_category_name.toLowerCase()}`;
          const parentId = parentMap.get(parentKey)!;
          const subKey = `${parentId}|${row.sub_category_name.toLowerCase()}`;
          const subId = subMap.get(subKey)!;

          try {
            await BillingItemCategoryService.createBillingItemCategory({
              institution_id: institutionId,
              parent_category_id: parentId,
              sub_category_id: subId,
              item_category_name: row.item_category_name,
              amount: row.amount,
              frequency: row.frequency as 'monthly' | 'quarterly' | 'yearly' | 'one-time',
              is_active: row.is_active,
            });
            successCount++;
          } catch (err) {
            uploadErrors.push({
              row: rowNum,
              name: row.item_category_name,
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
          fetchItemCategories();
          if (uploadErrors.length === 0) {
            toast.success(`Successfully uploaded ${successCount} item ${successCount === 1 ? 'category' : 'categories'}`);
          } else {
            toast.error(`${successCount} uploaded, ${uploadErrors.length} failed — see error details`);
          }
        } else {
          toast.error(`All ${rows.length} rows failed — see error details`);
        }
      } catch {
        toast.error('Failed to process file — check the format and try again');
      } finally {
        setIsUploading(false);
      }
    };
    input.click();
  };

  if (permissionsLoading) {
    return (
      <ContentLayout title='Billing Item Categories'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewItemCategories) {
    return (
      <ContentLayout title='Billing Item Categories'>
        <div className='text-center py-8'>
          <p className='text-destructive'>You don&apos;t have permission to view billing item categories.</p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Billing Item Categories'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button variant='outline' onClick={() => fetchItemCategories()} className='mt-4' disabled={!canViewItemCategories}>
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Billing Item Categories'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Item Categories', href: '/billing/categories/item-categories' },
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Billing Item Categories</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Define specific billable items with amounts and frequencies for actual fee collection
            </p>
          </div>
          <div className='flex flex-wrap gap-2 justify-end'>
            {canCreateItemCategories && (
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
            {canCreateItemCategories ? (
              <Button className='h-9' asChild>
                <Link href='/billing/categories/item-categories/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Add Item Category
                </Link>
              </Button>
            ) : (
              <Button className='h-9 opacity-50' disabled variant='outline'>
                <Plus className='mr-2 h-4 w-4' />
                Add Item Category
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <ItemCategoryFilters filters={filters} onFilterChange={updateFilters} />
            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <ItemCategoryList
                itemCategories={itemCategories}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchItemCategories}
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
                Institution, Parent Category, and Sub Category names must exactly match existing records. Frequency must be: monthly, quarterly, yearly, or one-time.
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
