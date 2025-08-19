'use client';

import { useState, useCallback, useMemo } from 'react';
import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar';
import moment from 'moment';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Calendar as CalendarIcon,
  Clock,
  Users,
  Book,
  MapPin,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useFacultyCalendar } from '@/hooks/academic/use-faculty-calendar';
import type {
  FacultySlot,
  FacultyCalendarEvent,
  FacultyCalendarFilters,
  CalendarView
} from '@/types/faculty-calendar';
import Loading from '@/components/Loading/Loading';

// Import CSS for react-big-calendar
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);

// Custom CSS for better calendar styling
const customCalendarStyles = `
  .rbc-calendar {
    font-family: inherit;
  }
  
  .rbc-event {
    border: none !important;
    border-radius: 6px !important;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12) !important;
    padding: 2px 4px !important;
    margin: 1px !important;
  }
  
  .rbc-event:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
    transform: translateY(-1px);
    transition: all 0.2s ease;
  }
  
  .rbc-event-content {
    font-size: 10px !important;
    line-height: 1.2 !important;
    overflow: hidden !important;
  }
  
  .rbc-time-slot {
    border-bottom: 1px solid #e5e7eb !important;
  }
  
  .rbc-timeslot-group {
    border-bottom: 2px solid #d1d5db !important;
  }
  
  .rbc-time-gutter .rbc-time-slot {
    font-size: 11px !important;
    color: #6b7280 !important;
  }
  
  .rbc-day-slot .rbc-time-slot {
    height: 40px !important;
  }
  
  .rbc-header {
    padding: 8px 4px !important;
    font-weight: 600 !important;
    font-size: 14px !important;
    border-bottom: 2px solid #e5e7eb !important;
    background-color: #f9fafb !important;
  }
  
  .rbc-today {
    background-color: #eff6ff !important;
  }
  
  /* Improve event overlapping */
  .rbc-addons-dnd .rbc-event {
    z-index: 1;
  }
  
  .rbc-selected {
    box-shadow: 0 2px 12px rgba(59, 130, 246, 0.3) !important;
  }
`;

interface FacultyCalendarProps {
  viewMode: 'faculty' | 'admin';
  staffId?: string;
  filters?: FacultyCalendarFilters;
  onSlotClick?: (slot: FacultySlot) => void;
  onDateClick?: (date: Date) => void;
  height?: number;
  className?: string;
}

export function FacultyCalendar({
  viewMode,
  staffId,
  filters,
  onSlotClick,
  onDateClick,
  height = 600,
  className
}: FacultyCalendarProps) {
  // State
  const [currentView, setCurrentView] = useState<View>(Views.WEEK);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] =
    useState<FacultyCalendarEvent | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);

  // Enhanced filters with current date range
  const enhancedFilters = useMemo(() => {
    // Calculate date range based on current view and date
    let from: Date, to: Date;

    if (currentView === Views.MONTH) {
      from = moment(currentDate).startOf('month').toDate();
      to = moment(currentDate).endOf('month').toDate();
    } else if (currentView === Views.WEEK) {
      from = moment(currentDate).startOf('week').toDate();
      to = moment(currentDate).endOf('week').toDate();
    } else if (currentView === Views.DAY) {
      from = moment(currentDate).startOf('day').toDate();
      to = moment(currentDate).endOf('day').toDate();
    } else {
      // Default to current month
      from = moment(currentDate).startOf('month').toDate();
      to = moment(currentDate).endOf('month').toDate();
    }

    return {
      include_break_slots: false, // Default to ensure property is always present
      ...filters,
      date_range: { from, to }
    };
  }, [filters, currentView, currentDate]);

  // Data hooks
  const {
    events,
    slots,
    courses,
    isLoading,
    error,
    refresh,
    hasData,
    isEmpty
  } = useFacultyCalendar({
    viewMode,
    staffId,
    filters: enhancedFilters,
    enabled: true
  });

  // Event handlers
  const handleSelectEvent = useCallback(
    (event: FacultyCalendarEvent) => {
      setSelectedEvent(event);
      setShowEventDialog(true);
      onSlotClick?.(event.resource);
    },
    [onSlotClick]
  );

  const handleSelectSlot = useCallback(
    ({ start }: { start: Date }) => {
      onDateClick?.(start);
    },
    [onDateClick]
  );

  const handleNavigate = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  const handleViewChange = useCallback((view: View) => {
    setCurrentView(view);
  }, []);

  // Custom event component
  const EventComponent = ({ event }: { event: FacultyCalendarEvent }) => {
    const slot = event.resource;

    // Color coding based on event type
    const getEventColor = () => {
      if (slot.is_break_slot) return 'bg-orange-500';
      if (slot.course?.course_code) return 'bg-blue-500';
      return 'bg-gray-500';
    };

    const getEventTextColor = () => {
      return 'text-white';
    };

    return (
      <div
        className={`
          relative overflow-hidden rounded-md border-l-2 border-white/30
          ${getEventColor()} ${getEventTextColor()}
          hover:shadow-md transition-all duration-200
          h-full flex flex-col justify-center px-2 py-1
        `}
        style={{
          minHeight: '32px',
          fontSize: '10px',
          lineHeight: '1.2'
        }}
      >
        {/* Main content */}
        <div className='flex-1 flex flex-col justify-center'>
          <div className='font-bold truncate leading-tight'>
            {slot.is_break_slot ? (
              <span className='flex items-center gap-1'>
                <Clock className='h-2.5 w-2.5 flex-shrink-0' />
                {slot.break_description || 'Break'}
              </span>
            ) : (
              <span title={slot.course?.course_name || 'Class'}>
                {slot.course?.course_code || 'Class'}
              </span>
            )}
          </div>

          {/* Section info for non-break slots */}
          {!slot.is_break_slot && slot.sections && slot.sections.length > 0 && (
            <div
              className='text-white/90 truncate text-[9px] mt-0.5'
              title={slot.sections.map((s) => s.section_name).join(', ')}
            >
              {slot.sections.length === 1
                ? slot.sections[0].section_name
                : `${slot.sections[0].section_name} +${
                    slot.sections.length - 1
                  }`}
            </div>
          )}

          {/* Time display */}
          <div className='text-white/80 text-[8px] truncate mt-0.5'>
            {moment(slot.start_time, 'HH:mm:ss').format('h:mm A')}
          </div>
        </div>
      </div>
    );
  };

  // Custom toolbar
  const CustomToolbar = ({ label, onNavigate, onView }: any) => (
    <div className='flex items-center justify-between mb-4 p-2 bg-gray-50 rounded-lg'>
      <div className='flex items-center gap-2'>
        <Button variant='outline' size='sm' onClick={() => onNavigate('PREV')}>
          <ChevronLeft className='h-4 w-4' />
        </Button>
        <Button variant='outline' size='sm' onClick={() => onNavigate('TODAY')}>
          Today
        </Button>
        <Button variant='outline' size='sm' onClick={() => onNavigate('NEXT')}>
          <ChevronRight className='h-4 w-4' />
        </Button>
      </div>

      <h2 className='text-lg font-semibold'>{label}</h2>

      <div className='flex items-center gap-2'>
        <Select value={currentView} onValueChange={onView}>
          <SelectTrigger className='w-32'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={Views.MONTH}>Month</SelectItem>
            <SelectItem value={Views.WEEK}>Week</SelectItem>
            <SelectItem value={Views.DAY}>Day</SelectItem>
            <SelectItem value='agenda'>Agenda</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant='outline'
          size='sm'
          onClick={refresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </div>
  );

  // Loading state
  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className='p-6'>
          <Loading title='Loading calendar...' />
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className={className}>
        <CardContent className='p-6'>
          <div className='text-center text-red-600'>
            <p>Error loading calendar: {error.message}</p>
            <Button onClick={refresh} className='mt-2'>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (isEmpty) {
    return (
      <Card className={className}>
        <CardContent className='p-6'>
          <div className='text-center py-8'>
            <CalendarIcon className='h-12 w-12 text-gray-400 mx-auto mb-4' />
            <h3 className='text-lg font-semibold text-gray-900 mb-2'>
              No Classes Scheduled
            </h3>
            <p className='text-gray-600'>
              {viewMode === 'faculty'
                ? 'You have no classes scheduled for this period.'
                : 'No faculty assignments found for the selected filters.'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={className}>
      {/* Inject custom styles */}
      <style>{customCalendarStyles}</style>

      {/* Calendar Stats */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-6'>
        <Card>
          <CardContent className='p-4'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm font-medium text-muted-foreground'>
                  Total Classes
                </p>
                <p className='text-2xl font-bold'>
                  {slots.filter((s) => !s.is_break_slot).length}
                </p>
              </div>
              <Book className='h-8 w-8 text-blue-600' />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='p-4'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm font-medium text-muted-foreground'>
                  Courses
                </p>
                <p className='text-2xl font-bold'>{courses.length}</p>
              </div>
              <Book className='h-8 w-8 text-green-600' />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='p-4'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm font-medium text-muted-foreground'>
                  Break Periods
                </p>
                <p className='text-2xl font-bold'>
                  {slots.filter((s) => s.is_break_slot).length}
                </p>
              </div>
              <Clock className='h-8 w-8 text-orange-600' />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Color Legend */}
      <div className='mb-4'>
        <Card>
          <CardContent className='p-3'>
            <div className='flex items-center gap-6 text-sm'>
              <span className='font-medium text-gray-700'>Legend:</span>
              <div className='flex items-center gap-2'>
                <div className='w-4 h-4 bg-blue-500 rounded'></div>
                <span>Regular Classes</span>
              </div>
              <div className='flex items-center gap-2'>
                <div className='w-4 h-4 bg-orange-500 rounded'></div>
                <span>Break Periods</span>
              </div>
              <div className='text-xs text-gray-500 ml-4'>
                Hover over events for more details • Click to view class
                information
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className='p-6'>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor='start'
            endAccessor='end'
            style={{ height }}
            min={new Date(0, 0, 0, 8, 0, 0)} // 8:00 AM
            max={new Date(0, 0, 0, 20, 0, 0)} // 8:00 PM
            step={30} // 30 minute steps for better granularity
            timeslots={2} // 2 slots per step (15-minute intervals)
            formats={{
              timeGutterFormat: 'h:mm A', // 12-hour format for time gutter
              eventTimeRangeFormat: ({ start, end }) =>
                `${moment(start).format('h:mm A')} - ${moment(end).format(
                  'h:mm A'
                )}`,
              agendaTimeFormat: 'h:mm A',
              agendaTimeRangeFormat: ({ start, end }) =>
                `${moment(start).format('h:mm A')} - ${moment(end).format(
                  'h:mm A'
                )}`
            }}
            onSelectEvent={handleSelectEvent}
            onSelectSlot={handleSelectSlot}
            onNavigate={handleNavigate}
            onView={handleViewChange}
            view={currentView}
            date={currentDate}
            selectable
            popup
            components={{
              event: EventComponent,
              toolbar: CustomToolbar
            }}
            eventPropGetter={(event: FacultyCalendarEvent) => {
              const slot = event.resource;
              let backgroundColor = '#3b82f6'; // Default blue

              if (slot.is_break_slot) {
                backgroundColor = '#f97316'; // Orange for breaks
              } else if (slot.course?.course_code) {
                backgroundColor = '#3b82f6'; // Blue for classes
              }

              return {
                style: {
                  backgroundColor,
                  border: 'none',
                  borderRadius: '6px',
                  padding: '2px',
                  margin: '1px',
                  fontSize: '10px',
                  lineHeight: '1.2',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  overflow: 'hidden'
                }
              };
            }}
            dayPropGetter={(date: Date) => ({
              style: {
                backgroundColor: moment(date).isSame(moment(), 'day')
                  ? '#f0f9ff'
                  : undefined
              }
            })}
          />
        </CardContent>
      </Card>

      {/* Event Details Dialog */}
      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <CalendarIcon className='h-5 w-5' />
              Class Details
            </DialogTitle>
          </DialogHeader>

          {selectedEvent && (
            <div className='space-y-4'>
              <EventDetailsContent slot={selectedEvent.resource} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Event details component
function EventDetailsContent({ slot }: { slot: FacultySlot }) {
  return (
    <div className='space-y-4'>
      {/* Header */}
      <div className='text-center'>
        <h3 className='text-lg font-semibold'>
          {slot.is_break_slot
            ? slot.break_description || 'Break Period'
            : slot.course?.course_name || 'Class'}
        </h3>
        <Badge
          variant={slot.is_break_slot ? 'secondary' : 'default'}
          className='mt-1'
        >
          {slot.period_name}
        </Badge>
      </div>

      {/* Time */}
      <div className='flex items-center gap-2'>
        <Clock className='h-4 w-4 text-gray-500' />
        <span className='text-sm'>
          {moment(slot.start_time, 'HH:mm:ss').format('h:mm A')} -
          {moment(slot.end_time, 'HH:mm:ss').format('h:mm A')}
        </span>
      </div>

      {/* Course Info */}
      {!slot.is_break_slot && slot.course && (
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            <Book className='h-4 w-4 text-gray-500' />
            <span className='text-sm'>
              {slot.course.course_code} - {slot.course.course_name}
            </span>
          </div>
        </div>
      )}

      {/* Sections */}
      {slot.sections && slot.sections.length > 0 && (
        <div className='flex items-center gap-2'>
          <Users className='h-4 w-4 text-gray-500' />
          <div className='flex flex-wrap gap-1'>
            {slot.sections.map((section, index) => (
              <Badge key={index} variant='outline' className='text-xs'>
                {section.section_name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Staff */}
      {slot.staff_members && slot.staff_members.length > 0 && (
        <div className='flex items-center gap-2'>
          <Users className='h-4 w-4 text-gray-500' />
          <div className='flex flex-wrap gap-1'>
            {slot.staff_members.map((staff, index) => (
              <Badge key={index} variant='secondary' className='text-xs'>
                {staff.first_name} {staff.last_name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Timetable Info */}
      <div className='space-y-2 pt-2 border-t'>
        <div className='text-xs text-gray-500'>
          <div>{slot.timetable.timetable_name}</div>
          <div>{slot.timetable.institution_name}</div>
          <div>{slot.timetable.department_name}</div>
          {slot.timetable.semester && (
            <div>Semester: {slot.timetable.semester}</div>
          )}
        </div>
      </div>

      {/* Combined Class Info */}
      {slot.is_combined && slot.sub_slots && (
        <div className='space-y-2 pt-2 border-t'>
          <h4 className='text-sm font-medium'>Combined Class Details:</h4>
          {slot.sub_slots.map((subSlot, index) => (
            <div key={index} className='p-2 bg-gray-50 rounded'>
              <div className='text-xs'>
                <div className='font-medium'>
                  Sub-slot {subSlot.sub_slot_order}
                </div>
                {subSlot.course && (
                  <div>
                    {subSlot.course.course_code} - {subSlot.course.course_name}
                  </div>
                )}
                {subSlot.sections && subSlot.sections.length > 0 && (
                  <div>
                    Sections:{' '}
                    {subSlot.sections.map((s) => s.section_name).join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
