'use client';

// /admission/counselors/team/rules — Tab 4: Assignment rules CRUD.
// Shell (ContentLayout + Breadcrumb + header + TeamNav) lives in ../layout.tsx.
//
// 2026-05-06 — Surfaced the institution picker for super-admin / global-admin
// roles so the "+ New Rule" button is reachable. Previously the page passed
// institutionId=undefined for admins, which the shared
// AssignmentRulesDataTable interprets as "no scope → hide create affordance"
// (defensive default). The picker scopes admins to one of their accessible
// institutions; the create button + form-dialog become available immediately.

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RulesTab } from '../_components/rules-tab';

export default function RulesPage() {
  const { profile } = useAuth();
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const isAdmin = isSuperAdmin || isAdmissionGlobalUser;

  const { institutions: accessibleInstitutions = [] } = useInstitutionsWithAccess({
    isActive: true,
  });

  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | undefined>(
    isAdmin ? undefined : profile?.institution_id ?? undefined
  );

  // Once accessibleInstitutions loads (it's an async hook), default the admin
  // picker to the first accessible institution. Skips if a value is already
  // set (admin manually picked one before the hook resolved).
  useEffect(() => {
    if (isAdmin && !selectedInstitutionId && accessibleInstitutions.length > 0) {
      setSelectedInstitutionId(accessibleInstitutions[0].id);
    }
  }, [isAdmin, selectedInstitutionId, accessibleInstitutions]);

  // Picker only renders for admins managing >1 institution. Single-institution
  // admins (and non-admins, who have one institution by definition) see the
  // tab content directly — no picker noise.
  const showPicker = isAdmin && accessibleInstitutions.length > 1;

  return (
    <div className="space-y-4">
      {showPicker && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
          <Label
            htmlFor="rules-institution-picker"
            className="shrink-0 text-sm font-medium"
          >
            Institution scope
          </Label>
          <Select
            value={selectedInstitutionId}
            onValueChange={setSelectedInstitutionId}
          >
            <SelectTrigger
              id="rules-institution-picker"
              className="h-9 w-full max-w-[320px] sm:w-[320px]"
            >
              <SelectValue placeholder="Select institution" />
            </SelectTrigger>
            <SelectContent>
              {accessibleInstitutions.map((inst: any) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Rules are scoped per institution. Switch to view or create rules at
            another college.
          </p>
        </div>
      )}
      <RulesTab institutionId={selectedInstitutionId} />
    </div>
  );
}
