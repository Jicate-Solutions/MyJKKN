'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useClinicalSites, useGrantClinicalEligibility, istToday } from '@/hooks/hr/use-clinical-duty';
import { useDepartmentsWithStaff } from '@/hooks/hr/use-leave-assignments';
import { StaffPicker } from '@/app/(routes)/hr/admin/leave-types/_components/staff-picker';
import type { StaffPickerOption } from '@/types/hr-leave-assignments';
import type { InstitutionOption } from './shared';

const schema = z
  .object({
    scopeType: z.enum(['staff', 'department', 'institution']),
    institutionId: z.string().min(1, 'Select an institution'),
    employeeId: z.string().nullable(),
    departmentId: z.string().nullable(),
    validFrom: z.string().min(1, 'Start date is required'),
    validUntil: z.string().nullable(),
    siteIds: z.array(z.string()),
    reason: z.string().max(500),
  })
  .superRefine((v, ctx) => {
    if (v.scopeType === 'staff' && !v.employeeId) {
      ctx.addIssue({ code: 'custom', path: ['employeeId'], message: 'Select a staff member' });
    }
    if (v.scopeType === 'department' && !v.departmentId) {
      ctx.addIssue({ code: 'custom', path: ['departmentId'], message: 'Select a department' });
    }
    if (v.validUntil && v.validUntil < v.validFrom) {
      ctx.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message: 'End date cannot be before the start date',
      });
    }
  });

type Values = z.infer<typeof schema>;

const emptyValues = (): Values => ({
  scopeType: 'staff',
  institutionId: '',
  employeeId: null,
  departmentId: null,
  validFrom: istToday(),
  validUntil: null,
  siteIds: [],
  reason: '',
});

export function GrantTab({ institutions }: { institutions: InstitutionOption[] }) {
  const [staff, setStaff] = useState<StaffPickerOption[]>([]);
  const grant = useGrantClinicalEligibility();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues(),
  });

  const scopeType = form.watch('scopeType');
  const institutionId = form.watch('institutionId');
  const siteIds = form.watch('siteIds');

  const { data: departments = [], isLoading: deptLoading } = useDepartmentsWithStaff(
    scopeType === 'department' && institutionId ? institutionId : undefined
  );
  const { data: allSites = [] } = useClinicalSites(institutionId || undefined, Boolean(institutionId));
  const sites = allSites.filter((s) => s.is_active);

  const onSubmit = (v: Values) => {
    grant.mutate(
      {
        scopeType: v.scopeType,
        institutionId: v.institutionId,
        employeeId: v.scopeType === 'staff' ? v.employeeId : null,
        departmentId: v.scopeType === 'department' ? v.departmentId : null,
        validFrom: v.validFrom,
        validUntil: v.validUntil || null,
        siteIds: v.siteIds.length > 0 ? v.siteIds : null,
        reason: v.reason.trim() || null,
      },
      {
        onSuccess: () => {
          form.reset(emptyValues());
          setStaff([]);
        },
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-5">
        <FormField
          control={form.control}
          name="scopeType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Who is covered</FormLabel>
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  form.setValue('employeeId', null);
                  form.setValue('departmentId', null);
                  setStaff([]);
                }}
              >
                <FormControl>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="staff">Individual staff</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="institution">Whole institution</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="institutionId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Institution <span className="text-red-500">*</span></FormLabel>
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  form.setValue('employeeId', null);
                  form.setValue('departmentId', null);
                  form.setValue('siteIds', []);
                  setStaff([]);
                }}
              >
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Select institution" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {scopeType === 'staff' && institutionId && (
          <FormField
            control={form.control}
            name="employeeId"
            render={() => (
              <FormItem>
                <FormLabel>Staff member <span className="text-red-500">*</span></FormLabel>
                <StaffPicker
                  institutionId={institutionId}
                  selected={staff}
                  onChange={(next) => {
                    const last = next.slice(-1);
                    setStaff(last);
                    form.setValue('employeeId', last[0]?.id ?? null, { shouldValidate: true });
                  }}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {scopeType === 'department' && institutionId && (
          <FormField
            control={form.control}
            name="departmentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department <span className="text-red-500">*</span></FormLabel>
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={deptLoading ? 'Loading…' : 'Select department'} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} ({d.staff_count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="validFrom"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valid from <span className="text-red-500">*</span></FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="validUntil"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valid until</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value || null)}
                  />
                </FormControl>
                <FormDescription>Leave empty for no end date.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {institutionId && (
          <div className="space-y-2">
            <FormLabel>Duty sites</FormLabel>
            {sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This institution has no active duty sites yet. Add one in the Duty sites tab.
              </p>
            ) : (
              <div className="space-y-2 rounded-md border p-3">
                {sites.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={siteIds.includes(s.id)}
                      onCheckedChange={(c) =>
                        form.setValue(
                          'siteIds',
                          c ? [...siteIds, s.id] : siteIds.filter((id) => id !== s.id)
                        )
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {siteIds.length === 0
                ? 'No site selected: covers every active site of the institution.'
                : `${siteIds.length} site${siteIds.length === 1 ? '' : 's'} selected.`}
            </p>
          </div>
        )}

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reason</FormLabel>
              <FormControl><Textarea rows={3} maxLength={500} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={grant.isPending}>
          {grant.isPending ? 'Granting…' : 'Grant eligibility'}
        </Button>
      </form>
    </Form>
  );
}
