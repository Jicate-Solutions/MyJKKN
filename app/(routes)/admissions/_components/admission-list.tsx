import Link from 'next/link';
import { Eye, MoreHorizontal, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/pagination';
import { AdmissionData } from '@/hooks/admission/use-admissions';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useUpdateAdmissionStatus,
  useDeleteAdmission
} from '@/hooks/admission/use-admissions';
import {
  CheckCircle,
  Clock,
  Edit,
  AlertCircle,
  XCircle,
  ClockIcon,
  UserCheck,
  Trash2
} from 'lucide-react';
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
import toast from 'react-hot-toast';

type PaginationMetadata = {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalCount: number;
};

interface AdmissionListProps {
  admissions: AdmissionData[];
  metadata: PaginationMetadata;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

interface StatusUpdateInfo {
  id: string;
  status: string;
}

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100';
    case 'approved':
      return 'bg-green-100 text-green-800 hover:bg-green-100';
    case 'rejected':
      return 'bg-red-100 text-red-800 hover:bg-red-100';
    case 'waitlisted':
      return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
    default:
      return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
  }
};

export function AdmissionList({
  admissions,
  metadata,
  onPageChange,
  onRefresh
}: AdmissionListProps) {
  const router = useRouter();
  const updateStatus = useUpdateAdmissionStatus();
  const deleteAdmission = useDeleteAdmission();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [admissionToDelete, setAdmissionToDelete] = useState<string | null>(
    null
  );
  const [statusUpdateInfo, setStatusUpdateInfo] =
    useState<StatusUpdateInfo | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  const handleUpdateStatus = (id: string, status: string) => {
    setStatusUpdateInfo({ id, status });
    setIsConfirmDialogOpen(true);
  };

  const confirmStatusUpdate = async () => {
    if (!statusUpdateInfo) return;

    const { id, status } = statusUpdateInfo;
    try {
      setUpdatingId(id);
      await updateStatus.mutateAsync({ id, status });
      toast.success(
        `Status updated to ${status.charAt(0).toUpperCase() + status.slice(1)}`
      );
      onRefresh();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    } finally {
      setUpdatingId(null);
      setStatusUpdateInfo(null);
      setIsConfirmDialogOpen(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500); // Keep the loading state visible for at least 500ms
    }
  };

  const handleDeleteAdmission = async () => {
    if (!admissionToDelete) return;

    try {
      await deleteAdmission.mutateAsync(admissionToDelete);
      setAdmissionToDelete(null);
      onRefresh();
    } catch (error) {
      console.error('Error deleting admission:', error);
      // Toast will be shown by the service
    }
  };

  const hasAdmissions = admissions.length > 0;

  const renderPagination = () => {
    if (metadata.totalPages <= 1) return null;

    return (
      <Pagination
        currentPage={metadata.currentPage}
        totalPages={metadata.totalPages}
        onPageChange={onPageChange}
      />
    );
  };

  return (
    <div>
      <div className='flex justify-between items-center mb-4'>
        <div className='text-sm text-muted-foreground'>
          {hasAdmissions
            ? `Showing ${
                (metadata.currentPage - 1) * metadata.pageSize + 1
              }-${Math.min(
                metadata.currentPage * metadata.pageSize,
                metadata.totalCount
              )} of ${metadata.totalCount} applications`
            : 'No applications found'}
        </div>
        <Button
          variant='ghost'
          size='sm'
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`}
          />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {!hasAdmissions ? (
        <div className='text-center py-10 border rounded-lg'>
          <p className='text-muted-foreground'>
            No admission applications found
          </p>
        </div>
      ) : (
        <div className='border rounded-lg overflow-hidden relative'>
          {isRefreshing && (
            <div className='absolute inset-0 bg-white/50 flex items-center justify-center z-10'>
              <div className='flex flex-col items-center bg-white p-4 rounded-lg shadow'>
                <RefreshCw className='h-6 w-6 animate-spin text-primary mb-2' />
                <p className='text-sm'>Refreshing data...</p>
              </div>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Application ID</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Application Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admissions.map((admission) => (
                <TableRow key={admission.id}>
                  <TableCell className='font-medium'>
                    {admission.id.slice(0, 8)}
                  </TableCell>
                  <TableCell>{admission.student_name}</TableCell>
                  <TableCell>
                    {admission.institution?.name ||
                      (admission.institution_id
                        ? `ID: ${admission.institution_id}`
                        : 'N/A')}
                  </TableCell>
                  <TableCell>
                    {admission.program?.program_name ||
                      (admission.program_id
                        ? `ID: ${admission.program_id}`
                        : 'N/A')}
                  </TableCell>
                  <TableCell>
                    {format(new Date(admission.created_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant='outline'
                      className={getStatusColor(admission.status)}
                    >
                      {updatingId === admission.id ? (
                        <span className='flex items-center'>
                          <ClockIcon className='h-3 w-3 mr-1 animate-spin' />
                          Updating...
                        </span>
                      ) : (
                        admission.status.charAt(0).toUpperCase() +
                          admission.status.slice(1) || 'Pending'
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' size='icon'>
                          <MoreHorizontal className='h-4 w-4' />
                          <span className='sr-only'>Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuItem asChild>
                          <Link href={`/admissions/${admission.id}`}>
                            <Eye className='mr-2 h-4 w-4' />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/admissions/${admission.id}/edit`}>
                            <Edit className='mr-2 h-4 w-4' />
                            Edit Application
                          </Link>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <Clock className='mr-2 h-4 w-4' />
                            Update Status
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem
                              onClick={() =>
                                handleUpdateStatus(admission.id, 'pending')
                              }
                              disabled={
                                admission.status === 'pending' ||
                                updatingId === admission.id
                              }
                            >
                              <ClockIcon className='mr-2 h-4 w-4 text-yellow-500' />
                              Pending
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleUpdateStatus(admission.id, 'approved')
                              }
                              disabled={
                                admission.status === 'approved' ||
                                updatingId === admission.id
                              }
                            >
                              <CheckCircle className='mr-2 h-4 w-4 text-green-500' />
                              Approved
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleUpdateStatus(admission.id, 'rejected')
                              }
                              disabled={
                                admission.status === 'rejected' ||
                                updatingId === admission.id
                              }
                            >
                              <XCircle className='mr-2 h-4 w-4 text-red-500' />
                              Rejected
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleUpdateStatus(admission.id, 'waitlisted')
                              }
                              disabled={
                                admission.status === 'waitlisted' ||
                                updatingId === admission.id
                              }
                            >
                              <AlertCircle className='mr-2 h-4 w-4 text-blue-500' />
                              Waitlisted
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleUpdateStatus(admission.id, 'enrolled')
                              }
                              disabled={
                                admission.status === 'enrolled' ||
                                updatingId === admission.id
                              }
                            >
                              <UserCheck className='mr-2 h-4 w-4 text-purple-500' />
                              Enrolled
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          onClick={() => setAdmissionToDelete(admission.id)}
                          className='text-destructive focus:text-destructive'
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {renderPagination()}

      <AlertDialog
        open={!!admissionToDelete}
        onOpenChange={(open) => !open && setAdmissionToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              admission application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAdmission.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAdmission}
              disabled={deleteAdmission.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deleteAdmission.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isConfirmDialogOpen}
        onOpenChange={setIsConfirmDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Status Update</AlertDialogTitle>
            <AlertDialogDescription>
              {statusUpdateInfo?.status === 'approved' && (
                <div className='mb-2 text-yellow-700 font-semibold'>
                  Approving this admission will automatically create a student
                  record.
                </div>
              )}
              Are you sure you want to update the status to{' '}
              {statusUpdateInfo && (
                <span className='font-bold'>
                  {statusUpdateInfo.status.charAt(0).toUpperCase() +
                    statusUpdateInfo.status.slice(1)}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatingId === statusUpdateInfo?.id}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStatusUpdate}
              disabled={updatingId === statusUpdateInfo?.id}
            >
              {updatingId === statusUpdateInfo?.id ? 'Updating...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
