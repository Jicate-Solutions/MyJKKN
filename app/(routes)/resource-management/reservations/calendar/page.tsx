'use client';
// app/(routes)/resource-management/reservations/calendar/page.tsx

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  User,
  MapPin,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronsUpDown,
  Check,
  Search,
  FolderOpen,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCalendarReservations } from '@/hooks/reservation/use-reservations';
import { useResourcesSelect } from '@/hooks/resource-management/use-resources';
import { useParentCategoriesSelect } from '@/hooks/resource-management/use-parent-categories';
import { useAuth } from '@/hooks/use-auth';
import type { Reservation } from '@/types/reservation';
import { format } from 'date-fns';

import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);

const calendarStyles = `
  .rbc-calendar { font-family: inherit; }
  .rbc-event {
    border: none !important;
    border-radius: 6px !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.12) !important;
    padding: 2px 6px !important;
    margin: 1px !important;
    font-size: 11px !important;
    cursor: pointer !important;
  }
  .rbc-event:hover {
    box-shadow: 0 2px 8px rgba(0,0,0,0.18) !important;
    transform: translateY(-1px);
    transition: all 0.2s ease;
  }
  .rbc-event-content { line-height: 1.3 !important; overflow: hidden !important; }
  .rbc-time-slot { border-bottom: 1px solid #e5e7eb !important; }
  .rbc-timeslot-group { border-bottom: 2px solid #d1d5db !important; }
  .rbc-time-gutter .rbc-time-slot { font-size: 11px !important; color: #6b7280 !important; }
  .rbc-header {
    padding: 8px 4px !important;
    font-weight: 600 !important;
    font-size: 13px !important;
    border-bottom: 2px solid #e5e7eb !important;
    background-color: #f9fafb !important;
  }
  .rbc-today { background-color: #eff6ff !important; }
  .rbc-selected { box-shadow: 0 2px 12px rgba(59,130,246,0.3) !important; }
  .rbc-show-more { font-size: 11px !important; color: #3b82f6 !important; font-weight: 600 !important; }
  .rbc-agenda-view table { font-size: 13px !important; }
`;

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Reservation;
  color: string;
}

const STATUS_COLORS: Record<string, string> = {
  approved: '#10b981',
  pending: '#f59e0b',
  rejected: '#ef4444',
  cancelled: '#6b7280',
  completed: '#3b82f6',
  no_show: '#f97316'
};

const RESOURCE_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e11d48', '#a855f7', '#0ea5e9', '#22c55e'
];

export default function ReservationCalendarPage() {
  const router = useRouter();
  const { profile: user } = useAuth();
  const [currentView, setCurrentView] = useState<View>(Views.MONTH);
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [resourceFilter, setResourceFilter] = useState<string>('all');
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [colorBy, setColorBy] = useState<'resource' | 'status'>('resource');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    setCurrentDate(new Date());
  }, []);

  const { resources: resourceList, loading: loadingResources } =
    useResourcesSelect();
  const { categories, loading: loadingCategories } =
    useParentCategoriesSelect();

  // Filter resources by selected category
  const filteredResourceList = useMemo(() => {
    if (categoryFilter === 'all') return resourceList;
    return resourceList.filter(
      (r) => r.parent_category_id === categoryFilter
    );
  }, [resourceList, categoryFilter]);

  // Get selected resource name for display
  const selectedResourceName = useMemo(() => {
    if (resourceFilter === 'all') return 'All Resources';
    return resourceList.find((r) => r.id === resourceFilter)?.name || 'Unknown';
  }, [resourceFilter, resourceList]);

  // Build a stable color map for resources
  const resourceColorMap = useMemo(() => {
    const map = new Map<string, string>();
    resourceList.forEach((r, i) => {
      map.set(r.id, RESOURCE_COLORS[i % RESOURCE_COLORS.length]);
    });
    return map;
  }, [resourceList]);

  // Compute date range based on current view
  const dateRange = useMemo(() => {
    const d = currentDate || new Date();
    let start: Date, end: Date;
    if (currentView === Views.MONTH) {
      start = moment(d).startOf('month').subtract(7, 'days').toDate();
      end = moment(d).endOf('month').add(7, 'days').toDate();
    } else if (currentView === Views.WEEK) {
      start = moment(d).startOf('week').toDate();
      end = moment(d).endOf('week').toDate();
    } else if (currentView === Views.DAY) {
      start = moment(d).startOf('day').toDate();
      end = moment(d).endOf('day').toDate();
    } else {
      start = moment(d).startOf('month').toDate();
      end = moment(d).endOf('month').add(14, 'days').toDate();
    }
    return {
      start: start.toISOString(),
      end: end.toISOString()
    };
  }, [currentView, currentDate]);

  const { data: reservations = [], isLoading } = useCalendarReservations(
    dateRange.start,
    dateRange.end,
    resourceFilter !== 'all' ? resourceFilter : undefined
  );

  // Convert reservations to calendar events
  const events: CalendarEvent[] = useMemo(() => {
    let filtered = reservations;

    if (statusFilter !== 'all') {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    return filtered.map((reservation) => {
      const color =
        colorBy === 'status'
          ? STATUS_COLORS[reservation.status] || '#6b7280'
          : resourceColorMap.get(reservation.resource_id) || '#3b82f6';

      return {
        id: reservation.id,
        title: `${reservation.resource?.name || 'Resource'} - ${reservation.user?.full_name || 'User'}`,
        start: new Date(reservation.start_time),
        end: new Date(reservation.end_time),
        resource: reservation,
        color
      };
    });
  }, [reservations, statusFilter, colorBy, resourceColorMap]);

  const handleNavigate = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  const handleViewChange = useCallback((view: View) => {
    setCurrentView(view);
  }, []);

  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
  }, []);

  const eventStyleGetter = useCallback(
    (event: CalendarEvent) => ({
      style: {
        backgroundColor: event.color,
        color: '#fff',
        border: 'none',
        borderRadius: '6px'
      }
    }),
    []
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className='bg-green-100 text-green-700 border-green-200 hover:bg-green-100 gap-1'>
            <CheckCircle2 className='h-3 w-3' />Approved
          </Badge>
        );
      case 'pending':
        return (
          <Badge className='bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-100 gap-1'>
            <Clock className='h-3 w-3' />Pending
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className='bg-red-100 text-red-700 border-red-200 hover:bg-red-100 gap-1'>
            <XCircle className='h-3 w-3' />Rejected
          </Badge>
        );
      case 'completed':
        return (
          <Badge className='bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100 gap-1'>
            <CheckCircle2 className='h-3 w-3' />Completed
          </Badge>
        );
      default:
        return (
          <Badge variant='outline' className='gap-1'>
            <AlertCircle className='h-3 w-3' />{status}
          </Badge>
        );
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy - h:mm a');
    } catch {
      return dateStr;
    }
  };

  if (!currentDate) return null;

  return (
    <ContentLayout title='Reservation Calendar'>
      <style>{calendarStyles}</style>

      <Breadcrumb className='mb-6'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/resource-management'>
              Resource Management
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href='/resource-management/reservations'>
              Reservations
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Calendar</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6'>
        <div>
          <h1 className='text-3xl font-bold'>Reservation Calendar</h1>
          <p className='text-muted-foreground'>
            View all resource bookings across the organization
          </p>
        </div>
        <Button
          className='shrink-0'
          onClick={() => router.push('/resource-management/reservations/new')}
        >
          <CalendarIcon className='mr-2 h-4 w-4' />
          New Reservation
        </Button>
      </div>

      {/* Filters */}
      <Card className='mb-6'>
        <CardContent className='p-4'>
          <div className='flex items-center gap-4 flex-wrap'>
            {/* Category Filter */}
            <div className='min-w-[180px]'>
              <label className='text-xs font-medium text-muted-foreground mb-1 block'>
                Category
              </label>
              <Select
                value={categoryFilter}
                onValueChange={(v) => {
                  setCategoryFilter(v);
                  setResourceFilter('all');
                }}
              >
                <SelectTrigger className='h-9'>
                  <SelectValue placeholder='All Categories' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Searchable Resource Filter */}
            <div className='flex-1 min-w-[220px]'>
              <label className='text-xs font-medium text-muted-foreground mb-1 block'>
                Resource
              </label>
              <Popover
                open={resourcePickerOpen}
                onOpenChange={setResourcePickerOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    role='combobox'
                    aria-expanded={resourcePickerOpen}
                    className='w-full justify-between h-9 font-normal'
                  >
                    <span className='truncate'>
                      {selectedResourceName}
                    </span>
                    {resourceFilter !== 'all' ? (
                      <X
                        className='ml-2 h-3.5 w-3.5 shrink-0 opacity-50 hover:opacity-100'
                        onClick={(e) => {
                          e.stopPropagation();
                          setResourceFilter('all');
                        }}
                      />
                    ) : (
                      <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-[calc(100vw-2rem)] max-w-[320px] sm:w-[320px] p-0' align='start'>
                  <Command>
                    <CommandInput placeholder='Search resources...' />
                    <CommandList>
                      <CommandEmpty>No resources found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value='All Resources'
                          onSelect={() => {
                            setResourceFilter('all');
                            setResourcePickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              resourceFilter === 'all' ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          All Resources
                          <Badge variant='secondary' className='ml-auto text-[10px]'>
                            {filteredResourceList.length}
                          </Badge>
                        </CommandItem>
                      </CommandGroup>

                      {/* Group by category if no category filter is active */}
                      {categoryFilter === 'all' ? (
                        <>
                          {categories.map((cat) => {
                            const catResources = filteredResourceList.filter(
                              (r) => r.parent_category_id === cat.id
                            );
                            if (catResources.length === 0) return null;
                            return (
                              <CommandGroup
                                key={cat.id}
                                heading={cat.name}
                              >
                                {catResources.map((r) => (
                                  <CommandItem
                                    key={r.id}
                                    value={`${cat.name} ${r.name}`}
                                    onSelect={() => {
                                      setResourceFilter(r.id);
                                      setResourcePickerOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        resourceFilter === r.id
                                          ? 'opacity-100'
                                          : 'opacity-0'
                                      )}
                                    />
                                    <span className='truncate'>{r.name}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            );
                          })}
                          {/* Uncategorized resources */}
                          {(() => {
                            const uncategorized = filteredResourceList.filter(
                              (r) => !r.parent_category_id
                            );
                            if (uncategorized.length === 0) return null;
                            return (
                              <CommandGroup heading='Uncategorized'>
                                {uncategorized.map((r) => (
                                  <CommandItem
                                    key={r.id}
                                    value={`Uncategorized ${r.name}`}
                                    onSelect={() => {
                                      setResourceFilter(r.id);
                                      setResourcePickerOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        resourceFilter === r.id
                                          ? 'opacity-100'
                                          : 'opacity-0'
                                      )}
                                    />
                                    <span className='truncate'>{r.name}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            );
                          })()}
                        </>
                      ) : (
                        <CommandGroup
                          heading={
                            categories.find((c) => c.id === categoryFilter)
                              ?.name || 'Filtered'
                          }
                        >
                          {filteredResourceList.map((r) => (
                            <CommandItem
                              key={r.id}
                              value={r.name}
                              onSelect={() => {
                                setResourceFilter(r.id);
                                setResourcePickerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  resourceFilter === r.id
                                    ? 'opacity-100'
                                    : 'opacity-0'
                                )}
                              />
                              <span className='truncate'>{r.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Status Filter */}
            <div className='min-w-[150px]'>
              <label className='text-xs font-medium text-muted-foreground mb-1 block'>
                Status
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className='h-9'>
                  <SelectValue placeholder='All Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Status</SelectItem>
                  <SelectItem value='pending'>Pending</SelectItem>
                  <SelectItem value='approved'>Approved</SelectItem>
                  <SelectItem value='completed'>Completed</SelectItem>
                  <SelectItem value='rejected'>Rejected</SelectItem>
                  <SelectItem value='cancelled'>Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Color By */}
            <div className='min-w-[140px]'>
              <label className='text-xs font-medium text-muted-foreground mb-1 block'>
                Color By
              </label>
              <Select
                value={colorBy}
                onValueChange={(v) => setColorBy(v as 'resource' | 'status')}
              >
                <SelectTrigger className='h-9'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='resource'>Resource</SelectItem>
                  <SelectItem value='status'>Status</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Event count */}
            <div className='flex items-end pb-0.5'>
              <Badge variant='outline' className='text-sm px-3 py-1.5'>
                {events.length} reservation{events.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>

          {/* Legend */}
          <div className='flex items-center gap-3 mt-3 pt-3 border-t flex-wrap'>
            <span className='text-xs text-muted-foreground font-medium'>
              Legend:
            </span>
            {colorBy === 'status' ? (
              <>
                {Object.entries(STATUS_COLORS).map(([status, color]) => (
                  <div key={status} className='flex items-center gap-1.5'>
                    <div
                      className='h-3 w-3 rounded-sm'
                      style={{ backgroundColor: color }}
                    />
                    <span className='text-xs capitalize'>{status}</span>
                  </div>
                ))}
              </>
            ) : (
              <>
                {resourceList.slice(0, 8).map((r) => (
                  <div key={r.id} className='flex items-center gap-1.5'>
                    <div
                      className='h-3 w-3 rounded-sm'
                      style={{
                        backgroundColor:
                          resourceColorMap.get(r.id) || '#3b82f6'
                      }}
                    />
                    <span className='text-xs truncate max-w-[100px]'>
                      {r.name}
                    </span>
                  </div>
                ))}
                {resourceList.length > 8 && (
                  <span className='text-xs text-muted-foreground'>
                    +{resourceList.length - 8} more
                  </span>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card>
        <CardContent className='p-4'>
          {/* Navigation toolbar */}
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4'>
            <div className='flex items-center gap-2 flex-wrap'>
              <Button
                variant='outline'
                size='sm'
                onClick={() =>
                  handleNavigate(
                    moment(currentDate)
                      .subtract(
                        1,
                        currentView === Views.MONTH
                          ? 'month'
                          : currentView === Views.WEEK
                          ? 'week'
                          : 'day'
                      )
                      .toDate()
                  )
                }
              >
                <ChevronLeft className='h-4 w-4' />
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => handleNavigate(new Date())}
              >
                Today
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() =>
                  handleNavigate(
                    moment(currentDate)
                      .add(
                        1,
                        currentView === Views.MONTH
                          ? 'month'
                          : currentView === Views.WEEK
                          ? 'week'
                          : 'day'
                      )
                      .toDate()
                  )
                }
              >
                <ChevronRight className='h-4 w-4' />
              </Button>
              <h2 className='text-lg font-semibold ml-2'>
                {moment(currentDate).format(
                  currentView === Views.DAY
                    ? 'dddd, MMMM D, YYYY'
                    : 'MMMM YYYY'
                )}
              </h2>
            </div>

            <div className='flex items-center gap-1 flex-wrap'>
              {[
                { view: Views.MONTH, label: 'Month' },
                { view: Views.WEEK, label: 'Week' },
                { view: Views.DAY, label: 'Day' },
                { view: Views.AGENDA, label: 'Agenda' }
              ].map(({ view, label }) => (
                <Button
                  key={label}
                  variant={currentView === view ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => handleViewChange(view)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Calendar component */}
          <div style={{ height: 650 }}>
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor='start'
              endAccessor='end'
              view={currentView}
              date={currentDate}
              onNavigate={handleNavigate}
              onView={handleViewChange}
              onSelectEvent={handleSelectEvent}
              eventPropGetter={eventStyleGetter}
              toolbar={false}
              popup
              showMultiDayTimes
              step={30}
              timeslots={2}
              min={new Date(2024, 0, 1, 7, 0)}
              max={new Date(2024, 0, 1, 21, 0)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Event Detail Dialog */}
      <Dialog
        open={!!selectedEvent}
        onOpenChange={() => setSelectedEvent(null)}
      >
        <DialogContent className='sm:max-w-[500px]'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <CalendarIcon className='h-5 w-5' />
              Reservation Details
            </DialogTitle>
          </DialogHeader>

          {selectedEvent && (
            <div className='space-y-4'>
              {/* Resource + Status */}
              <div className='flex items-start justify-between'>
                <div>
                  <h3 className='font-semibold text-lg'>
                    {selectedEvent.resource.resource?.name}
                  </h3>
                  <p className='text-sm text-muted-foreground line-clamp-2'>
                    {selectedEvent.resource.purpose}
                  </p>
                </div>
                {getStatusBadge(selectedEvent.resource.status)}
              </div>

              {/* Details grid */}
              <div className='rounded-lg border p-4 space-y-3 bg-muted/30'>
                <div className='flex items-center gap-3'>
                  <User className='h-4 w-4 text-muted-foreground shrink-0' />
                  <div>
                    <p className='text-xs text-muted-foreground'>Booked By</p>
                    <p className='text-sm font-medium'>
                      {selectedEvent.resource.user?.full_name || 'Unknown'}
                    </p>
                    {selectedEvent.resource.user?.email && (
                      <p className='text-xs text-muted-foreground'>
                        {selectedEvent.resource.user.email}
                      </p>
                    )}
                  </div>
                </div>

                <div className='flex items-center gap-3'>
                  <Clock className='h-4 w-4 text-muted-foreground shrink-0' />
                  <div>
                    <p className='text-xs text-muted-foreground'>Start</p>
                    <p className='text-sm font-medium'>
                      {formatDateTime(selectedEvent.resource.start_time)}
                    </p>
                  </div>
                </div>

                <div className='flex items-center gap-3'>
                  <Clock className='h-4 w-4 text-muted-foreground shrink-0' />
                  <div>
                    <p className='text-xs text-muted-foreground'>End</p>
                    <p className='text-sm font-medium'>
                      {formatDateTime(selectedEvent.resource.end_time)}
                    </p>
                  </div>
                </div>

                {(selectedEvent.resource.resource as any)?.building_number && (
                  <div className='flex items-center gap-3'>
                    <MapPin className='h-4 w-4 text-muted-foreground shrink-0' />
                    <div>
                      <p className='text-xs text-muted-foreground'>Location</p>
                      <p className='text-sm font-medium'>
                        Building{' '}
                        {(selectedEvent.resource.resource as any).building_number}
                        {(selectedEvent.resource.resource as any).room_number &&
                          `, Room ${(selectedEvent.resource.resource as any).room_number}`}
                      </p>
                    </div>
                  </div>
                )}

                <div className='flex items-center gap-3'>
                  <CalendarIcon className='h-4 w-4 text-muted-foreground shrink-0' />
                  <div>
                    <p className='text-xs text-muted-foreground'>Quantity</p>
                    <p className='text-sm font-medium'>
                      {selectedEvent.resource.quantity}
                    </p>
                  </div>
                </div>
              </div>

              {/* View Details button */}
              <Button
                className='w-full'
                onClick={() => {
                  setSelectedEvent(null);
                  router.push(
                    `/resource-management/reservations/${selectedEvent.resource.id}`
                  );
                }}
              >
                <Eye className='mr-2 h-4 w-4' />
                View Full Details
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
