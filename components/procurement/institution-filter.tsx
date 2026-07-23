'use client';

import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  value: string | undefined;
  onChange: (institutionId: string) => void;
  label?: string | null;
  hint?: string;
  className?: string;
}

/**
 * Institution scope selector for Procurement (PR form + list filters). Renders ONLY
 * when the user can actually choose — i.e. has access to more than one institution
 * (super admins / multi-institution grants). Single-institution users see nothing
 * (their institution is implicit), so it never adds noise for the common case.
 *
 * This is a UX convenience, not a security boundary: procurement RLS still scopes every
 * row to the user's institution(s) server-side. The selector just narrows what a
 * multi-institution user is currently viewing or raising a request against.
 */
export function InstitutionFilter({ value, onChange, label = 'Institution', hint, className }: Props) {
  const { institutions, canAccessAllInstitutions, loading } = useUserInstitutionAccess();

  if (loading) return null;
  const multi = canAccessAllInstitutions || institutions.length > 1;
  if (!multi || institutions.length === 0) return null;

  return (
    <div className={className ?? 'space-y-2'}>
      {label && <Label>{label}</Label>}
      <Select value={value} onValueChange={(v) => onChange(v)}>
        <SelectTrigger>
          <SelectValue placeholder="Select institution" />
        </SelectTrigger>
        <SelectContent>
          {institutions.map((inst) => (
            <SelectItem key={inst.institution_id} value={inst.institution_id}>
              {inst.institution_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
