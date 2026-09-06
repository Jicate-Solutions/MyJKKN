'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useApprovalFlows } from '@/hooks/hr/use-recruitment';

import { FlowEditor } from './flow-editor';

const LIST_PATH = '/hr/admin/recruitment-approval-flows';

export function EditFlowClient({ flowId }: { flowId: string }) {
  const router = useRouter();
  const { data: flows, isLoading, error } = useApprovalFlows();

  if (isLoading) {
    return (
      <Card className="mt-2">
        <CardContent className="p-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded bg-muted/50 animate-pulse" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const flow = (flows ?? []).find((f) => f.id === flowId) ?? null;
  if (error || !flow) {
    return (
      <div className="mt-2 space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error ? (error as Error).message : 'This workflow no longer exists — it may have been deleted.'}
          </AlertDescription>
        </Alert>
        <Button variant="outline" className="gap-1.5" onClick={() => router.push(LIST_PATH)}>
          <ArrowLeft className="h-4 w-4" />
          Back to all workflows
        </Button>
      </div>
    );
  }

  return <FlowEditor mode="edit" flow={flow} onDone={() => router.push(LIST_PATH)} />;
}
