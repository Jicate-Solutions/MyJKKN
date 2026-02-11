/**
 * Social Media Module Layout
 * UniSocial 360 — Phase 1: Social Media Monitoring Hub
 */

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Social Media | MyJKKN',
  description: 'Monitor and manage social media accounts across all departments',
};

export default function SocialMediaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
