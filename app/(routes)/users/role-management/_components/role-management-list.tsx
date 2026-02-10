'use client';

import { useState, useMemo, useEffect } from 'react';
import { CustomRole } from '@/types/auth';
import {
  Pencil,
  Trash2,
  Shield,
  Eye,
  CheckCircle,
  AlertCircle,
  Lock,
  MoreHorizontal,
  ChevronDown
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
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
import { format } from 'date-fns';
import { EditRoleDialog } from './edit-role-dialog';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

interface RoleManagementListProps {
  roles: CustomRole[];
  onUpdateRole: (
    roleKey: string,
    updates: {
      role_name?: string;
      description?: string;
      permissions?: Record<string, boolean>;
    }
  ) => Promise<void>;
  onDeleteRole: (roleKey: string) => Promise<void>;
}

export function RoleManagementList({
  roles,
  onUpdateRole,
  onDeleteRole
}: RoleManagementListProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<CustomRole | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [roleToEdit, setRoleToEdit] = useState<CustomRole | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Log roles whenever the prop changes
  useEffect(() => {
  }, [roles]);

  const handleDeleteClick = (role: CustomRole) => {
    setRoleToDelete(role);
    setShowDeleteDialog(true);
  };

  const handleEditClick = (role: CustomRole) => {
    setRoleToEdit(role);
    setShowEditDialog(true);
  };

  const confirmDelete = async () => {
    if (roleToDelete) {
      await onDeleteRole(roleToDelete.role_key);
      setShowDeleteDialog(false);
      setRoleToDelete(null);
    }
  };

  const handleEditSubmit = async (
    roleKey: string,
    updates: {
      role_name?: string;
      description?: string;
      permissions?: Record<string, boolean>;
    }
  ) => {
    await onUpdateRole(roleKey, updates);
    setShowEditDialog(false);
    setRoleToEdit(null);
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  const countPermissions = (permissions: Record<string, boolean>) => {
    return Object.values(permissions).filter(Boolean).length;
  };

  // Pagination logic
  const paginatedRoles = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return roles.slice(startIndex, endIndex);
  }, [roles, currentPage, pageSize]);

  const totalPages = Math.ceil(roles.length / pageSize);

  // Generate pagination items
  const paginationItems = useMemo(() => {
    const items = [];
    const maxVisiblePages = 5; // Maximum number of page buttons to show

    // Always show first page
    items.push(
      <PaginationItem key='first'>
        <PaginationLink
          isActive={currentPage === 1}
          onClick={() => setCurrentPage(1)}
        >
          1
        </PaginationLink>
      </PaginationItem>
    );

    // Calculate range of pages to show
    const startPage = Math.max(
      2,
      currentPage - Math.floor(maxVisiblePages / 2)
    );
    const endPage = Math.min(totalPages - 1, startPage + maxVisiblePages - 3);

    // Adjust if we're near the beginning
    if (startPage > 2) {
      items.push(
        <PaginationItem key='ellipsis-start'>
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

    // Add middle pages
    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink
            isActive={currentPage === i}
            onClick={() => setCurrentPage(i)}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    // Add ellipsis if needed
    if (endPage < totalPages - 1) {
      items.push(
        <PaginationItem key='ellipsis-end'>
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

    // Always show last page if there is more than one page
    if (totalPages > 1) {
      items.push(
        <PaginationItem key='last'>
          <PaginationLink
            isActive={currentPage === totalPages}
            onClick={() => setCurrentPage(totalPages)}
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return items;
  }, [currentPage, totalPages]);

  if (roles.length === 0) {
    return (
      <Card>
        <CardContent className='p-6 text-center'>
          <AlertCircle className='h-12 w-12 text-yellow-500 mx-auto mb-4' />
          <h3 className='text-lg font-medium mb-2'>No custom roles found</h3>
          <p className='text-muted-foreground'>
            Click the &quot;Create Role&quot; button to add a new role.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className='border rounded-md overflow-hidden'>
        <div className='overflow-x-auto'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-12 text-center'>No.</TableHead>
                <TableHead className='min-w-[160px]'>Role Name</TableHead>
                <TableHead className='min-w-[140px]'>Role Key</TableHead>
                <TableHead className='hidden md:table-cell'>
                  Description
                </TableHead>
                <TableHead className='hidden sm:table-cell'>
                  Permissions
                </TableHead>
                <TableHead className='hidden lg:table-cell'>Created</TableHead>
                <TableHead className='w-16 text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRoles.map((role, index) => (
                <TableRow key={role.id}>
                  <TableCell className='font-medium text-center'>
                    {(currentPage - 1) * pageSize + index + 1}
                  </TableCell>
                  <TableCell>
                    <div className='flex items-center gap-2'>
                      <Shield
                        className={`h-4 w-4 flex-shrink-0 ${
                          role.is_system_role
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        }`}
                      />
                      <span className='font-medium truncate'>
                        {role.role_name}
                      </span>
                      {role.is_system_role && (
                        <Badge variant='outline' className='ml-1'>
                          System
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className='font-mono text-xs'>
                    {role.role_key}
                  </TableCell>
                  <TableCell className='max-w-[200px] truncate hidden md:table-cell'>
                    {role.description || '-'}
                  </TableCell>
                  <TableCell className='hidden sm:table-cell'>
                    <Badge variant='secondary'>
                      {countPermissions(role.permissions)} permissions
                    </Badge>
                  </TableCell>
                  <TableCell className='text-sm text-muted-foreground hidden lg:table-cell'>
                    {formatDate(role.created_at)}
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex items-center justify-end'>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8'
                          >
                            <MoreHorizontal className='h-4 w-4' />
                            <span className='sr-only'>Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuItem
                            onClick={() => handleEditClick(role)}
                          >
                            {role.is_system_role ? (
                              <>
                                <Eye className='mr-2 h-4 w-4' />
                                <span>View details</span>
                              </>
                            ) : (
                              <>
                                <Pencil className='mr-2 h-4 w-4' />
                                <span>Edit role</span>
                              </>
                            )}
                          </DropdownMenuItem>
                          {!role.is_system_role && (
                            <DropdownMenuItem
                              onClick={() => handleDeleteClick(role)}
                              className='text-destructive focus:text-destructive'
                            >
                              <Trash2 className='mr-2 h-4 w-4' />
                              <span>Delete role</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <CardFooter className='flex w-full flex-col sm:flex-row items-center justify-between p-4 border-t'>
          <div className='flex w-full items-center mb-4 sm:mb-0'>
            <p className='text-sm text-muted-foreground mr-2'>Rows per page</p>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className='h-8 w-[70px]'>
                <SelectValue placeholder='10' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='10'>10</SelectItem>
                <SelectItem value='20'>20</SelectItem>
                <SelectItem value='50'>50</SelectItem>
                <SelectItem value='100'>100</SelectItem>
              </SelectContent>
            </Select>

            <p className='text-sm text-muted-foreground ml-4'>
              {(currentPage - 1) * pageSize + 1}-
              {Math.min(currentPage * pageSize, roles.length)} of {roles.length}
            </p>
          </div>

          <Pagination className='w-full justify-end'>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  aria-disabled={currentPage === 1}
                  className={
                    currentPage === 1 ? 'pointer-events-none opacity-50' : ''
                  }
                />
              </PaginationItem>

              {paginationItems}

              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  aria-disabled={currentPage === totalPages}
                  className={
                    currentPage === totalPages
                      ? 'pointer-events-none opacity-50'
                      : ''
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </CardFooter>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the role &quot;
              {roleToDelete?.role_name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Role Dialog */}
      {roleToEdit && (
        <EditRoleDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          role={roleToEdit}
          onSubmit={handleEditSubmit}
        />
      )}
    </>
  );
}
