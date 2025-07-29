'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Clock,
  User,
  BookOpen,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import Loading from '@/components/Loading/Loading';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { StudentService } from '@/lib/services/student/student-service';
import { useToast } from '@/hooks/use-toast';
import type {
  Timetable,
  TimetableSlot,
  Period,
  DayOfWeek
} from '@/types/academics';
import type { Student } from '@/types/student';
import { format, startOfWeek, addDays, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { PeriodService } from '@/lib/services/academic/period-service';
import { UserService } from '@/lib/services/users/user-service';

const DAYS_OF_WEEK: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY'
];

const DAY_ABBREVIATIONS: Record<DayOfWeek, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun'
};

export default function TimeTablePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('MONDAY');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(
    () => startOfWeek(new Date(), { weekStartsOn: 1 }) // Start week on Monday
  );

  useEffect(() => {
    fetchStudentAndTimetable();
  }, []);

  const fetchStudentAndTimetable = async () => {
    try {
      setLoading(true);

      // Get current user profile
      const { data: profile, error: profileError } =
        await UserService.getCurrentUserProfile();

      if (profileError || !profile) {
        toast({
          title: 'Error',
          description: 'Could not load user profile',
          variant: 'destructive'
        });
        return;
      }

      if (profile.role !== 'student' || !profile.student_id) {
        toast({
          title: 'Error',
          description: 'No student profile linked to your account',
          variant: 'destructive'
        });
        return;
      }

      // Get student details
      const studentData = await StudentService.getStudent(profile.student_id);
      if (!studentData) {
        toast({
          title: 'Error',
          description: 'Student profile not found',
          variant: 'destructive'
        });
        return;
      }
      setStudent(studentData);

      // Find active timetable for student's current semester
      const timetables = await TimetableService.getTimetables({
        institution_id: studentData.institution_id,
        degree_id: studentData.degree_id,
        department_id: studentData.department_id,
        program_id: studentData.program_id,
        semester: studentData.semester?.semester_name || '',
        is_active: true,
        is_template: false
      });

      if (timetables.data.length > 0) {
        // Get the full timetable with slots
        const fullTimetable = await TimetableService.getTimetable(
          timetables.data[0].id
        );
        setTimetable(fullTimetable);

        // Load selected periods from timetable_periods table
        const timetablePeriods = await TimetableService.getTimetablePeriods(
          timetables.data[0].id
        );
        if (timetablePeriods.length > 0) {
          const selectedPeriodsFromDB = timetablePeriods
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((tp) => tp.period)
            .filter(Boolean);
          setPeriods(selectedPeriodsFromDB);
        }
      } else {
        toast({
          title: 'No Timetable',
          description: 'No active timetable found for your current semester',
          variant: 'default'
        });
      }
    } catch (error) {
      console.error('Error fetching timetable:', error);
      toast({
        title: 'Error',
        description: 'Failed to load timetable',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getDateForDay = (day: DayOfWeek): Date => {
    const dayIndex = DAYS_OF_WEEK.indexOf(day);
    return addDays(currentWeekStart, dayIndex);
  };

  const getSlotForDayAndPeriod = (
    day: DayOfWeek,
    periodId: string
  ): TimetableSlot | undefined => {
    return timetable?.slots?.find(
      (slot) => slot.day_of_week === day && slot.period_id === periodId
    );
  };

  const getCurrentDaySlots = () => {
    return (
      timetable?.slots?.filter((slot) => slot.day_of_week === selectedDay) || []
    );
  };

  const navigateDay = (direction: 'prev' | 'next') => {
    const currentIndex = DAYS_OF_WEEK.indexOf(selectedDay);
    if (direction === 'prev' && currentIndex > 0) {
      setSelectedDay(DAYS_OF_WEEK[currentIndex - 1]);
    } else if (direction === 'next' && currentIndex < DAYS_OF_WEEK.length - 1) {
      setSelectedDay(DAYS_OF_WEEK[currentIndex + 1]);
    }
  };

  const renderSlotContent = (slot: TimetableSlot) => {
    if (slot.is_break_slot) {
      return (
        <div className='text-center'>
          <p className='text-sm font-medium text-muted-foreground'>Break</p>
          {slot.break_description && (
            <p className='text-xs text-muted-foreground mt-1'>
              {slot.break_description}
            </p>
          )}
        </div>
      );
    }

    if (slot.is_combined) {
      return (
        <div className='space-y-2'>
          <Badge variant='secondary' className='text-xs'>
            Combined Class
          </Badge>
          {slot.sub_slots?.map((subSlot, index) => (
            <div key={subSlot.id} className='border-l-2 border-primary/20 pl-2'>
              <p className='text-sm font-medium'>
                {subSlot.course?.course_code}
              </p>
              <p className='text-xs text-muted-foreground'>
                {subSlot.course?.course_name}
              </p>
              {subSlot.staff_members?.map((staff) => (
                <p key={staff.id} className='text-xs text-muted-foreground'>
                  {staff.first_name} {staff.last_name}
                </p>
              ))}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div>
        <p className='text-sm font-medium'>{slot.course?.course_code}</p>
        <p className='text-xs text-muted-foreground line-clamp-1'>
          {slot.course?.course_name}
        </p>
        {slot.staff_members && slot.staff_members.length > 0
          ? slot.staff_members.map((staff) => (
              <p key={staff.id} className='text-xs text-muted-foreground mt-1'>
                <User className='inline h-3 w-3 mr-1' />
                {staff.first_name} {staff.last_name}
              </p>
            ))
          : slot.staff && (
              <p className='text-xs text-muted-foreground mt-1'>
                <User className='inline h-3 w-3 mr-1' />
                {slot.staff.first_name} {slot.staff.last_name}
              </p>
            )}
      </div>
    );
  };

  if (loading) {
    return <Loading title='Loading timetable...' />;
  }

  if (!timetable) {
    return (
      <ContentLayout title='My Timetable'>
        <div className='flex flex-col items-center justify-center h-[400px] text-center'>
          <Calendar className='h-12 w-12 text-muted-foreground mb-4' />
          <h2 className='text-lg font-semibold'>No Timetable Available</h2>
          <p className='text-muted-foreground mt-2'>
            No active timetable found for your current semester.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const sortedPeriods = [...periods].sort((a, b) =>
    (a.start_time || '').localeCompare(b.start_time || '')
  );

  return (
    <ContentLayout title='My Timetable'>
      <div className='space-y-4'>
        {/* Header Info */}
        <Card>
          <CardContent className='p-4'>
            <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
              <div>
                <p className='text-sm text-muted-foreground'>Academic Year</p>
                <p className='font-medium'>
                  {timetable.academic_year?.academic_year_name}
                </p>
              </div>
              <div>
                <p className='text-sm text-muted-foreground'>Degree</p>
                <p className='font-medium'>{timetable.degree?.degree_name}</p>
              </div>
              <div>
                <p className='text-sm text-muted-foreground'>Department</p>
                <p className='font-medium'>
                  {timetable.department?.department_name}
                </p>
              </div>
              <div>
                <p className='text-sm text-muted-foreground'>Semester</p>
                <p className='font-medium'>{timetable.semester}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* View Mode Toggle - Mobile Only */}
        <div className='flex md:hidden items-center justify-between'>
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as 'grid' | 'list')}
          >
            <TabsList className='grid w-full grid-cols-2'>
              <TabsTrigger value='grid'>Week View</TabsTrigger>
              <TabsTrigger value='list'>Day View</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Week Navigation - Desktop */}
        <div className='hidden md:flex items-center justify-between mb-4'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setCurrentWeekStart((prev) => addDays(prev, -7))}
          >
            <ChevronLeft className='h-4 w-4 mr-1' />
            Previous Week
          </Button>

          <div className='text-center'>
            <p className='font-medium'>
              {format(currentWeekStart, 'MMM dd')} -{' '}
              {format(addDays(currentWeekStart, 6), 'MMM dd, yyyy')}
            </p>
            {isToday(currentWeekStart) && (
              <p className='text-sm text-muted-foreground'>Current Week</p>
            )}
          </div>

          <Button
            variant='outline'
            size='sm'
            onClick={() => setCurrentWeekStart((prev) => addDays(prev, 7))}
          >
            Next Week
            <ChevronRight className='h-4 w-4 ml-1' />
          </Button>
        </div>

        {/* Desktop Grid View */}
        <Card className='hidden md:block'>
          <CardContent className='p-0'>
            <ScrollArea className='w-full'>
              <div className='min-w-[800px]'>
                <table className='w-full'>
                  <thead>
                    <tr className='border-b'>
                      <th className='p-3 text-left font-medium'>Time</th>
                      {timetable.selected_days?.map((day) => {
                        const date = getDateForDay(day as DayOfWeek);

                        return (
                          <th key={day} className='p-3 text-center font-medium'>
                            <div>
                              <div>{day}</div>
                              <div className='text-xs font-normal text-muted-foreground'>
                                {format(date, 'MMM dd')}
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPeriods.map((periodItem) => {
                      const period = periodItem;
                      if (!period) return null;

                      return (
                        <tr key={period.id} className='border-b'>
                          <td className='p-3 text-sm'>
                            <div className='font-medium'>
                              {period.period_name}
                            </div>
                            <div className='text-xs text-muted-foreground'>
                              {period.start_time} - {period.end_time}
                            </div>
                          </td>
                          {timetable.selected_days?.map((day) => {
                            const slot = getSlotForDayAndPeriod(
                              day as DayOfWeek,
                              period.id
                            );

                            return (
                              <td key={day} className='p-3'>
                                {slot ? (
                                  <div
                                    className={cn(
                                      'p-3 rounded-lg border',
                                      slot.is_break_slot
                                        ? 'bg-muted/50 border-muted-foreground/20'
                                        : 'bg-primary/5 border-primary/20'
                                    )}
                                  >
                                    {renderSlotContent(slot)}
                                  </div>
                                ) : (
                                  <div className='p-3 rounded-lg border border-dashed border-muted-foreground/20'>
                                    <p className='text-xs text-muted-foreground text-center'>
                                      -
                                    </p>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ScrollBar orientation='horizontal' />
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Mobile View */}
        <div className='md:hidden space-y-4'>
          {viewMode === 'list' ? (
            <>
              {/* Day Navigation */}
              <Card>
                <CardContent className='p-3'>
                  <div className='flex items-center justify-between'>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => navigateDay('prev')}
                      disabled={selectedDay === DAYS_OF_WEEK[0]}
                    >
                      <ChevronLeft className='h-4 w-4' />
                    </Button>
                    <div className='text-center'>
                      <div className='font-medium'>{selectedDay}</div>
                      <div className='text-sm text-muted-foreground'>
                        {format(getDateForDay(selectedDay), 'MMM dd, yyyy')}
                      </div>
                    </div>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => navigateDay('next')}
                      disabled={
                        selectedDay === DAYS_OF_WEEK[DAYS_OF_WEEK.length - 1]
                      }
                    >
                      <ChevronRight className='h-4 w-4' />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Day Schedule */}
              <div className='space-y-3'>
                {sortedPeriods.map((periodItem) => {
                  const period = periodItem;
                  if (!period) return null;

                  const slot = getSlotForDayAndPeriod(selectedDay, period.id);

                  return (
                    <Card
                      key={period.id}
                      className={cn(
                        'transition-all',
                        slot?.is_break_slot && 'opacity-75'
                      )}
                    >
                      <CardContent className='p-4'>
                        <div className='flex items-start justify-between mb-2'>
                          <div>
                            <p className='font-medium'>{period.period_name}</p>
                            <p className='text-sm text-muted-foreground'>
                              <Clock className='inline h-3 w-3 mr-1' />
                              {period.start_time} - {period.end_time}
                            </p>
                          </div>
                          {slot?.is_break_slot && (
                            <Badge variant='secondary'>Break</Badge>
                          )}
                        </div>
                        {slot ? (
                          <div className='mt-3'>{renderSlotContent(slot)}</div>
                        ) : (
                          <p className='text-sm text-muted-foreground'>
                            No class scheduled
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          ) : (
            /* Mobile Week View */
            <Card>
              <CardContent className='p-0'>
                <ScrollArea className='w-full'>
                  <div className='min-w-[600px]'>
                    <table className='w-full text-sm'>
                      <thead>
                        <tr className='border-b'>
                          <th className='p-2 text-left text-xs'>Time</th>
                          {timetable.selected_days?.map((day) => (
                            <th key={day} className='p-2 text-center text-xs'>
                              {DAY_ABBREVIATIONS[day as DayOfWeek]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedPeriods.map((periodItem) => {
                          const period = periodItem;
                          if (!period) return null;

                          return (
                            <tr key={period.id} className='border-b'>
                              <td className='p-2 text-xs'>
                                <div className='font-medium'>
                                  {period.period_name}
                                </div>
                                <div className='text-[10px] text-muted-foreground'>
                                  {period.start_time?.substring(0, 5)}
                                </div>
                              </td>
                              {timetable.selected_days?.map((day) => {
                                const slot = getSlotForDayAndPeriod(
                                  day as DayOfWeek,
                                  period.id
                                );
                                return (
                                  <td key={day} className='p-1'>
                                    {slot ? (
                                      <div
                                        className={cn(
                                          'p-2 rounded text-xs',
                                          slot.is_break_slot
                                            ? 'bg-muted/50'
                                            : 'bg-primary/10'
                                        )}
                                      >
                                        {slot.is_break_slot ? (
                                          <span className='text-[10px]'>
                                            Break
                                          </span>
                                        ) : (
                                          <>
                                            <p className='font-medium text-[11px]'>
                                              {slot.course?.course_code}
                                            </p>
                                            {slot.staff && (
                                              <p className='text-[10px] text-muted-foreground truncate'>
                                                {slot.staff.last_name}
                                              </p>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    ) : (
                                      <div className='p-2 text-center text-muted-foreground'>
                                        -
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <ScrollBar orientation='horizontal' />
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Course Summary */}
        {viewMode === 'list' ? null : (
          <Card>
            <CardHeader>
              <h3 className='text-lg font-semibold'>Course Summary</h3>
            </CardHeader>
            <CardContent>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
                {Array.from(
                  new Set(
                    timetable.slots
                      ?.filter((slot) => !slot.is_break_slot && slot.course)
                      .map((slot) => slot.course?.id)
                  )
                ).map((courseId) => {
                  const slot = timetable.slots?.find(
                    (s) => s.course?.id === courseId
                  );
                  if (!slot?.course) return null;

                  const courseSlots =
                    timetable.slots?.filter((s) => s.course?.id === courseId) ||
                    [];
                  const totalClasses = courseSlots.length;

                  return (
                    <div
                      key={courseId}
                      className='flex items-start space-x-3 p-3 rounded-lg border'
                    >
                      <BookOpen className='h-5 w-5 text-primary mt-0.5' />
                      <div className='flex-1 min-w-0'>
                        <p className='font-medium'>{slot.course.course_code}</p>
                        <p className='text-sm text-muted-foreground truncate'>
                          {slot.course.course_name}
                        </p>
                        <p className='text-xs text-muted-foreground mt-1'>
                          {totalClasses} classes/week
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
