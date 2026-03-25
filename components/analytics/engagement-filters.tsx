'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { OrganizationalLevel } from '@/types/analytics';
import {
  Calendar,
  AlertCircle,
  Building2,
  GraduationCap,
  BookOpen,
  Layers,
  Users,
  X,
  Download,
  Loader2
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface EngagementFiltersProps {
  onFilterChange: (filters: {
    level: OrganizationalLevel;
    id: string;
    dateFrom: string;
    dateTo: string;
  }) => void;
  onExport?: () => void;
}

interface FilterOption {
  id: string;
  name: string;
}

// Special values for "all" selections
const ALL_VALUE = 'all';
const ALL_DEPARTMENTS = 'all_departments';
const ALL_PROGRAMS = 'all_programs';
const ALL_SEMESTERS = 'all_semesters';
const ALL_SECTIONS = 'all_sections';

export function EngagementFilters({
  onFilterChange,
  onExport
}: EngagementFiltersProps) {
  const [level, setLevel] = useState<OrganizationalLevel>('institution');
  const [selectedInstitution, setSelectedInstitution] = useState<string>(ALL_VALUE);
  const [selectedDepartment, setSelectedDepartment] = useState<string>(ALL_DEPARTMENTS);
  const [selectedProgram, setSelectedProgram] = useState<string>(ALL_PROGRAMS);
  const [selectedSemester, setSelectedSemester] = useState<string>(ALL_SEMESTERS);
  const [selectedSection, setSelectedSection] = useState<string>(ALL_SECTIONS);

  const [institutions, setInstitutions] = useState<FilterOption[]>([]);
  const [departments, setDepartments] = useState<FilterOption[]>([]);
  const [programs, setPrograms] = useState<FilterOption[]>([]);
  const [semesters, setSemesters] = useState<FilterOption[]>([]);
  const [sections, setSections] = useState<FilterOption[]>([]);

  const [loading, setLoading] = useState({
    institutions: false,
    departments: false,
    programs: false,
    semesters: false,
    sections: false,
  });

  const [dateFrom, setDateFrom] = useState<string>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [dateTo, setDateTo] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const supabase = createClientSupabaseClient();

  // Use ref to store callback to avoid infinite loops
  const onFilterChangeRef = useRef(onFilterChange);
  useEffect(() => {
    onFilterChangeRef.current = onFilterChange;
  }, [onFilterChange]);

  // Load institutions on mount
  useEffect(() => {
    loadInstitutions();
  }, []);

  // Load departments when institution changes
  useEffect(() => {
    if (selectedInstitution && selectedInstitution !== ALL_VALUE) {
      loadDepartments(selectedInstitution);
    } else {
      setDepartments([]);
      setSelectedDepartment(ALL_DEPARTMENTS);
    }
  }, [selectedInstitution]);

  // Load programs when department changes
  useEffect(() => {
    if (selectedDepartment && selectedDepartment !== ALL_DEPARTMENTS) {
      loadPrograms(selectedDepartment);
    } else {
      setPrograms([]);
      setSelectedProgram(ALL_PROGRAMS);
    }
  }, [selectedDepartment]);

  // Load semesters when program changes
  useEffect(() => {
    if (selectedProgram && selectedProgram !== ALL_PROGRAMS) {
      loadSemesters(selectedProgram);
    } else {
      setSemesters([]);
      setSelectedSemester(ALL_SEMESTERS);
    }
  }, [selectedProgram]);

  // Load sections when semester changes
  useEffect(() => {
    if (selectedSemester && selectedSemester !== ALL_SEMESTERS) {
      loadSections(selectedSemester);
    } else {
      setSections([]);
      setSelectedSection(ALL_SECTIONS);
    }
  }, [selectedSemester]);

  // Get the current ID based on level and selections
  const getCurrentId = useCallback((): string => {
    switch (level) {
      case 'institution':
        return selectedInstitution;
      case 'department':
        return selectedDepartment;
      case 'program':
        return selectedProgram;
      case 'semester':
        return selectedSemester;
      case 'section':
        return selectedSection;
      default:
        return selectedInstitution;
    }
  }, [level, selectedInstitution, selectedDepartment, selectedProgram, selectedSemester, selectedSection]);

  // Trigger filter change when selections or dates change
  useEffect(() => {
    const currentId = getCurrentId();
    if (currentId) {
      onFilterChangeRef.current({
        level,
        id: currentId,
        dateFrom,
        dateTo
      });
    }
  }, [level, getCurrentId, dateFrom, dateTo]);

  const loadInstitutions = async () => {
    setLoading(prev => ({ ...prev, institutions: true }));
    try {
      const { data } = await supabase
        .from('institutions')
        .select('id, name')
        .order('name')
        .returns<FilterOption[]>();
      setInstitutions(data || []);
      setSelectedInstitution(ALL_VALUE);
    } finally {
      setLoading(prev => ({ ...prev, institutions: false }));
    }
  };

  const loadDepartments = async (institutionId: string) => {
    setLoading(prev => ({ ...prev, departments: true }));
    try {
      console.log('[EngagementFilters] Loading departments for institution:', institutionId);
      const { data, error } = await supabase
        .from('departments')
        .select('id, department_name')
        .eq('institution_id', institutionId)
        .order('department_name');

      if (error) {
        console.error('[EngagementFilters] Error loading departments:', error);
      } else {
        console.log('[EngagementFilters] Departments loaded:', data);
      }

      setDepartments(data?.map((d: any) => ({ id: d.id, name: d.department_name })) || []);
    } finally {
      setLoading(prev => ({ ...prev, departments: false }));
    }
  };

  const loadPrograms = async (departmentId: string) => {
    setLoading(prev => ({ ...prev, programs: true }));
    try {
      console.log('[EngagementFilters] Loading programs for department:', departmentId);
      const { data, error } = await supabase
        .from('programs')
        .select('id, program_name')
        .eq('department_id', departmentId)
        .eq('is_active', true)
        .order('program_name');

      if (error) {
        console.error('[EngagementFilters] Error loading programs:', error);
      } else {
        console.log('[EngagementFilters] Programs loaded:', data);
      }

      // Map program_name to name for consistency
      const mappedData = data?.map((prog: any) => ({
        id: prog.id,
        name: prog.program_name
      })) || [];

      setPrograms(mappedData);
    } finally {
      setLoading(prev => ({ ...prev, programs: false }));
    }
  };

  const loadSemesters = async (programId: string) => {
    setLoading(prev => ({ ...prev, semesters: true }));
    try {
      console.log('[EngagementFilters] Loading semesters for program:', programId);
      const { data, error } = await supabase
        .from('semesters')
        .select('id, semester_name')
        .eq('program_id', programId)
        .eq('is_active', true)
        .order('semester_order', { ascending: true });

      if (error) {
        console.error('[EngagementFilters] Error loading semesters:', error);
      } else {
        console.log('[EngagementFilters] Semesters loaded:', data);
      }

      // Map semester_name to name for consistency
      const mappedData = data?.map((sem: any) => ({
        id: sem.id,
        name: sem.semester_name
      })) || [];

      setSemesters(mappedData);
    } finally {
      setLoading(prev => ({ ...prev, semesters: false }));
    }
  };

  const loadSections = async (semesterId: string) => {
    setLoading(prev => ({ ...prev, sections: true }));
    try {
      console.log('[EngagementFilters] Loading sections for semester:', semesterId);
      const { data, error } = await supabase
        .from('sections')
        .select('id, section_name')
        .eq('semester_id', semesterId)
        .eq('is_active', true)
        .order('section_name');

      if (error) {
        console.error('[EngagementFilters] Error loading sections:', error);
      } else {
        console.log('[EngagementFilters] Sections loaded:', data);
      }

      // Map section_name to name for consistency
      const mappedData = data?.map((sec: any) => ({
        id: sec.id,
        name: sec.section_name
      })) || [];

      setSections(mappedData);
    } finally {
      setLoading(prev => ({ ...prev, sections: false }));
    }
  };

  const handleDatePreset = (preset: string) => {
    const today = new Date();
    let from: Date;

    switch (preset) {
      case 'last7':
        from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'last30':
        from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'last90':
        from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(today.toISOString().split('T')[0]);
  };

  const clearFilters = () => {
    setSelectedDepartment(ALL_DEPARTMENTS);
    setSelectedProgram(ALL_PROGRAMS);
    setSelectedSemester(ALL_SEMESTERS);
    setSelectedSection(ALL_SECTIONS);
    setLevel('institution');
    // Reset to default date range
    handleDatePreset('last30');
  };

  const getLevelIcon = (currentLevel: OrganizationalLevel) => {
    const iconClass = 'h-4 w-4';
    switch (currentLevel) {
      case 'institution':
        return <Building2 className={iconClass} />;
      case 'department':
        return <Layers className={iconClass} />;
      case 'program':
        return <GraduationCap className={iconClass} />;
      case 'semester':
        return <BookOpen className={iconClass} />;
      case 'section':
        return <Users className={iconClass} />;
      default:
        return <Building2 className={iconClass} />;
    }
  };

  const getLevelBadgeColor = (currentLevel: OrganizationalLevel) => {
    switch (currentLevel) {
      case 'institution':
        return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
      case 'department':
        return 'bg-purple-100 text-purple-800 hover:bg-purple-200';
      case 'program':
        return 'bg-green-100 text-green-800 hover:bg-green-200';
      case 'semester':
        return 'bg-orange-100 text-orange-800 hover:bg-orange-200';
      case 'section':
        return 'bg-pink-100 text-pink-800 hover:bg-pink-200';
      default:
        return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
    }
  };

  return (
    <Card className="shadow-sm border-gray-200">
      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Current Level Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors',
                getLevelBadgeColor(level)
              )}
            >
              {getLevelIcon(level)}
              <span className="ml-1.5 capitalize">{level} Level</span>
            </Badge>
          </div>
        </div>

        {/* Hierarchical Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Institution */}
          <div className="space-y-2">
            <Label htmlFor="institution" className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-blue-600" />
              Institution
            </Label>
            <Select
              value={selectedInstitution}
              onValueChange={(value) => {
                setSelectedInstitution(value);
                setSelectedDepartment(ALL_DEPARTMENTS);
                setSelectedProgram(ALL_PROGRAMS);
                setSelectedSemester(ALL_SEMESTERS);
                setSelectedSection(ALL_SECTIONS);
                setLevel('institution');
              }}
              disabled={loading.institutions}
            >
              <SelectTrigger id="institution" className="transition-all">
                <SelectValue placeholder="Select institution..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All Institutions</SelectItem>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Department */}
          {selectedInstitution && selectedInstitution !== ALL_VALUE && (
            <div className="space-y-2 animate-in slide-in-from-left duration-300">
              <Label htmlFor="department" className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-purple-600" />
                Department
                {loading.departments && <Loader2 className="h-3 w-3 animate-spin" />}
              </Label>
              <Select
                value={selectedDepartment}
                onValueChange={(value) => {
                  setSelectedDepartment(value);
                  if (value === ALL_DEPARTMENTS) {
                    setSelectedProgram(ALL_PROGRAMS);
                    setSelectedSemester(ALL_SEMESTERS);
                    setSelectedSection(ALL_SECTIONS);
                    setLevel('institution');
                  } else if (level === 'institution') {
                    setLevel('department');
                  }
                }}
                disabled={loading.departments}
              >
                <SelectTrigger id="department" className="transition-all">
                  <SelectValue placeholder="Select department..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_DEPARTMENTS}>All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Program */}
          {selectedDepartment && selectedDepartment !== ALL_DEPARTMENTS && (
            <div className="space-y-2 animate-in slide-in-from-left duration-300">
              <Label htmlFor="program" className="flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5 text-green-600" />
                Program
                {loading.programs && <Loader2 className="h-3 w-3 animate-spin" />}
              </Label>
              <Select
                value={selectedProgram}
                onValueChange={(value) => {
                  setSelectedProgram(value);
                  if (value === ALL_PROGRAMS) {
                    setSelectedSemester(ALL_SEMESTERS);
                    setSelectedSection(ALL_SECTIONS);
                    setLevel('department');
                  } else if (level === 'institution' || level === 'department') {
                    setLevel('program');
                  }
                }}
                disabled={loading.programs}
              >
                <SelectTrigger id="program" className="transition-all">
                  <SelectValue placeholder="Select program..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PROGRAMS}>All Programs</SelectItem>
                  {programs.length === 0 && !loading.programs ? (
                    <div className="px-2 py-1.5 text-sm text-gray-500 italic">
                      No programs found for this department
                    </div>
                  ) : (
                    programs.map((prog) => (
                      <SelectItem key={prog.id} value={prog.id}>
                        {prog.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {programs.length === 0 && !loading.programs && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  No programs available for this department
                </p>
              )}
            </div>
          )}

          {/* Semester */}
          {selectedProgram && selectedProgram !== ALL_PROGRAMS && (
            <div className="space-y-2 animate-in slide-in-from-left duration-300">
              <Label htmlFor="semester" className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-orange-600" />
                Semester
                {loading.semesters && <Loader2 className="h-3 w-3 animate-spin" />}
              </Label>
              <Select
                value={selectedSemester}
                onValueChange={(value) => {
                  setSelectedSemester(value);
                  if (value === ALL_SEMESTERS) {
                    setSelectedSection(ALL_SECTIONS);
                    setLevel('program');
                  } else if (level === 'institution' || level === 'department' || level === 'program') {
                    setLevel('semester');
                  }
                }}
                disabled={loading.semesters}
              >
                <SelectTrigger id="semester" className="transition-all">
                  <SelectValue placeholder="Select semester..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SEMESTERS}>All Semesters</SelectItem>
                  {semesters.map((sem) => (
                    <SelectItem key={sem.id} value={sem.id}>
                      {sem.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Section */}
          {selectedSemester && selectedSemester !== ALL_SEMESTERS && (
            <div className="space-y-2 animate-in slide-in-from-left duration-300">
              <Label htmlFor="section" className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-pink-600" />
                Section
                {loading.sections && <Loader2 className="h-3 w-3 animate-spin" />}
              </Label>
              <Select
                value={selectedSection}
                onValueChange={(value) => {
                  setSelectedSection(value);
                  if (value === ALL_SECTIONS) {
                    setLevel('semester');
                  } else {
                    setLevel('section');
                  }
                }}
                disabled={loading.sections}
              >
                <SelectTrigger id="section" className="transition-all">
                  <SelectValue placeholder="Select section..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SECTIONS}>All Sections</SelectItem>
                  {sections.map((sec) => (
                    <SelectItem key={sec.id} value={sec.id}>
                      {sec.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Date Range */}
        <div className="space-y-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateFrom" className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Date From
              </Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="transition-all"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateTo" className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Date To
              </Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="transition-all"
              />
            </div>
          </div>

          {/* Date Presets */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDatePreset('last7')}
              className="transition-all"
            >
              Last 7 days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDatePreset('last30')}
              className="transition-all"
            >
              Last 30 days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDatePreset('last90')}
              className="transition-all"
            >
              Last 90 days
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4 border-t border-gray-200">
          <Button
            variant="ghost"
            onClick={clearFilters}
            className="transition-all"
          >
            <X className="h-4 w-4 mr-2" />
            Clear Filters
          </Button>

          {onExport && (
            <Button
              variant="default"
              onClick={onExport}
              className="bg-green-600 hover:bg-green-700 transition-all"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Data
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
