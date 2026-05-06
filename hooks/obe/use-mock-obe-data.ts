'use client';

import { useState, useCallback } from 'react';
import type {
  ObeRegulationConfig,
  ProgramOutcome,
  ProgramSpecificOutcome,
  CoPoMapping,
  CoPsoMapping,
} from '@/types/obe';

// Mock regulation config
const mockRegulationConfig: ObeRegulationConfig = {
  id: 'reg-config-001',
  institution_id: 'inst-001',
  regulation_id: 'reg-2024',
  taxonomy_type: 'blooms',
  blooms_active_levels: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'],
  finks_active_dimensions: [],
  direct_weightage: 80,
  indirect_weightage: 20,
  indirect_scale_max: 5,
  attainment_scale_max: 3,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
};

// Mock program outcomes (12 standard NBA engineering POs)
const mockProgramOutcomes: ProgramOutcome[] = [
  {
    id: 'po-001',
    institution_id: 'inst-001',
    program_id: 'prog-001',
    po_code: 'PO1',
    po_description: 'Engineering Knowledge',
    po_category: 'Technical',
    sort_order: 1,
    is_active: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'po-002',
    institution_id: 'inst-001',
    program_id: 'prog-001',
    po_code: 'PO2',
    po_description: 'Problem Analysis',
    po_category: 'Technical',
    sort_order: 2,
    is_active: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'po-003',
    institution_id: 'inst-001',
    program_id: 'prog-001',
    po_code: 'PO3',
    po_description: 'Design/Development of Solutions',
    po_category: 'Technical',
    sort_order: 3,
    is_active: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'po-004',
    institution_id: 'inst-001',
    program_id: 'prog-001',
    po_code: 'PO4',
    po_description: 'Conduct Investigations',
    po_category: 'Technical',
    sort_order: 4,
    is_active: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'po-005',
    institution_id: 'inst-001',
    program_id: 'prog-001',
    po_code: 'PO5',
    po_description: 'Modern Tool Usage',
    po_category: 'Technical',
    sort_order: 5,
    is_active: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'po-006',
    institution_id: 'inst-001',
    program_id: 'prog-001',
    po_code: 'PO6',
    po_description: 'The Engineer and Society',
    po_category: 'Soft Skills',
    sort_order: 6,
    is_active: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'po-007',
    institution_id: 'inst-001',
    program_id: 'prog-001',
    po_code: 'PO7',
    po_description: 'Environment and Sustainability',
    po_category: 'Soft Skills',
    sort_order: 7,
    is_active: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'po-008',
    institution_id: 'inst-001',
    program_id: 'prog-001',
    po_code: 'PO8',
    po_description: 'Ethics',
    po_category: 'Soft Skills',
    sort_order: 8,
    is_active: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'po-009',
    institution_id: 'inst-001',
    program_id: 'prog-001',
    po_code: 'PO9',
    po_description: 'Individual and Team Work',
    po_category: 'Soft Skills',
    sort_order: 9,
    is_active: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'po-010',
    institution_id: 'inst-001',
    program_id: 'prog-001',
    po_code: 'PO10',
    po_description: 'Communication',
    po_category: 'Soft Skills',
    sort_order: 10,
    is_active: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'po-011',
    institution_id: 'inst-001',
    program_id: 'prog-001',
    po_code: 'PO11',
    po_description: 'Project Management and Finance',
    po_category: 'Soft Skills',
    sort_order: 11,
    is_active: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'po-012',
    institution_id: 'inst-001',
    program_id: 'prog-001',
    po_code: 'PO12',
    po_description: 'Life-long Learning',
    po_category: 'Soft Skills',
    sort_order: 12,
    is_active: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
];

// Mock PSOs
const mockProgramSpecificOutcomes: ProgramSpecificOutcome[] = [
  {
    id: 'pso-001',
    institution_id: 'inst-001',
    program_id: 'prog-001',
    pso_code: 'PSO1',
    pso_description: 'Specialized knowledge in Computer Science fundamentals',
    sort_order: 1,
    is_active: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'pso-002',
    institution_id: 'inst-001',
    program_id: 'prog-001',
    pso_code: 'PSO2',
    pso_description: 'Ability to apply advanced algorithms and data structures',
    sort_order: 2,
    is_active: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
];

export function useMockRegulationConfig() {
  const [config, setConfig] = useState<ObeRegulationConfig>(mockRegulationConfig);
  const [loading, setLoading] = useState(false);

  const updateConfig = useCallback(async (newConfig: Partial<ObeRegulationConfig>) => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    setConfig(prev => ({
      ...prev,
      ...newConfig,
      updated_at: new Date().toISOString(),
    }));
    setLoading(false);
  }, []);

  return { config, loading, updateConfig };
}

export function useMockProgramOutcomes(programId?: string) {
  const [outcomes, setOutcomes] = useState<ProgramOutcome[]>(mockProgramOutcomes);
  const [loading, setLoading] = useState(false);

  const addOutcome = useCallback(async (outcome: Omit<ProgramOutcome, 'id' | 'created_at' | 'updated_at'>) => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    const newOutcome: ProgramOutcome = {
      ...outcome,
      id: `po-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setOutcomes(prev => [...prev, newOutcome]);
    setLoading(false);
    return newOutcome;
  }, []);

  const updateOutcome = useCallback(async (id: string, updates: Partial<ProgramOutcome>) => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    setOutcomes(prev =>
      prev.map(o =>
        o.id === id
          ? { ...o, ...updates, updated_at: new Date().toISOString() }
          : o
      )
    );
    setLoading(false);
  }, []);

  const deleteOutcome = useCallback(async (id: string) => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    setOutcomes(prev => prev.filter(o => o.id !== id));
    setLoading(false);
  }, []);

  return { outcomes, loading, addOutcome, updateOutcome, deleteOutcome };
}

export function useMockProgramSpecificOutcomes(programId?: string) {
  const [outcomes, setOutcomes] = useState<ProgramSpecificOutcome[]>(mockProgramSpecificOutcomes);
  const [loading, setLoading] = useState(false);

  const addOutcome = useCallback(async (outcome: Omit<ProgramSpecificOutcome, 'id' | 'created_at' | 'updated_at'>) => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    const newOutcome: ProgramSpecificOutcome = {
      ...outcome,
      id: `pso-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setOutcomes(prev => [...prev, newOutcome]);
    setLoading(false);
    return newOutcome;
  }, []);

  const updateOutcome = useCallback(async (id: string, updates: Partial<ProgramSpecificOutcome>) => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    setOutcomes(prev =>
      prev.map(o =>
        o.id === id
          ? { ...o, ...updates, updated_at: new Date().toISOString() }
          : o
      )
    );
    setLoading(false);
  }, []);

  const deleteOutcome = useCallback(async (id: string) => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    setOutcomes(prev => prev.filter(o => o.id !== id));
    setLoading(false);
  }, []);

  return { outcomes, loading, addOutcome, updateOutcome, deleteOutcome };
}
