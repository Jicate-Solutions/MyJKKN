'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { notFound } from 'next/navigation';
import { PolicyEditor } from '@/features/hr/policies/components/policy-editor';
import { getPolicyTableDef } from '@/features/hr/policies/registry';

/**
 * Universal route — ONE file handles all 19 policy tables.
 * URL: /hr/policies/[table]?org=<uuid>
 *
 * `org` query param is optional in Sprint 2 (super_admin can scope manually).
 * Sprint 3 will hydrate from useUserHRAccess hook.
 */
export default function HRPolicyTablePage() {
  const params = useParams();
  const search = useSearchParams();
  const table = typeof params.table === 'string' ? params.table : Array.isArray(params.table) ? params.table[0] : '';
  const orgFromQuery = search.get('org') ?? undefined;

  const def = getPolicyTableDef(table);
  if (!def) {
    notFound();
  }

  return <PolicyEditor def={def!} hrOrganizationId={orgFromQuery} />;
}
