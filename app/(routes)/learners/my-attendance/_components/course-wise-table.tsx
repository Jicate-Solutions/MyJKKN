/**
 * Course-wise Attendance Table Component
 * Created: 2025-12-29
 * Description: Display attendance breakdown by course
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BookOpen } from 'lucide-react';
import type { CourseAttendance } from '@/types/student-attendance';
import { cn } from '@/lib/utils';

interface CourseWiseTableProps {
  data: CourseAttendance[];
}

export function CourseWiseTable({ data }: CourseWiseTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Course-wise Attendance
        </CardTitle>
        <CardDescription>
          Attendance breakdown by individual courses
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No course data available
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead className="text-center">Code</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Present</TableHead>
                  <TableHead className="text-center">Absent</TableHead>
                  <TableHead className="text-center">Percentage</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((course, index) => {
                  const isAboveThreshold = course.percentage >= 75;
                  const isWarning = course.percentage >= 70 && course.percentage < 75;
                  const isCritical = course.percentage < 70;

                  return (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {course.course_name}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {course.course_code || '-'}
                      </TableCell>
                      <TableCell className="text-center">{course.total}</TableCell>
                      <TableCell className="text-center text-green-600">
                        {course.present}
                      </TableCell>
                      <TableCell className="text-center text-red-600">
                        {course.absent}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          "font-semibold",
                          isAboveThreshold && "text-green-600",
                          isWarning && "text-yellow-600",
                          isCritical && "text-red-600"
                        )}>
                          {course.percentage}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {isAboveThreshold && (
                          <Badge variant="default">On Track</Badge>
                        )}
                        {isWarning && (
                          <Badge variant="outline" className="border-yellow-600 text-yellow-600">
                            Warning
                          </Badge>
                        )}
                        {isCritical && (
                          <Badge variant="destructive">Below 70%</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
