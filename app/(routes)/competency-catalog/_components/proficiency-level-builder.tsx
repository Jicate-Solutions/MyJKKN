'use client';

// ============================================================================
// Proficiency Level Builder Component
// Allows defining proficiency levels with criteria for each level
// ============================================================================

import { useState } from 'react';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import type { ProficiencyLevel, ProficiencyLevelDefinition } from '@/types/competency';

// ============================================================================
// CONSTANTS
// ============================================================================

const PROFICIENCY_LEVELS: { value: ProficiencyLevel; label: string; color: string }[] = [
  { value: 'novice', label: 'Novice', color: 'bg-slate-100 text-slate-700' },
  { value: 'beginner', label: 'Beginner', color: 'bg-blue-100 text-blue-700' },
  { value: 'intermediate', label: 'Intermediate', color: 'bg-amber-100 text-amber-700' },
  { value: 'advanced', label: 'Advanced', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'expert', label: 'Expert', color: 'bg-purple-100 text-purple-700' }
];

const DEFAULT_LEVELS: ProficiencyLevelDefinition[] = [
  {
    level: 'novice',
    description: 'Just starting, basic awareness of concepts',
    criteria: ['Recognizes basic terminology', 'Can follow guided instructions'],
    typical_duration_hours: 10
  },
  {
    level: 'beginner',
    description: 'Basic knowledge, needs guidance for tasks',
    criteria: ['Understands core concepts', 'Can complete simple tasks with support'],
    typical_duration_hours: 30
  },
  {
    level: 'intermediate',
    description: 'Working knowledge, can work independently',
    criteria: ['Can apply knowledge to new situations', 'Works independently on standard tasks'],
    typical_duration_hours: 80
  },
  {
    level: 'advanced',
    description: 'Deep knowledge, can mentor others',
    criteria: ['Solves complex problems', 'Can teach and guide others'],
    typical_duration_hours: 150
  },
  {
    level: 'expert',
    description: 'Mastery level, can innovate and lead',
    criteria: ['Creates new solutions', 'Recognized authority in the field'],
    typical_duration_hours: 300
  }
];

// ============================================================================
// PROPS
// ============================================================================

interface ProficiencyLevelBuilderProps {
  value: ProficiencyLevelDefinition[];
  onChange: (levels: ProficiencyLevelDefinition[]) => void;
  error?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ProficiencyLevelBuilder({
  value,
  onChange,
  error
}: ProficiencyLevelBuilderProps) {
  const [expandedLevels, setExpandedLevels] = useState<string[]>([]);

  const toggleExpand = (level: string) => {
    setExpandedLevels(prev =>
      prev.includes(level)
        ? prev.filter(l => l !== level)
        : [...prev, level]
    );
  };

  const addLevel = () => {
    // Find the first level not already defined
    const existingLevels = value.map(l => l.level);
    const availableLevel = PROFICIENCY_LEVELS.find(l => !existingLevels.includes(l.value));

    if (availableLevel) {
      const newLevel: ProficiencyLevelDefinition = {
        level: availableLevel.value,
        description: '',
        criteria: [],
        typical_duration_hours: undefined
      };
      onChange([...value, newLevel]);
      setExpandedLevels(prev => [...prev, availableLevel.value]);
    }
  };

  const removeLevel = (index: number) => {
    const newLevels = [...value];
    newLevels.splice(index, 1);
    onChange(newLevels);
  };

  const updateLevel = (index: number, updates: Partial<ProficiencyLevelDefinition>) => {
    const newLevels = [...value];
    newLevels[index] = { ...newLevels[index], ...updates };
    onChange(newLevels);
  };

  const addCriterion = (levelIndex: number) => {
    const newLevels = [...value];
    newLevels[levelIndex].criteria = [...(newLevels[levelIndex].criteria || []), ''];
    onChange(newLevels);
  };

  const updateCriterion = (levelIndex: number, criteriaIndex: number, newValue: string) => {
    const newLevels = [...value];
    newLevels[levelIndex].criteria[criteriaIndex] = newValue;
    onChange(newLevels);
  };

  const removeCriterion = (levelIndex: number, criteriaIndex: number) => {
    const newLevels = [...value];
    newLevels[levelIndex].criteria.splice(criteriaIndex, 1);
    onChange(newLevels);
  };

  const useDefaultLevels = () => {
    onChange(DEFAULT_LEVELS);
    setExpandedLevels(DEFAULT_LEVELS.map(l => l.level));
  };

  const getLevelConfig = (level: ProficiencyLevel) => {
    return PROFICIENCY_LEVELS.find(l => l.value === level);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Proficiency Levels</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={useDefaultLevels}
          >
            Use Defaults
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addLevel}
            disabled={value.length >= PROFICIENCY_LEVELS.length}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Level
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {value.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">
              No proficiency levels defined. Add levels to define mastery progression.
            </p>
            <Button type="button" variant="outline" onClick={useDefaultLevels}>
              Start with Default Levels
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {value.map((levelDef, index) => {
            const config = getLevelConfig(levelDef.level);
            const isExpanded = expandedLevels.includes(levelDef.level);

            return (
              <Card key={levelDef.level} className="overflow-hidden">
                <Collapsible open={isExpanded} onOpenChange={() => toggleExpand(levelDef.level)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <Badge className={config?.color}>
                            {config?.label || levelDef.level}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {levelDef.description || 'No description'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {levelDef.criteria?.length || 0} criteria
                          </Badge>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4 px-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Level</Label>
                          <Select
                            value={levelDef.level}
                            onValueChange={(v) => updateLevel(index, { level: v as ProficiencyLevel })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PROFICIENCY_LEVELS.map(l => (
                                <SelectItem
                                  key={l.value}
                                  value={l.value}
                                  disabled={value.some((v, i) => v.level === l.value && i !== index)}
                                >
                                  {l.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Typical Duration (hours)</Label>
                          <Input
                            type="number"
                            placeholder="e.g., 40"
                            value={levelDef.typical_duration_hours || ''}
                            onChange={(e) => updateLevel(index, {
                              typical_duration_hours: e.target.value ? parseInt(e.target.value) : undefined
                            })}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          placeholder="Describe what this proficiency level means..."
                          value={levelDef.description}
                          onChange={(e) => updateLevel(index, { description: e.target.value })}
                          rows={2}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Success Criteria</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => addCriterion(index)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                        </div>
                        {levelDef.criteria && levelDef.criteria.length > 0 ? (
                          <div className="space-y-2">
                            {levelDef.criteria.map((criterion, criteriaIndex) => (
                              <div key={criteriaIndex} className="flex gap-2">
                                <Input
                                  placeholder="Enter criterion..."
                                  value={criterion}
                                  onChange={(e) => updateCriterion(index, criteriaIndex, e.target.value)}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeCriterion(index, criteriaIndex)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground py-2">
                            No criteria defined. Click "Add" to add success criteria.
                          </p>
                        )}
                      </div>

                      <div className="flex justify-end pt-2 border-t">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLevel(index)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove Level
                        </Button>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
