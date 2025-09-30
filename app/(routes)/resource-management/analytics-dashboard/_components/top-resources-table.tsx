// app/(routes)/resource-management/analytics-dashboard/_components/top-resources-table.tsx
'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { TrendingUp } from 'lucide-react';
import type { ReservationAnalytics } from '@/types/analytics';

interface TopResourcesTableProps {
  data: ReservationAnalytics | undefined;
  isLoading: boolean;
}

export function TopResourcesTable({ data, isLoading }: TopResourcesTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-4 w-64 mt-2' />
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className='h-12 w-full' />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const topResources =
    data?.by_resource
      .sort((a, b) => b.reservation_count - a.reservation_count)
      .slice(0, 10) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <TrendingUp className='h-5 w-5' />
          Top Performing Resources
        </CardTitle>
        <CardDescription>
          Most reserved resources by booking count
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Resource Name</TableHead>
              <TableHead className='text-center'>Reservations</TableHead>
              <TableHead className='text-center'>Hours Used</TableHead>
              <TableHead className='text-center'>Utilization</TableHead>
              <TableHead className='text-right'>Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topResources.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className='text-center text-muted-foreground py-8'
                >
                  No reservation data available
                </TableCell>
              </TableRow>
            ) : (
              topResources.map((resource, index) => (
                <TableRow key={resource.resource_id}>
                  <TableCell className='font-medium'>
                    <div className='flex items-center gap-2'>
                      <Badge
                        variant='outline'
                        className='w-6 h-6 flex items-center justify-center p-0'
                      >
                        {index + 1}
                      </Badge>
                      {resource.resource_name}
                    </div>
                  </TableCell>
                  <TableCell className='text-center'>
                    <Badge variant='secondary'>
                      {resource.reservation_count}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-center'>
                    {resource.total_hours.toFixed(1)}h
                  </TableCell>
                  <TableCell className='text-center'>
                    <Badge
                      variant={
                        resource.utilization_rate > 70 ? 'default' : 'secondary'
                      }
                    >
                      {resource.utilization_rate.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className='text-right font-medium'>
                    ₹{resource.revenue.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
