'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ALL_ADMISSION_STAGES } from '@/types/admission-workflow-config';

interface StageConfiguratorProps {
  activeStages: string[];
  onChange: (stages: string[]) => void;
}

export function StageConfigurator({ activeStages, onChange }: StageConfiguratorProps) {
  const [stages, setStages] = useState<string[]>(activeStages);

  const toggleStage = (stageId: string) => {
    // 'new' and 'enrolled' are always on
    if (stageId === 'new' || stageId === 'enrolled') return;
    const updated = stages.includes(stageId)
      ? stages.filter((s) => s !== stageId)
      : [...stages, stageId];
    setStages(updated);
    onChange(updated);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Admission Stages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ALL_ADMISSION_STAGES.map((stage) => {
          const isFixed = stage.id === 'new' || stage.id === 'enrolled';
          const isActive = stages.includes(stage.id);
          return (
            <div key={stage.id} className="flex items-center justify-between">
              <Label
                htmlFor={`stage-${stage.id}`}
                className={`text-sm ${isFixed ? 'text-muted-foreground' : ''}`}
              >
                {stage.label}
                {isFixed && <span className="text-xs ml-1">(required)</span>}
              </Label>
              <Switch
                id={`stage-${stage.id}`}
                checked={isActive}
                onCheckedChange={() => toggleStage(stage.id)}
                disabled={isFixed}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
