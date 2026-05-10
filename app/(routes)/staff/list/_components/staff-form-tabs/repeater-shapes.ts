import type {
  BadgeItem, QualificationItem, SpecialisationItem, ExperienceEntryItem,
  ResearchFocusItem, PublicationItem, FundedProjectItem, CertificationItem,
  AwardItem, MembershipItem, PhdScholarItem, FaqItem, AchievementItem,
} from '@/types/staff';

export const defaults = {
  badge:           (): BadgeItem           => ({ label: '', color: '' }),
  qualification:   (): QualificationItem   => ({ degree: '', institution: '', year: '' }),
  specialisation:  (): SpecialisationItem  => ({ name: '' }),
  experienceEntry: (): ExperienceEntryItem => ({ role: '', organisation: '', from: '', to: '', description: '' }),
  researchFocus:   (): ResearchFocusItem   => ({ area: '', description: '' }),
  publication:     (): PublicationItem     => ({ title: '', journal: '', year: '', doi: '', url: '', type: '' }),
  fundedProject:   (): FundedProjectItem   => ({ title: '', agency: '', amount: '', year: '', status: '' }),
  certification:   (): CertificationItem   => ({ name: '', issuer: '', year: '', credential_url: '' }),
  award:           (): AwardItem           => ({ title: '', awarded_by: '', year: '', description: '' }),
  membership:      (): MembershipItem      => ({ body: '', role: '', since: '' }),
  phdScholar:      (): PhdScholarItem      => ({ name: '', topic: '', year: '', status: '' }),
  faq:             (): FaqItem             => ({ question: '', answer: '' }),
  achievement:     (): AchievementItem     => ({ title: '', description: '', date: '', featured: false, category: '' }),
};
