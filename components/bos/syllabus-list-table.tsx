'use client';

import React, { useState } from 'react';
import { useBosSyllabi, useDeleteBosSyllabus } from '@/hooks/bos/use-bos-syllabi';
import { BosCourseSyllabus, BosSyllabusFilters } from '@/types/bos';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Edit2, Trash2, Copy, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { BosPermissions } from '@/hooks/bos/use-bos-permissions';

interface SyllabusListTableProps {
  filters: BosSyllabusFilters;
  onEdit?: (syllabus: BosCourseSyllabus) => void;
  onRevise?: (syllabus: BosCourseSyllabus) => void;
  onDelete?: (id: string) => void;
  onHistory?: (id: string) => void;
  onDuplicate?: (syllabus: BosCourseSyllabus) => void;
  permissions?: BosPermissions;
}

export function SyllabusListTable({
  filters,
  onEdit,
  onRevise,
  onDelete,
  onHistory,
  onDuplicate,
  permissions,
}: SyllabusListTableProps) {
  const { data, isLoading, error } = useBosSyllabi(filters);
  const deleteBosSyllabus = useDeleteBosSyllabus();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this syllabus?')) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteBosSyllabus.mutateAsync(id);
      onDelete?.(id);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64">Loading syllabi...</div>;
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64 text-red-500">
        Error loading syllabi: {error.message}
      </div>
    );
  }

  const syllabi = data?.data || [];

  if (syllabi.length === 0) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500">
        No syllabi found. Create one to get started.
      </div>
    );
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Course Code</TableHead>
            <TableHead>Course Name</TableHead>
            <TableHead>Stream</TableHead>
            <TableHead>Credits</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {syllabi.map((syllabus) => (
            <TableRow key={syllabus.id}>
              <TableCell className="font-mono font-semibold">{syllabus.course_code}</TableCell>
              <TableCell>{syllabus.course_name}</TableCell>
              <TableCell>
                {syllabus.stream ? (
                  <Badge variant="outline">{syllabus.stream}</Badge>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </TableCell>
              <TableCell>{syllabus.course_credits || '-'}</TableCell>
              <TableCell>
                <Badge variant={syllabus.is_latest ? 'default' : 'secondary'}>
                  v{syllabus.version_number}
                </Badge>
              </TableCell>
              <TableCell>
                {syllabus.is_archived ? (
                  <Badge variant="destructive">Archived</Badge>
                ) : syllabus.is_latest ? (
                  <Badge variant="default">Active</Badge>
                ) : (
                  <Badge variant="secondary">Previous</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {syllabus.is_latest && !syllabus.is_archived && permissions?.canEdit && (
                      <DropdownMenuItem onClick={() => onEdit?.(syllabus)}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {syllabus.is_latest && !syllabus.is_archived && permissions?.canRevise && (
                      <DropdownMenuItem onClick={() => onRevise?.(syllabus)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Create Revision
                      </DropdownMenuItem>
                    )}
                    {permissions?.canView && (
                      <DropdownMenuItem onClick={() => onHistory?.(syllabus.id)}>
                        <History className="h-4 w-4 mr-2" />
                        View History
                      </DropdownMenuItem>
                    )}
                    {syllabus.is_latest && !syllabus.is_archived && permissions?.canDuplicate && (
                      <DropdownMenuItem onClick={() => onDuplicate?.(syllabus)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate to Regulation
                      </DropdownMenuItem>
                    )}
                    {permissions?.canDelete && (
                      <DropdownMenuItem
                        onClick={() => handleDelete(syllabus.id)}
                        disabled={deletingId === syllabus.id}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {data?.metadata && (
        <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
          <span>
            Showing {(data.metadata.page - 1) * data.metadata.limit + 1} to{' '}
            {Math.min(data.metadata.page * data.metadata.limit, data.metadata.total)} of{' '}
            {data.metadata.total} results
          </span>
        </div>
      )}
    </div>
  );
}
