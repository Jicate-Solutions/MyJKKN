'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useHostelAttendance } from '@/hooks/campus-living/use-hostel-attendance';
import {
  ClipboardCheck,
  Users,
  UserX,
  CalendarOff,
  Clock,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Calendar,
  Download,
  Building2
} from 'lucide-react';

export default function AttendanceDashboardPage() {
  const { profile } = useAuth();
  const { data: rawStats, isLoading } = useHostelAttendance(profile?.institution_id ?? '');
  const stats = rawStats as any;

  if (isLoading || !stats) {
    return (
      <ContentLayout title="Hostel Attendance">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Hostel Attendance">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Attendance' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Hostel Attendance</h1>
            <p className="text-sm text-muted-foreground">
              Today: {new Date(stats.date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/attendance/history">
                <Calendar className="mr-2 h-4 w-4" />
                History
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/campus-living/attendance/absentees">
                <UserX className="mr-2 h-4 w-4" />
                Absentees
              </Link>
            </Button>
            <Button asChild>
              <Link href="/campus-living/attendance/mark">
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Mark Attendance
              </Link>
            </Button>
          </div>
        </div>

        {/* Primary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
              <p className="text-2xl font-bold">{stats.total_hostellers.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{stats.present.toLocaleString()}</p>
              <p className="text-xs text-green-600">Present</p>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50/50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-700">{stats.absent}</p>
              <p className="text-xs text-red-600">Absent</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-700">{stats.on_leave}</p>
              <p className="text-xs text-amber-600">On Leave</p>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-orange-50/50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-orange-700">{stats.late_entry}</p>
              <p className="text-xs text-orange-600">Late Entry</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.attendance_rate}%</p>
              <p className="text-xs text-muted-foreground">Rate</p>
            </CardContent>
          </Card>
          <Card className={stats.curfew_violations > 0 ? 'border-red-200 bg-red-50/50' : ''}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-700">{stats.curfew_violations}</p>
              <p className="text-xs text-red-600">Curfew Violations</p>
            </CardContent>
          </Card>
        </div>

        {/* Block-wise Attendance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Block-wise Attendance</CardTitle>
              <CardDescription>Today&apos;s attendance by hostel block</CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.blocks.map((block) => {
                const rate = block.total > 0 ? Math.round((block.present / block.total) * 100) : 0;
                return (
                  <div key={block.id} className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{block.name}</span>
                        <Badge variant="outline" className="text-xs">{block.code}</Badge>
                        {!block.marked && (
                          <Badge variant="destructive" className="text-xs">Not Marked</Badge>
                        )}
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${rate >= 90 ? 'bg-green-500' : rate >= 75 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex gap-4 text-center text-sm">
                      <div>
                        <p className="font-semibold text-green-600">{block.present}</p>
                        <p className="text-xs text-muted-foreground">Present</p>
                      </div>
                      <div>
                        <p className="font-semibold text-red-600">{block.absent}</p>
                        <p className="text-xs text-muted-foreground">Absent</p>
                      </div>
                      <div>
                        <p className="font-semibold text-amber-600">{block.on_leave}</p>
                        <p className="text-xs text-muted-foreground">Leave</p>
                      </div>
                      <div>
                        <p className="font-semibold">{rate}%</p>
                        <p className="text-xs text-muted-foreground">Rate</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/campus-living/attendance/mark?block=${block.id}`}>
                        {block.marked ? 'Update' : 'Mark'}
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Weekly Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly Attendance Trend</CardTitle>
            <CardDescription>Last 7 days attendance overview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {stats.weekly_trend.map((day) => {
                const rate = Math.round((day.present / (day.present + day.absent)) * 100);
                return (
                  <div key={day.day} className="text-center">
                    <p className="text-xs text-muted-foreground mb-2">{day.day}</p>
                    <div className="h-24 bg-muted rounded-lg relative overflow-hidden">
                      <div
                        className={`absolute bottom-0 left-0 right-0 rounded-lg ${rate >= 90 ? 'bg-green-400' : rate >= 80 ? 'bg-amber-400' : 'bg-red-400'}`}
                        style={{ height: `${rate}%` }}
                      />
                    </div>
                    <p className="text-xs font-medium mt-1">{rate}%</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
