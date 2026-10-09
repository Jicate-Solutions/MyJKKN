'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BeatLoader } from 'react-spinners';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useDeleteScholarshipCategory,
  useDeleteScholarshipType,
  useScholarshipSetup,
  useUpdateScholarshipCategory,
  useUpdateScholarshipType
} from '@/hooks/billing/use-scholarship-setup';
import type {
  ScholarshipCategory,
  ScholarshipType
} from '@/types/billing-schedule';
import { ScholarshipCategoryDialog } from '../_components/scholarship-category-dialog';
import { ScholarshipTypeDialog } from '../_components/scholarship-type-dialog';

/**
 * navMeta — reached from the "Categories & Types" button on the parent
 * Scholarship Management page, not from a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs`.
 */
export const navMeta = {
  invokedFrom: '/billing/scholarships'
} as const;

type PendingDelete =
  | { kind: 'category' | 'type'; id: string; name: string }
  | null;

const nextSort = (rows: { sort_order: number }[]) =>
  rows.reduce((max, r) => Math.max(max, r.sort_order), 0) + 10;

export default function ScholarshipSetupPage() {
  const router = useRouter();
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const canView = isSuperAdmin || canAccess('billing.scholarship_setup', 'view');
  const canCreate = isSuperAdmin || canAccess('billing.scholarship_setup', 'create');
  const canEdit = isSuperAdmin || canAccess('billing.scholarship_setup', 'edit');
  const canDelete = isSuperAdmin || canAccess('billing.scholarship_setup', 'delete');

  const { data: tree = [], isLoading, error } = useScholarshipSetup();
  const updateCategory = useUpdateScholarshipCategory();
  const updateType = useUpdateScholarshipType();
  const deleteCategory = useDeleteScholarshipCategory();
  const deleteType = useDeleteScholarshipType();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{
    open: boolean;
    category: ScholarshipCategory | null;
  }>({ open: false, category: null });
  const [typeDialog, setTypeDialog] = useState<{
    open: boolean;
    type: ScholarshipType | null;
  }>({ open: false, type: null });
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  // Keep a valid selection: first category on load, and again after a delete.
  useEffect(() => {
    if (tree.length > 0 && !tree.some((c) => c.id === selectedId)) {
      setSelectedId(tree[0].id);
    }
  }, [tree, selectedId]);

  const selected = tree.find((c) => c.id === selectedId) ?? null;

  if (permissionsLoading) {
    return (
      <ContentLayout title='Scholarship Categories & Types'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title='Scholarship Categories & Types'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view scholarship categories and types.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      if (pendingDelete.kind === 'category') {
        await deleteCategory.mutateAsync(pendingDelete.id);
      } else {
        await deleteType.mutateAsync(pendingDelete.id);
      }
      setPendingDelete(null);
    } catch {
      // Toasted by the hook (e.g. "in use — deactivate it instead").
      setPendingDelete(null);
    }
  };

  return (
    <ContentLayout title='Scholarship Categories & Types'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Scholarships', href: '/billing/scholarships' },
          { label: 'Categories & Types', href: '/billing/scholarships/setup' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex items-center gap-4'>
          <Button variant='outline' size='sm' onClick={() => router.push('/billing/scholarships')}>
            <ArrowLeft className='h-4 w-4' />
          </Button>
          <div>
            <h1 className='text-2xl font-bold py-1'>Scholarship Categories & Types</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Define the categories and the types under each one. They appear on
              the Apply Scholarship form for every institution.
            </p>
          </div>
        </div>

        {error && (
          <p className='text-destructive'>
            Could not load scholarship categories. Reload the page to retry.
          </p>
        )}

        <div className='grid grid-cols-1 lg:grid-cols-5 gap-6'>
          {/* Categories */}
          <Card className='lg:col-span-2'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0'>
              <CardTitle>Categories</CardTitle>
              {canCreate && (
                <Button
                  size='sm'
                  onClick={() => setCategoryDialog({ open: true, category: null })}
                >
                  <Plus className='mr-1 h-4 w-4' /> Add category
                </Button>
              )}
            </CardHeader>
            <CardContent className='space-y-2'>
              {isLoading && <BeatLoader size={8} color='#00e902' />}
              {!isLoading && tree.length === 0 && (
                <p className='text-sm text-muted-foreground'>No categories yet.</p>
              )}
              {tree.map((category) => (
                <div
                  key={category.id}
                  className={`flex items-center justify-between gap-2 rounded-md border p-3 ${
                    category.id === selectedId ? 'border-primary bg-muted/50' : ''
                  }`}
                >
                  <button
                    type='button'
                    className='flex-1 text-left'
                    onClick={() => setSelectedId(category.id)}
                  >
                    <div className='font-medium'>{category.name}</div>
                    <div className='text-xs text-muted-foreground'>
                      {category.types.length}{' '}
                      {category.types.length === 1 ? 'type' : 'types'}
                      {category.is_active ? '' : ' · inactive'}
                    </div>
                  </button>
                  <div className='flex items-center gap-1'>
                    {canEdit && (
                      <>
                        <Button
                          variant='ghost'
                          size='icon'
                          aria-label={`Edit ${category.name}`}
                          onClick={() => setCategoryDialog({ open: true, category })}
                        >
                          <Pencil className='h-4 w-4' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          aria-label={`${category.is_active ? 'Deactivate' : 'Activate'} ${category.name}`}
                          disabled={updateCategory.isPending}
                          onClick={() =>
                            updateCategory.mutate({
                              id: category.id,
                              data: { is_active: !category.is_active }
                            })
                          }
                        >
                          <Power
                            className={`h-4 w-4 ${category.is_active ? '' : 'text-muted-foreground'}`}
                          />
                        </Button>
                      </>
                    )}
                    {canDelete && (
                      <Button
                        variant='ghost'
                        size='icon'
                        aria-label={`Delete ${category.name}`}
                        onClick={() =>
                          setPendingDelete({ kind: 'category', id: category.id, name: category.name })
                        }
                      >
                        <Trash2 className='h-4 w-4 text-destructive' />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Types of the selected category */}
          <Card className='lg:col-span-3'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0'>
              <CardTitle>
                {selected ? `Types — ${selected.name}` : 'Types'}
              </CardTitle>
              {canCreate && selected && (
                <Button size='sm' onClick={() => setTypeDialog({ open: true, type: null })}>
                  <Plus className='mr-1 h-4 w-4' /> Add type
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!selected ? (
                <p className='text-sm text-muted-foreground'>
                  Select a category to see its types.
                </p>
              ) : selected.types.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  No types under this category yet.
                </p>
              ) : (
                <div className='rounded-md border overflow-x-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Default</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className='text-right'>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.types.map((type) => (
                        <TableRow key={type.id}>
                          <TableCell>
                            <div className='font-medium'>{type.name}</div>
                            {type.description && (
                              <div className='text-xs text-muted-foreground'>
                                {type.description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className='whitespace-nowrap'>
                            {type.default_value != null
                              ? type.default_value_mode === 'percentage'
                                ? `${type.default_value}%`
                                : `₹${Number(type.default_value).toLocaleString('en-IN')}`
                              : type.default_value_mode === 'percentage'
                                ? 'Percentage'
                                : 'Fixed Amount'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={type.is_active ? 'default' : 'secondary'}>
                              {type.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className='text-right whitespace-nowrap'>
                            {canEdit && (
                              <>
                                <Button
                                  variant='ghost'
                                  size='icon'
                                  aria-label={`Edit ${type.name}`}
                                  onClick={() => setTypeDialog({ open: true, type })}
                                >
                                  <Pencil className='h-4 w-4' />
                                </Button>
                                <Button
                                  variant='ghost'
                                  size='icon'
                                  aria-label={`${type.is_active ? 'Deactivate' : 'Activate'} ${type.name}`}
                                  disabled={updateType.isPending}
                                  onClick={() =>
                                    updateType.mutate({
                                      id: type.id,
                                      data: { is_active: !type.is_active }
                                    })
                                  }
                                >
                                  <Power
                                    className={`h-4 w-4 ${type.is_active ? '' : 'text-muted-foreground'}`}
                                  />
                                </Button>
                              </>
                            )}
                            {canDelete && (
                              <Button
                                variant='ghost'
                                size='icon'
                                aria-label={`Delete ${type.name}`}
                                onClick={() =>
                                  setPendingDelete({ kind: 'type', id: type.id, name: type.name })
                                }
                              >
                                <Trash2 className='h-4 w-4 text-destructive' />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ScholarshipCategoryDialog
        open={categoryDialog.open}
        onOpenChange={(open) => setCategoryDialog((s) => ({ ...s, open }))}
        category={categoryDialog.category}
        nextSortOrder={nextSort(tree)}
      />

      {selected && (
        <ScholarshipTypeDialog
          open={typeDialog.open}
          onOpenChange={(open) => setTypeDialog((s) => ({ ...s, open }))}
          categoryId={selected.id}
          categoryName={selected.name}
          type={typeDialog.type}
          nextSortOrder={nextSort(selected.types)}
        />
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{pendingDelete?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This only works while nothing uses it. If scholarships already
              reference it (or, for a category, it still has types), deactivate
              it instead — it then disappears from the Apply form but stays on
              existing records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
