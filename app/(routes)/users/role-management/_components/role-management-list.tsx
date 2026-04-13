'use client';

import { useState, useMemo, useEffect } from 'react';
import { CustomRole } from '@/types/auth';
import {
  Trash2,
  Shield,
  AlertCircle,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
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
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils';

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
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Log roles whenever the prop changes
  useEffect(() => {
    console.log('RoleManagementList received roles:', roles);
  }, [roles]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

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

  // Filter roles by search query
  const filteredRoles = useMemo(() => {
    if (!searchQuery) return roles;
    const q = searchQuery.toLowerCase();
    return roles.filter(
      (r) =>
        r.role_name.toLowerCase().includes(q) ||
        r.role_key.toLowerCase().includes(q)
    );
  }, [roles, searchQuery]);

  // Pagination logic
  const paginatedRoles = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredRoles.slice(startIndex, endIndex);
  }, [filteredRoles, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredRoles.length / pageSize);

  // Generate pagination items
  const paginationItems = useMemo(() => {
    const items = [];
    const maxVisiblePages = 5;

    items.push(
      <PaginationItem key="first">
        <PaginationLink
          isActive={currentPage === 1}
          onClick={() => setCurrentPage(1)}
        >
          1
        </PaginationLink>
      </PaginationItem>
    );

    const startPage = Math.max(
      2,
      currentPage - Math.floor(maxVisiblePages / 2)
    );
    const endPage = Math.min(totalPages - 1, startPage + maxVisiblePages - 3);

    if (startPage > 2) {
      items.push(
        <PaginationItem key="ellipsis-start">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

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

    if (endPage < totalPages - 1) {
      items.push(
        <PaginationItem key="ellipsis-end">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

    if (totalPages > 1) {
      items.push(
        <PaginationItem key="last">
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

  const getPermissionBadgeColor = (count: number) => {
    if (count > 50) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (count > 10) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    return '';
  };

  if (roles.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No custom roles found</h3>
          <p className="text-muted-foreground">
            Click the &quot;Create Role&quot; button to add a new role.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search roles..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* No search results */}
      {filteredRoles.length === 0 && searchQuery && (
        <Card>
          <CardContent className="p-6 text-center">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No roles found</h3>
            <p className="text-muted-foreground">
              No roles match &quot;{searchQuery}&quot;. Try a different search term.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Role Cards Grid */}
      {filteredRoles.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedRoles.map((role) => {
              const permCount = countPermissions(role.permissions);
              return (
                <Card
                  key={role.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => handleEditClick(role)}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Header: Name + System badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Shield
                          className={cn(
                            'h-4 w-4 flex-shrink-0',
                            role.is_system_role
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          )}
                        />
                        <span className="font-semibold truncate">
                          {role.role_name}
                        </span>
                      </div>
                      {role.is_system_role && (
                        <Badge variant="outline" className="flex-shrink-0">
                          System
                        </Badge>
                      )}
                    </div>

                    {/* Role key */}
                    <p className="font-mono text-xs text-muted-foreground">
                      {role.role_key}
                    </p>

                    {/* Description */}
                    <p
                      className={cn(
                        'text-sm text-muted-foreground line-clamp-2',
                        !role.description && 'italic'
                      )}
                    >
                      {role.description || 'No description'}
                    </p>

                    {/* Stats row */}
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="secondary"
                        className={cn(getPermissionBadgeColor(permCount))}
                      >
                        {permCount} permissions
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={cn(
                          role.institution_scope === 'all'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        )}
                      >
                        {role.institution_scope === 'all'
                          ? 'All Institutions'
                          : 'Own Institution'}
                      </Badge>
                    </div>

                    {/* Footer: Date + Delete */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-muted-foreground">
                        Created {formatDate(role.created_at)}
                      </span>
                      {!role.is_system_role && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(role);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete role</span>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
              {/* Left: Page size + count */}
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">Rows per page</p>
                <Select
                  value={pageSize.toString()}
                  onValueChange={(value) => {
                    setPageSize(Number(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue placeholder="12" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6</SelectItem>
                    <SelectItem value="12">12</SelectItem>
                    <SelectItem value="24">24</SelectItem>
                    <SelectItem value="48">48</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground ml-2">
                  {(currentPage - 1) * pageSize + 1}-
                  {Math.min(currentPage * pageSize, filteredRoles.length)} of{' '}
                  {filteredRoles.length} roles
                </p>
              </div>

              {/* Mobile: Simple prev/next */}
              <div className="flex sm:hidden items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Desktop: Full pagination */}
              <Pagination className="hidden sm:flex w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(prev - 1, 1))
                      }
                      aria-disabled={currentPage === 1}
                      className={
                        currentPage === 1
                          ? 'pointer-events-none opacity-50'
                          : ''
                      }
                    />
                  </PaginationItem>

                  {paginationItems}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() =>
                        setCurrentPage((prev) =>
                          Math.min(prev + 1, totalPages)
                        )
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
            </div>
          )}
        </>
      )}

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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
