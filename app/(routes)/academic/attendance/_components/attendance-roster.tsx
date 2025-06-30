'use client';

import { useState, useMemo } from 'react';
import { Search, Save, Users, UserCheck, UserX } from 'lucide-react';
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
}

export function AttendanceRoster({
  rosterData,
  onSave,
  canMarkAttendance,
  loading
}: AttendanceRosterProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [students, setStudents] = useState<AttendanceRosterStudent[]>(
    rosterData.students
  );
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Filter students based on search term
  const filteredStudents = useMemo(() => {
    if (!searchTerm) return students;

    return students.filter(
      (student) =>
        student.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
    if (!canMarkAttendance) {
      toast({
        title: 'Permission Denied',
        description: 'You do not have permission to mark attendance.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);

      // Get current user ID (you might need to get this from auth context)
      const currentUserId = 'current-user-id'; // TODO: Get from auth context

      // Prepare attendance records
      const attendanceRecords: CreateStudentAttendanceDto[] = students.map(
        (student) => ({
          student_id: student.id,
          timetable_slot_id: rosterData.timetable_slot.id,
          attendance_date: rosterData.attendance_date,
          status: student.status,
          marked_by: currentUserId,
          institution_id: 'institution-id' // TODO: Get from context
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
      console.error('Error saving attendance:', error);
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

        {canMarkAttendance && selectedStudents.length > 0 && (
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
                  disabled={!canMarkAttendance}
                />
              </TableHead>
              <TableHead>Roll Number</TableHead>
              <TableHead>Student Name</TableHead>
              <TableHead>Status</TableHead>
              {canMarkAttendance && <TableHead>Action</TableHead>}
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
                    disabled={!canMarkAttendance}
                  />
                </TableCell>
                <TableCell className='font-medium'>
                  {student.roll_number || 'N/A'}
                </TableCell>
                <TableCell>{student.student_name}</TableCell>
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
                {canMarkAttendance && (
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
      {canMarkAttendance && (
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
