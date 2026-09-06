'use client';

// term-calendar-form.tsx
//
// The heart of Phase 3: one editable row per term, carrying the due date, the
// date a flat fine starts, and the fine amount.
//
// This screen comes FIRST in the build order for a reason — generation copies
// due_date and fine_effective_date onto every billing_student_bills row it
// creates. A year without a calendar produces bills that can never be chased
// or fined, and those bills are real financial records once written.

import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';

import {
  schoolTermCalendarFormSchema,
  type SchoolTermCalendarFormValues,
} from '@/lib/services/school-fees/school-fees-schemas';
import {
  DEFAULT_TERM_COUNT,
  MAX_TERM_NUMBER,
  termLabel,
  type SchoolTermCalendar,
} from '@/types/school-fees';

interface TermCalendarFormProps {
  institutionId: string;
  academicYearId: string;
  existing: SchoolTermCalendar[];
  saving: boolean;
  canEdit: boolean;
  onSave: (terms: SchoolTermCalendarFormValues['terms']) => Promise<unknown>;
}

/** A blank 3-term skeleton for a year that has no calendar yet. */
function blankTerms(): SchoolTermCalendarFormValues['terms'] {
  return Array.from({ length: DEFAULT_TERM_COUNT }, (_, i) => ({
    term_number: i + 1,
    term_name: termLabel(i + 1),
    due_date: '',
    fine_effective_date: null,
    fine_amount: 0,
  }));
}

function toFormValues(
  institutionId: string,
  academicYearId: string,
  existing: SchoolTermCalendar[],
): SchoolTermCalendarFormValues {
  return {
    institution_id: institutionId,
    academic_year_id: academicYearId,
    terms:
      existing.length > 0
        ? existing.map((t) => ({
            term_number: t.term_number,
            term_name: t.term_name,
            due_date: t.due_date,
            fine_effective_date: t.fine_effective_date,
            fine_amount: Number(t.fine_amount),
          }))
        : blankTerms(),
  };
}

export function TermCalendarForm({
  institutionId,
  academicYearId,
  existing,
  saving,
  canEdit,
  onSave,
}: TermCalendarFormProps) {
  const form = useForm<SchoolTermCalendarFormValues>({
    resolver: zodResolver(schoolTermCalendarFormSchema),
    defaultValues: toFormValues(institutionId, academicYearId, existing),
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'terms' });

  // Re-seed whenever the selection changes or a save/clone brings new rows
  // back. Without this the form keeps showing the previous year's dates after
  // the dropdown changes — the classic stale-defaultValues trap, since
  // defaultValues is only read on first render.
  useEffect(() => {
    form.reset(toFormValues(institutionId, academicYearId, existing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId, academicYearId, existing]);

  const submit = form.handleSubmit(async (values) => {
    await onSave(values.terms);
  });

  const nextTermNumber = Math.max(0, ...fields.map((_, i) => form.getValues(`terms.${i}.term_number`) ?? 0)) + 1;

  // Cross-row errors (duplicate term numbers, dates running backwards) are
  // raised by the schema against the `terms` array itself, so they have no
  // field to attach to and would otherwise render nowhere.
  const arrayError = form.formState.errors.terms?.message;

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-4">
        {arrayError ? (
          <Alert variant="destructive">
            <AlertDescription>{arrayError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Term</TableHead>
                <TableHead className="min-w-[140px]">Name</TableHead>
                <TableHead className="min-w-[160px]">Due date</TableHead>
                <TableHead className="min-w-[160px]">Fine starts</TableHead>
                <TableHead className="min-w-[120px]">Fine (₹)</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <FormField
                      control={form.control}
                      name={`terms.${index}.term_number`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">Term number</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={MAX_TERM_NUMBER}
                              disabled={!canEdit}
                              value={field.value ?? ''}
                              onChange={(e) =>
                                field.onChange(e.target.value === '' ? 0 : Number(e.target.value))
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TableCell>

                  <TableCell>
                    <FormField
                      control={form.control}
                      name={`terms.${index}.term_name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">Term name</FormLabel>
                          <FormControl>
                            <Input placeholder="Term I" disabled={!canEdit} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TableCell>

                  <TableCell>
                    <FormField
                      control={form.control}
                      name={`terms.${index}.due_date`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">Due date</FormLabel>
                          <FormControl>
                            <Input type="date" disabled={!canEdit} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TableCell>

                  <TableCell>
                    <FormField
                      control={form.control}
                      name={`terms.${index}.fine_effective_date`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">Fine effective date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              disabled={!canEdit}
                              value={field.value ?? ''}
                              // Empty means "no fine for this term" — store NULL
                              // rather than '', which would fail the date cast.
                              onChange={(e) => field.onChange(e.target.value || null)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TableCell>

                  <TableCell>
                    <FormField
                      control={form.control}
                      name={`terms.${index}.fine_amount`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">Fine amount</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              disabled={!canEdit}
                              value={field.value ?? 0}
                              onChange={(e) =>
                                field.onChange(e.target.value === '' ? 0 : Number(e.target.value))
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TableCell>

                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={!canEdit || fields.length <= 1}
                      onClick={() => remove(index)}
                      aria-label={`Remove term ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || fields.length >= MAX_TERM_NUMBER}
            onClick={() =>
              append({
                term_number: Math.min(nextTermNumber, MAX_TERM_NUMBER),
                term_name: termLabel(Math.min(nextTermNumber, MAX_TERM_NUMBER)),
                due_date: '',
                fine_effective_date: null,
                fine_amount: 0,
              })
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Add term
          </Button>

          <div className="flex-1" />

          <Button type="submit" disabled={!canEdit || saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? 'Saving…' : 'Save calendar'}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Leave <strong>Fine starts</strong> empty for a term that carries no late fine. The fine is
          a flat rupee amount applied once after that date — it is not the percentage-based late
          charge used for college and hostel bills.
        </p>
      </form>
    </Form>
  );
}
