// ============================================
// ORGANIZATIONAL TAB - HIERARCHICAL VIEW
// ============================================
// Created: 2025-01-23
// Updated: 2025-01-23 - Added hierarchical institution view
// Purpose: Institution → Degree → Department → Program → Semester → Section hierarchy
// ============================================

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Building2,
  GraduationCap,
  BookOpen,
  Users,
  Layers,
  ChevronDown,
  ChevronRight,
  School,
  Folder,
  FolderOpen
} from 'lucide-react';
import type {
  LearnerDashboardStats,
  LearnerDashboardFilters,
  HierarchicalInstitution,
  HierarchicalDegree,
  HierarchicalDepartment,
  HierarchicalProgram,
  HierarchicalSemester
} from '@/types/learner-dashboard';

interface OrganizationalTabProps {
  data: LearnerDashboardStats;
  filters: LearnerDashboardFilters;
}

export function OrganizationalTab({ data, filters }: OrganizationalTabProps) {
  const [expandedInstitutions, setExpandedInstitutions] = useState<Set<string>>(new Set());
  const [expandedDegrees, setExpandedDegrees] = useState<Set<string>>(new Set());
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());
  const [expandedPrograms, setExpandedPrograms] = useState<Set<string>>(new Set());
  const [expandedSemesters, setExpandedSemesters] = useState<Set<string>>(new Set());

  const toggleInstitution = (id: string) => {
    const newSet = new Set(expandedInstitutions);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedInstitutions(newSet);
  };

  const toggleDegree = (id: string) => {
    const newSet = new Set(expandedDegrees);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedDegrees(newSet);
  };

  const toggleDepartment = (id: string) => {
    const newSet = new Set(expandedDepartments);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedDepartments(newSet);
  };

  const toggleProgram = (id: string) => {
    const newSet = new Set(expandedPrograms);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedPrograms(newSet);
  };

  const toggleSemester = (id: string) => {
    const newSet = new Set(expandedSemesters);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedSemesters(newSet);
  };

  // Expand all institutions
  const expandAll = () => {
    const allInstitutionIds = data.hierarchicalInstitutions.map(i => i.id);
    const allDegreeIds = data.hierarchicalInstitutions.flatMap(i => i.degrees.map(d => d.id));
    const allDepartmentIds = data.hierarchicalInstitutions.flatMap(i =>
      i.degrees.flatMap(d => d.departments.map(dept => dept.id))
    );
    const allProgramIds = data.hierarchicalInstitutions.flatMap(i =>
      i.degrees.flatMap(d =>
        d.departments.flatMap(dept => dept.programs.map(p => p.id))
      )
    );
    const allSemesterIds = data.hierarchicalInstitutions.flatMap(i =>
      i.degrees.flatMap(d =>
        d.departments.flatMap(dept =>
          dept.programs.flatMap(p => p.semesters.map(s => s.id))
        )
      )
    );

    setExpandedInstitutions(new Set(allInstitutionIds));
    setExpandedDegrees(new Set(allDegreeIds));
    setExpandedDepartments(new Set(allDepartmentIds));
    setExpandedPrograms(new Set(allProgramIds));
    setExpandedSemesters(new Set(allSemesterIds));
  };

  // Collapse all
  const collapseAll = () => {
    setExpandedInstitutions(new Set());
    setExpandedDegrees(new Set());
    setExpandedDepartments(new Set());
    setExpandedPrograms(new Set());
    setExpandedSemesters(new Set());
  };

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Organizational Hierarchy
              </CardTitle>
              <CardDescription className="mt-2">
                Complete institution hierarchy: Institution → Degree → Department → Program → Semester → Section
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={expandAll}>
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Collapse All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span>{data.hierarchicalInstitutions.length} Institutions</span>
            </div>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              <span>{data.hierarchicalInstitutions.reduce((sum, i) => sum + i.degrees.length, 0)} Degrees</span>
            </div>
            <div className="flex items-center gap-2">
              <School className="h-4 w-4" />
              <span>
                {data.hierarchicalInstitutions.reduce((sum, i) =>
                  sum + i.degrees.reduce((dSum, d) => dSum + d.departments.length, 0), 0
                )} Departments
              </span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <span>
                {data.hierarchicalInstitutions.reduce((sum, i) =>
                  sum + i.degrees.reduce((dSum, d) =>
                    dSum + d.departments.reduce((depSum, dep) => depSum + dep.programs.length, 0), 0
                  ), 0
                )} Programs
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hierarchical Institution Cards */}
      <div className="space-y-4">
        {data.hierarchicalInstitutions.map((institution) => (
          <Card key={institution.id} className="overflow-hidden">
            {/* Institution Level */}
            <CardHeader className="bg-blue-50 dark:bg-blue-950/20">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleInstitution(institution.id)}
              >
                <div className="flex items-center gap-3">
                  {expandedInstitutions.has(institution.id) ? (
                    <ChevronDown className="h-5 w-5 text-blue-600" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-blue-600" />
                  )}
                  <Building2 className="h-5 w-5 text-blue-600" />
                  <div>
                    <CardTitle className="text-lg">{institution.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {institution.degrees.length} Degrees • {institution.count.toLocaleString()} Learners
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="default" className="text-sm bg-blue-600">
                  {institution.count.toLocaleString()}
                </Badge>
              </div>
            </CardHeader>

            {/* Degrees (Level 2) */}
            {expandedInstitutions.has(institution.id) && (
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {institution.degrees.map((degree) => (
                    <div key={degree.id} className="border rounded-lg">
                      {/* Degree Header */}
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 rounded-t-lg"
                        onClick={() => toggleDegree(degree.id)}
                      >
                        <div className="flex items-center gap-3">
                          {expandedDegrees.has(degree.id) ? (
                            <ChevronDown className="h-4 w-4 text-green-600" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-green-600" />
                          )}
                          <GraduationCap className="h-4 w-4 text-green-600" />
                          <div>
                            <p className="font-medium text-sm">{degree.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {degree.departments.length} Departments • {degree.count.toLocaleString()} Learners
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {degree.count.toLocaleString()}
                        </Badge>
                      </div>

                      {/* Departments (Level 3) */}
                      {expandedDegrees.has(degree.id) && (
                        <div className="px-6 pb-3 space-y-2">
                          {degree.departments.map((department) => (
                            <div key={department.id} className="border rounded-lg">
                              {/* Department Header */}
                              <div
                                className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 rounded-t-lg"
                                onClick={() => toggleDepartment(department.id)}
                              >
                                <div className="flex items-center gap-3">
                                  {expandedDepartments.has(department.id) ? (
                                    <ChevronDown className="h-4 w-4 text-purple-600" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-purple-600" />
                                  )}
                                  <School className="h-4 w-4 text-purple-600" />
                                  <div>
                                    <p className="font-medium text-sm">{department.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {department.programs.length} Programs • {department.count.toLocaleString()} Learners
                                    </p>
                                  </div>
                                </div>
                                <Badge variant="secondary" className="text-xs">
                                  {department.count.toLocaleString()}
                                </Badge>
                              </div>

                              {/* Programs (Level 4) */}
                              {expandedDepartments.has(department.id) && (
                                <div className="px-6 pb-3 space-y-2">
                                  {department.programs.map((program) => (
                                    <div key={program.id} className="border rounded-lg">
                                      {/* Program Header */}
                                      <div
                                        className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/50 rounded-t-lg"
                                        onClick={() => toggleProgram(program.id)}
                                      >
                                        <div className="flex items-center gap-2">
                                          {expandedPrograms.has(program.id) ? (
                                            <ChevronDown className="h-3 w-3 text-orange-600" />
                                          ) : (
                                            <ChevronRight className="h-3 w-3 text-orange-600" />
                                          )}
                                          <BookOpen className="h-3 w-3 text-orange-600" />
                                          <div>
                                            <p className="font-medium text-xs">{program.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                              {program.semesters.length} Semesters • {program.count.toLocaleString()} Learners
                                            </p>
                                          </div>
                                        </div>
                                        <Badge variant="outline" className="text-xs">
                                          {program.count.toLocaleString()}
                                        </Badge>
                                      </div>

                                      {/* Semesters (Level 5) */}
                                      {expandedPrograms.has(program.id) && (
                                        <div className="px-4 pb-2 space-y-1">
                                          {program.semesters.map((semester) => (
                                            <div key={semester.id} className="border rounded-lg">
                                              {/* Semester Header */}
                                              <div
                                                className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/50 rounded-t-lg"
                                                onClick={() => toggleSemester(semester.id)}
                                              >
                                                <div className="flex items-center gap-2">
                                                  {expandedSemesters.has(semester.id) ? (
                                                    <ChevronDown className="h-3 w-3 text-cyan-600" />
                                                  ) : (
                                                    <ChevronRight className="h-3 w-3 text-cyan-600" />
                                                  )}
                                                  <Layers className="h-3 w-3 text-cyan-600" />
                                                  <div>
                                                    <p className="font-medium text-xs">{semester.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                      {semester.sections.length} Sections • {semester.count.toLocaleString()} Learners
                                                    </p>
                                                  </div>
                                                </div>
                                                <Badge variant="outline" className="text-xs">
                                                  {semester.count.toLocaleString()}
                                                </Badge>
                                              </div>

                                              {/* Sections (Level 6) */}
                                              {expandedSemesters.has(semester.id) && (
                                                <div className="px-4 pb-2 space-y-1">
                                                  {semester.sections.map((section) => (
                                                    <div
                                                      key={section.id}
                                                      className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg"
                                                    >
                                                      <div className="flex items-center gap-2">
                                                        <Users className="h-3 w-3 text-gray-600" />
                                                        <p className="text-xs font-medium">{section.name}</p>
                                                      </div>
                                                      <Badge variant="outline" className="text-xs">
                                                        {section.count.toLocaleString()}
                                                      </Badge>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        ))}

        {/* Empty state */}
        {data.hierarchicalInstitutions.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No institution data available</p>
              <p className="text-sm text-muted-foreground mt-2">
                Apply different filters to see organizational hierarchy
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
