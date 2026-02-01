/**
 * Process Instances List Page
 *
 * Lists all active and completed process instances with SLA tracking.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, CheckCircle, Clock, XCircle, Activity } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useProcessInstances,
  useActiveProcessDefinitions
} from '@/hooks/process-excellence';
import { SLA_STATUS_LABELS } from '@/types/process-excellence';
import type { SLAStatus } from '@/types/process-excellence';

const SLA_STATUS_ICONS = {
  on_track: <CheckCircle className='h-4 w-4 text-green-500' />,
  at_risk: <Clock className='h-4 w-4 text-amber-500' />,
  breached: <XCircle className='h-4 w-4 text-red-500' />
};

const SLA_STATUS_COLORS: Record<SLAStatus, string> = {
  on_track: 'bg-green-100 text-green-800',
  at_risk: 'bg-amber-100 text-amber-800',
  breached: 'bg-red-100 text-red-800'
};

export default function ProcessInstancesPage() {
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const [processId, setProcessId] = useState<string>('all');
  const [slaStatus, setSlaStatus] = useState<string>('all');
  const [isCompleted, setIsCompleted] = useState<string>('all');
  const [page, setPage] = useState(1);

  const { data: processes } = useActiveProcessDefinitions(selectedInstitutionId || '');

  const { data, isLoading, error } = useProcessInstances({
    institution_id: selectedInstitutionId || undefined,
    process_id: processId !== 'all' ? processId : undefined,
    sla_status: slaStatus !== 'all' ? (slaStatus as SLAStatus) : undefined,
    is_completed:
      isCompleted === 'all' ? undefined : isCompleted === 'completed',
    page,
    limit: 10
  });

  return (
    <ContentLayout title='Process Instances'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Process Excellence', href: '/process-excellence' },
          { label: 'Instances', href: '/process-excellence/instances' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Process Instances</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Track in-progress and completed process executions with SLA monitoring
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className='pt-6'>
            <div className='flex flex-col sm:flex-row gap-4'>
              <Select
                value={processId}
                onValueChange={(value) => {
                  setProcessId(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className='w-[200px]'>
                  <SelectValue placeholder='All Processes' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Processes</SelectItem>
                  {processes?.map((process) => (
                    <SelectItem key={process.id} value={process.id}>
                      {process.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={slaStatus}
                onValueChange={(value) => {
                  setSlaStatus(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className='w-[150px]'>
                  <SelectValue placeholder='All SLA Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All SLA Status</SelectItem>
                  {Object.entries(SLA_STATUS_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={isCompleted}
                onValueChange={(value) => {
                  setIsCompleted(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className='w-[150px]'>
                  <SelectValue placeholder='All Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All</SelectItem>
                  <SelectItem value='active'>Active Only</SelectItem>
                  <SelectItem value='completed'>Completed Only</SelectItem>
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
                Please select an institution to view process instances.
              </p>
            ) : isLoading ? (
              <p className='text-center text-muted-foreground py-8'>
                Loading...
              </p>
            ) : error ? (
              <p className='text-center text-destructive py-8'>
                Failed to load process instances.
              </p>
            ) : !data?.data.length ? (
              <p className='text-center text-muted-foreground py-8'>
                No process instances found.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Process</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Current Stage</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Cycle Time</TableHead>
                      <TableHead>Value-Add</TableHead>
                      <TableHead>SLA Status</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((instance) => (
                      <TableRow key={instance.id}>
                        <TableCell className='font-medium'>
                          {(instance as any).process?.name || 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <span className='text-xs text-muted-foreground'>
                            {instance.reference_type}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant='outline'>
                            {instance.current_stage || 'N/A'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(instance.started_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {instance.total_cycle_hours
                            ? `${instance.total_cycle_hours.toFixed(1)}h`
                            : instance.completed_at
                            ? '-'
                            : (
                                (Date.now() - new Date(instance.started_at).getTime()) /
                                (1000 * 60 * 60)
                              ).toFixed(1) + 'h'}
                        </TableCell>
                        <TableCell>
                          {instance.value_add_ratio !== null
                            ? `${instance.value_add_ratio.toFixed(1)}%`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <div className='flex items-center gap-2'>
                            {SLA_STATUS_ICONS[instance.sla_status]}
                            <Badge
                              variant='outline'
                              className={SLA_STATUS_COLORS[instance.sla_status]}
                            >
                              {SLA_STATUS_LABELS[instance.sla_status]}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {instance.completed_at ? (
                            <Badge variant='secondary'>Completed</Badge>
                          ) : (
                            <Badge className='bg-blue-100 text-blue-800'>
                              <Activity className='h-3 w-3 mr-1' />
                              Active
                            </Badge>
                          )}
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
