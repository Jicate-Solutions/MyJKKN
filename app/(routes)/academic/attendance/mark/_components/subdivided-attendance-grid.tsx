'use client';

// Created: 2025-10-11
// Subdivided Attendance Grid - Display and mark attendance for subdivided sections

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users,
  User,
  MapPin,
  UserCheck,
  UserX,
  Check,
  X,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SubdividedStudent {
  id: string;
  first_name: string;
  last_name: string;
  roll_number: string;
  student_email?: string;
  section_id?: string;
  section_name?: string;
  avatar_url?: string;
}

interface SubdivisionGroupData {
  group_order: number;
  group_name: string;
  student_ids: string[];
  staff_ids: string[];
  lab_room?: string;
  max_capacity?: number;
}

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  staff_id?: string;
  email?: string;
  institution_email?: string;
}

interface SubdividedAttendanceGridProps {
  groups: SubdivisionGroupData[];
  allStudents: SubdividedStudent[];
  availableStaff: StaffMember[];
  attendanceData: Record<string, 'Present' | 'Absent'>;
  onAttendanceChange: (studentId: string, status: 'Present' | 'Absent') => void;
  onMarkAllGroupPresent: (groupOrder: number) => void;
  onMarkAllGroupAbsent: (groupOrder: number) => void;
  readOnly?: boolean;
  searchTerm?: string;
  subdivisionType?: string;
}

export function SubdividedAttendanceGrid({
  groups,
  allStudents,
  availableStaff,
  attendanceData,
  onAttendanceChange,
  onMarkAllGroupPresent,
  onMarkAllGroupAbsent,
  readOnly = false,
  searchTerm = '',
  subdivisionType = 'practical'
}: SubdividedAttendanceGridProps) {
  // Helper function to get students for a specific group
  const getGroupStudents = (group: SubdivisionGroupData) => {
    return allStudents.filter((student) => group.student_ids.includes(student.id));
  };

  // Helper function to get staff for a specific group
  const getGroupStaff = (group: SubdivisionGroupData) => {
    return availableStaff.filter((staff) => group.staff_ids.includes(staff.id));
  };

  // Filter students based on search term
  const filterStudents = (students: SubdividedStudent[]) => {
    if (!searchTerm) return students;

    const term = searchTerm.toLowerCase();
    return students.filter(
      (student) =>
        student.first_name?.toLowerCase().includes(term) ||
        student.last_name?.toLowerCase().includes(term) ||
        student.roll_number?.toLowerCase().includes(term) ||
        student.student_email?.toLowerCase().includes(term)
    );
  };

  // Calculate stats for a group
  const getGroupStats = (group: SubdivisionGroupData) => {
    const groupStudents = getGroupStudents(group);
    const present = groupStudents.filter(
      (student) => attendanceData[student.id] === 'Present'
    ).length;
    const absent = groupStudents.filter(
      (student) => attendanceData[student.id] === 'Absent'
    ).length;
    const percentage =
      groupStudents.length > 0 ? Math.round((present / groupStudents.length) * 100) : 0;

    return { total: groupStudents.length, present, absent, percentage };
  };

  // Calculate overall stats
  const overallStats = useMemo(() => {
    const totalStudents = allStudents.length;
    const present = allStudents.filter(
      (student) => attendanceData[student.id] === 'Present'
    ).length;
    const absent = allStudents.filter(
      (student) => attendanceData[student.id] === 'Absent'
    ).length;
    const percentage = totalStudents > 0 ? Math.round((present / totalStudents) * 100) : 0;

    return { totalStudents, present, absent, percentage };
  }, [allStudents, attendanceData]);

  if (groups.length === 0) {
    return (
      <Alert className='border-amber-200 bg-amber-50 dark:bg-amber-900/20'>
        <AlertTriangle className='h-4 w-4 text-amber-600 dark:text-amber-500' />
        <AlertDescription className='text-amber-800 dark:text-amber-200'>
          No subdivision groups found. Please check the timetable configuration.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Overall Summary Card */}
      <Card className='border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20'>
        <CardContent className='p-6'>
          <div className='flex items-center justify-between flex-wrap gap-4'>
            <div className='flex items-center gap-3'>
              <div className='bg-purple-100 dark:bg-purple-900/50 p-3 rounded-full'>
                <Users className='h-6 w-6 text-purple-600 dark:text-purple-400' />
              </div>
              <div>
                <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                  {subdivisionType.charAt(0).toUpperCase() + subdivisionType.slice(1)} Groups
                </h3>
                <p className='text-sm text-gray-600 dark:text-gray-400'>
                  {groups.length} groups • {overallStats.totalStudents} students total
                </p>
              </div>
            </div>
            <div className='flex gap-4 text-center'>
              <div>
                <p className='text-2xl font-bold text-green-600 dark:text-green-400'>
                  {overallStats.present}
                </p>
                <p className='text-xs text-gray-600 dark:text-gray-400'>Present</p>
              </div>
              <div>
                <p className='text-2xl font-bold text-red-600 dark:text-red-400'>
                  {overallStats.absent}
                </p>
                <p className='text-xs text-gray-600 dark:text-gray-400'>Absent</p>
              </div>
              <div>
                <p className='text-2xl font-bold text-purple-600 dark:text-purple-400'>
                  {overallStats.percentage}%
                </p>
                <p className='text-xs text-gray-600 dark:text-gray-400'>Attendance</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Group Cards */}
      <div className='space-y-6'>
        {groups.map((group) => {
          const groupStudents = getGroupStudents(group);
          const filteredStudents = filterStudents(groupStudents);
          const groupStaff = getGroupStaff(group);
          const stats = getGroupStats(group);

          return (
            <Card
              key={group.group_order}
              className='border-l-4 border-l-purple-500 shadow-lg'
            >
              <CardHeader className='bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20'>
                <div className='flex items-start justify-between gap-4 flex-wrap'>
                  <div className='flex-1'>
                    <CardTitle className='text-xl flex items-center gap-2'>
                      <Badge variant='secondary' className='text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700'>
                        Group {group.group_order}
                      </Badge>
                      {group.group_name}
                    </CardTitle>

                    {/* Group Metadata */}
                    <div className='flex flex-wrap gap-3 mt-3'>
                      {group.lab_room && (
                        <Badge variant='outline' className='text-xs'>
                          <MapPin className='h-3 w-3 mr-1' />
                          {group.lab_room}
                        </Badge>
                      )}
                      <Badge variant='outline' className='text-xs'>
                        <Users className='h-3 w-3 mr-1' />
                        {stats.total} students
                        {group.max_capacity && ` / ${group.max_capacity} max`}
                      </Badge>
                      <Badge variant='outline' className='text-xs'>
                        <User className='h-3 w-3 mr-1' />
                        {groupStaff.length} staff
                      </Badge>
                    </div>

                    {/* Assigned Staff */}
                    {groupStaff.length > 0 && (
                      <div className='mt-3 flex flex-wrap gap-2'>
                        <span className='text-xs text-gray-600 dark:text-gray-400 font-medium'>
                          Assigned Staff:
                        </span>
                        {groupStaff.map((staff) => (
                          <Badge
                            key={staff.id}
                            variant='secondary'
                            className='text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                          >
                            {staff.full_name ||
                              `${staff.first_name || ''} ${staff.last_name || ''}`.trim()}
                            {staff.staff_id && ` (${staff.staff_id})`}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Group Stats */}
                  <div className='flex gap-3'>
                    <div className='text-center bg-white dark:bg-gray-800 rounded-lg p-2 border'>
                      <p className='text-lg font-bold text-green-600 dark:text-green-400'>
                        {stats.present}
                      </p>
                      <p className='text-xs text-gray-600 dark:text-gray-400'>Present</p>
                    </div>
                    <div className='text-center bg-white dark:bg-gray-800 rounded-lg p-2 border'>
                      <p className='text-lg font-bold text-red-600 dark:text-red-400'>
                        {stats.absent}
                      </p>
                      <p className='text-xs text-gray-600 dark:text-gray-400'>Absent</p>
                    </div>
                    <div className='text-center bg-white dark:bg-gray-800 rounded-lg p-2 border'>
                      <p className='text-lg font-bold text-purple-600 dark:text-purple-400'>
                        {stats.percentage}%
                      </p>
                      <p className='text-xs text-gray-600 dark:text-gray-400'>Rate</p>
                    </div>
                  </div>
                </div>

                {/* Capacity Warning */}
                {group.max_capacity && stats.total > group.max_capacity && (
                  <Alert className='mt-3 border-red-200 bg-red-50 dark:bg-red-900/20'>
                    <AlertTriangle className='h-4 w-4 text-red-600 dark:text-red-500' />
                    <AlertDescription className='text-red-800 dark:text-red-200 text-xs'>
                      ⚠ Group exceeds maximum capacity: {stats.total}/{group.max_capacity}
                    </AlertDescription>
                  </Alert>
                )}
              </CardHeader>

              <CardContent className='p-4'>
                {/* Group Actions */}
                {!readOnly && (
                  <div className='flex gap-2 mb-4'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => onMarkAllGroupPresent(group.group_order)}
                      className='bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700 hover:border-green-300 dark:hover:border-green-600'
                    >
                      <UserCheck className='h-3 w-3 mr-1' />
                      Mark All Present
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => onMarkAllGroupAbsent(group.group_order)}
                      className='bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700 hover:border-red-300 dark:hover:border-red-600'
                    >
                      <UserX className='h-3 w-3 mr-1' />
                      Mark All Absent
                    </Button>
                  </div>
                )}

                {/* Student Grid */}
                {filteredStudents.length === 0 ? (
                  <div className='text-center py-8 text-gray-500 dark:text-gray-400'>
                    <Users className='h-8 w-8 mx-auto mb-2 opacity-50' />
                    <p className='text-sm'>
                      {searchTerm ? 'No matching students in this group' : 'No students assigned'}
                    </p>
                  </div>
                ) : (
                  <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'>
                    {filteredStudents.map((student) => (
                      <Card
                        key={student.id}
                        className={cn(
                          'border-0 shadow-md transition-all duration-200 hover:shadow-lg cursor-pointer',
                          attendanceData[student.id] === 'Present'
                            ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-l-2 border-l-green-500 dark:from-green-900/20 dark:to-emerald-900/20'
                            : 'bg-gradient-to-br from-red-50 to-rose-50 border-l-2 border-l-red-500 dark:from-red-900/20 dark:to-rose-900/20',
                          readOnly && 'opacity-75 cursor-not-allowed'
                        )}
                        onClick={() => !readOnly && onAttendanceChange(student.id, attendanceData[student.id] === 'Present' ? 'Absent' : 'Present')}
                      >
                        <CardContent className='p-3'>
                          <div className='flex flex-col items-center text-center space-y-2'>
                            {/* Student Avatar */}
                            <div className='relative'>
                              <Avatar className='h-12 w-12 ring-2 ring-white shadow'>
                                <AvatarImage
                                  src={student.avatar_url}
                                  alt={`${student.first_name} ${student.last_name}`}
                                />
                                <AvatarFallback className='bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold text-sm'>
                                  {student.first_name?.[0]?.toUpperCase()}
                                  {student.last_name?.[0]?.toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              {/* Status Indicator */}
                              <div
                                className={cn(
                                  'absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full border-2 border-white flex items-center justify-center shadow',
                                  attendanceData[student.id] === 'Present'
                                    ? 'bg-green-500'
                                    : 'bg-red-500'
                                )}
                              >
                                {attendanceData[student.id] === 'Present' ? (
                                  <Check className='h-2.5 w-2.5 text-white' />
                                ) : (
                                  <X className='h-2.5 w-2.5 text-white' />
                                )}
                              </div>
                            </div>

                            {/* Student Info */}
                            <div className='w-full'>
                              <h4 className='font-semibold text-gray-900 dark:text-gray-100 text-xs leading-tight'>
                                {student.first_name} {student.last_name}
                              </h4>
                              <p className='text-xs text-gray-600 dark:text-gray-400 font-medium'>
                                {student.roll_number || 'N/A'}
                              </p>
                            </div>

                            {/* Status Button */}
                            <Button
                              variant={
                                attendanceData[student.id] === 'Present'
                                  ? 'default'
                                  : 'destructive'
                              }
                              size='sm'
                              className={cn(
                                'w-full h-7 text-xs font-medium transition-all',
                                attendanceData[student.id] === 'Present'
                                  ? 'bg-green-600 hover:bg-green-700'
                                  : 'bg-red-600 hover:bg-red-700',
                                readOnly && 'opacity-60 cursor-not-allowed'
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!readOnly) {
                                  onAttendanceChange(
                                    student.id,
                                    attendanceData[student.id] === 'Present' ? 'Absent' : 'Present'
                                  );
                                }
                              }}
                              disabled={readOnly}
                            >
                              {attendanceData[student.id] === 'Present' ? 'Present' : 'Absent'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
