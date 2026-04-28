'use client';

/**
 * Tab 7 - Test Sandbox (placeholder stub).
 *
 * Wave 4 implementation: inputs for page + role + state JSON, "Resolve"
 * button hits the resolver in dry-run mode, renders the resulting
 * AttentionBar with the full per-layer trace timeline.
 *
 * Tab 3 (rules editor) deep-links here via ?tab=sandbox&page=...&role=...
 * once Wave 4 lands.
 *
 * This stub exists so attention-bar-admin-client.tsx compiles after Wave 3
 * which only ships Tabs 3 and 5.
 */

import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FlaskConical } from 'lucide-react';

export function TabSandbox() {
  const searchParams = useSearchParams();
  const page = searchParams.get('page');
  const role = searchParams.get('role');
  const ruleId = searchParams.get('rule_id');

  const hasContext = !!(page || role || ruleId);

  return (
    <div className='space-y-6 py-4'>
      <h3 className='text-lg font-semibold flex items-center gap-2'>
        <FlaskConical className='h-5 w-5 text-pink-500' />
        Test Sandbox
      </h3>

      {hasContext && (
        <Card className='border-dashed'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm'>Pre-loaded context</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='flex flex-wrap gap-2 text-sm'>
              {page && (
                <Badge variant='secondary' className='font-mono'>
                  page = {page}
                </Badge>
              )}
              {role && (
                <Badge variant='secondary' className='font-mono'>
                  role = {role}
                </Badge>
              )}
              {ruleId && (
                <Badge variant='secondary' className='font-mono'>
                  rule_id = {ruleId.slice(0, 8)}…
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Coming in Wave 4</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground'>
            This tab will let admins resolve the bar dry-run for any{' '}
            <code>page × role × state</code> combination and see the full
            5-layer trace timeline. Editor &quot;Test in sandbox&quot; buttons
            already pass context here via querystring.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
