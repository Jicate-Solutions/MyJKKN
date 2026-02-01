/**
 * Process Audits List Page
 *
 * Lists all process audits with filtering and management.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Eye, Edit, Trash2, FileText } from 'lucide-react';
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
import { useProcessAudits, useDeleteProcessAudit } from '@/hooks/process-excellence';
import {
  ABCD_RATING_LABELS,
  ABCD_RATING_COLORS
} from '@/types/process-excellence';
import type { ABCDRating, AuditStatus } from '@/types/process-excellence';

const STATUS_COLORS: Record<AuditStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  in_review: 'bg-blue-100 text-blue-800',
  finalized: 'bg-green-100 text-green-800'
};

export default function ProcessAuditsPage() {
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [rating, setRating] = useState<string>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useProcessAudits({
    institution_id: selectedInstitutionId || undefined,
    status: status !== 'all' ? (status as AuditStatus) : undefined,
    abcd_rating: rating !== 'all' ? (rating as ABCDRating) : undefined,
    page,
    limit: 10
  });

  const deleteAudit = useDeleteProcessAudit();

  const handleDelete = async (id: string) => {
    await deleteAudit.mutateAsync(id);
  };

  return (
    <ContentLayout title='Process Audits'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Process Excellence', href: '/process-excellence' },
          { label: 'Audits', href: '/process-excellence/audits' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Process Audits</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Periodic audit reports with A/B/C/D performance ratings
            </p>
          </div>

          <Button asChild>
            <Link href='/process-excellence/audits/new'>
              <Plus className='mr-2 h-4 w-4' />
              New Audit
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className='pt-6'>
            <div className='flex flex-col sm:flex-row gap-4'>
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
                  <SelectItem value='draft'>Draft</SelectItem>
                  <SelectItem value='in_review'>In Review</SelectItem>
                  <SelectItem value='finalized'>Finalized</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={rating}
                onValueChange={(value) => {
                  setRating(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className='w-[150px]'>
                  <SelectValue placeholder='All Ratings' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Ratings</SelectItem>
                  {Object.entries(ABCD_RATING_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {key}: {label}
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
                Please select an institution to view process audits.
              </p>
            ) : isLoading ? (
              <p className='text-center text-muted-foreground py-8'>
                Loading...
              </p>
            ) : error ? (
              <p className='text-center text-destructive py-8'>
                Failed to load process audits.
              </p>
            ) : !data?.data.length ? (
              <p className='text-center text-muted-foreground py-8'>
                No audits found. Create one to evaluate process performance.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Process</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Instances</TableHead>
                      <TableHead>Avg Cycle Time</TableHead>
                      <TableHead>Value-Add</TableHead>
                      <TableHead>SLA Compliance</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='text-right'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((audit) => (
                      <TableRow key={audit.id}>
                        <TableCell className='font-medium'>
                          {(audit as any).process?.name || 'Unknown'}
                        </TableCell>
                        <TableCell>
                          {new Date(audit.audit_period_start).toLocaleDateString()} -
                          {new Date(audit.audit_period_end).toLocaleDateString()}
                        </TableCell>
                        <TableCell>{audit.total_instances}</TableCell>
                        <TableCell>
                          {audit.avg_cycle_hours
                            ? `${audit.avg_cycle_hours.toFixed(1)}h`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {audit.avg_value_add_ratio
                            ? `${audit.avg_value_add_ratio.toFixed(1)}%`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {audit.sla_compliance_rate
                            ? `${audit.sla_compliance_rate.toFixed(1)}%`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {audit.abcd_rating ? (
                            <Badge
                              style={{
                                backgroundColor:
                                  ABCD_RATING_COLORS[audit.abcd_rating as ABCDRating],
                                color: 'white'
                              }}
                            >
                              {audit.abcd_rating}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant='outline'
                            className={STATUS_COLORS[audit.status as AuditStatus]}
                          >
                            {audit.status === 'in_review' ? 'In Review' : audit.status}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-right'>
                          <div className='flex justify-end gap-2'>
                            <Button variant='ghost' size='icon' asChild>
                              <Link href={`/process-excellence/audits/${audit.id}`}>
                                <Eye className='h-4 w-4' />
                              </Link>
                            </Button>
                            {audit.status !== 'finalized' && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant='ghost' size='icon'>
                                    <Trash2 className='h-4 w-4 text-destructive' />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Audit</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete this audit?
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(audit.id)}
                                      className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
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
