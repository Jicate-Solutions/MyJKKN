import { Metadata } from 'next';
import { AdmissionLayoutClient } from './_layout-client';

export const metadata: Metadata = {
  title: {
    template: '%s | Admission',
    default: 'Admission',
  },
  description: 'JKKN Admission CRM - Lead management, WhatsApp chat, and enrollment',
};

interface AdmissionLayoutProps {
  children: React.ReactNode;
}

export default function AdmissionLayout({ children }: AdmissionLayoutProps) {
  return <AdmissionLayoutClient>{children}</AdmissionLayoutClient>;
}
