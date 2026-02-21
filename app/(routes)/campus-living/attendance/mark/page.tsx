'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/use-auth';
import {
  ArrowLeft,
  ClipboardCheck,
  Search,
  Loader2,
  Save,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Filter
} from 'lucide-react';

type AttendanceStatus = 'present' | 'absent' | 'on_leave' | 'late_entry' | 'medical';

// Placeholder data
const useHostelStudentsForAttendance = (blockId: string | null) => {
  return {
    data: [
      { id: 'l1', name: 'Rahul Kumar', roll_number: 'CS2024001', room: 'G-101', bed: 'A', current_status: null as AttendanceStatus | null },
      { id: 'l2', name: 'Arjun Patel', roll_number: 'EC2024015', room: 'G-101', bed: 'B', current_status: null as AttendanceStatus | null },
      { id: 'l3', name: 'Vikram Singh', roll_number: 'CE2023010', room: 'F1-108', bed: 'A', current_status: null as AttendanceStatus | null },
      { id: 'l4', name: 'Karthik Rajan', roll_number: 'CS2023005', room: 'F2-301', bed: 'A', current_status: null as AttendanceStatus | null },
      { id: 'l5', name: 'Anil Kumar', roll_number: 'IT2024008', room: 'F2-301', bed: 'B', current_status: null as AttendanceStatus | null },
      { id: 'l6', name: 'Deepak M', roll_number: 'ME2024012', room: 'F2-301', bed: 'C', current_status: null as AttendanceStatus | null },
      { id: 'l7', name: 'Suresh Raj', roll_number: 'CS2025005', room: 'G-102', bed: 'A', current_status: 'on_leave' as AttendanceStatus },
      { id: 'l8', name: 'Praveen Das', roll_number: 'EC2025012', room: 'G-103', bed: 'A', current_status: null as AttendanceStatus | null },
      { id: 'l9', name: 'Ravi Shankar', roll_number: 'ME2025003', room: 'F1-201', bed: 'A', current_status: null as AttendanceStatus | null },
      { id: 'l10', name: 'Gopal Krishna', roll_number: 'CE2024020', room: 'F1-201', bed: 'B', current_status: null as AttendanceStatus | null },
    ],
    isLoading: false,
    error: null,
  };
};

const blocks = [
  { id: '1', name: 'Boys Hostel A (BHA)' },
  { id: '2', name: 'Boys Hostel B (BHB)' },
  { id: '3', name: 'Girls Hostel A (GHA)' },
  { id: '4', name: 'Girls Hostel B (GHB)' },
  { id: '5', name: 'Girls Hostel C (GHC)' },
  { id: '6', name: 'PG Hostel (PGH)' },
];

const statusOptions: { value: AttendanceStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'present', label: 'Present', icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-green-600 bg-green-50 border-green-200' },
  { value: 'absent', label: 'Absent', icon: <XCircle className="h-4 w-4" />, color: 'text-red-600 bg-red-50 border-red-200' },
  { value: 'on_leave', label: 'On Leave', icon: <Clock className="h-4 w-4" />, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'late_entry', label: 'Late Entry', icon: <Clock className="h-4 w-4" />, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { value: 'medical', label: 'Medical', icon: <Clock className="h-4 w-4" />, color: 'text-purple-600 bg-purple-50 border-purple-200' },
];

export default function MarkAttendancePage() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const blockParam = searchParams.get('block');

  const [selectedBlock, setSelectedBlock] = useState(blockParam ?? '1');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: students, isLoading } = useHostelStudentsForAttendance(selectedBlock);

  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});

  const handleMarkStatus = useCallback((studentId: string, status: AttendanceStatus) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: prev[studentId] === status ? undefined as unknown as AttendanceStatus : status,
    }));
  }, []);

  const handleMarkAllPresent = useCallback(() => {
    const allPresent: Record<string, AttendanceStatus> = {};
    students?.forEach((s) => {
      if (s.current_status !== 'on_leave') {
        allPresent[s.id] = 'present';
      } else {
        allPresent[s.id] = 'on_leave';
      }
    });
    setAttendance(allPresent);
  }, [students]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // TODO: Replace with actual API call
      console.log('Submitting attendance:', { block: selectedBlock, date: attendanceDate, attendance });
      await new Promise((r) => setTimeout(r, 1000));
    } catch (error) {
      console.error('Failed to save attendance:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredStudents = students?.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.roll_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.room.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  const markedCount = Object.values(attendance).filter(Boolean).length;
  const presentCount = Object.values(attendance).filter((s) => s === 'present').length;
  const absentCount = Object.values(attendance).filter((s) => s === 'absent').length;

  return (
    <ContentLayout title="Mark Attendance">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Attendance', href: '/campus-living/attendance' },
          { label: 'Mark Attendance' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/attendance">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold py-1">Mark Attendance</h1>
              <p className="text-sm text-muted-foreground">
                Bulk attendance marking for hostel students
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="space-y-1.5 flex-1">
                <Label>Hostel Block</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={selectedBlock}
                  onChange={(e) => setSelectedBlock(e.target.value)}
                >
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <div className="space-y-1.5 flex-1 max-w-sm">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Name, roll no, room..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions & Summary */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleMarkAllPresent}>
              <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
              Mark All Present
            </Button>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-muted-foreground">
              Marked: <span className="font-medium text-foreground">{markedCount}/{filteredStudents.length}</span>
            </span>
            <span className="text-green-600">
              Present: <span className="font-medium">{presentCount}</span>
            </span>
            <span className="text-red-600">
              Absent: <span className="font-medium">{absentCount}</span>
            </span>
          </div>
        </div>

        {/* Student List */}
        {isLoading ? (
          <div className="flex items-center justify-center min-h-[200px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {filteredStudents.map((student) => {
              const status = attendance[student.id] ?? student.current_status;
              return (
                <Card key={student.id} className={status ? 'border-l-4' : ''} style={{
                  borderLeftColor: status === 'present' ? '#16a34a' : status === 'absent' ? '#dc2626' : status === 'on_leave' ? '#d97706' : status === 'late_entry' ? '#ea580c' : status === 'medical' ? '#9333ea' : undefined,
                }}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <Users className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{student.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {student.roll_number} &middot; Room {student.room} &middot; Bed {student.bed}
                          </p>
                        </div>
                        {student.current_status === 'on_leave' && (
                          <Badge variant="outline" className="text-amber-600 bg-amber-50">
                            On Approved Leave
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {statusOptions.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => handleMarkStatus(student.id, opt.value)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                              status === opt.value ? opt.color + ' border-current' : 'bg-background hover:bg-muted border-border'
                            }`}
                          >
                            {opt.icon}
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {filteredStudents.length === 0 && !isLoading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No students found</p>
              <p className="text-sm text-muted-foreground">Select a block or adjust your search</p>
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        {filteredStudents.length > 0 && (
          <div className="flex justify-end gap-3 sticky bottom-4 bg-background/80 backdrop-blur-sm p-4 rounded-lg border">
            <div className="flex-1 text-sm text-muted-foreground flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              {markedCount} of {filteredStudents.length} students marked
            </div>
            <Button variant="outline" asChild>
              <Link href="/campus-living/attendance">Cancel</Link>
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || markedCount === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Attendance
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
