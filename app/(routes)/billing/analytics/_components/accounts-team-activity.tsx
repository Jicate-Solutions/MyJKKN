'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserActivityLeaderboard } from './user-activity-leaderboard';
import { DailyActivityBreakdown } from './daily-activity-breakdown';
import type {
  BillingUserActivityRow,
  BillingDailyActivityRow,
} from '@/types/billing-analytics';

/**
 * "Accounts Team Activity" card. Hosts two views of the same date range:
 *  - Daily Breakdown — bills/receipts/collections per day, expandable to the
 *    institution-wise split (default tab).
 *  - By Team Member — the per-user leaderboard.
 */
export function AccountsTeamActivity({
  userActivity,
  userLoading,
  dailyActivity,
  dailyLoading,
}: {
  userActivity?: BillingUserActivityRow[];
  userLoading: boolean;
  dailyActivity?: BillingDailyActivityRow[];
  dailyLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>Accounts Team Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='daily'>
          <TabsList className='mb-3'>
            <TabsTrigger value='daily'>Daily Breakdown</TabsTrigger>
            <TabsTrigger value='members'>By Team Member</TabsTrigger>
          </TabsList>

          <TabsContent value='daily'>
            <p className='text-muted-foreground mb-2 text-xs'>
              Bills created, receipts generated and amount collected per day —
              expand a day for the institution-wise split.
            </p>
            <DailyActivityBreakdown data={dailyActivity} loading={dailyLoading} />
          </TabsContent>

          <TabsContent value='members'>
            <p className='text-muted-foreground mb-2 text-xs'>
              Actions logged and payments collected per user in the selected
              range.
            </p>
            <UserActivityLeaderboard data={userActivity} loading={userLoading} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
