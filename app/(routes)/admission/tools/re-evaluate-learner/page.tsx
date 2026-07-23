'use client';

import { useState } from 'react';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';

export default function ReEvaluateLearnerTool() {
  const [id, setId] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const supabase = createClientSupabaseClient();

  const run = async () => {
    if (pending) return;
    setPending(true);
    setErr(null);
    setResult(null);
    try {
      const { data, error } = await (supabase as any).rpc('evaluate_learner_status_after_payment', { p_learner_id: id });
      if (error) throw new Error(getErrorMessage(error));
      setResult(data);
    } catch (e) {
      setErr(getErrorMessage(e as Error));
    } finally {
      setPending(false);
    }
  };

  return (
    <PermissionGuard module="admission.settings.statuses" action="manage">
      <div className="container mx-auto py-6 max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Re-Evaluate Learner Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Manually trigger the threshold evaluator for a specific learner. Existing learners are grandfathered;
              use this to retroactively promote one when their paid percentage has crossed the threshold.
            </p>
            <div className="space-y-2">
              <Label htmlFor="learner-id">Learner ID (UUID)</Label>
              <Input id="learner-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
            </div>
            <Button onClick={run} disabled={pending || !id}>Run evaluator</Button>
            {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
            {result != null && (
              <pre className="rounded bg-muted p-3 text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>
            )}
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}
