/**
 * Process Definitions List Page
 *
 * Lists all process definitions with filtering and CRUD operations.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Settings, Trash2, Edit, Eye } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useProcessDefinitions,
  useDeleteProcessDefinition
} from '@/hooks/process-excellence';
import { PROCESS_CATEGORY_LABELS } from '@/types/process-excellence';
import type { ProcessCategory } from '@/types/process-excellence';

export default function ProcessDefinitionsPage() {
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useProcessDefinitions({
    institution_id: selectedInstitutionId || undefined,
    search: search || undefined,
    category: category !== 'all' ? (category as ProcessCategory) : undefined,
    page,
    limit: 10
  });

  const deleteDefinition = useDeleteProcessDefinition();

  const handleDelete = async (id: string) => {
    await deleteDefinition.mutateAsync(id);
  };

  return (
    <ContentLayout title='Process Definitions'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Process Excellence', href: '/process-excellence' },
          { label: 'Definitions', href: '/process-excellence/definitions' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Process Definitions</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Define auditable processes with stages, SLAs, and value-add targets
            </p>
          </div>

          <Button asChild>
            <Link href='/process-excellence/definitions/new'>
              <Plus className='mr-2 h-4 w-4' />
              New Process
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className='pt-6'>
            <div className='flex flex-col sm:flex-row gap-4'>
              <div className='flex-1'>
                <Input
                  placeholder='Search processes...'
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Select
                value={category}
                onValueChange={(value) => {
                  setCategory(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className='w-[180px]'>
                  <SelectValue placeholder='All Categories' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Categories</SelectItem>
                  {Object.entries(PROCESS_CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className='pt-6'>
            {!selectedInstitutionId ? (
              <p className='text-center text-muted-foreground py-8'>
                Please select an institution to view process definitions.
              </p>
            ) : isLoading ? (
              <p className='text-center text-muted-foreground py-8'>
                Loading...
              </p>
            ) : error ? (
              <p className='text-center text-destructive py-8'>
                Failed to load process definitions.
              </p>
            ) : !data?.data.length ? (
              <p className='text-center text-muted-foreground py-8'>
                No process definitions found. Create one to get started.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Stages</TableHead>
                      <TableHead>SLA (hrs)</TableHead>
                      <TableHead>Target Value-Add</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='text-right'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((definition) => (
                      <TableRow key={definition.id}>
                        <TableCell className='font-medium'>
                          {definition.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant='outline' className='capitalize'>
                            {definition.category}
                          </Badge>
                        </TableCell>
                        <TableCell>{definition.stages?.length || 0}</TableCell>
                        <TableCell>{definition.sla_hours || '-'}</TableCell>
                        <TableCell>
                          {definition.target_value_add_ratio
                            ? `${definition.target_value_add_ratio}%`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={definition.is_active ? 'default' : 'secondary'}>
                            {definition.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-right'>
                          <div className='flex justify-end gap-2'>
                            <Button variant='ghost' size='icon' asChild>
                              <Link href={`/process-excellence/definitions/${definition.id}`}>
                                <Eye className='h-4 w-4' />
                              </Link>
                            </Button>
                            <Button variant='ghost' size='icon' asChild>
                              <Link href={`/process-excellence/definitions/${definition.id}/edit`}>
                                <Edit className='h-4 w-4' />
                              </Link>
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant='ghost' size='icon'>
                                  <Trash2 className='h-4 w-4 text-destructive' />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Process Definition</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete &quot;{definition.name}&quot;?
                                    This will also delete all associated instances and audits.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(definition.id)}
                                    className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {data.metadata.totalPages > 1 && (
                  <div className='flex justify-center gap-2 mt-4'>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <span className='flex items-center px-3 text-sm'>
                      Page {page} of {data.metadata.totalPages}
                    </span>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page >= data.metadata.totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
