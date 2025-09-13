'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Eye,
  Edit,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Trash2,
  Plus
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import {
  AdmissionData,
  useUpdateAdmissionStatus,
  useDeleteAdmission,
  useBulkDeleteAdmissions
} from '@/hooks/admission/use-admissions';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import BulkUploadAdmissions from './bulk-upload-admissions';
import DownloadTemplateButton from './download-template-button';

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

interface AdmissionDataTableProps {
  data: AdmissionData[];
  canEdit?: boolean;
  canDelete?: boolean;
  canCreate?: boolean;
  onRefresh: () => void;
  isLoading?: boolean;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export function AdmissionDataTable({
  data,
  canEdit = false,
  canDelete = false,
  canCreate = false,
  onRefresh,
  isLoading = false,
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange
}: AdmissionDataTableProps) {
  const router = useRouter();
  const updateStatus = useUpdateAdmissionStatus();
  const deleteAdmission = useDeleteAdmission();
  const bulkDeleteAdmissions = useBulkDeleteAdmissions();
  const queryClient = useQueryClient();

  const [statusUpdateDialog, setStatusUpdateDialog] = useState<{
    open: boolean;
    admissionId: string;
    newStatus: string;
  }>({ open: false, admissionId: '', newStatus: '' });

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleUpdateStatus = async (id: string, status: string) => {
    if (!canEdit) return;

    setStatusUpdateDialog({
      open: true,
      admissionId: id,
      newStatus: status
    });
  };

  const confirmStatusUpdate = async () => {
    const { admissionId, newStatus } = statusUpdateDialog;

    try {
      setUpdatingId(admissionId);
      await updateStatus.mutateAsync({ id: admissionId, status: newStatus });

      toast.success(
        `Status updated to ${
          newStatus.charAt(0).toUpperCase() + newStatus.slice(1)
        }`
      );

      // If approved, refresh to trigger real-time updates
      if (newStatus === 'approved') {
        router.refresh();
      }

      onRefresh();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    } finally {
      setUpdatingId(null);
      setStatusUpdateDialog({ open: false, admissionId: '', newStatus: '' });
    }
  };

  const handleBulkDelete = async (admissions: AdmissionData[]) => {
    if (!canDelete) return;

    try {
      // Extract IDs from the selected admissions
      const admissionIds = admissions.map(admission => admission.id);
      
      // Use the bulk delete service that shows only one toast message
      await bulkDeleteAdmissions.mutateAsync(admissionIds);
      
      onRefresh();
    } catch (error) {
      console.error('Error deleting admissions:', error);
      throw error;
    }
  };

  // Note: Search functionality is handled server-side through the AdmissionFilter component
  // The DataTable is used only for display with server-side pagination

  const ActionsCell = ({ admission }: { admission: AdmissionData }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='sm'>
          <MoreHorizontal className='h-4 w-4' />
          <span className='sr-only'>Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={`/admissions/${admission.id}`}>
            <Eye className='mr-2 h-4 w-4' />
            View Details
          </Link>
        </DropdownMenuItem>
        {canEdit && (
          <DropdownMenuItem asChild>
            <Link href={`/admissions/${admission.id}/edit`}>
              <Edit className='mr-2 h-4 w-4' />
              Edit Application
            </Link>
          </DropdownMenuItem>
        )}

        {canEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Clock className='mr-2 h-4 w-4' />
                Update Status
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onClick={() => handleUpdateStatus(admission.id, 'pending')}
                  disabled={
                    admission.status === 'pending' ||
                    updatingId === admission.id
                  }
                >
                  <Clock className='mr-2 h-4 w-4 text-yellow-500' />
                  Mark as Pending
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleUpdateStatus(admission.id, 'approved')}
                  disabled={
                    admission.status === 'approved' ||
                    updatingId === admission.id
                  }
                >
                  <CheckCircle className='mr-2 h-4 w-4 text-green-500' />
                  Mark as Approved
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleUpdateStatus(admission.id, 'rejected')}
                  disabled={
                    admission.status === 'rejected' ||
                    updatingId === admission.id
                  }
                >
                  <XCircle className='mr-2 h-4 w-4 text-red-500' />
                  Mark as Rejected
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleUpdateStatus(admission.id, 'waitlisted')}
                  disabled={
                    admission.status === 'waitlisted' ||
                    updatingId === admission.id
                  }
                >
                  <AlertCircle className='mr-2 h-4 w-4 text-blue-500' />
                  Mark as Waitlisted
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: PermissionColumnDef<AdmissionData, any>[] = [
    {
      id: 'application_id',
      header: 'Application ID',
      cell: ({ row }) => (
        <Link
          href={`/admissions/${row.original.id}`}
          className='font-medium  hover:text-primary cursor-pointer'
        >
          {row.original.application_id || `ID: ${row.original.id.slice(0, 8)}`}
        </Link>
      )
    },
    {
      id: 'student_name',
      header: 'Student Name',
      cell: ({ row }) => (
        <div>
          {`${row.original.first_name}${
            row.original.last_name ? ` ${row.original.last_name}` : ''
          }`.trim()}
        </div>
      )
    },
    {
      id: 'institution',
      header: 'Institution',
      cell: ({ row }) => (
        <div>
          {row.original.institution?.name ||
            (row.original.institution_id
              ? `ID: ${row.original.institution_id}`
              : 'N/A')}
        </div>
      )
    },
    {
      id: 'program',
      header: 'Program',
      cell: ({ row }) => (
        <div>
          {row.original.program?.program_name ||
            (row.original.program_id
              ? `ID: ${row.original.program_id}`
              : 'N/A')}
        </div>
      )
    },
    {
      id: 'application_date',
      header: 'Application Date',
      cell: ({ row }) => (
        <div>{format(new Date(row.original.created_at), 'dd MMM yyyy')}</div>
      )
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge
          variant='outline'
          className={getStatusColor(row.original.status)}
        >
          {row.original.status?.charAt(0).toUpperCase() +
            row.original.status?.slice(1) || 'Unknown'}
        </Badge>
      )
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => <ActionsCell admission={row.original} />,
      enableSorting: false,
      enableHiding: false
    }
  ];

  // Table tools for the toolbar
  const tableTools = (
    <div className='flex items-center gap-2'>
      <DownloadTemplateButton />
      {canCreate && <BulkUploadAdmissions />}
      {canCreate && (
        <Button onClick={() => router.push('/admissions/new')}>
          <Plus className='mr-2 h-4 w-4' />
          New Admission
        </Button>
      )}
    </div>
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        permissions={{
          module: 'admissions',
          actions: {
            view: true,
            edit: canEdit,
            delete: canDelete
          }
        }}
        tableTools={tableTools}
        onBulkAction={canDelete ? handleBulkDelete : undefined}
        bulkActionConfig={
          canDelete
            ? {
                label: 'Delete Selected',
                icon: Trash2,
                variant: 'destructive',
                confirmTitle: 'Delete Admissions',
                confirmDescription:
                  'This will permanently delete {count} admission application{s}. This action cannot be undone.',
                successMessage:
                  'Successfully deleted {count} admission{plural}',
                errorMessage: 'Failed to delete selected admissions',
                loadingText: 'Deleting admissions...'
              }
            : undefined
        }
        getRowId={(row) => row.id}
        onRefresh={onRefresh}
        serverSidePagination={{
          currentPage,
          totalPages,
          pageSize,
          totalItems,
          hasNextPage: currentPage < totalPages,
          hasPreviousPage: currentPage > 1,
          onPageChange,
          isLoading
        }}
      />

      <AlertDialog
        open={statusUpdateDialog.open}
        onOpenChange={(open) =>
          !open &&
          setStatusUpdateDialog({ open: false, admissionId: '', newStatus: '' })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Status</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to update the status to &quot;
              {statusUpdateDialog.newStatus
                ? statusUpdateDialog.newStatus.charAt(0).toUpperCase() +
                  statusUpdateDialog.newStatus.slice(1)
                : ''}
              &quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatusUpdate}>
              Update Status
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
