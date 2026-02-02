import { Metadata } from 'next';
import { FeesClient } from '../_components/fees-client';

export const metadata: Metadata = {
  title: 'Fee Status | Parent Portal | MyJKKN',
  description: 'View and manage fee payments for your children',
};

export default function FeesPage() {
  return <FeesClient />;
}
