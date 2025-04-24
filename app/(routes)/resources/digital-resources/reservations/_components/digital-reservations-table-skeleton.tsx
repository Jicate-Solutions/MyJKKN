import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export function DigitalReservationsTableSkeleton() {
  return (
    <Card>
      <CardHeader className='pb-0'>
        <div className='flex justify-between items-center'>
          <Skeleton className='h-9 w-48' />
          <div className='flex gap-2'>
            <Skeleton className='h-9 w-40' />
            <Skeleton className='h-9 w-20' />
          </div>
        </div>
        <div className='mt-4 flex gap-2'>
          <Skeleton className='h-9 w-40' />
          <Skeleton className='h-9 w-40' />
          <Skeleton className='h-9 w-40' />
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Skeleton className='h-4 w-full' />
              </TableHead>
              <TableHead>
                <Skeleton className='h-4 w-full' />
              </TableHead>
              <TableHead>
                <Skeleton className='h-4 w-full' />
              </TableHead>
              <TableHead>
                <Skeleton className='h-4 w-full' />
              </TableHead>
              <TableHead>
                <Skeleton className='h-4 w-full' />
              </TableHead>
              <TableHead>
                <Skeleton className='h-4 w-20' />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className='h-4 w-full' />
                </TableCell>
                <TableCell>
                  <Skeleton className='h-4 w-full' />
                </TableCell>
                <TableCell>
                  <Skeleton className='h-4 w-full' />
                </TableCell>
                <TableCell>
                  <Skeleton className='h-4 w-full' />
                </TableCell>
                <TableCell>
                  <Skeleton className='h-4 w-full' />
                </TableCell>
                <TableCell>
                  <Skeleton className='h-6 w-20' />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className='mt-4 flex justify-center'>
          <Skeleton className='h-9 w-80' />
        </div>
      </CardContent>
    </Card>
  );
}
