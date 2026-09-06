'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAssessmentsByCourse } from '@/hooks/pde/use-pde';
import { useVACCourses } from '@/hooks/vac/use-vac';
import { useAuth } from '@/hooks/use-auth';
import { BeatLoader } from 'react-spinners';
import {
  Plus,
  FileText,
  ClipboardList,
  Users,
  TrendingUp,
  CheckCircle2,
} from 'lucide-react';
import type { PDEAssessment } from '@/types/pde';

export default function FacultyAssessmentsPage() {
  const { profile: user } = useAuth();
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');

  const { data: coursesData, isLoading: loadingCourses } = useVACCourses();
  const { data: assessments, isLoading: loadingAssessments } = useAssessmentsByCourse(
    selectedCourseId || undefined
  );

  const courses = coursesData?.data || [];
  const selectedCourse = courses.find(
    (c: { id: string; name: string }) => c.id === selectedCourseId
  );
  const assessmentCount = assessments?.length ?? 0;

  return (
    <ContentLayout title="My Assessments">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Faculty', href: '/faculty' },
          { label: 'PDE', href: '/pde/faculty/dashboard' },
          { label: 'Assessments' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1" style={{ color: '#0b6d41' }}>
              Assessment Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Create, manage, and review assessments across your courses
            </p>
          </div>
          <Button asChild className="bg-[#0b6d41] hover:bg-[#0b6d41]/90">
            <Link href="/pde/admin/assessments/create">
              <Plus className="mr-2 h-4 w-4" />
              Create Assessment
            </Link>
          </Button>
        </div>

        {/* Filter by Course */}
        <Card className="bg-[#fbfbee]/30 dark:bg-card">
          <CardContent className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-sm font-medium text-muted-foreground">Filter by course:</span>
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger className="w-full sm:w-[300px]">
                  <SelectValue placeholder="Select a course..." />
                </SelectTrigger>
                <SelectContent>
                  {loadingCourses ? (
                    <SelectItem value="loading" disabled>Loading courses...</SelectItem>
                  ) : (
                    courses.map((c: { id: string; name: string }) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Result summary — clarifies the list is scoped to the chosen course */}
        {selectedCourseId && !loadingAssessments && assessmentCount > 0 && (
          <p className="px-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{assessmentCount}</span>{' '}
            assessment{assessmentCount !== 1 ? 's' : ''}
            {selectedCourse ? ` in ${selectedCourse.name}` : ''}
          </p>
        )}

        {/* Assessments Table */}
        <Card className="bg-[#fbfbee]/30 dark:bg-card">
          <CardContent className="p-0">
            {!selectedCourseId ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ClipboardList className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-medium mb-1">Choose a course to begin</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Assessments are organised by course. Pick one from the filter above
                  to see its assessments, submissions, and performance.
                </p>
              </div>
            ) : loadingAssessments ? (
              <div className="flex justify-center p-8">
                <BeatLoader color="#0b6d41" />
              </div>
            ) : !assessments || assessments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-medium mb-1">
                  No assessments yet{selectedCourse ? ` in ${selectedCourse.name}` : ' for this course'}
                </h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-md">
                  This course has no assessments. Create the first one, or pick a
                  different course from the filter above.
                </p>
                <Button asChild variant="outline">
                  <Link href={`/pde/admin/assessments/create?courseId=${selectedCourseId}`}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Assessment
                  </Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">
                      <span className="flex items-center justify-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        Submissions
                      </span>
                    </TableHead>
                    <TableHead className="text-center">
                      <span className="flex items-center justify-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Avg Score
                      </span>
                    </TableHead>
                    <TableHead className="text-center">
                      <span className="flex items-center justify-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Pass Rate
                      </span>
                    </TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessments.map((a: PDEAssessment) => (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => window.location.href = `/pde/admin/assessments/create?edit=${a.id}`}
                    >
                      <TableCell className="font-medium">{a.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {a.assessment_type.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">--</TableCell>
                      <TableCell className="text-center">--</TableCell>
                      <TableCell className="text-center">{a.pass_threshold}%</TableCell>
                      <TableCell className="text-center">
                        {a.is_active ? (
                          <Badge className="bg-green-500/10 text-green-600 border-green-200">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
