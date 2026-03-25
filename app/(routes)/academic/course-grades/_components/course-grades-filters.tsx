/**
 * Course Grades Filters Component
 * Filter grades by program, semester, section, tool, resource
 *
 * Created: 2026-01-12
 */

'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface FilterOption {
  id: string;
  name: string;
}

interface CourseGradesFiltersProps {
  programs: FilterOption[];
  semesters: FilterOption[];
  sections: FilterOption[];
  tools: FilterOption[];
  currentFilters: {
    programId?: string;
    semesterId?: string;
    sectionId?: string;
    toolId?: string;
    resourceLinkId?: string;
  };
}

export function CourseGradesFilters({
  programs,
  semesters,
  sections,
  tools,
  currentFilters
}: CourseGradesFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value === 'all' || !value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push(pathname);
  };

  const hasFilters = Object.values(currentFilters).some((v) => v);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Program Filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">Program</label>
          <Select
            value={currentFilters.programId || 'all'}
            onValueChange={(value) => updateFilter('programId', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Programs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Programs</SelectItem>
              {programs.map((program) => (
                <SelectItem key={program.id} value={program.id}>
                  {program.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Semester Filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">Semester</label>
          <Select
            value={currentFilters.semesterId || 'all'}
            onValueChange={(value) => updateFilter('semesterId', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Semesters" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Semesters</SelectItem>
              {semesters.map((semester) => (
                <SelectItem key={semester.id} value={semester.id}>
                  {semester.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Section Filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">Section</label>
          <Select
            value={currentFilters.sectionId || 'all'}
            onValueChange={(value) => updateFilter('sectionId', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              {sections.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tool Filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">Tool</label>
          <Select
            value={currentFilters.toolId || 'all'}
            onValueChange={(value) => updateFilter('toolId', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Tools" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tools</SelectItem>
              {tools.map((tool) => (
                <SelectItem key={tool.id} value={tool.id}>
                  {tool.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Clear Filters Button */}
      {hasFilters && (
        <Button variant="outline" size="sm" onClick={clearFilters}>
          <X className="h-4 w-4 mr-2" />
          Clear Filters
        </Button>
      )}
    </div>
  );
}
