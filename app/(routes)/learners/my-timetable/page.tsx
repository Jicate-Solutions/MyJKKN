/**
 * Student Timetable Page
 * Created: 2026-01-14
 * Description: Mobile-first timetable view for student self-service
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import { StudentTimetableService } from '@/lib/services/learners/student-timetable-service';
import { DaySwiper } from './_components/day-swiper';
import { EmptyState } from './_components/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function StudentTimetablePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  // 1. Authenticate user
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // 2. Check role is student
  const { data: profile } = await supabase
    .from('profiles')
    .select('learner_id, role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'student' || !profile.learner_id) {
    redirect('/'); // Non-students redirected to home
  }

  // 3. Validate student lifecycle status
  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed) {
    redirect(`/auth/login?reason=${validation.reason}`);
  }

  // 4. Get student's section and semester
  const { data: learner } = await supabase
    .from('learners_profiles')
    .select(`
      section_id,
      semester_id,
      first_name,
      last_name,
      roll_number,
      degree_id,
      department_id,
      program_id,
      sections (
        section_name
      ),
      semesters (
        semester_name
      ),
      degrees (
        degree_name
      ),
      departments (
        department_name
      ),
      programs (
        program_name
      )
    `)
    .eq('id', profile.learner_id)
    .single();

  // Check if section/semester assigned
  if (!learner?.section_id || !learner?.semester_id) {
    return (
      <ContentLayout title="My Timetable">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Learners' },
            { label: 'My Timetable' }
          ]}
        />
        <EmptyState type="no-section" />
      </ContentLayout>
    );
  }

  // 5. Fetch timetable data
  const timetableData = await StudentTimetableService.getStudentTimetable(
    learner.section_id,
    learner.semester_id
  );

  // Check if timetable exists
  if (!timetableData) {
    return (
      <ContentLayout title="My Timetable">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Learners' },
            { label: 'My Timetable' }
          ]}
        />
        <EmptyState type="no-timetable" />
      </ContentLayout>
    );
  }

  // Add student info to timetable data
  timetableData.student_info = {
    name: `${learner.first_name} ${learner.last_name}`,
    roll_number: learner.roll_number || '',
    section_name: (learner.sections as any)?.section_name || 'Unknown',
    semester_name: (learner.semesters as any)?.semester_name || 'Unknown',
    degree_name: (learner.degrees as any)?.degree_name || '',
    department_name: (learner.departments as any)?.department_name || '',
    program_name: (learner.programs as any)?.program_name || ''
  };

  return (
    <ContentLayout title="My Timetable">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners' },
          { label: 'My Timetable' }
        ]}
      />

      <div className="space-y-4 mt-4">
        {/* Student Info Card */}
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              {/* Student Name and Roll Number */}
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  {timetableData.student_info.name}
                </h2>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm text-muted-foreground">
                    Roll No: {timetableData.student_info.roll_number}
                  </p>
                  <p className="text-lg py-2 font-medium text-primary">
                    {timetableData.timetable_name}
                  </p>
                </div>
              </div>

              {/* Academic Details - Grid Layout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {timetableData.student_info.degree_name && (
                  <div>
                    <span className="text-muted-foreground">Degree: </span>
                    <span className="font-medium text-foreground">
                      {timetableData.student_info.degree_name}
                    </span>
                  </div>
                )}
                {timetableData.student_info.department_name && (
                  <div>
                    <span className="text-muted-foreground">Department: </span>
                    <span className="font-medium text-foreground">
                      {timetableData.student_info.department_name}
                    </span>
                  </div>
                )}
                {timetableData.student_info.program_name && (
                  <div>
                    <span className="text-muted-foreground">Program: </span>
                    <span className="font-medium text-foreground">
                      {timetableData.student_info.program_name}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Semester: </span>
                  <span className="font-medium text-foreground">
                    {timetableData.student_info.semester_name}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Section: </span>
                  <span className="font-medium text-foreground">
                    {timetableData.student_info.section_name}
                  </span>
                </div>
              </div>

              {/* Timetable Duration */}
              {(timetableData.start_date || timetableData.end_date) && (
                <div className="pt-2 border-t border-border/50">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {timetableData.start_date && (
                      <span>
                        Start: {new Date(timetableData.start_date).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </span>
                    )}
                    {timetableData.start_date && timetableData.end_date && (
                      <span>•</span>
                    )}
                    {timetableData.end_date && (
                      <span>
                        End: {new Date(timetableData.end_date).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Timetable Swiper */}
        <DaySwiper timetableData={timetableData} />
      </div>
    </ContentLayout>
  );
}
