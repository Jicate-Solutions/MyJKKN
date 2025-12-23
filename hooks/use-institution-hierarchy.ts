// ============================================
// INSTITUTION HIERARCHY HOOK
// ============================================
// Created: 2025-01-22
// Updated: 2025-01-22 - Added degree and section support
// Purpose: Fetch academic hierarchy data for filters
// Hierarchy: Institution → Degree → Department → Program → Semester → Section
// ============================================

import { useState, useEffect } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface Institution {
  id: string;
  name: string;
}

interface Degree {
  id: string;
  degree_name: string;
}

interface Department {
  id: string;
  department_name: string;
}

interface Program {
  id: string;
  program_name: string;
}

interface Semester {
  id: string;
  semester_name: string;
}

interface Section {
  id: string;
  section_name: string;
}

interface UseInstitutionHierarchyProps {
  institutionId?: string;
  degreeId?: string;
  departmentId?: string;
  programId?: string;
  semesterId?: string;
}

export function useInstitutionHierarchy({
  institutionId,
  degreeId,
  departmentId,
  programId,
  semesterId
}: UseInstitutionHierarchyProps = {}) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch institutions
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        setIsLoading(true);
        const supabase = createClientSupabaseClient();
        const { data, error } = await supabase
          .from('institutions')
          .select('id, name')
          .order('name');

        if (error) throw error;
        setInstitutions(data || []);
      } catch (err) {
        console.error('[use-institution-hierarchy] Error fetching institutions:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch institutions');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInstitutions();
  }, []);

  // Fetch departments when degree changes
  useEffect(() => {
    if (!degreeId) {
      setDepartments([]);
      return;
    }

    const fetchDepartments = async () => {
      try {
        setIsLoading(true);
        const supabase = createClientSupabaseClient();
        const { data, error } = await supabase
          .from('departments')
          .select('id, department_name')
          .eq('degree_id', degreeId)
          .order('department_name');

        if (error) throw error;
        setDepartments(data || []);
      } catch (err) {
        console.error('[use-institution-hierarchy] Error fetching departments:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch departments');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDepartments();
  }, [degreeId]);

  // Fetch programs when department changes
  useEffect(() => {
    if (!departmentId) {
      setPrograms([]);
      return;
    }

    const fetchPrograms = async () => {
      try {
        setIsLoading(true);
        const supabase = createClientSupabaseClient();
        const { data, error } = await supabase
          .from('programs')
          .select('id, program_name')
          .eq('department_id', departmentId)
          .order('program_name');

        if (error) throw error;
        setPrograms(data || []);
      } catch (err) {
        console.error('[use-institution-hierarchy] Error fetching programs:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch programs');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrograms();
  }, [departmentId]);

  // Fetch degrees when institution changes
  useEffect(() => {
    if (!institutionId) {
      setDegrees([]);
      return;
    }

    const fetchDegrees = async () => {
      try {
        setIsLoading(true);
        const supabase = createClientSupabaseClient();
        const { data, error } = await supabase
          .from('degrees')
          .select('id, degree_name')
          .eq('institution_id', institutionId)
          .order('degree_name');

        if (error) throw error;
        setDegrees(data || []);
      } catch (err) {
        console.error('[use-institution-hierarchy] Error fetching degrees:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch degrees');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDegrees();
  }, [institutionId]);

  // Fetch semesters when program changes
  useEffect(() => {
    if (!programId) {
      setSemesters([]);
      return;
    }

    const fetchSemesters = async () => {
      try {
        setIsLoading(true);
        const supabase = createClientSupabaseClient();
        const { data, error } = await supabase
          .from('semesters')
          .select('id, semester_name')
          .eq('program_id', programId)
          .order('semester_name');

        if (error) throw error;
        setSemesters(data || []);
      } catch (err) {
        console.error('[use-institution-hierarchy] Error fetching semesters:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch semesters');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSemesters();
  }, [programId]);

  // Fetch sections when semester changes
  useEffect(() => {
    if (!semesterId) {
      setSections([]);
      return;
    }

    const fetchSections = async () => {
      try {
        setIsLoading(true);
        const supabase = createClientSupabaseClient();
        const { data, error } = await supabase
          .from('sections')
          .select('id, section_name')
          .eq('semester_id', semesterId)
          .order('section_name');

        if (error) throw error;
        setSections(data || []);
      } catch (err) {
        console.error('[use-institution-hierarchy] Error fetching sections:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch sections');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSections();
  }, [semesterId]);

  return {
    institutions,
    degrees,
    departments,
    programs,
    semesters,
    sections,
    isLoading,
    error
  };
}
