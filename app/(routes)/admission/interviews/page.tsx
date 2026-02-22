'use client';

import React, { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday } from 'date-fns';
import {
  Calendar,
  Clock,
  Users,
  ChevronLeft,
  ChevronRight,
  Video,
  MapPin,
  UserCheck,
  Plus,
  Download,
  Mail,
  Phone,
  GraduationCap,
  CalendarPlus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Search,
  Settings,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useInterviewSlots,
  useInterviewBookings,
  useInterviewStats,
  useCreateInterviewSlot,
  useBookingsForSlot,
} from '@/hooks/admission/use-interviews';

function InterviewSchedulingPageContent() {
  const { selectedInstitutionId: institutionId, loading: institutionLoading } = useUserInstitutionAccess();
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateSlotDialog, setShowCreateSlotDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('calendar');
  const [isSendingReminders, setIsSendingReminders] = useState(false);

  // Build filters
  const slotFilters = useMemo(() => {
    const filters: { program_id?: string; is_online?: boolean } = {};
    if (selectedProgram !== 'all') filters.program_id = selectedProgram;
    if (selectedType === 'online') filters.is_online = true;
    if (selectedType === 'in-person') filters.is_online = false;
    return filters;
  }, [selectedProgram, selectedType]);

  // Hooks for real data
  const { slots, isLoading: slotsLoading } = useInterviewSlots(institutionId, slotFilters);
  const { bookings, isLoading: bookingsLoading } = useInterviewBookings(institutionId);
  const { stats, isLoading: statsLoading } = useInterviewStats(institutionId);
  const { bookings: selectedSlotBookings } = useBookingsForSlot(selectedSlotId || undefined);
  const createSlotMutation = useCreateInterviewSlot();

  const selectedSlot = useMemo(() => slots.find(s => s.id === selectedSlotId) || null, [slots, selectedSlotId]);

  // New slot form state
  const [newSlot, setNewSlot] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '10:00',
    type: 'in-person' as 'online' | 'in-person',
    venue: '',
    meetingLink: '',
    programId: '',
    maxCapacity: 10,
  });

  const weekDays = useMemo(() => {
    return eachDayOfInterval({
      start: currentWeekStart,
      end: endOfWeek(currentWeekStart, { weekStartsOn: 1 }),
    });
  }, [currentWeekStart]);

  const getSlotsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return slots.filter(slot => slot.slot_date === dateStr);
  };

  const filteredBookings = useMemo(() => {
    if (!searchQuery.trim()) return bookings;
    const query = searchQuery.toLowerCase();
    return bookings.filter(b => {
      const appNum = b.admission_applications?.application_number || '';
      return appNum.toLowerCase().includes(query) ||
        b.application_id.toLowerCase().includes(query);
    });
  }, [bookings, searchQuery]);

  // Get unique program IDs from slots for filter
  const programIds = useMemo(() => {
    return [...new Set(slots.map(s => s.program_id).filter(Boolean))] as string[];
  }, [slots]);

  const isLoading = institutionLoading || slotsLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <ContentLayout title="Interviews">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Interviews</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interview Scheduling</h1>
          <p className="text-gray-600 text-sm mt-1">
            Manage interview slots, bookings, and panel assignments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.success('Interview schedule exported successfully')}>
            <Download className="h-4 w-4 mr-2" />
            Export Schedule
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.success('Calendar synced successfully')}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync Calendar
          </Button>
          <Dialog open={showCreateSlotDialog} onOpenChange={setShowCreateSlotDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-[#0b6d41] hover:bg-[#095535]">
                <Plus className="h-4 w-4 mr-2" />
                Create Slot
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Interview Slot</DialogTitle>
                <DialogDescription>
                  Configure a new interview slot for applicants to book
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={newSlot.date}
                      onChange={(e) => setNewSlot({ ...newSlot, date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Program ID</Label>
                    <Input
                      placeholder="e.g., btech-cse"
                      value={newSlot.programId}
                      onChange={(e) => setNewSlot({ ...newSlot, programId: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={newSlot.startTime}
                      onChange={(e) => setNewSlot({ ...newSlot, startTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={newSlot.endTime}
                      onChange={(e) => setNewSlot({ ...newSlot, endTime: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Interview Type</Label>
                    <Select value={newSlot.type} onValueChange={(v: 'online' | 'in-person') => setNewSlot({ ...newSlot, type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in-person">In-Person</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Capacity</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={newSlot.maxCapacity}
                      onChange={(e) => setNewSlot({ ...newSlot, maxCapacity: parseInt(e.target.value) || 10 })}
                    />
                  </div>
                </div>
                {newSlot.type === 'in-person' ? (
                  <div className="space-y-2">
                    <Label>Venue</Label>
                    <Input
                      placeholder="e.g., Interview Room 101, Main Building"
                      value={newSlot.venue}
                      onChange={(e) => setNewSlot({ ...newSlot, venue: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Meeting Link</Label>
                    <Input
                      placeholder="https://meet.jkkn.edu.in/..."
                      value={newSlot.meetingLink}
                      onChange={(e) => setNewSlot({ ...newSlot, meetingLink: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateSlotDialog(false)} disabled={createSlotMutation.isPending}>Cancel</Button>
                <Button
                  className="bg-[#0b6d41] hover:bg-[#095535]"
                  disabled={createSlotMutation.isPending}
                  onClick={() => {
                    if (!institutionId) return;
                    createSlotMutation.mutate({
                      institution_id: institutionId,
                      slot_date: newSlot.date,
                      start_time: newSlot.startTime,
                      end_time: newSlot.endTime,
                      capacity: newSlot.maxCapacity,
                      is_online: newSlot.type === 'online',
                      interview_type: 'interview',
                      location: newSlot.type === 'in-person' ? newSlot.venue : undefined,
                      meeting_link: newSlot.type === 'online' ? newSlot.meetingLink : undefined,
                      program_id: newSlot.programId || undefined,
                    }, {
                      onSuccess: () => setShowCreateSlotDialog(false),
                    });
                  }}
                >
                  {createSlotMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Slot'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalSlots}</p>
                <p className="text-xs text-gray-500">Total Slots</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <UserCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalBooked}</p>
                <p className="text-xs text-gray-500">Booked</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalCapacity}</p>
                <p className="text-xs text-gray-500">Capacity</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.todaySlots}</p>
                <p className="text-xs text-gray-500">Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.completedBookings}</p>
                <p className="text-xs text-gray-500">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="calendar">Calendar View</TabsTrigger>
            <TabsTrigger value="bookings">All Bookings</TabsTrigger>
            <TabsTrigger value="panel">Panel Management</TabsTrigger>
          </TabsList>

          {activeTab === 'calendar' && (
            <div className="flex items-center gap-2">
              <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by program" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Programs</SelectItem>
                  {programIds.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="in-person">In-Person</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {activeTab === 'bookings' && (
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search applicants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
        </div>

        <TabsContent value="calendar" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-medium">
                      {format(currentWeekStart, 'MMM d')} - {format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), 'MMM d, yyyy')}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                  >
                    Today
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1">
                  {weekDays.map((day, idx) => (
                    <div key={idx} className="text-center">
                      <div className="text-xs text-gray-500 font-medium mb-1">
                        {format(day, 'EEE')}
                      </div>
                      <button
                        onClick={() => setSelectedDate(day)}
                        className={cn(
                          "w-full aspect-square rounded-lg border-2 p-2 transition-all",
                          isToday(day) && "border-[#0b6d41] bg-[#0b6d41]/5",
                          selectedDate && isSameDay(selectedDate, day) && "border-[#0b6d41] bg-[#0b6d41]/10",
                          !isToday(day) && (!selectedDate || !isSameDay(selectedDate, day)) && "border-gray-200 hover:border-gray-300",
                          day.getDay() === 0 && "opacity-50"
                        )}
                      >
                        <div className={cn(
                          "text-lg font-semibold",
                          isToday(day) && "text-[#0b6d41]"
                        )}>
                          {format(day, 'd')}
                        </div>
                        <div className="mt-1 space-y-1">
                          {getSlotsForDate(day).slice(0, 2).map(slot => (
                            <div
                              key={slot.id}
                              className={cn(
                                "text-[10px] px-1 py-0.5 rounded truncate",
                                slot.is_online
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-orange-100 text-orange-700"
                              )}
                            >
                              {slot.start_time}
                            </div>
                          ))}
                          {getSlotsForDate(day).length > 2 && (
                            <div className="text-[10px] text-gray-500">
                              +{getSlotsForDate(day).length - 2} more
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Slot Details */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  {selectedDate ? format(selectedDate, 'EEEE, MMM d') : 'Select a Date'}
                </CardTitle>
                <CardDescription>
                  {selectedDate ? `${getSlotsForDate(selectedDate).length} slots available` : 'Click on a date to view slots'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  {selectedDate ? (
                    <div className="space-y-3">
                      {getSlotsForDate(selectedDate).length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <Calendar className="h-12 w-12 mx-auto mb-2 opacity-30" />
                          <p>No slots for this date</p>
                          <Button
                            variant="link"
                            size="sm"
                            className="text-[#0b6d41]"
                            onClick={() => setShowCreateSlotDialog(true)}
                          >
                            Create a slot
                          </Button>
                        </div>
                      ) : (
                        getSlotsForDate(selectedDate).map(slot => (
                          <div
                            key={slot.id}
                            className={cn(
                              "p-3 border rounded-lg cursor-pointer transition-all",
                              selectedSlotId === slot.id
                                ? "border-[#0b6d41] bg-[#0b6d41]/5"
                                : "border-gray-200 hover:border-gray-300"
                            )}
                            onClick={() => setSelectedSlotId(slot.id)}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-gray-400" />
                                <span className="font-medium">
                                  {slot.start_time} - {slot.end_time}
                                </span>
                              </div>
                              <Badge variant={slot.is_online ? 'default' : 'secondary'}>
                                {slot.is_online ? (
                                  <><Video className="h-3 w-3 mr-1" /> Online</>
                                ) : (
                                  <><MapPin className="h-3 w-3 mr-1" /> In-Person</>
                                )}
                              </Badge>
                            </div>
                            {slot.program_id && (
                              <div className="text-sm text-gray-600 mb-2">
                                <GraduationCap className="h-3 w-3 inline mr-1" />
                                {slot.program_id}
                              </div>
                            )}
                            <div className="flex items-center justify-between text-sm">
                              <span className={cn(
                                (slot.booked_count || 0) >= slot.capacity ? "text-red-600" : "text-gray-500"
                              )}>
                                <Users className="h-3 w-3 inline mr-1" />
                                {slot.booked_count || 0}/{slot.capacity} booked
                              </span>
                              {slot.default_panel_members && (
                                <span className="text-xs text-gray-400">
                                  {slot.default_panel_members.length} panelists
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <CalendarPlus className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      <p>Select a date from the calendar</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Selected Slot Details */}
          {selectedSlot && (
            <Card className="mt-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Slot Details: {selectedSlot.start_time} - {selectedSlot.end_time}</CardTitle>
                    <CardDescription>
                      {selectedSlot.program_id || 'All Programs'} | {format(new Date(selectedSlot.slot_date), 'EEEE, MMMM d, yyyy')}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSendingReminders}
                      onClick={async () => {
                        setIsSendingReminders(true);
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        toast.success('Reminders sent to all booked applicants');
                        setIsSendingReminders(false);
                      }}
                    >
                      {isSendingReminders ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="h-4 w-4 mr-2" />
                          Send Reminders
                        </>
                      )}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => toast.success('Opening slot editor...')}>
                      <Settings className="h-4 w-4 mr-2" />
                      Edit Slot
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Slot Info */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-500 uppercase">Slot Information</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        {selectedSlot.is_online ? (
                          <>
                            <Video className="h-4 w-4 text-blue-500" />
                            <span>Online Interview</span>
                          </>
                        ) : (
                          <>
                            <MapPin className="h-4 w-4 text-orange-500" />
                            <span>{selectedSlot.location || 'No venue specified'}</span>
                          </>
                        )}
                      </div>
                      {selectedSlot.meeting_link && (
                        <div className="text-sm">
                          <span className="text-gray-500">Meeting Link:</span>
                          <a href={selectedSlot.meeting_link} className="text-blue-600 hover:underline ml-1 break-all">
                            {selectedSlot.meeting_link}
                          </a>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-gray-400" />
                        <span>{selectedSlot.booked_count || 0} of {selectedSlot.capacity} seats booked</span>
                      </div>
                    </div>
                  </div>

                  {/* Panel Members */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-500 uppercase">Panel Members</h4>
                    <div className="space-y-2">
                      {(selectedSlot.default_panel_members || []).length > 0 ? (
                        (selectedSlot.default_panel_members || []).map((memberId, idx) => (
                          <div key={memberId} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                            <div className="h-8 w-8 bg-[#0b6d41] rounded-full flex items-center justify-center text-white text-sm font-medium">
                              P{idx + 1}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{memberId.substring(0, 8)}...</p>
                              <p className="text-xs text-gray-500">Panel Member</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">No panel members assigned</p>
                      )}
                      <Button variant="outline" size="sm" className="w-full" onClick={() => toast.success('Panel member added to slot')}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Panel Member
                      </Button>
                    </div>
                  </div>

                  {/* Booked Applicants */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-500 uppercase">Booked Applicants ({selectedSlotBookings.length})</h4>
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-2">
                        {selectedSlotBookings.map(booking => (
                          <div key={booking.id} className="p-2 bg-gray-50 rounded-lg">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">
                                {booking.admission_applications?.application_number || booking.application_id.substring(0, 8)}
                              </p>
                              <Badge
                                variant={booking.status === 'completed' ? 'default' : 'secondary'}
                                className={cn(
                                  booking.status === 'completed' && "bg-green-100 text-green-700"
                                )}
                              >
                                {booking.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500">{booking.application_id.substring(0, 12)}...</p>
                          </div>
                        ))}
                        {selectedSlotBookings.length === 0 && (
                          <p className="text-sm text-gray-500 text-center py-4">No bookings yet</p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="bookings" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {bookingsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Application</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Slot</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Interview Date</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Status</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Outcome</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Score</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBookings.slice(0, 20).map(booking => (
                        <tr key={booking.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="p-3">
                            <div>
                              <p className="font-medium text-sm">
                                {booking.admission_applications?.application_number || 'N/A'}
                              </p>
                              <p className="text-xs text-gray-500">{booking.application_id.substring(0, 12)}</p>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="text-sm font-mono">{booking.slot_id.substring(0, 8)}</span>
                          </td>
                          <td className="p-3">
                            <div className="text-sm">
                              {booking.interview_slots ? (
                                <>
                                  <p>{format(new Date(booking.interview_slots.slot_date), 'MMM d, yyyy')}</p>
                                  <p className="text-xs text-gray-500">{booking.interview_slots.start_time} - {booking.interview_slots.end_time}</p>
                                </>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge
                              variant="secondary"
                              className={cn(
                                booking.status === 'completed' && "bg-green-100 text-green-700",
                                booking.status === 'scheduled' && "bg-blue-100 text-blue-700",
                                booking.status === 'no_show' && "bg-red-100 text-red-700",
                                booking.status === 'cancelled' && "bg-gray-100 text-gray-700"
                              )}
                            >
                              {booking.status}
                            </Badge>
                          </td>
                          <td className="p-3">
                            {booking.outcome ? (
                              <Badge
                                variant="secondary"
                                className={cn(
                                  booking.outcome === 'selected' && "bg-green-100 text-green-700",
                                  booking.outcome === 'rejected' && "bg-red-100 text-red-700",
                                  booking.outcome === 'waitlisted' && "bg-yellow-100 text-yellow-700",
                                  booking.outcome === 'pending' && "bg-gray-100 text-gray-700"
                                )}
                              >
                                {booking.outcome}
                              </Badge>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            {booking.score !== null ? (
                              <span className="font-medium">{booking.score}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => toast.success('Opening booking details...')}>
                                <Mail className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => toast.success('Reschedule initiated')}>
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredBookings.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-gray-500">
                            No bookings found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {filteredBookings.length > 20 && (
                <div className="text-center mt-4 text-sm text-gray-500">
                  Showing 20 of {filteredBookings.length} bookings
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="panel" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="border-dashed">
              <CardContent className="pt-6 flex flex-col items-center justify-center h-full min-h-[200px]">
                <Plus className="h-8 w-8 text-gray-400 mb-2" />
                <p className="text-gray-500 text-sm">Panel member data will be loaded from profiles table</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Help Section */}
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="pt-4">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <AlertCircle className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium">Interview Scheduling Tips</h4>
              <ul className="mt-2 text-sm text-gray-600 space-y-1">
                <li>Create slots at least 3 days in advance to allow applicants time to book</li>
                <li>Automated reminders are sent 24 hours and 1 hour before the interview</li>
                <li>Applicants can reschedule up to 48 hours before their scheduled time</li>
                <li>Panel members will receive calendar invites automatically</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
      </div>
    </ContentLayout>
  );
}

export default function InterviewSchedulingPage() {
  return (
    <AdmissionErrorBoundary>
      <InterviewSchedulingPageContent />
    </AdmissionErrorBoundary>
  );
}
