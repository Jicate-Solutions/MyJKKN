/**
 * Stakeholder NPS Module Layout
 * F005: Net Promoter Score Surveys
 *
 * Provides consistent layout wrapper for NPS pages
 */

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stakeholder NPS | MyJKKN',
  description: 'Net Promoter Score tracking for all stakeholder types',
};

export default function StakeholderNPSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
