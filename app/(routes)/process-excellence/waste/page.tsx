/**
 * Waste Incidents List Page
 *
 * Lists all TIMWOOD waste incidents with filtering and management.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Eye, CheckCircle, Trash2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  useWasteIncidents,
  useResolveWasteIncident,
  useDeleteWasteIncident
} from '@/hooks/process-excellence';
import { WASTE_LABELS, WASTE_COLORS } from '@/types/process-excellence';
import type { WasteCategory, WasteStatus } from '@/types/process-excellence';

const STATUS_COLORS: Record<WasteStatus, string> = {
  open: 'bg-red-100 text-red-800',
  investigating: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-800'
};

export default function WasteIncidentsPage() {
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useWasteIncidents({
    institution_id: selectedInstitutionId || undefined,
    search: search || undefined,
    waste_category: category !== 'all' ? (category as WasteCategory) : undefined,
    status: status !== 'all' ? (status as WasteStatus) : undefined,
    page,
    limit: 10
  });

  const resolveIncident = useResolveWasteIncident();
  const deleteIncident = useDeleteWasteIncident();

  const handleResolve = async (id: string) => {
    await resolveIncident.mutateAsync({ id });
  };

  const handleDelete = async (id: string) => {
    await deleteIncident.mutateAsync(id);
  };

  return (
    <ContentLayout title='Waste Incidents'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Process Excellence', href: '/process-excellence' },
          { label: 'Waste Incidents', href: '/process-excellence/waste' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>TIMWOOD Waste Incidents</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Track and manage waste incidents across processes
            </p>
          </div>

          <Button asChild>
            <Link href='/process-excellence/waste/new'>
              <Plus className='mr-2 h-4 w-4' />
              Report Waste
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className='pt-6'>
            <div className='flex flex-col sm:flex-row gap-4'>
              <div className='flex-1'>
                <Input
                  placeholder='Search incidents...'
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
                  {Object.entries(WASTE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {key}: {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className='w-[150px]'>
                  <SelectValue placeholder='All Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Status</SelectItem>
                  <SelectItem value='open'>Open</SelectItem>
                  <SelectItem value='investigating'>Investigating</SelectItem>
                  <SelectItem value='resolved'>Resolved</SelectItem>
                  <SelectItem value='dismissed'>Dismissed</SelectItem>
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
                Please select an institution to view waste incidents.
              </p>
            ) : isLoading ? (
              <p className='text-center text-muted-foreground py-8'>
                Loading...
              </p>
            ) : error ? (
              <p className='text-center text-destructive py-8'>
                Failed to load waste incidents.
              </p>
            ) : !data?.data.length ? (
              <p className='text-center text-muted-foreground py-8'>
                No waste incidents found. Report one to start tracking waste.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Process</TableHead>
                      <TableHead>Time Lost</TableHead>
                      <TableHead>Cost Impact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reported</TableHead>
                      <TableHead className='text-right'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((incident) => (
                      <TableRow key={incident.id}>
                        <TableCell>
                          <div className='flex items-center gap-2'>
                            <div
                              className='w-3 h-3 rounded-full'
                              style={{
                                backgroundColor: WASTE_COLORS[incident.waste_category]
                              }}
                            />
                            <span className='font-medium'>
                              {incident.waste_category}
                            </span>
                          </div>
                          <span className='text-xs text-muted-foreground'>
                            {WASTE_LABELS[incident.waste_category]}
                          </span>
                        </TableCell>
                        <TableCell className='max-w-xs truncate'>
                          {incident.description}
                        </TableCell>
                        <TableCell>
                          {(incident as any).process?.name || '-'}
                        </TableCell>
                        <TableCell>
                          {incident.estimated_time_lost_hours
                            ? `${incident.estimated_time_lost_hours}h`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {incident.estimated_cost_impact
                            ? `Rs.${incident.estimated_cost_impact.toLocaleString()}`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant='outline'
                            className={STATUS_COLORS[incident.status as WasteStatus]}
                          >
                            {incident.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(incident.reported_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className='text-right'>
                          <div className='flex justify-end gap-2'>
                            {incident.status === 'open' && (
                              <Button
                                variant='ghost'
                                size='icon'
                                onClick={() => handleResolve(incident.id)}
                                title='Mark as Resolved'
                              >
                                <CheckCircle className='h-4 w-4 text-green-500' />
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant='ghost' size='icon'>
                                  <Trash2 className='h-4 w-4 text-destructive' />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Waste Incident</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this waste incident?
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(incident.id)}
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
