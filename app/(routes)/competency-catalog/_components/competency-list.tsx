'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  MoreVertical,
  Eye,
  Pencil,
  Archive,
  RotateCcw,
  RefreshCw,
  Award
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { Competency, CompetencyType } from '@/types/competency';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useArchiveCompetency,
  useRestoreCompetency
} from '@/hooks/competency';
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

// Type badge color mapping
const TYPE_BADGE_CONFIG: Record<CompetencyType, { label: string; className: string }> = {
  technical: { label: 'Technical', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  behavioral: { label: 'Behavioral', className: 'bg-green-100 text-green-800 border-green-200' },
  domain: { label: 'Domain', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  soft_skill: { label: 'Soft Skill', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  metacognitive: { label: 'Metacognitive', className: 'bg-pink-100 text-pink-800 border-pink-200' }
};

// AI resistance score color
function getAiResistanceColor(score: number): string {
  if (score >= 7) return 'text-green-700 bg-green-50';
  if (score >= 4) return 'text-yellow-700 bg-yellow-50';
  return 'text-red-700 bg-red-50';
}

interface CompetencyListProps {
  competencies: Competency[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function CompetencyList({
  competencies,
  metadata,
  onPageChange,
  onRefresh
}: CompetencyListProps) {
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [selectedCompetency, setSelectedCompetency] = useState<Competency | null>(null);

  const { canAccess, isSuperAdmin } = usePermissions();
  const archiveMutation = useArchiveCompetency();
  const restoreMutation = useRestoreCompetency();

  const canViewCatalog =
    isSuperAdmin || canAccess('competency.catalog', 'view');
  const canEditCatalog =
    isSuperAdmin || canAccess('competency.catalog', 'edit');
  const canDeleteCatalog =
    isSuperAdmin || canAccess('competency.catalog', 'delete');

  const handleArchive = async () => {
    if (!selectedCompetency) return;

    try {
      await archiveMutation.mutateAsync(selectedCompetency.id);
      toast.success('Competency archived successfully');
      setArchiveDialogOpen(false);
      setSelectedCompetency(null);
      onRefresh();
    } catch (error) {
      console.error('Error archiving competency:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to archive competency'
      );
    }
  };

  const handleRestore = async (competency: Competency) => {
    try {
      await restoreMutation.mutateAsync(competency.id);
      toast.success('Competency restored successfully');
      onRefresh();
    } catch (error) {
      console.error('Error restoring competency:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to restore competency'
      );
    }
  };

  const openArchiveDialog = (competency: Competency) => {
    setSelectedCompetency(competency);
    setArchiveDialogOpen(true);
  };

  const getTypeBadge = (type: CompetencyType) => {
    const config = TYPE_BADGE_CONFIG[type] || {
      label: type.replace('_', ' '),
      className: 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return (
      <Badge variant='outline' className={config.className}>
        {config.label}
      </Badge>
    );
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center'>
        <p className='text-sm text-muted-foreground'>
          {metadata.total} competenc{metadata.total === 1 ? 'y' : 'ies'} found
        </p>
        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className='ml-auto'
          disabled={!canViewCatalog}
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
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>AI Resistance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {competencies.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className='text-center py-8'
                >
                  <div className='flex flex-col items-center space-y-3'>
                    <Award className='h-8 w-8 text-muted-foreground' />
                    <p className='text-muted-foreground'>No competencies found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              competencies.map((competency) => (
                <TableRow key={competency.id}>
                  <TableCell className='font-mono text-sm'>
                    {competency.competency_code}
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-col'>
                      <Link
                        href={`/competency-catalog/${competency.id}`}
                        className='font-medium hover:underline'
                      >
                        {competency.competency_name}
                      </Link>
                      {competency.industry_tags?.length > 0 && (
                        <div className='flex gap-1 mt-1'>
                          {competency.industry_tags.slice(0, 2).map((tag) => (
                            <Badge
                              key={tag}
                              variant='outline'
                              className='text-xs'
                            >
                              {tag}
                            </Badge>
                          ))}
                          {competency.industry_tags.length > 2 && (
                            <Badge variant='outline' className='text-xs'>
                              +{competency.industry_tags.length - 2}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getTypeBadge(competency.competency_type)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-medium ${getAiResistanceColor(competency.ai_resistance_score)}`}
                    >
                      {competency.ai_resistance_score}/10
                    </span>
                  </TableCell>
                  <TableCell>
                    {competency.is_active ? (
                      <Badge className='bg-emerald-100 text-emerald-800 border-emerald-200'>
                        Active
                      </Badge>
                    ) : (
                      <Badge variant='secondary'>Archived</Badge>
                    )}
                  </TableCell>
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
                        <DropdownMenuSeparator />

                        <DropdownMenuItem asChild>
                          <Link href={`/competency-catalog/${competency.id}`}>
                            <Eye className='mr-2 h-4 w-4' />
                            View Details
                          </Link>
                        </DropdownMenuItem>

                        {canEditCatalog && (
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/competency-catalog/${competency.id}/edit`}
                            >
                              <Pencil className='mr-2 h-4 w-4' />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        )}

                        {canDeleteCatalog && (
                          <>
                            <DropdownMenuSeparator />
                            {competency.is_active ? (
                              <DropdownMenuItem
                                className='text-destructive'
                                onClick={() => openArchiveDialog(competency)}
                              >
                                <Archive className='mr-2 h-4 w-4' />
                                Archive
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => handleRestore(competency)}
                              >
                                <RotateCcw className='mr-2 h-4 w-4' />
                                Restore
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {metadata.totalPages > 1 && (
        <div className='flex items-center justify-between'>
          <p className='text-sm text-muted-foreground'>
            Showing {(metadata.page - 1) * metadata.limit + 1} to{' '}
            {Math.min(metadata.page * metadata.limit, metadata.total)} of{' '}
            {metadata.total} results
          </p>
          <div className='flex items-center space-x-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page - 1)}
              disabled={metadata.page <= 1}
            >
              Previous
            </Button>
            <span className='text-sm'>
              Page {metadata.page} of {metadata.totalPages}
            </span>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page + 1)}
              disabled={metadata.page >= metadata.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Archive confirmation dialog */}
      <AlertDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Competency</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive &quot;{selectedCompetency?.competency_name}&quot;?
              Archived competencies will not appear in selection lists but existing
              learner progress will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchive}
              disabled={archiveMutation.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {archiveMutation.isPending ? 'Archiving...' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
