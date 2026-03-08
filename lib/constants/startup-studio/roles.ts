// lib/constants/startup-studio/roles.ts
// The 6 predefined roles for Appathon Role Cards

export const APPATHON_ROLES = [
  {
    id: 'problem_finder',
    label: 'Problem Finder',
    description: 'Found the problem worth solving, talked to users',
  },
  {
    id: 'prompt_architect',
    label: 'Prompt Architect',
    description: 'Built the app in Lovable through AI prompting',
  },
  {
    id: 'design_shaper',
    label: 'Design Shaper',
    description: 'Shaped UI/UX, visual quality, user experience',
  },
  {
    id: 'user_getter',
    label: 'User Getter',
    description: 'Marketed the app, got people to sign up and use it',
  },
  {
    id: 'deal_closer',
    label: 'Deal Closer',
    description: 'Got someone to pay, handled pricing/payments',
  },
  {
    id: 'team_captain',
    label: 'Team Captain',
    description: 'Coordinated the team, managed time, kept things on track',
  },
] as const;

export type AppathonRoleId = (typeof APPATHON_ROLES)[number]['id'];
