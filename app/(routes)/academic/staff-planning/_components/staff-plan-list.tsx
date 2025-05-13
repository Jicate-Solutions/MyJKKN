'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  MoreVertical,
  Edit,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileText
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { StaffPlan } from '@/types/staff-planning';
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
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';
import { SectionService } from '@/lib/services/organization/section-service';

interface StaffPlanListProps {
  staffPlans: StaffPlan[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

interface Section {
  id: string;
  section_code: string;
  section_name: string;
}

// Map to cache sections by semester ID
type SectionMap = Record<string, Record<string, Section>>;

export function StaffPlanList({
  staffPlans,
  metadata,
  onPageChange,
  onRefresh,
  canEdit = true,
  canDelete = true
}: StaffPlanListProps) {
  const [planToDelete, setPlanToDelete] = useState<StaffPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sectionMap, setSectionMap] = useState<SectionMap>({});

  // Load sections for all unique semester IDs in staff plans
  useEffect(() => {
    async function loadSections() {
      try {
        // Get unique semester IDs
        const semesterIds = [
          ...new Set(
            staffPlans
              .filter((plan) => plan.semester_id && plan.section)
              .map((plan) => plan.semester_id)
          )
        ];

        if (semesterIds.length === 0) return;

        // Fetch sections for each semester
        const newSectionMap: SectionMap = {};

        await Promise.all(
          semesterIds.map(async (semesterId) => {
            try {
              const sections = await SectionService.getSectionsBySemester(
                semesterId
              );

              // Create a map of section_code -> section for this semester
              newSectionMap[semesterId] = sections.reduce((acc, section) => {
                acc[section.section_code] = section;
                return acc;
              }, {} as Record<string, Section>);
            } catch (error) {
              console.error(
                `Error loading sections for semester ${semesterId}:`,
                error
              );
            }
          })
        );

        setSectionMap(newSectionMap);
      } catch (error) {
        console.error('Error loading sections:', error);
      }
    }

    loadSections();
  }, [staffPlans]);

  // Get section name from section code
  const getSectionName = (plan: StaffPlan): string => {
    if (!plan.semester_id || !plan.section) return plan.section || 'N/A';

    const sections = sectionMap[plan.semester_id];
    if (!sections) return plan.section;

    const section = sections[plan.section];
    return section ? section.section_name : plan.section;
  };

  const handleDelete = async () => {
    if (!planToDelete) return;

    try {
      setIsLoading(true);
      await StaffPlanService.deleteStaffPlan(planToDelete.id);
      onRefresh(); // Refresh the list after deletion
      setPlanToDelete(null); // Reset the selected plan
      toast.success('Staff plan deleted successfully');
    } catch (error) {
      console.error('Error deleting staff plan:', error);
      toast.error('Failed to delete staff plan');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='space-y-4 mt-6'>
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Institution</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Semester</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Academic Year</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffPlans.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className='text-center text-muted-foreground h-24'
                >
                  No staff plans found
                </TableCell>
              </TableRow>
            ) : (
              staffPlans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>{plan.institution?.name}</TableCell>
                  <TableCell>{plan.program?.program_name}</TableCell>
                  <TableCell>{plan.semester?.semester_name}</TableCell>
                  <TableCell>{getSectionName(plan)}</TableCell>
                  <TableCell>
                    {plan.academic_year?.academic_year_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant={plan.is_active ? 'success' : 'secondary'}>
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </Badge>
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
                        <DropdownMenuItem asChild>
                          <Link href={`/academic/staff-planning/${plan.id}`}>
                            <FileText className='mr-2 h-4 w-4' />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/academic/staff-planning/${plan.id}/edit`}
                            >
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {canEdit && canDelete && <DropdownMenuSeparator />}
                        {canDelete && (
                          <DropdownMenuItem
                            onClick={() => setPlanToDelete(plan)}
                            className='text-destructive focus:text-destructive'
                          >
                            <Trash2 className='mr-2 h-4 w-4' />
                            Delete
                          </DropdownMenuItem>
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

      {metadata.total > 0 && (
        <div className='flex items-center justify-between'>
          <div className='text-sm text-muted-foreground'>
            Showing {(metadata.page - 1) * metadata.limit + 1} to{' '}
            {Math.min(metadata.page * metadata.limit, metadata.total)} of{' '}
            {metadata.total} entries
          </div>

          <div className='flex items-center space-x-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page - 1)}
              disabled={metadata.page <= 1}
            >
              <ChevronLeft className='h-4 w-4' />
              Previous
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page + 1)}
              disabled={metadata.page >= metadata.totalPages}
            >
              Next
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}

      <AlertDialog
        open={!!planToDelete}
        onOpenChange={(open) => !open && setPlanToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Staff Plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this staff plan? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete Plan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
