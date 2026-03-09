import type { TrackId } from '@/types/startup-studio'

export const TRACKS = [
  {
    id: 'solve_for_100' as TrackId,
    label: 'Solve for 100',
    sublabel: 'Startup Track',
    description: 'Grow this app into a business serving 100 paying users over the next 10 months.',
    icon: 'Rocket',
    color: 'green' as const,
    benefits: [
      '₹1,00,000 NIF Startup Credits',
      'Dedicated mentor',
      '100% internal assessment marks',
      'Exclusive industry visits',
    ],
    eligibility: 'Any team. Top 5 per college get automatic entry. Others apply with a 30-day plan.',
    requiresCaseStudy: false,
  },
  {
    id: 'jicate_solutions' as TrackId,
    label: 'JICATE Solutions',
    sublabel: 'Campus Track',
    description: 'Your solution is useful for JKKN or other institutions. JICATE will partner with you to develop and deploy it.',
    icon: 'Building2',
    color: 'blue' as const,
    benefits: [
      'JICATE development support',
      'Solution deployed across JKKN campuses',
      '60/40 revenue share if sold to other institutions',
      'Portfolio credit for placements',
    ],
    eligibility: 'Any team whose solution addresses a campus or institutional problem.',
    requiresCaseStudy: true,
  },
  {
    id: 'solve_for_industry' as TrackId,
    label: 'Solve for Industry',
    sublabel: 'Industry Track',
    description: "Your solution solves a problem that businesses outside JKKN would pay for. We'll package it as a case study and find industry partners.",
    icon: 'Briefcase',
    color: 'purple' as const,
    benefits: [
      'Solution packaged as industry case study',
      'JICATE connects you with industry partners',
      'Revenue share on industry contracts',
      'Real-world portfolio for placements',
    ],
    eligibility: 'Any team whose solution has applicability outside education or campus.',
    requiresCaseStudy: true,
  },
  {
    id: 'completed' as TrackId,
    label: 'Completed',
    sublabel: 'Exit',
    description: "You're done with the Appathon. You'll receive your participation certificate.",
    icon: 'CheckCircle',
    color: 'gray' as const,
    benefits: [
      'Digital participation certificate via MyJKKN',
      'Appathon experience on your profile',
    ],
    eligibility: 'Everyone.',
    requiresCaseStudy: false,
  },
] as const

export type TrackConfig = (typeof TRACKS)[number]

export function getTrack(id: TrackId): TrackConfig | undefined {
  return TRACKS.find(t => t.id === id)
}

export function trackRequiresCaseStudy(id: TrackId): boolean {
  return TRACKS.find(t => t.id === id)?.requiresCaseStudy ?? false
}
