/**
 * Semester Filter Component
 * Created: 2025-12-29
 * Description: Dropdown to select semester for attendance view
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from 'lucide-react';

interface SemesterFilterProps {
  semesters: Array<{ id: string; semester_name: string }>;
  selected: string;
  currentSemester: string;
}

export function SemesterFilter({ semesters, selected, currentSemester }: SemesterFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSemesterChange = (semesterId: string) => {
    const params = new URLSearchParams(searchParams);
    if (semesterId === currentSemester) {
      params.delete('semester');
    } else {
      params.set('semester', semesterId);
    }
    router.push(`?${params.toString()}`);
  };

  const selectedSemester = semesters.find(s => s.id === selected);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Select Semester
        </CardTitle>
        <CardDescription>
          View your attendance records for different semesters
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <Select value={selected} onValueChange={handleSemesterChange}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Select a semester" />
            </SelectTrigger>
            <SelectContent>
              {semesters.map(semester => (
                <SelectItem key={semester.id} value={semester.id}>
                  {semester.semester_name}
                  {semester.id === currentSemester && ' (Current)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selected === currentSemester && (
            <Badge variant="default">Current Semester</Badge>
          )}
        </div>

        {selectedSemester && (
          <p className="text-sm text-muted-foreground mt-2">
            Showing attendance for: <span className="font-medium">{selectedSemester.semester_name}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
