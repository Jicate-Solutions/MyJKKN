import type { ProgressionLevelNumber } from '@/types/startup-studio'

export const PROGRESSION_LEVELS = [
  {
    level: 1 as ProgressionLevelNumber,
    name: 'App Builder',
    test: 'Working app deployed and presented at Demo Day',
    auto_criteria: { app_live: true, presented: true },
    stage: 'Appathon',
    identity: 'I can find a problem and direct AI to build a solution.',
    color: 'blue' as const,
  },
  {
    level: 2 as ProgressionLevelNumber,
    name: 'Traction Builder',
    test: '25+ active users, at least 5 organic (not teammates or friends)',
    auto_criteria: { verified_active_users: 25 },
    stage: 'Solve for 100 — Traction Sprint (Weeks 1-4)',
    identity: 'Real people outside my circle use this and come back.',
    color: 'green' as const,
  },
  {
    level: 3 as ProgressionLevelNumber,
    name: 'Solution Architect',
    test: '100 active users and at least one automated workflow',
    auto_criteria: { verified_active_users: 100, has_automation: true },
    stage: 'Solve for 100 — Scale Phase (Months 2-5)',
    identity: 'I designed systems so it works without me doing each task.',
    color: 'yellow' as const,
  },
  {
    level: 4 as ProgressionLevelNumber,
    name: 'AI Orchestrator',
    test: 'Positive unit economics — revenue covers costs, growth engine running',
    auto_criteria: { positive_unit_economics: true },
    stage: 'Solve for 100 — Business Phase (Months 6-10)',
    identity: 'Revenue covers costs, growth engine runs without me.',
    color: 'orange' as const,
  },
  {
    level: 5 as ProgressionLevelNumber,
    name: 'AI Principal',
    test: 'Multiple ventures OR institutional impact beyond single product',
    auto_criteria: null,
    stage: 'NIF Incubation / Beyond',
    identity: 'I decide what value should exist and make it happen.',
    color: 'purple' as const,
  },
] as const

export type ProgressionLevelConfig = (typeof PROGRESSION_LEVELS)[number]

export function getProgressionLevel(level: ProgressionLevelNumber): ProgressionLevelConfig | undefined {
  return PROGRESSION_LEVELS.find(p => p.level === level)
}
