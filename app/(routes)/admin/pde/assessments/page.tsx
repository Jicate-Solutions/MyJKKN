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
import { BeatLoader } from 'react-spinners';
import { Plus, FileText, ClipboardList } from 'lucide-react';
import type { PDEAssessment } from '@/types/pde';

export default function AdminAssessmentsPage() {
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');

  const { data: coursesData, isLoading: loadingCourses } = useVACCourses();
  const { data: assessments, isLoading: loadingAssessments } = useAssessmentsByCourse(
    selectedCourseId || undefined
  );

  const courses = coursesData?.courses || [];

  return (
    <ContentLayout title="PDE Assessments">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'PDE Assessments' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Assessment Management</h1>
            <p className="text-sm text-muted-foreground">
              Create and manage assessments for courses
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/pde/assessments/create">
              <Plus className="mr-2 h-4 w-4" />
              Create Assessment
            </Link>
          </Button>
        </div>

        {/* Filter by Course */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">Filter by course:</span>
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Select a course..." />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Assessments Table */}
        <Card>
          <CardContent className="p-0">
            {!selectedCourseId ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ClipboardList className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground">Select a course to view its assessments</p>
              </div>
            ) : loadingAssessments ? (
              <div className="flex justify-center p-8">
                <BeatLoader color="#00e902" />
              </div>
            ) : !assessments || assessments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground mb-4">No assessments found for this course</p>
                <Button asChild variant="outline">
                  <Link href={`/admin/pde/assessments/create?courseId=${selectedCourseId}`}>
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
                    <TableHead className="text-center">Questions</TableHead>
                    <TableHead className="text-center">Pass %</TableHead>
                    <TableHead className="text-center">Max Attempts</TableHead>
                    <TableHead className="text-center">Time Limit</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessments.map((a: PDEAssessment) => (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => window.location.href = `/admin/pde/assessments/create?edit=${a.id}`}
                    >
                      <TableCell className="font-medium">{a.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {a.assessment_type.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">--</TableCell>
                      <TableCell className="text-center">{a.pass_threshold}%</TableCell>
                      <TableCell className="text-center">{a.max_attempts}</TableCell>
                      <TableCell className="text-center">
                        {a.time_limit_minutes ? `${a.time_limit_minutes}m` : 'None'}
                      </TableCell>
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
