'use client';

import { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { JobSkill, SkillProficiency, SkillType } from '@/types/hr-recruitment';

interface SkillsInputProps {
  skills: JobSkill[];
  onChange: (skills: JobSkill[]) => void;
}

const PROFICIENCY_LEVELS: { value: SkillProficiency; label: string }[] = [
  { value: 'basic', label: 'Basic' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'pro', label: 'Pro' },
  { value: 'expert', label: 'Expert' },
];

const PROFICIENCY_INDEX: Record<SkillProficiency, number> = {
  basic: 1,
  intermediate: 2,
  pro: 3,
  expert: 4,
};

function ProficiencyDots({
  proficiency,
  type,
}: {
  proficiency: SkillProficiency;
  type: SkillType;
}) {
  const filled = PROFICIENCY_INDEX[proficiency];
  const color = type === 'required' ? 'bg-primary' : 'bg-amber-500';
  return (
    <span className="inline-flex gap-0.5 ml-1">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn('h-2 w-2 rounded-full', i <= filled ? color : 'bg-muted')}
        />
      ))}
    </span>
  );
}

export function SkillsInput({ skills, onChange }: SkillsInputProps) {
  const [addAs, setAddAs] = useState<SkillType>('required');
  const [proficiency, setProficiency] = useState<SkillProficiency>('intermediate');
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addSkill = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...skills, { name: trimmed, type: addAs, proficiency }]);
    setInputValue('');
  };

  const removeSkill = (name: string) => {
    onChange(skills.filter((s) => s.name !== name));
  };

  const required = skills.filter((s) => s.type === 'required');
  const niceToHave = skills.filter((s) => s.type === 'nice_to_have');

  return (
    <div className="space-y-4">
      {/* Controls panel */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          {/* Add next as toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
              Add next as
            </span>
            <div className="flex rounded-md border max-w-full overflow-x-auto [&>button]:shrink-0">
              <button
                type="button"
                onClick={() => setAddAs('required')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors',
                  addAs === 'required'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                )}
              >
                <span className="h-2 w-2 rounded-full bg-current" />
                Required
              </button>
              <button
                type="button"
                onClick={() => setAddAs('nice_to_have')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors',
                  addAs === 'nice_to_have'
                    ? 'bg-amber-500 text-white'
                    : 'hover:bg-muted'
                )}
              >
                <span className="h-2 w-2 rounded-full bg-current" />
                Nice to have
              </button>
            </div>
          </div>

          {/* Proficiency selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
              Proficiency
            </span>
            <div className="flex rounded-md border max-w-full overflow-x-auto [&>button]:shrink-0">
              {PROFICIENCY_LEVELS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setProficiency(p.value)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors',
                    proficiency === p.value
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Skill name input */}
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addSkill(inputValue);
            }
          }}
          placeholder="Type a skill and press Enter — e.g. Python, AWS, System Design"
          className="bg-background"
        />
      </div>

      {/* Required skills */}
      {required.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider">Required</span>
            <Badge variant="outline" className="text-xs h-5 px-1.5">
              {required.length}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {required.map((skill) => (
              <div
                key={skill.name}
                className="flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-sm"
              >
                <span>{skill.name}</span>
                <ProficiencyDots proficiency={skill.proficiency} type={skill.type} />
                <button
                  type="button"
                  onClick={() => removeSkill(skill.name)}
                  className="ml-1 h-3.5 w-3.5 rounded-full hover:bg-muted flex items-center justify-center"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nice to have skills */}
      {niceToHave.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className="text-xs font-semibold uppercase tracking-wider">Nice to Have</span>
            <Badge variant="outline" className="text-xs h-5 px-1.5">
              {niceToHave.length}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {niceToHave.map((skill) => (
              <div
                key={skill.name}
                className="flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-sm"
              >
                <span>{skill.name}</span>
                <ProficiencyDots proficiency={skill.proficiency} type={skill.type} />
                <button
                  type="button"
                  onClick={() => removeSkill(skill.name)}
                  className="ml-1 h-3.5 w-3.5 rounded-full hover:bg-muted flex items-center justify-center"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {skills.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No skills added yet. Type a skill above and press Enter.
        </p>
      )}
    </div>
  );
}
