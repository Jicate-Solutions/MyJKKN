'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SERVICE_TYPE_SCOPE_OPTIONS,
  type ServiceTypeScopeLevel,
} from '@/types/service-request';
import { SCOPE_ICONS } from './scope-icons';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface OrgEntity {
  id: string;
  name: string;
}

interface ScopeSelectorProps {
  scopeLevel: ServiceTypeScopeLevel;
  institutionIds: string[];
  degreeIds: string[];
  departmentIds: string[];
  programIds: string[];
  onScopeLevelChange: (level: ServiceTypeScopeLevel) => void;
  onInstitutionIdsChange: (ids: string[]) => void;
  onDegreeIdsChange: (ids: string[]) => void;
  onDepartmentIdsChange: (ids: string[]) => void;
  onProgramIdsChange: (ids: string[]) => void;
  error?: string;
}

export function ScopeSelector({
  scopeLevel,
  institutionIds,
  degreeIds,
  departmentIds,
  programIds,
  onScopeLevelChange,
  onInstitutionIdsChange,
  onDegreeIdsChange,
  onDepartmentIdsChange,
  onProgramIdsChange,
  error,
}: ScopeSelectorProps) {
  const supabase = createClientSupabaseClient();

  // Cascading dropdown data
  const [institutions, setInstitutions] = useState<OrgEntity[]>([]);
  const [degrees, setDegrees] = useState<OrgEntity[]>([]);
  const [departments, setDepartments] = useState<OrgEntity[]>([]);
  const [programs, setPrograms] = useState<OrgEntity[]>([]);

  // Parent selections for cascading (single-select parents, multi-select leaf)
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');
  const [selectedDegreeId, setSelectedDegreeId] = useState<string>('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');

  const [popoverOpen, setPopoverOpen] = useState(false);

  // Load institutions once
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('institutions')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      setInstitutions(data || []);
    };
    load();
  }, []);

  // Load degrees when institution changes (for degree/department/program scopes)
  useEffect(() => {
    if (!selectedInstitutionId || scopeLevel === 'institution') {
      setDegrees([]);
      setSelectedDegreeId('');
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from('degrees')
        .select('id, degree_name')
        .eq('institution_id', selectedInstitutionId)
        .eq('is_active', true)
        .order('degree_name');
      setDegrees((data || []).map((d) => ({ id: d.id, name: d.degree_name })));
    };
    load();
  }, [selectedInstitutionId, scopeLevel]);

  // Load departments when degree changes (for department/program scopes)
  useEffect(() => {
    if (!selectedDegreeId || scopeLevel === 'degree') {
      setDepartments([]);
      setSelectedDepartmentId('');
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from('departments')
        .select('id, department_name')
        .eq('institution_id', selectedInstitutionId)
        .eq('degree_id', selectedDegreeId)
        .eq('is_active', true)
        .order('department_name');
      setDepartments(
        (data || []).map((d) => ({ id: d.id, name: d.department_name }))
      );
    };
    load();
  }, [selectedInstitutionId, selectedDegreeId, scopeLevel]);

  // Load programs when department changes (for program scope)
  useEffect(() => {
    if (!selectedDepartmentId || scopeLevel !== 'program') {
      setPrograms([]);
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from('programs')
        .select('id, program_name')
        .eq('department_id', selectedDepartmentId)
        .eq('is_active', true)
        .order('program_name');
      setPrograms((data || []).map((p) => ({ id: p.id, name: p.program_name })));
    };
    load();
  }, [selectedDepartmentId, scopeLevel]);

  // Reset downstream when scope level changes
  const handleScopeLevelChange = useCallback(
    (level: ServiceTypeScopeLevel) => {
      onScopeLevelChange(level);
      onInstitutionIdsChange([]);
      onDegreeIdsChange([]);
      onDepartmentIdsChange([]);
      onProgramIdsChange([]);
      setSelectedInstitutionId('');
      setSelectedDegreeId('');
      setSelectedDepartmentId('');
    },
    [
      onScopeLevelChange,
      onInstitutionIdsChange,
      onDegreeIdsChange,
      onDepartmentIdsChange,
      onProgramIdsChange,
    ]
  );

  const getLeafConfig = () => {
    switch (scopeLevel) {
      case 'institution':
        return {
          entities: institutions,
          selectedIds: institutionIds,
          onChange: onInstitutionIdsChange,
          label: 'Institutions',
        };
      case 'degree':
        return {
          entities: degrees,
          selectedIds: degreeIds,
          onChange: onDegreeIdsChange,
          label: 'Degrees',
        };
      case 'department':
        return {
          entities: departments,
          selectedIds: departmentIds,
          onChange: onDepartmentIdsChange,
          label: 'Departments',
        };
      case 'program':
        return {
          entities: programs,
          selectedIds: programIds,
          onChange: onProgramIdsChange,
          label: 'Programs',
        };
      default:
        return null;
    }
  };

  const leafConfig = getLeafConfig();
  const showInstitutionParent = ['degree', 'department', 'program'].includes(scopeLevel);
  const showDegreeParent = ['department', 'program'].includes(scopeLevel);
  const showDepartmentParent = scopeLevel === 'program';

  const currentOption = SERVICE_TYPE_SCOPE_OPTIONS.find((o) => o.value === scopeLevel);

  return (
    <div className="space-y-3">
      {/* Scope Level as Select dropdown */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          Service Visibility <span className="text-red-500">*</span>
        </Label>
        <Select
          value={scopeLevel}
          onValueChange={(v) => handleScopeLevelChange(v as ServiceTypeScopeLevel)}
        >
          <SelectTrigger>
            <SelectValue>
              {currentOption &&
                (() => {
                  const Icon = SCOPE_ICONS[currentOption.value];
                  return (
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {currentOption.label}
                    </span>
                  );
                })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SERVICE_TYPE_SCOPE_OPTIONS.map((option) => {
              const Icon = SCOPE_ICONS[option.value];
              return (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-start gap-2 py-1">
                    <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </div>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Cascading pickers for scoped types */}
      {scopeLevel !== 'common' && (
        <div className="border rounded-md p-4 space-y-4 bg-muted/30">
          {showInstitutionParent && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Institution <span className="text-red-500">*</span>
              </Label>
              <Select
                value={selectedInstitutionId}
                onValueChange={(v) => {
                  setSelectedInstitutionId(v);
                  setSelectedDegreeId('');
                  setSelectedDepartmentId('');
                  onDegreeIdsChange([]);
                  onDepartmentIdsChange([]);
                  onProgramIdsChange([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select institution..." />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showDegreeParent && selectedInstitutionId && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Degree <span className="text-red-500">*</span>
              </Label>
              <Select
                value={selectedDegreeId}
                onValueChange={(v) => {
                  setSelectedDegreeId(v);
                  setSelectedDepartmentId('');
                  onDepartmentIdsChange([]);
                  onProgramIdsChange([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select degree..." />
                </SelectTrigger>
                <SelectContent>
                  {degrees.map((deg) => (
                    <SelectItem key={deg.id} value={deg.id}>
                      {deg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showDepartmentParent && selectedDegreeId && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Department <span className="text-red-500">*</span>
              </Label>
              <Select
                value={selectedDepartmentId}
                onValueChange={(v) => {
                  setSelectedDepartmentId(v);
                  onProgramIdsChange([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department..." />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {leafConfig && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Select {leafConfig.label} <span className="text-red-500">*</span>
              </Label>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen} modal>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={popoverOpen}
                    className={cn(
                      'w-full justify-between min-h-[42px] h-auto py-2 font-normal',
                      !leafConfig.selectedIds.length && 'text-muted-foreground'
                    )}
                    disabled={
                      (scopeLevel !== 'institution' && !selectedInstitutionId) ||
                      (showDegreeParent && !selectedDegreeId) ||
                      (showDepartmentParent && !selectedDepartmentId)
                    }
                  >
                    {leafConfig.selectedIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {leafConfig.selectedIds.map((id) => {
                          const entity = leafConfig.entities.find((e) => e.id === id);
                          return (
                            <Badge
                              key={id}
                              variant="secondary"
                              className="flex items-center gap-1"
                            >
                              {entity?.name || id.slice(0, 8)}
                              <span
                                role="button"
                                tabIndex={0}
                                className="ml-0.5 hover:bg-accent rounded-full p-0.5 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  leafConfig.onChange(
                                    leafConfig.selectedIds.filter((i) => i !== id)
                                  );
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.stopPropagation();
                                    leafConfig.onChange(
                                      leafConfig.selectedIds.filter((i) => i !== id)
                                    );
                                  }
                                }}
                              >
                                ×
                              </span>
                            </Badge>
                          );
                        })}
                      </div>
                    ) : (
                      `Select ${leafConfig.label.toLowerCase()}...`
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[min(400px,calc(100vw-2rem))] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput
                      placeholder={`Search ${leafConfig.label.toLowerCase()}...`}
                    />
                    <CommandList className="max-h-[250px]">
                      <CommandEmpty>No {leafConfig.label.toLowerCase()} found.</CommandEmpty>
                      <CommandGroup>
                        {leafConfig.entities.map((entity) => {
                          const isSelected = leafConfig.selectedIds.includes(entity.id);
                          return (
                            <CommandItem
                              key={entity.id}
                              value={entity.name}
                              onSelect={() => {
                                const updated = isSelected
                                  ? leafConfig.selectedIds.filter((i) => i !== entity.id)
                                  : [...leafConfig.selectedIds, entity.id];
                                leafConfig.onChange(updated);
                              }}
                            >
                              <div
                                className={cn(
                                  'mr-2 flex h-4 w-4 items-center justify-center rounded border shrink-0',
                                  isSelected
                                    ? 'bg-primary border-primary'
                                    : 'border-muted-foreground'
                                )}
                              >
                                {isSelected && (
                                  <Check className="h-3 w-3 text-primary-foreground" />
                                )}
                              </div>
                              <span>{entity.name}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                Only users belonging to the selected {leafConfig.label.toLowerCase()} will
                see this service type
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
