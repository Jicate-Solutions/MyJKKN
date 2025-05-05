// app/(routes)/organizations/institutions/_components/institution-list.tsx

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  MoreVertical,
  Edit,
  Trash2,
  Building2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Ban
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Institution } from '@/types/organizations';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Pagination } from '@/components/pagination';

interface InstitutionListProps {
  institutions: Institution[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function InstitutionList({
  institutions,
  metadata,
  onPageChange,
  onRefresh
}: InstitutionListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [institutionToDelete, setInstitutionToDelete] =
    useState<Institution | null>(null);
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewInstitutions =
    isSuperAdmin || canAccess('organizations.institutions', 'view');
  const canEditInstitutions =
    isSuperAdmin || canAccess('organizations.institutions', 'edit');
  const canDeleteInstitutions =
    isSuperAdmin || canAccess('organizations.institutions', 'delete');

  const handleDelete = async () => {
    if (!institutionToDelete) return;

    try {
      setIsLoading(true);
      await OrganizationService.deleteInstitution(institutionToDelete.id);

      onRefresh(); // Refresh the list after deletion
    } catch (error) {
      console.error('Error deleting institution:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete institution'
      );
    } finally {
      setIsLoading(false);
      setInstitutionToDelete(null);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className='ml-auto'
          disabled={!canViewInstitutions}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Institution Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {institutions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className='text-center text-muted-foreground h-24'
                >
                  No institutions found
                </TableCell>
              </TableRow>
            ) : (
              institutions.map((institution) => (
                <TableRow key={institution.id}>
                  <TableCell className='font-medium'>
                    {canViewInstitutions ? (
                      <Link
                        href={`/organizations/institutions/${institution.id}`}
                        className='flex items-center hover:text-primary'
                      >
                        <Building2 className='mr-2 h-4 w-4' />
                        {institution.counselling_code}
                      </Link>
                    ) : (
                      <div className='flex items-center'>
                        <Building2 className='mr-2 h-4 w-4' />
                        {institution.counselling_code}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{institution.name}</TableCell>
                  <TableCell>
                    <div className='flex flex-col'>
                      {institution.email && (
                        <span className='text-sm text-muted-foreground'>
                          {institution.email}
                        </span>
                      )}
                      {institution.phone && (
                        <span className='text-sm text-muted-foreground'>
                          {institution.phone}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={institution.is_active ? 'default' : 'secondary'}
                    >
                      {institution.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(institution.created_at)}</TableCell>
                  <TableCell className='text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' className='h-8 w-8 p-0'>
                          <span className='sr-only'>Open menu</span>
                          <MoreVertical className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          asChild={canViewInstitutions}
                          disabled={!canViewInstitutions}
                          style={{ opacity: canViewInstitutions ? 1 : 0.5 }}
                        >
                          {canViewInstitutions ? (
                            <Link
                              href={`/organizations/institutions/${institution.id}`}
                              className='cursor-pointer'
                            >
                              <Building2 className='mr-2 h-4 w-4' />
                              View
                            </Link>
                          ) : (
                            <div>
                              <Building2 className='mr-2 h-4 w-4' />
                              View
                            </div>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          asChild={canEditInstitutions}
                          disabled={!canEditInstitutions}
                          style={{ opacity: canEditInstitutions ? 1 : 0.5 }}
                        >
                          {canEditInstitutions ? (
                            <Link
                              href={`/organizations/institutions/${institution.id}/edit`}
                              className='cursor-pointer'
                            >
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </Link>
                          ) : (
                            <div className='flex items-center gap-2'>
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </div>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={
                            canDeleteInstitutions
                              ? () => setInstitutionToDelete(institution)
                              : undefined
                          }
                          disabled={!canDeleteInstitutions}
                          className={
                            canDeleteInstitutions
                              ? 'text-destructive focus:text-destructive cursor-pointer'
                              : 'cursor-pointer'
                          }
                          style={{ opacity: canDeleteInstitutions ? 1 : 0.5 }}
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {metadata.totalPages > 1 && (
        <Pagination
          currentPage={metadata.page}
          totalPages={metadata.totalPages}
          onPageChange={onPageChange}
        />
      )}

      <AlertDialog
        open={!!institutionToDelete && canDeleteInstitutions}
        onOpenChange={(open) => !open && setInstitutionToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Institution</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {institutionToDelete?.name}? This
              action cannot be undone, and will also delete all departments
              associated with this institution.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete Institution'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
