'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
// Permission-aware org hooks. These honor super_admin (all institutions),
// admission-global users (all institutions), and otherwise scope the list
// to the viewer's own institution + any user_institution_access grants.
// Previously this component queried supabase.from('institutions') directly,
// which leaked every active institution to HOD/principal/etc. because the
// institutions table's RLS doesn't scope reads by role.
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';

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
  // Parent selections for cascading (single-select parents, multi-select leaf)
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');
  const [selectedDegreeId, setSelectedDegreeId] = useState<string>('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');

  const [popoverOpen, setPopoverOpen] = useState(false);

  // Permission-aware institution list. HOD/principal/staff see only their
  // own institution (and anything granted via user_institution_access);
  // super_admin and admission-global users see all.
  const { institutions: accessibleInstitutions } = useInstitutionsWithAccess();
  const institutions = useMemo<OrgEntity[]>(
    () =>
      (accessibleInstitutions || []).map((i) => ({ id: i.id, name: i.name })),
    [accessibleInstitutions]
  );

  // Degrees cascade off selected institution. Only load when scope needs
  // degrees downstream (degree / department / program scopes).
  const needsDegreeCascade =
    scopeLevel === 'degree' || scopeLevel === 'department' || scopeLevel === 'program';
  const { data: degreesData } = useDegrees({
    institution_id: needsDegreeCascade && selectedInstitutionId ? selectedInstitutionId : undefined,
  });
  const degrees = useMemo<OrgEntity[]>(
    () =>
      !needsDegreeCascade || !selectedInstitutionId
        ? []
        : (degreesData?.data || []).map((d: any) => ({ id: d.id, name: d.degree_name })),
    [degreesData, needsDegreeCascade, selectedInstitutionId]
  );

  // Departments cascade off degree. Only load when scope needs departments.
  const needsDepartmentCascade = scopeLevel === 'department' || scopeLevel === 'program';
  const { data: departmentsData } = useDepartments({
    institution_id: needsDepartmentCascade && selectedInstitutionId ? selectedInstitutionId : undefined,
    degree_id: needsDepartmentCascade && selectedDegreeId ? selectedDegreeId : undefined,
  });
  const departments = useMemo<OrgEntity[]>(
    () =>
      !needsDepartmentCascade || !selectedDegreeId
        ? []
        : (departmentsData?.data || []).map((d: any) => ({ id: d.id, name: d.department_name })),
    [departmentsData, needsDepartmentCascade, selectedDegreeId]
  );

  // Programs cascade off department. Only load when scope is program.
  const { data: programsData } = usePrograms({
    institution_id: scopeLevel === 'program' && selectedInstitutionId ? selectedInstitutionId : undefined,
    degree_id: scopeLevel === 'program' && selectedDegreeId ? selectedDegreeId : undefined,
    department_id: scopeLevel === 'program' && selectedDepartmentId ? selectedDepartmentId : undefined,
  });
  const programs = useMemo<OrgEntity[]>(
    () =>
      scopeLevel !== 'program' || !selectedDepartmentId
        ? []
        : (programsData?.data || []).map((p: any) => ({ id: p.id, name: p.program_name })),
    [programsData, scopeLevel, selectedDepartmentId]
  );

  // Reset downstream picks when scope level changes (keeps stale ids out of
  // the degree/department/program dropdowns).
  useEffect(() => {
    if (scopeLevel === 'institution' || scopeLevel === 'common') {
      setSelectedDegreeId('');
      setSelectedDepartmentId('');
    } else if (scopeLevel === 'degree') {
      setSelectedDepartmentId('');
    }
  }, [scopeLevel]);

  // UX polish for scoped HODs: when the accessible institutions list resolves
  // to exactly one and we're in a scope that needs an institution parent
  // (degree/department/program), auto-select it so the user doesn't have to
  // pick their own institution from a one-item list.
  useEffect(() => {
    if (
      needsDegreeCascade
      && institutions.length === 1
      && !selectedInstitutionId
    ) {
      setSelectedInstitutionId(institutions[0].id);
    }
  }, [institutions, needsDegreeCascade, selectedInstitutionId]);

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
