'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search, Save, Users, UserCheck, UserX } from 'lucide-react';
import { logger } from '@/lib/utils/enhanced-logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  AttendanceRosterData,
  AttendanceRosterStudent,
  BatchUpdateAttendanceDto,
  CreateStudentAttendanceDto
} from '@/types/attendance';

interface AttendanceRosterProps {
  rosterData: AttendanceRosterData;
  onSave: (data: BatchUpdateAttendanceDto) => Promise<boolean>;
  canMarkAttendance: boolean;
  loading: boolean;
  institutionId: string;
  checkSlotPermission?: boolean;
}

export function AttendanceRoster({
  rosterData,
  onSave,
  canMarkAttendance,
  loading,
  institutionId,
  checkSlotPermission = false
}: AttendanceRosterProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const user = profile;
  const { userProfile, isSuperAdmin } = usePermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const [students, setStudents] = useState<AttendanceRosterStudent[]>(
    rosterData.students
  );
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [canMarkThisSlot, setCanMarkThisSlot] = useState(canMarkAttendance);
  const [checkingPermission, setCheckingPermission] = useState(false);

  // Check slot-specific permissions when enabled
  useEffect(() => {
    const checkSlotSpecificPermission = async () => {
      // For super admins, always allow
      if (isSuperAdmin) {
        setCanMarkThisSlot(true);
        return;
      }

      // For manual entries, use general permission
      if (rosterData.timetable_slot.id === 'manual-entry') {
        setCanMarkThisSlot(canMarkAttendance);
        return;
      }

      // If slot permission checking is disabled, use general permission
      if (!checkSlotPermission) {
        setCanMarkThisSlot(canMarkAttendance);
        return;
      }

      setCheckingPermission(true);
      try {
        const { AttendanceService } = await import(
          '@/lib/services/academic/attendance-service'
        );

        const canMarkForSlot = await AttendanceService.canMarkAttendanceForSlot(
          rosterData.timetable_slot.id,
          isSuperAdmin
        );

        // Use slot-specific permission only if stricter checks are enabled
        // Otherwise, fall back to general permission
        const finalPermission = canMarkForSlot || canMarkAttendance;
        setCanMarkThisSlot(finalPermission);
      } catch (error) {
        logger.error('academic/attendance', 'Error checking slot permission', error);
        // On error, fall back to general permission
        setCanMarkThisSlot(canMarkAttendance);
      } finally {
        setCheckingPermission(false);
      }
    };

    checkSlotSpecificPermission();
  }, [
    checkSlotPermission,
    isSuperAdmin,
    canMarkAttendance,
    rosterData.timetable_slot.id
  ]);

  // Filter students based on search term
  const filteredStudents = useMemo(() => {
    if (!searchTerm) return students;

    return students.filter(
      (student) =>
        `${student.first_name} ${student.last_name || ''}`
          .trim()
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        student.roll_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [students, searchTerm]);

  // Calculate attendance statistics
  const stats = useMemo(() => {
    const total = students.length;
    const present = students.filter((s) => s.status === 'Present').length;
    const absent = total - present;

    return {
      total,
      present,
      absent,
      presentPercentage: total > 0 ? ((present / total) * 100).toFixed(1) : '0'
    };
  }, [students]);

  // Handle individual student selection
  const handleStudentSelect = (studentId: string, checked: boolean) => {
    if (checked) {
      setSelectedStudents([...selectedStudents, studentId]);
    } else {
      setSelectedStudents(selectedStudents.filter((id) => id !== studentId));
    }
  };

  // Handle select all students
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudents(filteredStudents.map((s) => s.id));
    } else {
      setSelectedStudents([]);
    }
  };

  // Mark selected students as present
  const markAsPresent = () => {
    setStudents(
      students.map((student) =>
        selectedStudents.includes(student.id)
          ? { ...student, status: 'Present' }
          : student
      )
    );
    setSelectedStudents([]);
  };

  // Mark selected students as absent
  const markAsAbsent = () => {
    setStudents(
      students.map((student) =>
        selectedStudents.includes(student.id)
          ? { ...student, status: 'Absent' }
          : student
      )
    );
    setSelectedStudents([]);
  };

  // Toggle individual student status
  const toggleStudentStatus = (studentId: string) => {
    setStudents(
      students.map((student) =>
        student.id === studentId
          ? {
              ...student,
              status: student.status === 'Present' ? 'Absent' : 'Present'
            }
          : student
      )
    );
  };

  // Save attendance
  const handleSave = async () => {
    if (!canMarkThisSlot) {
      toast({
        title: 'Permission Denied',
        description: 'You do not have permission to mark attendance.',
        variant: 'destructive'
      });
      return;
    }

    // Check authentication - use userProfile.id as fallback for user.id
    const currentUserId = user?.id || userProfile?.id;
    if (!currentUserId) {
      toast({
        title: 'Authentication Error',
        description: 'You must be logged in to mark attendance.',
        variant: 'destructive'
      });
      return;
    }

    // For super admins, use the first student's institution or allow manual override
    let institutionIdToUse = userProfile?.institution_id;

    if (!institutionIdToUse) {
      if (isSuperAdmin && institutionId) {
        // For super admins, use the institution from the filter context
        institutionIdToUse = institutionId;
      }

      if (!institutionIdToUse) {
        toast({
          title: 'Institution Error',
          description:
            'Unable to determine institution context. Please contact support.',
          variant: 'destructive'
        });
        return;
      }
    }

    try {
      setSaving(true);

      // Prepare attendance records with actual user and institution IDs
      const attendanceRecords: CreateStudentAttendanceDto[] = students.map(
        (student) => ({
          student_id: student.id,
          timetable_slot_id: rosterData.timetable_slot.id,
          attendance_date: rosterData.attendance_date,
          status: student.status,
          marked_by: currentUserId,
          institution_id: institutionIdToUse!
        })
      );

      const success = await onSave({ records: attendanceRecords });

      if (success) {
        toast({
          title: 'Success',
          description: 'Attendance saved successfully.'
        });
      }
    } catch (error) {
      logger.error('academic/attendance', 'Error saving attendance', error);
      toast({
        title: 'Error',
        description: 'Failed to save attendance. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const isAllSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every((student) => selectedStudents.includes(student.id));
  const isIndeterminate = selectedStudents.length > 0 && !isAllSelected;

  return (
    <div className='space-y-6'>
      {/* Header with period info and stats */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h3 className='text-lg font-medium'>
            {rosterData.timetable_slot.period.period_name}
          </h3>
          <p className='text-sm text-muted-foreground'>
            {rosterData.timetable_slot.period.start_time} -{' '}
            {rosterData.timetable_slot.period.end_time}
            {rosterData.timetable_slot.course && (
              <>
                {' '}
                | {rosterData.timetable_slot.course.course_code} -{' '}
                {rosterData.timetable_slot.course.course_name}
              </>
            )}
          </p>
        </div>

        <div className='flex items-center gap-4'>
          <div className='flex items-center gap-2'>
            <Badge variant='outline' className='flex items-center gap-1'>
              <Users className='h-3 w-3' />
              {stats.total} Total
            </Badge>
            <Badge variant='default' className='flex items-center gap-1'>
              <UserCheck className='h-3 w-3' />
              {stats.present} Present ({stats.presentPercentage}%)
            </Badge>
            <Badge variant='destructive' className='flex items-center gap-1'>
              <UserX className='h-3 w-3' />
              {stats.absent} Absent
            </Badge>
          </div>
        </div>
      </div>

      {/* Show permission checking indicator */}
      {checkingPermission && (
        <div className='flex items-center justify-center py-4 text-sm text-muted-foreground'>
          <div className='animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2'></div>
          Checking teaching assignment...
        </div>
      )}

      {/* Show permission denied message for slot-specific restrictions */}
      {checkSlotPermission &&
        !isSuperAdmin &&
        !checkingPermission &&
        !canMarkThisSlot &&
        canMarkAttendance && (
          <div className='bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-lg p-4 text-center'>
            <p className='text-sm text-yellow-800 dark:text-yellow-200'>
              <strong>Permission Restricted:</strong> You are not assigned to
              teach this specific period. Only staff assigned to this timetable
              slot can mark attendance.
            </p>
          </div>
        )}

      {/* Debug permission info - remove after testing */}
      {process.env.NODE_ENV === 'development' && (
        <div className='bg-muted/50 border border-border rounded-lg p-3 text-xs'>
          <div className='flex justify-between items-center'>
            <div>
              <strong>Debug Info:</strong> canMarkAttendance:{' '}
              {canMarkAttendance.toString()}, canMarkThisSlot:{' '}
              {canMarkThisSlot.toString()}, checkSlotPermission:{' '}
              {checkSlotPermission.toString()}, isSuperAdmin:{' '}
              {isSuperAdmin.toString()}
            </div>
            {!canMarkThisSlot && (
              <Button
                size='sm'
                variant='outline'
                onClick={() => setCanMarkThisSlot(true)}
              >
                Force Enable (Debug)
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Search and actions */}
      <div className='flex flex-col sm:flex-row gap-4'>
        <div className='relative flex-1'>
          <Search className='absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder='Search students by name or roll number...'
            className='pl-9'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {canMarkThisSlot && selectedStudents.length > 0 && (
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={markAsPresent}
              className='flex items-center gap-1'
            >
              <UserCheck className='h-4 w-4' />
              Mark Present ({selectedStudents.length})
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={markAsAbsent}
              className='flex items-center gap-1'
            >
              <UserX className='h-4 w-4' />
              Mark Absent ({selectedStudents.length})
            </Button>
          </div>
        )}
      </div>

      {/* Students table */}
      <div className='border rounded-lg'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-12'>
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                  disabled={!canMarkThisSlot}
                />
              </TableHead>
              <TableHead>Roll Number</TableHead>
              <TableHead>Student Name</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Status</TableHead>
              {canMarkThisSlot && <TableHead>Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.map((student) => (
              <TableRow key={student.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedStudents.includes(student.id)}
                    onCheckedChange={(checked) =>
                      handleStudentSelect(student.id, checked as boolean)
                    }
                    disabled={!canMarkThisSlot}
                  />
                </TableCell>
                <TableCell className='font-medium'>
                  {student.roll_number || 'N/A'}
                </TableCell>
                <TableCell>
                  {`${student.first_name} ${student.last_name || ''}`.trim()}
                </TableCell>
                <TableCell>
                  <Badge variant='outline' className='font-medium'>
                    {student.section?.section_name || 'N/A'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      student.status === 'Present' ? 'default' : 'destructive'
                    }
                    className='flex items-center gap-1 w-fit'
                  >
                    {student.status === 'Present' ? (
                      <UserCheck className='h-3 w-3' />
                    ) : (
                      <UserX className='h-3 w-3' />
                    )}
                    {student.status}
                  </Badge>
                </TableCell>
                {canMarkThisSlot && (
                  <TableCell>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => toggleStudentStatus(student.id)}
                      className='h-8 px-2'
                    >
                      {student.status === 'Present'
                        ? 'Mark Absent'
                        : 'Mark Present'}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filteredStudents.length === 0 && (
          <div className='text-center py-8 text-muted-foreground'>
            {searchTerm
              ? 'No students found matching your search.'
              : 'No students found.'}
          </div>
        )}
      </div>

      {/* Save button */}
      {canMarkThisSlot && (
        <div className='flex justify-end'>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className='flex items-center gap-2'
          >
            <Save className='h-4 w-4' />
            {saving ? 'Saving...' : 'Save Attendance'}
          </Button>
        </div>
      )}
    </div>
  );
}
