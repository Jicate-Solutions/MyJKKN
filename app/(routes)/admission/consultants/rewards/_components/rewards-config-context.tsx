'use client';

import { createContext, useContext } from 'react';
import type { ReferralRewardConfig } from '@/types/education-consultants';

interface RewardsConfigActionsContextValue {
  onEdit: (config: ReferralRewardConfig) => void;
}

const RewardsConfigActionsContext =
  createContext<RewardsConfigActionsContextValue | null>(null);

export function RewardsConfigActionsProvider({
  children,
  onEdit,
}: {
  children: React.ReactNode;
  onEdit: (config: ReferralRewardConfig) => void;
}) {
  return (
    <RewardsConfigActionsContext.Provider value={{ onEdit }}>
      {children}
    </RewardsConfigActionsContext.Provider>
  );
}

export function useRewardsConfigActions() {
  const context = useContext(RewardsConfigActionsContext);
  if (!context) {
    throw new Error(
      'useRewardsConfigActions must be used within a RewardsConfigActionsProvider'
    );
  }
  return context;
}
