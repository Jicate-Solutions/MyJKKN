'use client'

import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Hammer, BookOpen, Video } from 'lucide-react'
import type { SolutionType } from '@/types/solutions'

interface SolutionTypeSelectorProps {
  value: SolutionType | null
  onChange: (type: SolutionType) => void
}

const solutionTypes: Array<{
  type: SolutionType
  title: string
  description: string
  icon: React.ElementType
  color: string
}> = [
  {
    type: 'software',
    title: 'Software Solution',
    description: 'Custom apps, AI tools, automation. Built by trained Appathon builders.',
    icon: Hammer,
    color: 'border-blue-500 bg-blue-50',
  },
  {
    type: 'training',
    title: 'Training Program',
    description: 'AI transformation programs, workshops. Delivered by AI Cohort members.',
    icon: BookOpen,
    color: 'border-green-500 bg-green-50',
  },
  {
    type: 'content',
    title: 'Content Production',
    description: 'Videos, graphics, presentations, writing. Created by production learners.',
    icon: Video,
    color: 'border-purple-500 bg-purple-50',
  },
]

export function SolutionTypeSelector({ value, onChange }: SolutionTypeSelectorProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {solutionTypes.map((item) => {
        const Icon = item.icon
        const isSelected = value === item.type

        return (
          <Card
            key={item.type}
            className={cn(
              'cursor-pointer transition-all hover:shadow-md',
              isSelected ? `border-2 ${item.color}` : 'border hover:border-muted-foreground/50'
            )}
            onClick={() => onChange(item.type)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Icon className={cn('h-5 w-5', isSelected && 'text-primary')} />
                <CardTitle className="text-lg">{item.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>{item.description}</CardDescription>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
