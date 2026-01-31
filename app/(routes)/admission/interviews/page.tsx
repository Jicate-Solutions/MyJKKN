'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, isBefore, addMinutes, parse } from 'date-fns';
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
  Filter,
  Download,
  Mail,
  Phone,
  Building2,
  GraduationCap,
  CalendarPlus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Settings,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';

// Types
interface InterviewSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  type: 'online' | 'in-person';
  venue?: string;
  meetingLink?: string;
  programId: string;
  programName: string;
  maxCapacity: number;
  bookedCount: number;
  panelMembers: PanelMember[];
  status: 'available' | 'full' | 'cancelled';
}

interface PanelMember {
  id: string;
  name: string;
  role: string;
  email: string;
  avatar?: string;
}

interface BookedInterview {
  id: string;
  slotId: string;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  applicationNumber: string;
  programApplied: string;
  bookedAt: string;
  status: 'scheduled' | 'completed' | 'no-show' | 'rescheduled' | 'cancelled';
  remindersSent: number;
  feedback?: {
    rating: number;
    notes: string;
    recommendation: 'accept' | 'reject' | 'waitlist';
  };
}

// Sample data
const SAMPLE_PANEL_MEMBERS: PanelMember[] = [
  { id: 'p1', name: 'Dr. Senthil Kumar', role: 'HOD - Computer Science', email: 'senthil@jkkn.edu.in' },
  { id: 'p2', name: 'Prof. Lakshmi Priya', role: 'Associate Professor', email: 'lakshmi@jkkn.edu.in' },
  { id: 'p3', name: 'Mr. Rajesh Kumar', role: 'Industry Expert', email: 'rajesh@techcorp.com' },
  { id: 'p4', name: 'Dr. Anitha Devi', role: 'Dean - Admissions', email: 'anitha@jkkn.edu.in' },
];

const PROGRAMS = [
  { id: 'btech-cse', name: 'B.Tech Computer Science' },
  { id: 'btech-ece', name: 'B.Tech Electronics' },
  { id: 'mba', name: 'MBA' },
  { id: 'bpharm', name: 'B.Pharm' },
  { id: 'mca', name: 'MCA' },
];

const generateSampleSlots = (): InterviewSlot[] => {
  const slots: InterviewSlot[] = [];
  const today = new Date();

  for (let i = 1; i <= 14; i++) {
    const date = addDays(today, i);
    if (date.getDay() === 0) continue; // Skip Sundays

    // Morning slots
    slots.push({
      id: `slot-${i}-1`,
      date: format(date, 'yyyy-MM-dd'),
      startTime: '09:00',
      endTime: '10:00',
      type: i % 3 === 0 ? 'online' : 'in-person',
      venue: i % 3 !== 0 ? 'Interview Room 101, Main Building' : undefined,
      meetingLink: i % 3 === 0 ? 'https://meet.jkkn.edu.in/interview-001' : undefined,
      programId: PROGRAMS[i % PROGRAMS.length].id,
      programName: PROGRAMS[i % PROGRAMS.length].name,
      maxCapacity: 10,
      bookedCount: Math.floor(Math.random() * 8),
      panelMembers: [SAMPLE_PANEL_MEMBERS[0], SAMPLE_PANEL_MEMBERS[1]],
      status: 'available',
    });

    // Afternoon slots
    slots.push({
      id: `slot-${i}-2`,
      date: format(date, 'yyyy-MM-dd'),
      startTime: '14:00',
      endTime: '15:00',
      type: 'online',
      meetingLink: 'https://meet.jkkn.edu.in/interview-002',
      programId: PROGRAMS[(i + 1) % PROGRAMS.length].id,
      programName: PROGRAMS[(i + 1) % PROGRAMS.length].name,
      maxCapacity: 8,
      bookedCount: Math.floor(Math.random() * 6),
      panelMembers: [SAMPLE_PANEL_MEMBERS[2], SAMPLE_PANEL_MEMBERS[3]],
      status: 'available',
    });
  }

  return slots;
};

const generateSampleBookings = (slots: InterviewSlot[]): BookedInterview[] => {
  const bookings: BookedInterview[] = [];
  const firstNames = ['Arun', 'Priya', 'Karthik', 'Divya', 'Rahul', 'Sneha', 'Vijay', 'Meera'];
  const lastNames = ['Kumar', 'Sharma', 'Patel', 'Reddy', 'Nair', 'Singh', 'Menon', 'Das'];

  slots.forEach((slot, idx) => {
    for (let i = 0; i < slot.bookedCount; i++) {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      bookings.push({
        id: `booking-${slot.id}-${i}`,
        slotId: slot.id,
        applicantId: `app-${idx}-${i}`,
        applicantName: `${firstName} ${lastName}`,
        applicantEmail: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@gmail.com`,
        applicantPhone: `+91 ${9000000000 + Math.floor(Math.random() * 999999999)}`,
        applicationNumber: `JKKN-2024-${String(1000 + idx * 10 + i).padStart(5, '0')}`,
        programApplied: slot.programName,
        bookedAt: format(addDays(new Date(), -Math.floor(Math.random() * 7)), 'yyyy-MM-dd'),
        status: Math.random() > 0.2 ? 'scheduled' : 'completed',
        remindersSent: Math.floor(Math.random() * 3),
      });
    }
  });

  return bookings;
};

function InterviewSchedulingPageContent() {
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<InterviewSlot | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateSlotDialog, setShowCreateSlotDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('calendar');
  const [isCreatingSlot, setIsCreatingSlot] = useState(false);
  const [isSendingReminders, setIsSendingReminders] = useState(false);

  const [slots] = useState<InterviewSlot[]>(generateSampleSlots);
  const [bookings] = useState<BookedInterview[]>(() => generateSampleBookings(slots));

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
    panelMemberIds: [] as string[],
  });

  const weekDays = useMemo(() => {
    return eachDayOfInterval({
      start: currentWeekStart,
      end: endOfWeek(currentWeekStart, { weekStartsOn: 1 }),
    });
  }, [currentWeekStart]);

  const filteredSlots = useMemo(() => {
    return slots.filter(slot => {
      if (selectedProgram !== 'all' && slot.programId !== selectedProgram) return false;
      if (selectedType !== 'all' && slot.type !== selectedType) return false;
      return true;
    });
  }, [slots, selectedProgram, selectedType]);

  const getSlotsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return filteredSlots.filter(slot => slot.date === dateStr);
  };

  const getBookingsForSlot = (slotId: string) => {
    return bookings.filter(b => b.slotId === slotId);
  };

  const stats = useMemo(() => {
    const totalSlots = slots.length;
    const totalCapacity = slots.reduce((acc, s) => acc + s.maxCapacity, 0);
    const totalBooked = slots.reduce((acc, s) => acc + s.bookedCount, 0);
    const todaySlots = slots.filter(s => s.date === format(new Date(), 'yyyy-MM-dd')).length;
    const completedInterviews = bookings.filter(b => b.status === 'completed').length;

    return { totalSlots, totalCapacity, totalBooked, todaySlots, completedInterviews };
  }, [slots, bookings]);

  const filteredBookings = useMemo(() => {
    if (!searchQuery.trim()) return bookings;
    const query = searchQuery.toLowerCase();
    return bookings.filter(b =>
      b.applicantName.toLowerCase().includes(query) ||
      b.applicationNumber.toLowerCase().includes(query) ||
      b.applicantEmail.toLowerCase().includes(query)
    );
  }, [bookings, searchQuery]);

  return (
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
                    <Label>Program</Label>
                    <Select value={newSlot.programId} onValueChange={(v) => setNewSlot({ ...newSlot, programId: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select program" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROGRAMS.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                <div className="space-y-2">
                  <Label>Panel Members</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Add panel members" />
                    </SelectTrigger>
                    <SelectContent>
                      {SAMPLE_PANEL_MEMBERS.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} - {p.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateSlotDialog(false)} disabled={isCreatingSlot}>Cancel</Button>
                <Button
                  className="bg-[#0b6d41] hover:bg-[#095535]"
                  disabled={isCreatingSlot}
                  onClick={async () => {
                    setIsCreatingSlot(true);
                    // Simulate async operation
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    toast.success('Interview slot created successfully');
                    setIsCreatingSlot(false);
                    setShowCreateSlotDialog(false);
                  }}
                >
                  {isCreatingSlot ? (
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
                <p className="text-2xl font-bold">{stats.completedInterviews}</p>
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
                  {PROGRAMS.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
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
                                slot.type === 'online'
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-orange-100 text-orange-700"
                              )}
                            >
                              {slot.startTime}
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
                              selectedSlot?.id === slot.id
                                ? "border-[#0b6d41] bg-[#0b6d41]/5"
                                : "border-gray-200 hover:border-gray-300"
                            )}
                            onClick={() => setSelectedSlot(slot)}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-gray-400" />
                                <span className="font-medium">
                                  {slot.startTime} - {slot.endTime}
                                </span>
                              </div>
                              <Badge variant={slot.type === 'online' ? 'default' : 'secondary'}>
                                {slot.type === 'online' ? (
                                  <><Video className="h-3 w-3 mr-1" /> Online</>
                                ) : (
                                  <><MapPin className="h-3 w-3 mr-1" /> In-Person</>
                                )}
                              </Badge>
                            </div>
                            <div className="text-sm text-gray-600 mb-2">
                              <GraduationCap className="h-3 w-3 inline mr-1" />
                              {slot.programName}
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className={cn(
                                slot.bookedCount >= slot.maxCapacity ? "text-red-600" : "text-gray-500"
                              )}>
                                <Users className="h-3 w-3 inline mr-1" />
                                {slot.bookedCount}/{slot.maxCapacity} booked
                              </span>
                              <span className="text-xs text-gray-400">
                                {slot.panelMembers.length} panelists
                              </span>
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
                    <CardTitle>Slot Details: {selectedSlot.startTime} - {selectedSlot.endTime}</CardTitle>
                    <CardDescription>{selectedSlot.programName} | {format(new Date(selectedSlot.date), 'EEEE, MMMM d, yyyy')}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSendingReminders}
                      onClick={async () => {
                        setIsSendingReminders(true);
                        // Simulate async operation
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
                        {selectedSlot.type === 'online' ? (
                          <>
                            <Video className="h-4 w-4 text-blue-500" />
                            <span>Online Interview</span>
                          </>
                        ) : (
                          <>
                            <MapPin className="h-4 w-4 text-orange-500" />
                            <span>{selectedSlot.venue}</span>
                          </>
                        )}
                      </div>
                      {selectedSlot.meetingLink && (
                        <div className="text-sm">
                          <span className="text-gray-500">Meeting Link:</span>
                          <a href={selectedSlot.meetingLink} className="text-blue-600 hover:underline ml-1 break-all">
                            {selectedSlot.meetingLink}
                          </a>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-gray-400" />
                        <span>{selectedSlot.bookedCount} of {selectedSlot.maxCapacity} seats booked</span>
                      </div>
                    </div>
                  </div>

                  {/* Panel Members */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-500 uppercase">Panel Members</h4>
                    <div className="space-y-2">
                      {selectedSlot.panelMembers.map(member => (
                        <div key={member.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                          <div className="h-8 w-8 bg-[#0b6d41] rounded-full flex items-center justify-center text-white text-sm font-medium">
                            {member.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{member.name}</p>
                            <p className="text-xs text-gray-500">{member.role}</p>
                          </div>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" className="w-full" onClick={() => toast.success('Panel member added to slot')}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Panel Member
                      </Button>
                    </div>
                  </div>

                  {/* Booked Applicants */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-500 uppercase">Booked Applicants ({getBookingsForSlot(selectedSlot.id).length})</h4>
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-2">
                        {getBookingsForSlot(selectedSlot.id).map(booking => (
                          <div key={booking.id} className="p-2 bg-gray-50 rounded-lg">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">{booking.applicantName}</p>
                              <Badge
                                variant={booking.status === 'completed' ? 'default' : 'secondary'}
                                className={cn(
                                  booking.status === 'completed' && "bg-green-100 text-green-700"
                                )}
                              >
                                {booking.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500">{booking.applicationNumber}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Phone className="h-3 w-3 text-gray-400" />
                              <span className="text-xs text-gray-500">{booking.applicantPhone}</span>
                            </div>
                          </div>
                        ))}
                        {getBookingsForSlot(selectedSlot.id).length === 0 && (
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
              <div className="rounded-lg border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-3 text-sm font-medium text-gray-500">Applicant</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500">Application #</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500">Program</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500">Interview Date</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500">Status</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBookings.slice(0, 20).map(booking => {
                      const slot = slots.find(s => s.id === booking.slotId);
                      return (
                        <tr key={booking.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="p-3">
                            <div>
                              <p className="font-medium text-sm">{booking.applicantName}</p>
                              <p className="text-xs text-gray-500">{booking.applicantEmail}</p>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="text-sm font-mono">{booking.applicationNumber}</span>
                          </td>
                          <td className="p-3">
                            <span className="text-sm">{booking.programApplied}</span>
                          </td>
                          <td className="p-3">
                            <div className="text-sm">
                              <p>{slot ? format(new Date(slot.date), 'MMM d, yyyy') : '-'}</p>
                              <p className="text-xs text-gray-500">{slot?.startTime} - {slot?.endTime}</p>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge
                              variant="secondary"
                              className={cn(
                                booking.status === 'completed' && "bg-green-100 text-green-700",
                                booking.status === 'scheduled' && "bg-blue-100 text-blue-700",
                                booking.status === 'no-show' && "bg-red-100 text-red-700",
                                booking.status === 'cancelled' && "bg-gray-100 text-gray-700"
                              )}
                            >
                              {booking.status}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => toast.success(`Email sent to ${booking.applicantName}`)}>
                                <Mail className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => toast.success(`Calling ${booking.applicantName}...`)}>
                                <Phone className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => toast.success('Interview rescheduled successfully')}>
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
            {SAMPLE_PANEL_MEMBERS.map(member => (
              <Card key={member.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 bg-[#0b6d41] rounded-full flex items-center justify-center text-white text-lg font-medium">
                      {member.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{member.name}</h3>
                      <p className="text-sm text-gray-500">{member.role}</p>
                      <p className="text-sm text-gray-400 mt-1">{member.email}</p>
                      <div className="mt-3 flex items-center gap-4 text-sm">
                        <div>
                          <span className="font-medium text-[#0b6d41]">12</span>
                          <span className="text-gray-500 ml-1">interviews</span>
                        </div>
                        <div>
                          <span className="font-medium text-blue-600">3</span>
                          <span className="text-gray-500 ml-1">this week</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <div className="flex items-center justify-between">
                    <Button variant="outline" size="sm" onClick={() => toast.success('Opening panel member schedule...')}>View Schedule</Button>
                    <Button variant="ghost" size="sm" onClick={() => toast.success('Opening panel member settings...')}>
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            <Card className="border-dashed">
              <CardContent className="pt-6 flex flex-col items-center justify-center h-full min-h-[200px]">
                <Plus className="h-8 w-8 text-gray-400 mb-2" />
                <p className="text-gray-500 text-sm">Add Panel Member</p>
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
  );
}

export default function InterviewSchedulingPage() {
  return (
    <AdmissionErrorBoundary>
      <InterviewSchedulingPageContent />
    </AdmissionErrorBoundary>
  );
}
