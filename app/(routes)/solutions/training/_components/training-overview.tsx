'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BookOpen,
  Users,
  Calendar,
  Clock,
  ArrowRight,
  GraduationCap,
  MapPin,
} from 'lucide-react';
import { format } from 'date-fns';

export function TrainingOverview() {
  const stats = {
    activePrograms: 8,
    scheduledSessions: 42,
    cohortMembers: 25,
    completedSessions: 156,
  };

  const upcomingSessions = [
    {
      id: '1',
      title: 'AI Fundamentals - Day 1',
      program: { title: 'AI Workshop Series' },
      date: '2026-02-10',
      time: '10:00 AM',
      location: 'Seminar Hall A',
      cohort_count: 3,
    },
    {
      id: '2',
      title: 'Web Dev Bootcamp - Week 2',
      program: { title: 'Full Stack Bootcamp' },
      date: '2026-02-12',
      time: '09:00 AM',
      location: 'Computer Lab 3',
      cohort_count: 2,
    },
    {
      id: '3',
      title: 'Data Science Intro',
      program: { title: 'Data Science Certification' },
      date: '2026-02-15',
      time: '02:00 PM',
      location: 'Virtual',
      cohort_count: 4,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Programs</CardTitle>
            <BookOpen className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activePrograms}</div>
            <p className="text-xs text-muted-foreground">Training programs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Calendar className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.scheduledSessions}</div>
            <p className="text-xs text-muted-foreground">Upcoming sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cohort Members</CardTitle>
            <Users className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.cohortMembers}</div>
            <p className="text-xs text-muted-foreground">Active trainers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <GraduationCap className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedSessions}</div>
            <p className="text-xs text-muted-foreground">Sessions delivered</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/training/programs">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                All Programs
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>View and manage training programs</CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/training/sessions">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Sessions Calendar
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>Schedule and track sessions</CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/training/cohort">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Cohort Management
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>Manage cohort members</CardDescription>
            </CardHeader>
          </Link>
        </Card>
      </div>

      {/* Upcoming Sessions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Upcoming Sessions</CardTitle>
            <CardDescription>Next scheduled training sessions</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/solutions/training/sessions">
              View All <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {upcomingSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-4 rounded-lg border"
              >
                <div className="flex-1">
                  <p className="font-medium">{session.title}</p>
                  <p className="text-sm text-muted-foreground">{session.program.title}</p>
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(session.date), 'dd MMM yyyy')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {session.time}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {session.location}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    <Users className="mr-1 h-3 w-3" />
                    {session.cohort_count} cohort
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
