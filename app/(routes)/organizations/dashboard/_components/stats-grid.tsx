'use client';

import { OrganizationStats } from '@/types/organizations';
import {
  Building,
  Boxes,
  Flame,
  GraduationCap,
  BookOpen,
  CalendarDays,
  FolderTree,
  Link2
} from 'lucide-react';
import { StatCard } from './stat-card';

interface StatsGridProps {
  stats: OrganizationStats;
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
      <StatCard
        title='Institutions'
        value={stats.institutionCount}
        icon={Building}
        link='/organizations/institutions'
        variant='blue'
      />
      <StatCard
        title='Degrees'
        value={stats.degreeCount}
        icon={Boxes}
        link='/organizations/degrees'
        variant='green'
      />
      <StatCard
        title='Departments'
        value={stats.departmentCount}
        icon={Flame}
        link='/organizations/departments'
        variant='orange'
      />
      <StatCard
        title='Programs'
        value={stats.programCount}
        icon={GraduationCap}
        link='/organizations/programs'
        variant='purple'
      />
      <StatCard
        title='Courses'
        value={stats.courseCount}
        icon={BookOpen}
        link='/organizations/courses'
        variant='red'
      />
      <StatCard
        title='Semesters'
        value={stats.semesterCount}
        icon={CalendarDays}
        link='/organizations/semesters'
        variant='cyan'
      />
      <StatCard
        title='Sections'
        value={stats.sectionCount}
        icon={FolderTree}
        link='/organizations/sections'
        variant='pink'
      />
      <StatCard
        title='Course Mappings'
        value={stats.courseMappingCount}
        icon={Link2}
        link='/organizations/courses/mappings'
        variant='indigo'
      />
    </div>
  );
}
