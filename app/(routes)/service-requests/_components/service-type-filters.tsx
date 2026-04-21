'use client';

import { useEffect, useState } from 'react';
import { Search, Filter, X, ChevronDown, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import { SERVICE_TYPE_SCOPE_CONFIG } from '@/types/service-request';
import type { ServiceTypeScopeLevel, ApprovalWorkflowType } from '@/types/service-request';

export type ServiceTypeSortBy = 'name' | 'created_at' | 'updated_at' | 'scope_level';
export type SortOrder = 'asc' | 'desc';
export type TriState = 'all' | 'yes' | 'no';

export interface ServiceTypeFilterState {
  search: string;
  scope_level: ServiceTypeScopeLevel | 'all';
  approval_workflow_type: ApprovalWorkflowType | 'all';
  is_active: TriState;
  is_system_default: TriState;
  enable_attachments: TriState;
  enable_priority: TriState;
  allowed_role: string;
  sortBy: ServiceTypeSortBy;
  sortOrder: SortOrder;
}

export const DEFAULT_SERVICE_TYPE_FILTERS: ServiceTypeFilterState = {
  search: '',
  scope_level: 'all',
  approval_workflow_type: 'all',
  is_active: 'all',
  is_system_default: 'all',
  enable_attachments: 'all',
  enable_priority: 'all',
  allowed_role: 'all',
  sortBy: 'name',
  sortOrder: 'asc',
};

interface ServiceTypeFiltersProps {
  filters: ServiceTypeFilterState;
  onChange: (patch: Partial<ServiceTypeFilterState>) => void;
  availableRoles: string[];
}

export function ServiceTypeFilters({
  filters,
  onChange,
  availableRoles,
}: ServiceTypeFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setSearchValue(filters.search);
  }, [filters.search]);

  // Debounce search → parent state
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== filters.search) {
        onChange({ search: searchValue });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue, filters.search, onChange]);

  const handleClear = () => {
    setSearchValue('');
    onChange(DEFAULT_SERVICE_TYPE_FILTERS);
  };

  const hasActiveFilters =
    filters.scope_level !== 'all' ||
    filters.approval_workflow_type !== 'all' ||
    filters.is_active !== 'all' ||
    filters.is_system_default !== 'all' ||
    filters.enable_attachments !== 'all' ||
    filters.enable_priority !== 'all' ||
    filters.allowed_role !== 'all';

  return (
    <div className="space-y-4">
      {/* Search + toggle row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, slug, or description..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9"
          />
          {searchValue && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setSearchValue('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <Button
          variant="outline"
          onClick={() => setShowFilters((v) => !v)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          {showFilters ? 'Hide Filters' : 'Show Filters'}
          {hasActiveFilters && (
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              •
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              showFilters ? 'rotate-180' : ''
            }`}
          />
        </Button>

        {(hasActiveFilters || filters.search) && (
          <Button variant="outline" size="sm" onClick={handleClear} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Clear All
          </Button>
        )}
      </div>

      {/* Collapsible filter grid */}
      <Collapsible open={showFilters} onOpenChange={setShowFilters}>
        <CollapsibleContent>
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {/* Scope Level */}
                <div className="space-y-2">
                  <Label>Scope</Label>
                  <Select
                    value={filters.scope_level}
                    onValueChange={(value) =>
                      onChange({ scope_level: value as ServiceTypeFilterState['scope_level'] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All scopes</SelectItem>
                      {(Object.keys(SERVICE_TYPE_SCOPE_CONFIG) as ServiceTypeScopeLevel[]).map(
                        (s) => (
                          <SelectItem key={s} value={s}>
                            {SERVICE_TYPE_SCOPE_CONFIG[s].label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Approval Workflow */}
                <div className="space-y-2">
                  <Label>Approval Workflow</Label>
                  <Select
                    value={filters.approval_workflow_type}
                    onValueChange={(value) =>
                      onChange({
                        approval_workflow_type:
                          value as ServiceTypeFilterState['approval_workflow_type'],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All workflows</SelectItem>
                      <SelectItem value="sequential">Sequential</SelectItem>
                      <SelectItem value="parallel">Parallel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Active Status */}
                <div className="space-y-2">
                  <Label>Active Status</Label>
                  <Select
                    value={filters.is_active}
                    onValueChange={(value) =>
                      onChange({ is_active: value as TriState })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Active & Inactive</SelectItem>
                      <SelectItem value="yes">Active only</SelectItem>
                      <SelectItem value="no">Inactive only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* System Default */}
                <div className="space-y-2">
                  <Label>Origin</Label>
                  <Select
                    value={filters.is_system_default}
                    onValueChange={(value) =>
                      onChange({ is_system_default: value as TriState })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="yes">System defaults</SelectItem>
                      <SelectItem value="no">Custom only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Allowed Role */}
                <div className="space-y-2">
                  <Label>Allowed Role</Label>
                  <Select
                    value={filters.allowed_role}
                    onValueChange={(value) => onChange({ allowed_role: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All roles</SelectItem>
                      {availableRoles.map((role) => (
                        <SelectItem key={role} value={role} className="capitalize">
                          {role.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Attachments */}
                <div className="space-y-2">
                  <Label>Attachments</Label>
                  <Select
                    value={filters.enable_attachments}
                    onValueChange={(value) =>
                      onChange({ enable_attachments: value as TriState })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any</SelectItem>
                      <SelectItem value="yes">Enabled</SelectItem>
                      <SelectItem value="no">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Priority */}
                <div className="space-y-2">
                  <Label>Priority Field</Label>
                  <Select
                    value={filters.enable_priority}
                    onValueChange={(value) =>
                      onChange({ enable_priority: value as TriState })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any</SelectItem>
                      <SelectItem value="yes">Enabled</SelectItem>
                      <SelectItem value="no">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Sort By */}
                <div className="space-y-2">
                  <Label>Sort By</Label>
                  <Select
                    value={filters.sortBy}
                    onValueChange={(value) =>
                      onChange({ sortBy: value as ServiceTypeSortBy })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="scope_level">Scope</SelectItem>
                      <SelectItem value="created_at">Created date</SelectItem>
                      <SelectItem value="updated_at">Updated date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Sort Order */}
                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Select
                    value={filters.sortOrder}
                    onValueChange={(value) =>
                      onChange({ sortOrder: value as SortOrder })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Active filters:</span>

          {filters.scope_level !== 'all' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange({ scope_level: 'all' })}
            >
              Scope: {SERVICE_TYPE_SCOPE_CONFIG[filters.scope_level].label}
              <X className="ml-2 h-3 w-3" />
            </Button>
          )}

          {filters.approval_workflow_type !== 'all' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange({ approval_workflow_type: 'all' })}
            >
              Workflow: {filters.approval_workflow_type}
              <X className="ml-2 h-3 w-3" />
            </Button>
          )}

          {filters.is_active !== 'all' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange({ is_active: 'all' })}
            >
              {filters.is_active === 'yes' ? 'Active only' : 'Inactive only'}
              <X className="ml-2 h-3 w-3" />
            </Button>
          )}

          {filters.is_system_default !== 'all' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange({ is_system_default: 'all' })}
            >
              {filters.is_system_default === 'yes' ? 'System default' : 'Custom'}
              <X className="ml-2 h-3 w-3" />
            </Button>
          )}

          {filters.allowed_role !== 'all' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange({ allowed_role: 'all' })}
            >
              Role: <span className="capitalize ml-1">{filters.allowed_role.replace(/_/g, ' ')}</span>
              <X className="ml-2 h-3 w-3" />
            </Button>
          )}

          {filters.enable_attachments !== 'all' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange({ enable_attachments: 'all' })}
            >
              Attachments: {filters.enable_attachments === 'yes' ? 'On' : 'Off'}
              <X className="ml-2 h-3 w-3" />
            </Button>
          )}

          {filters.enable_priority !== 'all' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange({ enable_priority: 'all' })}
            >
              Priority: {filters.enable_priority === 'yes' ? 'On' : 'Off'}
              <X className="ml-2 h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
