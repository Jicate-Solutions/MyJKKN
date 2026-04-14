'use client';

import { OrganizationStats } from '@/types/organizations';
import {
  Building,
  Building2,
  Briefcase,
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
    <div className='space-y-6'>
      {/* Top row: Entity-level breakdown — institutions, admin offices, companies */}
      <div>
        <h2 className='text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide'>
          Organization Entities
        </h2>
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
          <StatCard
            title='Institutions'
            value={stats.institutionCount}
            icon={Building}
            link='/organizations/institutions?entity_type=institution'
            variant='blue'
          />
          <StatCard
            title='Administration Offices'
            value={stats.adminOfficeCount}
            icon={Building2}
            link='/organizations/institutions?entity_type=admin_office'
            variant='slate'
          />
          <StatCard
            title='Companies'
            value={stats.companyCount}
            icon={Briefcase}
            link='/organizations/institutions?entity_type=company'
            variant='amber'
          />
        </div>
      </div>

      {/* Bottom rows: Academic structure (institution-scoped only) */}
      <div>
        <h2 className='text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide'>
          Academic Structure
        </h2>
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
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
      </div>
    </div>
  );
}
