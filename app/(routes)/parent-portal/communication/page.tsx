import { Metadata } from 'next';
import { CommunicationClient } from './communication-client';

export const metadata: Metadata = {
  title: 'Messages | Parent Portal',
  description: 'View messages and announcements from the institution',
};

export default function CommunicationPage() {
  return <CommunicationClient />;
}
