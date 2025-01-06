'use client';

import { use } from 'react';
import { StaffPlanDetailsPage } from '../_components/staff-plan-details';

interface StaffPlanPageProps {
  params: Promise<{ id: string }>;
}

export default function StaffPlanPage({ params }: StaffPlanPageProps) {
  const resolvedParams = use(params);
  return <StaffPlanDetailsPage id={resolvedParams.id} />;
}
