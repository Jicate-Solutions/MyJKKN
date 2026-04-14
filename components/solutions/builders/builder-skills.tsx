'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { SHBuilderSkill } from '@/types/solutions'

interface BuilderSkillsProps {
  skills: SHBuilderSkill[]
  maxDisplay?: number
  showProficiency?: boolean
  className?: string
}

const proficiencyColors: Record<number, string> = {
  1: 'bg-slate-100 text-slate-700',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-indigo-100 text-indigo-700',
  4: 'bg-purple-100 text-purple-700',
  5: 'bg-emerald-100 text-emerald-700',
}

const proficiencyLabels: Record<number, string> = {
  1: 'Beginner',
  2: 'Basic',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
}

export function BuilderSkills({
  skills,
  maxDisplay = 5,
  showProficiency = true,
  className,
}: BuilderSkillsProps) {
  // Get latest version of each skill
  const latestSkills = skills.reduce((acc, skill) => {
    const existing = acc.find((s) => s.skill_name === skill.skill_name)
    if (!existing || existing.version < skill.version) {
      return [...acc.filter((s) => s.skill_name !== skill.skill_name), skill]
    }
    return acc
  }, [] as SHBuilderSkill[])

  // Sort by proficiency level (highest first)
  const sortedSkills = [...latestSkills].sort(
    (a, b) => (b.proficiency_level || 0) - (a.proficiency_level || 0)
  )

  const displaySkills = sortedSkills.slice(0, maxDisplay)
  const remainingCount = sortedSkills.length - maxDisplay

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {displaySkills.map((skill) => (
        <Badge
          key={skill.id}
          variant="outline"
          className={cn(
            'text-xs border-0',
            showProficiency && skill.proficiency_level
              ? proficiencyColors[skill.proficiency_level]
              : 'bg-muted'
          )}
          title={
            showProficiency && skill.proficiency_level
              ? `${skill.skill_name} - ${proficiencyLabels[skill.proficiency_level]}`
              : skill.skill_name
          }
        >
          {skill.skill_name}
          {showProficiency && skill.proficiency_level && (
            <span className="ml-1 opacity-60">L{skill.proficiency_level}</span>
          )}
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge variant="outline" className="text-xs bg-muted">
          +{remainingCount} more
        </Badge>
      )}
    </div>
  )
}

// Standalone skill level indicator
interface SkillLevelProps {
  level: number
  showLabel?: boolean
}

export function SkillLevel({ level, showLabel = false }: SkillLevelProps) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              'h-2 w-2 rounded-full',
              i <= level ? 'bg-primary' : 'bg-muted'
            )}
          />
        ))}
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground ml-1">
          {proficiencyLabels[level]}
        </span>
      )}
    </div>
  )
}

export { proficiencyColors, proficiencyLabels }
