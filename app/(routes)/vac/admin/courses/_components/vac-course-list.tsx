'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  MoreVertical,
  Edit,
  Trash2,
  RefreshCw,
  CheckSquare,
  Square,
  BookOpen,
  GraduationCap,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useDeleteVACCourse } from '@/hooks/vac/use-vac';
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
import type { VACCourse } from '@/types/vac';

interface VACCourseListProps {
  courses: VACCourse[];
  onRefresh: () => void;
}

type SortField = 'code' | 'name' | 'institution' | 'track' | 'duration_hours' | 'fee' | 'is_active';
type SortOrder = 'asc' | 'desc';

export function VACCourseList({ courses, onRefresh }: VACCourseListProps) {
  const [courseToDelete, setCourseToDelete] = useState<VACCourse | null>(null);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const deleteMutation = useDeleteVACCourse();

  // Sort courses
  const sortedCourses = useMemo(() => {
    return [...courses].sort((a, b) => {
      let aVal: string | number | boolean = a[sortField];
      let bVal: string | number | boolean = b[sortField];

      // Handle different types
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [courses, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-4 w-4 ml-1" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1" />
    );
  };

  const handleDelete = async () => {
    if (!courseToDelete) return;

    try {
      await deleteMutation.mutateAsync(courseToDelete.id);
      toast.success('Course deleted successfully');
      onRefresh();
    } catch (error) {
      console.error('Error deleting course:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete course'
      );
    } finally {
      setCourseToDelete(null);
    }
  };

  const toggleSelectAll = () => {
    if (selectedCourses.length === courses.length) {
      setSelectedCourses([]);
    } else {
      setSelectedCourses(courses.map((c) => c.id));
    }
  };

  const toggleSelectCourse = (id: string) => {
    if (selectedCourses.includes(id)) {
      setSelectedCourses(selectedCourses.filter((cId) => cId !== id));
    } else {
      setSelectedCourses([...selectedCourses, id]);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getTrackBadgeColor = (track: string) => {
    switch (track) {
      case 'ai':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'matlab':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'programming':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'data-science':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'web-development':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center'>
        {selectedCourses.length > 0 && (
          <span className='text-sm text-muted-foreground'>
            {selectedCourses.length} selected
          </span>
        )}

        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className={selectedCourses.length > 0 ? 'ml-auto' : 'ml-auto'}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-12'>
                <div className='flex items-center' onClick={toggleSelectAll}>
                  {selectedCourses.length === courses.length &&
                  courses.length > 0 ? (
                    <CheckSquare className='h-4 w-4 cursor-pointer' />
                  ) : (
                    <Square className='h-4 w-4 cursor-pointer' />
                  )}
                </div>
              </TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('code')}>
                <div className="flex items-center">Code<SortIcon field="code" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('name')}>
                <div className="flex items-center">Name<SortIcon field="name" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('institution')}>
                <div className="flex items-center">Institution<SortIcon field="institution" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('track')}>
                <div className="flex items-center">Track<SortIcon field="track" /></div>
              </TableHead>
              <TableHead className='text-center cursor-pointer hover:bg-muted/50' onClick={() => handleSort('duration_hours')}>
                <div className="flex items-center justify-center">Duration<SortIcon field="duration_hours" /></div>
              </TableHead>
              <TableHead className='text-right cursor-pointer hover:bg-muted/50' onClick={() => handleSort('fee')}>
                <div className="flex items-center justify-end">Fee<SortIcon field="fee" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('is_active')}>
                <div className="flex items-center">Status<SortIcon field="is_active" /></div>
              </TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className='text-center py-8'>
                  <div className='flex flex-col items-center space-y-3'>
                    <GraduationCap className='h-8 w-8 text-muted-foreground' />
                    <p className='text-muted-foreground'>No courses found</p>
                    <Button asChild size='sm'>
                      <Link href='/vac/admin/courses/new'>
                        Create your first course
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sortedCourses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell>
                    <div
                      className='flex items-center'
                      onClick={() => toggleSelectCourse(course.id)}
                    >
                      {selectedCourses.includes(course.id) ? (
                        <CheckSquare className='h-4 w-4 cursor-pointer' />
                      ) : (
                        <Square className='h-4 w-4 cursor-pointer' />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className='text-sm font-mono bg-muted px-1.5 py-0.5 rounded'>
                      {course.code}
                    </code>
                  </TableCell>
                  <TableCell className='font-medium max-w-[200px] truncate'>
                    {course.name}
                  </TableCell>
                  <TableCell>{course.institution}</TableCell>
                  <TableCell>
                    <Badge
                      variant='outline'
                      className={getTrackBadgeColor(course.track)}
                    >
                      {course.track}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-center'>
                    <div className='flex flex-col text-sm'>
                      <span>{course.duration_hours}h</span>
                      <span className='text-muted-foreground text-xs'>
                        {course.weeks}w
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className='text-right'>
                    {formatCurrency(course.fee)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={course.is_active ? 'default' : 'secondary'}>
                      {course.is_active ? 'Active' : 'Inactive'}
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
                        <DropdownMenuSeparator />

                        <DropdownMenuItem asChild>
                          <Link href={`/vac/${course.id}`}>
                            <BookOpen className='mr-2 h-4 w-4' />
                            View Course
                          </Link>
                        </DropdownMenuItem>

                        <DropdownMenuItem asChild>
                          <Link href={`/vac/admin/courses/${course.id}/lessons`}>
                            <GraduationCap className='mr-2 h-4 w-4' />
                            Manage Lessons
                          </Link>
                        </DropdownMenuItem>

                        <DropdownMenuItem asChild>
                          <Link href={`/vac/admin/courses/${course.id}/edit`}>
                            <Edit className='mr-2 h-4 w-4' />
                            Edit
                          </Link>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          className='text-destructive'
                          onClick={() => setCourseToDelete(course)}
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

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!courseToDelete}
        onOpenChange={() => setCourseToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              course &quot;{courseToDelete?.name}&quot; and all its associated
              lessons.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
