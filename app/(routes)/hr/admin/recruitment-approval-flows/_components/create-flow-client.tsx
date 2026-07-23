'use client';

import { useRouter } from 'next/navigation';
import { FlowEditor } from './flow-editor';

const LIST_PATH = '/hr/admin/recruitment-approval-flows';

export function CreateFlowClient() {
  const router = useRouter();
  return <FlowEditor mode="create" flow={null} onDone={() => router.push(LIST_PATH)} />;
}
