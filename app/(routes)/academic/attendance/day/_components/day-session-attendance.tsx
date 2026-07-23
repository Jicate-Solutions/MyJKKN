'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
  CalendarIcon,
  Loader2,
  Check,
  X,
  Users,
  Sun,
  Sunset,
  Save,
  LayoutGrid,
  List,
  Search,
  UserCheck,
  UserX,
  Percent
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { logger } from '@/lib/utils/enhanced-logger';
import { DailySessionAttendanceService } from '@/lib/services/academic/daily-session-attendance-service';
import type {
  DaySession,
  DaySessionClass,
  DaySessionRosterStudent
} from '@/types/attendance';

interface DaySessionAttendanceProps {
  /** Resolved staff id of the class incharge (null for admins without a staff record). */
  staffId: string | null;
  /** Admins/HOD/super-admin bypass the incharge authorization check and pick any class. */
  allowOverride?: boolean;
  /**
   * Institution to scope the class list for override users. undefined = all
   * institutions (super-admin marks for every school). Ignored for incharges.
   */
  institutionId?: string;
  /**
   * Pre-resolved class to mark. When provided, the class dropdown is locked to
   * this single class and no class list is fetched — used when the attendance
   * overview has already DECIDED the day-wise class from the search criteria.
   */
  fixedClass?: DaySessionClass;
  /** Initial date (yyyy-MM-dd) to mark, e.g. the date chosen in the search filters. */
  initialDate?: string;
}

type StatusMap = Record<string, 'Present' | 'Absent'>;

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

const AVATAR_COLORS = [
  'bg-purple-500',
  'bg-blue-500',
  'bg-teal-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-cyan-600',
  'bg-amber-500',
  'bg-rose-500',
  'bg-emerald-500',
  'bg-violet-500'
];

const initialsOf = (first?: string, last?: string) =>
  `${(first?.[0] || '').toUpperCase()}${(last?.[0] || '').toUpperCase()}` || '?';

/** Deterministic avatar colour from the student id, so it's stable per student. */
const avatarColor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
};

export function DaySessionAttendance({
  staffId,
  allowOverride = false,
  institutionId,
  fixedClass,
  initialDate
}: DaySessionAttendanceProps) {
  const [classes, setClasses] = useState<DaySessionClass[]>(
    fixedClass ? [fixedClass] : []
  );
  const [loadingClasses, setLoadingClasses] = useState(!fixedClass);
  const [selectedClassId, setSelectedClassId] = useState<string>(
    fixedClass?.timetable_id || ''
  );

  const [date, setDate] = useState<string>(initialDate || todayStr());
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [roster, setRoster] = useState<DaySessionRosterStudent[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  const [session, setSession] = useState<DaySession>('FN');
  // Per-session status maps. Defaulting an unmarked student to Present is the
  // common school workflow (mark only the absentees).
  const [fnStatus, setFnStatus] = useState<StatusMap>({});
  const [anStatus, setAnStatus] = useState<StatusMap>({});
  const [savedSessions, setSavedSessions] = useState<Set<DaySession>>(new Set());
  const [saving, setSaving] = useState(false);

  // Roster layout: grid (default) or list. Persisted per-user in localStorage so
  // their choice survives logout/login. Default applied on the server render;
  // the cached value is applied after mount to avoid a hydration mismatch.
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('daywise-attendance-view');
      if (saved === 'list' || saved === 'grid') setViewMode(saved);
    } catch {
      /* localStorage unavailable — keep default */
    }
  }, []);
  const changeView = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    try {
      window.localStorage.setItem('daywise-attendance-view', mode);
    } catch {
      /* ignore persistence failure */
    }
  };

  const selectedClass = useMemo(
    () => classes.find((c) => c.timetable_id === selectedClassId) || null,
    [classes, selectedClassId]
  );

  // Keep the date in sync when the parent supplies a new one (e.g. the admin
  // changes the date in the search filters and re-searches).
  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);

  // Load the markable classes once. Override users (admin/HOD/super-admin) pick
  // any session_wise class (scoped by institution; all institutions when
  // institutionId is undefined). Incharges get only their assigned classes.
  // When fixedClass is supplied the overview already resolved the class, so we
  // lock to it and skip the fetch entirely.
  useEffect(() => {
    if (fixedClass) {
      setClasses([fixedClass]);
      setSelectedClassId(fixedClass.timetable_id);
      setLoadingClasses(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        setLoadingClasses(true);
        const list = allowOverride
          ? await DailySessionAttendanceService.getAllSessionClasses(
              institutionId
            )
          : staffId
          ? await DailySessionAttendanceService.getInchargeClasses(staffId)
          : [];
        if (!active) return;
        setClasses(list);
        if (list.length > 0) setSelectedClassId(list[0].timetable_id);
      } finally {
        if (active) setLoadingClasses(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [staffId, allowOverride, institutionId, fixedClass]);

  // Load roster + existing attendance when class or date changes.
  const loadRosterAndAttendance = useCallback(async () => {
    if (!selectedClass) return;
    try {
      setLoadingRoster(true);
      const [students, records] = await Promise.all([
        DailySessionAttendanceService.getSectionRoster(selectedClass.section_id),
        DailySessionAttendanceService.getDailyAttendance(
          selectedClass.timetable_id,
          selectedClass.section_id,
          date
        )
      ]);

      // Seed both sessions: default everyone Present, then apply saved statuses.
      const seed = (sess: DaySession): StatusMap => {
        const map: StatusMap = {};
        students.forEach((s) => {
          map[s.id] = 'Present';
        });
        const rec = records.find((r) => r.session === sess);
        rec?.attendance_data?.students?.forEach((st) => {
          map[st.student_id] = st.status;
        });
        return map;
      };

      setRoster(students);
      setFnStatus(seed('FN'));
      setAnStatus(seed('AN'));
      setSavedSessions(
        new Set(records.map((r) => r.session as DaySession))
      );
    } catch (error) {
      logger.error('academic/attendance', 'Error loading day-wise roster', error);
      toast.error('Failed to load class roster.');
    } finally {
      setLoadingRoster(false);
    }
  }, [selectedClass, date]);

  useEffect(() => {
    loadRosterAndAttendance();
  }, [loadRosterAndAttendance]);

  const [search, setSearch] = useState('');

  const currentStatus = session === 'FN' ? fnStatus : anStatus;
  const setCurrentStatus = session === 'FN' ? setFnStatus : setAnStatus;

  const presentCount = useMemo(
    () => roster.filter((s) => currentStatus[s.id] === 'Present').length,
    [roster, currentStatus]
  );
  const absentCount = roster.length - presentCount;
  const attendanceRate = roster.length
    ? Math.round((presentCount / roster.length) * 100)
    : 0;

  // Search filters which students are shown, but stats stay over the full class.
  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((s) =>
      `${s.first_name} ${s.last_name} ${s.roll_number || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [roster, search]);

  const setStudent = (studentId: string, status: 'Present' | 'Absent') =>
    setCurrentStatus((prev) => ({ ...prev, [studentId]: status }));

  const markAll = (status: 'Present' | 'Absent') =>
    setCurrentStatus(() => {
      const map: StatusMap = {};
      roster.forEach((s) => (map[s.id] = status));
      return map;
    });

  // Present/Absent toggle buttons — shared by both grid and list layouts.
  const statusButtons = (s: DaySessionRosterStudent) => {
    const status = currentStatus[s.id] || 'Present';
    return (
      <div className='flex gap-1 shrink-0'>
        <Button
          size='sm'
          variant={status === 'Present' ? 'default' : 'outline'}
          className={cn(
            status === 'Present' && 'bg-green-600 hover:bg-green-700'
          )}
          onClick={() => setStudent(s.id, 'Present')}
        >
          <Check className='h-4 w-4' />
        </Button>
        <Button
          size='sm'
          variant={status === 'Absent' ? 'default' : 'outline'}
          className={cn(status === 'Absent' && 'bg-red-600 hover:bg-red-700')}
          onClick={() => setStudent(s.id, 'Absent')}
        >
          <X className='h-4 w-4' />
        </Button>
      </div>
    );
  };

  const handleSave = async () => {
    if (!selectedClass) return;
    try {
      setSaving(true);
      const statuses = roster.map((s) => ({
        student_id: s.id,
        status: currentStatus[s.id] || 'Present'
      }));
      await DailySessionAttendanceService.saveSession({
        institutionId: selectedClass.institution_id,
        sectionId: selectedClass.section_id,
        timetableId: selectedClass.timetable_id,
        date,
        session,
        statuses,
        allowOverride
      });
      setSavedSessions((prev) => new Set(prev).add(session));
      toast.success(
        `${session === 'FN' ? 'Forenoon' : 'Afternoon'} attendance saved.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save attendance.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loadingClasses) {
    return (
      <Card>
        <CardContent className='flex items-center justify-center py-12'>
          <Loader2 className='h-6 w-6 animate-spin mr-2' />
          <span>Loading your classes…</span>
        </CardContent>
      </Card>
    );
  }

  if (classes.length === 0) {
    return (
      <Alert>
        <Users className='h-4 w-4' />
        <AlertDescription>
          {allowOverride
            ? 'No day-wise (session) classes found. Create a timetable with Attendance Mode = Day-wise to mark here.'
            : 'You are not assigned as the incharge of any day-wise class.'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Class + Date controls */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between p-4 bg-muted/50 rounded-lg border'>
        <div className='flex flex-col gap-1.5 flex-1 max-w-sm'>
          <span className='text-sm font-medium'>Class</span>
          <Select
            value={selectedClassId}
            onValueChange={setSelectedClassId}
            disabled={!!fixedClass}
          >
            <SelectTrigger>
              <SelectValue placeholder='Select class' />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.timetable_id} value={c.timetable_id}>
                  {c.class_label}
                  {c.section_name ? ` — Section ${c.section_name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='flex flex-col gap-1.5'>
          <span className='text-sm font-medium'>Date</span>
          <div className='flex gap-2'>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant='outline'
                  className={cn('justify-start text-left font-normal sm:w-[220px]')}
                >
                  <CalendarIcon className='mr-2 h-4 w-4' />
                  {format(new Date(date + 'T00:00:00'), 'PPP')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-auto p-0' align='start'>
                <Calendar
                  mode='single'
                  selected={new Date(date + 'T00:00:00')}
                  onSelect={(d) => {
                    if (d) setDate(format(d, 'yyyy-MM-dd'));
                    setCalendarOpen(false);
                  }}
                  disabled={(d) => {
                    const t = new Date();
                    t.setHours(23, 59, 59, 999);
                    return d > t;
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button variant='outline' onClick={() => setDate(todayStr())}>
              Today
            </Button>
          </div>
        </div>
      </div>

      {/* Session tabs */}
      <Tabs value={session} onValueChange={(v) => setSession(v as DaySession)}>
        <TabsList className='grid w-full max-w-md grid-cols-2'>
          <TabsTrigger value='FN' className='flex items-center gap-2'>
            <Sun className='h-4 w-4' />
            Forenoon (FN)
            {savedSessions.has('FN') && (
              <Check className='h-3.5 w-3.5 text-green-600' />
            )}
          </TabsTrigger>
          <TabsTrigger value='AN' className='flex items-center gap-2'>
            <Sunset className='h-4 w-4' />
            Afternoon (AN)
            {savedSessions.has('AN') && (
              <Check className='h-3.5 w-3.5 text-green-600' />
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Stat cards */}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-3'>
        <div className='rounded-xl p-4 text-white bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-between shadow-sm'>
          <div>
            <p className='text-xs opacity-90'>Total Students</p>
            <p className='text-2xl font-bold'>{roster.length}</p>
          </div>
          <Users className='h-8 w-8 opacity-80' />
        </div>
        <div className='rounded-xl p-4 text-white bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-between shadow-sm'>
          <div>
            <p className='text-xs opacity-90'>Present</p>
            <p className='text-2xl font-bold'>{presentCount}</p>
          </div>
          <UserCheck className='h-8 w-8 opacity-80' />
        </div>
        <div className='rounded-xl p-4 text-white bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-between shadow-sm'>
          <div>
            <p className='text-xs opacity-90'>Absent</p>
            <p className='text-2xl font-bold'>{absentCount}</p>
          </div>
          <UserX className='h-8 w-8 opacity-80' />
        </div>
        <div className='rounded-xl p-4 text-white bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-between shadow-sm'>
          <div>
            <p className='text-xs opacity-90'>Attendance Rate</p>
            <p className='text-2xl font-bold'>{attendanceRate}%</p>
          </div>
          <Percent className='h-8 w-8 opacity-80' />
        </div>
      </div>

      {/* Search + bulk actions + view toggle */}
      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative flex-1 min-w-[220px]'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Search by name or roll number…'
            className='pl-9'
          />
        </div>
        <Button
          size='sm'
          variant='outline'
          className='border-green-300 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30'
          onClick={() => markAll('Present')}
          disabled={loadingRoster || roster.length === 0}
        >
          <UserCheck className='h-4 w-4 mr-1' /> Mark All Present
        </Button>
        <Button
          size='sm'
          variant='outline'
          className='border-red-300 text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30'
          onClick={() => markAll('Absent')}
          disabled={loadingRoster || roster.length === 0}
        >
          <UserX className='h-4 w-4 mr-1' /> Mark All Absent
        </Button>
        <div className='inline-flex items-center rounded-md border p-0.5'>
          <Button
            size='sm'
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            className='h-7 px-2'
            onClick={() => changeView('grid')}
            aria-label='Grid view'
            title='Grid view'
          >
            <LayoutGrid className='h-4 w-4' />
          </Button>
          <Button
            size='sm'
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            className='h-7 px-2'
            onClick={() => changeView('list')}
            aria-label='List view'
            title='List view'
          >
            <List className='h-4 w-4' />
          </Button>
        </div>
      </div>

      {/* Roster */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base flex items-center gap-2'>
            <Users className='h-4 w-4' />
            Student Roster
            <Badge variant='secondary'>{filteredRoster.length}</Badge>
            <span className='ml-auto text-sm font-normal text-muted-foreground'>
              {session === 'FN' ? 'Forenoon (FN)' : 'Afternoon (AN)'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingRoster ? (
            <div className='flex items-center justify-center py-10'>
              <Loader2 className='h-6 w-6 animate-spin mr-2' />
              <span>Loading roster…</span>
            </div>
          ) : roster.length === 0 ? (
            <Alert>
              <Users className='h-4 w-4' />
              <AlertDescription>
                No active students found for this class.
              </AlertDescription>
            </Alert>
          ) : filteredRoster.length === 0 ? (
            <Alert>
              <Search className='h-4 w-4' />
              <AlertDescription>
                No students match &quot;{search}&quot;.
              </AlertDescription>
            </Alert>
          ) : viewMode === 'grid' ? (
            // Grid view (default): rich avatar cards, colour-coded by status.
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3'>
              {filteredRoster.map((s) => {
                const present = (currentStatus[s.id] || 'Present') === 'Present';
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'rounded-xl border-2 p-3 transition-colors',
                      present
                        ? 'border-green-300 bg-green-50 dark:bg-green-950/30'
                        : 'border-red-300 bg-red-50 dark:bg-red-950/30'
                    )}
                  >
                    <div className='flex flex-col items-center text-center gap-1.5'>
                      <div className='relative'>
                        <div
                          className={cn(
                            'h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold',
                            avatarColor(s.id)
                          )}
                        >
                          {initialsOf(s.first_name, s.last_name)}
                        </div>
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full flex items-center justify-center text-white ring-2 ring-white dark:ring-background',
                            present ? 'bg-green-600' : 'bg-red-600'
                          )}
                        >
                          {present ? (
                            <Check className='h-3 w-3' />
                          ) : (
                            <X className='h-3 w-3' />
                          )}
                        </span>
                      </div>
                      <div className='font-medium text-sm leading-tight truncate w-full'>
                        {s.first_name} {s.last_name}
                      </div>
                      {s.roll_number && (
                        <div className='text-xs text-muted-foreground'>
                          Roll {s.roll_number}
                        </div>
                      )}
                      <Button
                        size='sm'
                        className={cn(
                          'w-full mt-1 text-white',
                          present
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-red-600 hover:bg-red-700'
                        )}
                        onClick={() =>
                          setStudent(s.id, present ? 'Absent' : 'Present')
                        }
                      >
                        {present ? (
                          <>
                            <Check className='h-4 w-4 mr-1' />
                            Present
                          </>
                        ) : (
                          <>
                            <X className='h-4 w-4 mr-1' />
                            Absent
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // List view: avatar row per student.
            <div className='space-y-2'>
              {filteredRoster.map((s) => {
                const present = (currentStatus[s.id] || 'Present') === 'Present';
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-md border p-2.5',
                      present ? 'border-green-200' : 'border-red-200'
                    )}
                  >
                    <div className='flex items-center gap-3 min-w-0'>
                      <div
                        className={cn(
                          'h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0',
                          avatarColor(s.id)
                        )}
                      >
                        {initialsOf(s.first_name, s.last_name)}
                      </div>
                      <div className='min-w-0'>
                        <div className='truncate text-sm font-medium'>
                          {s.first_name} {s.last_name}
                        </div>
                        {s.roll_number && (
                          <div className='text-xs text-muted-foreground'>
                            Roll {s.roll_number}
                          </div>
                        )}
                      </div>
                    </div>
                    {statusButtons(s)}
                  </div>
                );
              })}
            </div>
          )}

          <div className='mt-4 flex justify-end'>
            <Button
              onClick={handleSave}
              disabled={saving || loadingRoster || roster.length === 0}
            >
              {saving ? (
                <Loader2 className='h-4 w-4 mr-2 animate-spin' />
              ) : (
                <Save className='h-4 w-4 mr-2' />
              )}
              Save {session === 'FN' ? 'Forenoon' : 'Afternoon'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
