import { Metadata } from 'next';
import { ParentDashboardClient } from '../_components/parent-dashboard';

export const metadata: Metadata = {
  title: 'Dashboard | Parent Portal | MyJKKN',
  description: 'Overview of your children\'s academic progress and activities',
};

export default function DashboardPage() {
  return <ParentDashboardClient />;
}
