'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CalendarIcon,
  Search,
  User,
  Building,
  RefreshCw,
  Plus,
  Trash2,
  FileText,
  Calculator,
  ShoppingCart,
  IndianRupee
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn, getErrorMessage } from '@/lib/utils';
import { format } from 'date-fns';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import {
  useSearchStudentsByQuery,
  useStudentForBilling
} from '@/hooks/billing/use-student-search';
import {
  useCreateStudentBill,
  useUpdateStudentBill
} from '@/hooks/billing/use-student-bills';
import { useAcademicYears } from '@/hooks/use-academic-years';
import {
  validatePlanLines,
  fetchInstalmentSplit
} from '@/lib/services/billing/instalments/instalment-plan-service';
import {
  writeBillInstalments,
  replaceBillInstalments,
  type BillInstalmentLine
} from '@/lib/services/billing/instalments/bill-instalment-writer';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  fetchFeeStructurePreview,
  type FeeStructurePreview
} from '@/lib/services/billing/instalments/fee-structure-preview';
import { BillInstalmentEditor } from './bill-instalment-editor';
import type { Institution } from '@/types/organizations';
import type { BillingCategory } from '@/types/billing';
import type {
  StudentBill,
  CreateStudentBillDto,
  StudentForBilling
} from '@/types/billing-schedule';

// One authored tranche. Percent-only and date-only by design: a manual bill
// takes no due_anchor/offset (it has a concrete date now) and no
// promotes_to_status_code (raising a bill must not move a learner up the
// lifecycle ladder — that stays with the reviewed fee structure).
const billInstalmentSchema = z.object({
  share_percent: z
    .number({ invalid_type_error: 'Share must be a number' })
    .gt(0, 'Share must be greater than 0')
    .max(100, 'Share cannot exceed 100'),
  due_date: z.string().min(1, 'Each instalment needs a due date')
});

// Schema for individual billing item
const billingItemSchema = z.object({
  item_category_id: z.string().min(1, 'Item category is required'),
  unit_amount: z.number().min(0, 'Unit amount must be positive'),
  tax_amount: z.number().min(0, 'Tax amount must be positive').default(0),
  /** Empty = a plain single-date bill, which is every bill's behaviour today. */
  instalments: z.array(billInstalmentSchema).default([])
});

// Main form schema with multiple billing items
const studentBillSchema = z.object({
  student_id: z.string().min(1, 'Student is required'),
  institution_id: z.string().min(1, 'Institution is required'),
  academic_year_id: z.string().min(1, 'Academic year is required'),
  due_date: z.date({ required_error: 'Due date is required' }),
  billing_items: z
    .array(billingItemSchema)
    .min(1, 'At least one billing item is required'),
  overall_remarks: z.string().optional(),
  is_recurring: z.boolean().default(false),
  recurrence_pattern: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
  number_of_recurrences: z.number().min(1).max(100).optional()
}).superRefine((data, ctx) => {
  // Run the SAME check the fee-structure editor saves against, so a split that
  // the engine would refuse is a form error here instead of a Postgres
  // exception (BL002 from the deferred sum trigger) after the bill row has
  // already been inserted.
  data.billing_items.forEach((item, index) => {
    const lines = item.instalments ?? [];
    if (lines.length === 0) return;

    const errors = validatePlanLines(
      lines.map((line, i) => ({
        sequence_no: i + 1,
        share_percent: line.share_percent,
        fixed_amount: null,
        due_date: line.due_date,
        due_offset_days: null
      }))
    );
    for (const message of errors) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['billing_items', index, 'instalments'],
        message
      });
    }
  });
});

type StudentBillFormData = z.infer<typeof studentBillSchema>;
type BillingItem = z.infer<typeof billingItemSchema>;

// ---------------------------------------------------------------------------
// Session-lifetime caches for the two catalogs this form loads on mount.
//
// Both are small, effectively-static tables (the college list and the active
// billing categories). On the /billing/schedule/new PAGE the form mounted once
// per visit and the cost was invisible; in the quick-bill popup it mounts once
// PER BILL, so raising ten bills meant ten institution fetches and ten
// category fetches before the clerk could type anything.
//
// The cached value is the PROMISE, not the resolved array — two dialogs
// opening in the same tick then share one in-flight request instead of racing.
// A rejection clears the slot so the next mount retries rather than caching
// the failure forever.
// ---------------------------------------------------------------------------
let institutionsCache: Promise<Institution[]> | null = null;
let billingCategoriesCache: Promise<BillingCategory[]> | null = null;

function fetchInstitutionsCached(): Promise<Institution[]> {
  if (!institutionsCache) {
    // College-only: the billing schedule bills entity_type='institution'.
    // Schools are billed through /billing/school-fees, which owns its own
    // plans, term calendar and generation run — listing them here would let
    // a clerk raise a college bill against a school learner.
    institutionsCache = OrganizationService.getInstitutionNames(
      true,
      undefined,
      'institution'
    ).then((rows) => rows as Institution[]);
    institutionsCache.catch(() => {
      institutionsCache = null;
    });
  }
  return institutionsCache;
}

function fetchBillingCategoriesCached(): Promise<BillingCategory[]> {
  if (!billingCategoriesCache) {
    billingCategoriesCache = BillingCategoryService.getActiveBillingCategories();
    billingCategoriesCache.catch(() => {
      billingCategoriesCache = null;
    });
  }
  return billingCategoriesCache;
}

interface StudentBillFormProps {
  bill?: StudentBill;
  preSelectedStudent?: StudentForBilling;
  /**
   * `createdBillIds` carries the rows that were just inserted, so a dialog host
   * can chain straight into collecting payment against them. Only populated on
   * CREATE — an edit has nothing newly billable to receipt, so hosts must not
   * pop a payment form after one.
   */
  onSuccess?: (createdBillIds?: string[]) => void;
  returnTo?: string;
  /**
   * Cancel handler. Defaults to router.back(), which is right on the
   * /billing/schedule/new PAGE but wrong inside a dialog — there it would
   * navigate the whole app away instead of closing the modal. Dialog hosts
   * pass their close function here.
   */
  onCancel?: () => void;
  /**
   * Hides the outer student summary card and the page-level heading padding.
   * Dialog hosts render their own compact student header, so repeating the
   * full card inside the modal wastes the little vertical space it has.
   */
  compact?: boolean;
}

export function StudentBillForm({
  bill,
  preSelectedStudent,
  onSuccess,
  returnTo,
  onCancel,
  compact = false,
}: StudentBillFormProps) {
  const router = useRouter();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [itemCategories, setItemCategories] = useState<BillingCategory[]>(
    []
  );
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);
  const [isLoadingItemCategories, setIsLoadingItemCategories] = useState(false);

  const createStudentBill = useCreateStudentBill();
  const updateStudentBill = useUpdateStudentBill();

  // Fetch complete student data when editing a bill
  const { data: completeStudentData } = useStudentForBilling(
    bill?.student_id || null
  );

  // Determine initial values based on pre-selected student or existing bill
  const getInitialValues = (): StudentBillFormData => {
    if (bill) {
      return {
        student_id: bill.student_id,
        institution_id: bill.institution_id,
        academic_year_id: bill.academic_year_id || '',
        due_date: bill.due_date ? new Date(bill.due_date) : new Date(),
        billing_items: [
          {
            item_category_id: bill.item_category_id || '',
            unit_amount: bill.unit_amount || 0,
            tax_amount: bill.tax_amount || 0,
            // Loaded from billing_bill_instalments by the effect below;
            // the bill row itself carries no schedule.
            instalments: []
          }
        ],
        overall_remarks: bill.remarks || '',
        is_recurring: bill.is_recurring || false,
        recurrence_pattern: bill.recurrence_pattern || undefined,
        number_of_recurrences: bill.number_of_recurrences || undefined
      };
    } else if (preSelectedStudent) {
      return {
        student_id: preSelectedStudent.id,
        institution_id: preSelectedStudent.institution_id,
        academic_year_id: preSelectedStudent.academic_year_id || '',
        due_date: new Date(),
        billing_items: [
          {
            item_category_id: '',
            unit_amount: 0,
            tax_amount: 0,
            instalments: []
          }
        ],
        overall_remarks: '',
        is_recurring: false,
        recurrence_pattern: undefined,
        number_of_recurrences: undefined
      };
    } else {
      return {
        student_id: '',
        institution_id: '',
        academic_year_id: '',
        due_date: new Date(),
        billing_items: [
          {
            item_category_id: '',
            unit_amount: 0,
            tax_amount: 0,
            instalments: []
          }
        ],
        overall_remarks: '',
        is_recurring: false,
        recurrence_pattern: undefined,
        number_of_recurrences: undefined
      };
    }
  };

  const form = useForm<StudentBillFormData>({
    resolver: zodResolver(studentBillSchema),
    defaultValues: getInitialValues()
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'billing_items'
  });

  // Whether the learner is fixed (edit mode, or pre-selected from the search
  // results / quick-bill popup) rather than picked in this form.
  const isStudentPreSelected = !!(
    bill?.student ||
    preSelectedStudent ||
    completeStudentData
  );

  // The student typeahead only renders when nothing is pre-selected — but it
  // used to FETCH regardless: the pre-select path writes the display string
  // ("Name (Roll)") into studentSearchQuery, which satisfied the hook's
  // `enabled` guard. That is one wasted learner search plus a
  // bulk_calculate_student_outstanding RPC on every mount of this form, i.e.
  // on every single bill raised from the popup. Feed it an empty string
  // instead so the query stays disabled.
  const { data: searchResults } = useSearchStudentsByQuery(
    isStudentPreSelected ? '' : studentSearchQuery,
    form.watch('institution_id'),
    10
  );

  const watchedValues = form.watch();

  const { data: academicYearsData } = useAcademicYears(
    watchedValues.institution_id || undefined
  );
  const academicYears = academicYearsData?.data || [];

  // ─── Payment schedules on a manually-raised bill ───────────────────────────
  //
  // Shares are taken of the ITEM's own amount + tax, not the grand total:
  // every billing item becomes its own bill row, and trg_bbi_validate_sum
  // checks the tranches against that row's final_amount.
  const itemFinalAmount = (index: number) => {
    const item = watchedValues.billing_items?.[index];
    return (item?.unit_amount || 0) + (item?.tax_amount || 0);
  };

  // Where an item's lines came from, per item index. Purely informational.
  const [scheduleSource, setScheduleSource] = useState<Record<number, string>>({});
  // Real splits offered by the learner's fee structure, per item index.
  //
  // INVARIANT: a key exists ONLY when there are >= 2 lines. Storing [] for
  // "no split" is what made the per-item button appear for every item — `!![]`
  // is true — and then do nothing when clicked. Keeping the empty case OUT of
  // the map means a truthiness test is correct too.
  const [structureSplitAvailable, setStructureSplitAvailable] = useState<
    Record<number, BillInstalmentLine[]>
  >({});

  // Editing the split of a bill that has already taken money would silently
  // change which tranches read as settled — allocation is derived from the
  // bill's paid position, oldest tranche first — and that in turn feeds the
  // promotion engine. A bill only stays schedulable while it is untouched.
  const scheduleLocked = !!bill && (bill.status !== 'unpaid' ||
    Number(bill.balance_amount ?? bill.final_amount) !== Number(bill.final_amount));

  /**
   * Turns stored rupee tranches back into the share percentages this editor
   * works in.
   *
   * The LAST share is the remainder, not its own rounded quotient. Rounding
   * each line independently is what a 30/35/35 or a thirds split does NOT
   * survive: 33.33 x 3 = 99.99, and validatePlanLines demands exactly 100, so
   * a freshly prefilled form would refuse to save the very schedule the fee
   * structure authored.
   */
  const sharesFromAmounts = (amounts: number[], total: number): number[] => {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const out: number[] = [];
    let used = 0;
    amounts.forEach((amount, i) => {
      if (i < amounts.length - 1) {
        const pct = round2((Number(amount) / total) * 100);
        out.push(pct);
        used += pct;
      } else {
        out.push(round2(100 - used));
      }
    });
    return out;
  };

  /**
   * Asks the engine what THIS learner's fee structure says about THIS category,
   * and returns the lines as share percentages of the given amount.
   *
   * Reuses fetchInstalmentSplit — the same guarded RPC the generation path
   * uses — rather than reading the structure tables directly, so the manual
   * form and the generator cannot resolve different schedules. It returns null
   * on any error or missing permission, which here simply means "no prefill".
   */
  const loadStructureSplit = async (
    studentId: string,
    categoryId: string,
    amount: number
  ): Promise<BillInstalmentLine[] | null> => {
    if (!studentId || !categoryId || !(amount > 0)) return null;
    const split = await fetchInstalmentSplit(
      createClientSupabaseClient(),
      studentId,
      categoryId,
      amount
    );
    // One row is an unsplit fee carrying only a due date — not a schedule.
    if (!split || split.length < 2) return null;

    // Back out the percentages the engine's rupees represent, so the operator
    // edits in the same unit the fee structure was authored in.
    const shares = sharesFromAmounts(
      split.map((row) => Number(row.instalment_amount)),
      amount
    );
    return split.map((row, i) => ({
      share_percent: shares[i],
      due_date: row.instalment_due_date
    }));
  };

  const applyFeeStructureSplit = (index: number) => {
    // Unreachable while the button is gated on length >= 2; kept as the
    // last line of defence so a future caller cannot reintroduce a no-op click.
    const lines = structureSplitAvailable[index];
    if (!lines || lines.length < 2) {
      toast.error('This fee item has no instalment schedule in the fee structure.');
      return;
    }
    form.setValue(`billing_items.${index}.instalments`, lines, {
      shouldDirty: true,
      shouldValidate: true
    });
    setScheduleSource((prev) => ({
      ...prev,
      [index]: "From this learner's fee structure"
    }));
  };

  // Signatures already probed, so a re-render does not re-hit the RPC and a
  // prefill cannot fight the operator's own edits.
  const probedRef = useRef<Record<number, string>>({});

  // A stable signature of the (category, amount) pairs on screen. Extracted
  // rather than inlined in the dependency array so the linter can check it.
  const scheduleProbeKey = JSON.stringify(
    (watchedValues.billing_items || []).map((i) => [
      i.item_category_id,
      i.unit_amount,
      i.tax_amount
    ])
  );

  // Prefill from the fee structure when learner + category + amount settle.
  // Only ever fills an item whose schedule is still EMPTY: once the operator
  // has touched the lines they own them, and a later re-probe must not
  // overwrite what they typed.
  useEffect(() => {
    if (scheduleLocked) return;
    const studentId = watchedValues.student_id;
    const items = watchedValues.billing_items || [];
    if (!studentId) return;

    let cancelled = false;

    items.forEach((item, index) => {
      const amount = (item.unit_amount || 0) + (item.tax_amount || 0);
      const signature = `${studentId}|${item.item_category_id}|${amount}`;
      if (!item.item_category_id || !(amount > 0)) return;
      if (probedRef.current[index] === signature) return;
      probedRef.current[index] = signature;

      // Same rule as the panel: a prefill that cannot be read leaves the item
      // exactly as the operator typed it rather than crashing the form.
      void loadStructureSplit(studentId, item.item_category_id, amount).catch(
        () => null
      ).then(
        (lines) => {
          if (cancelled) return;
          setStructureSplitAvailable((prev) => {
            const next = { ...prev };
            if (lines && lines.length >= 2) next[index] = lines;
            else delete next[index];
            return next;
          });
          if (!lines) return;

          const current = form.getValues(`billing_items.${index}.instalments`) ?? [];
          if (current.length > 0) return;

          form.setValue(`billing_items.${index}.instalments`, lines, {
            shouldDirty: false,
            shouldValidate: false
          });
          setScheduleSource((prev) => ({
            ...prev,
            [index]: "Prefilled from this learner's fee structure"
          }));
        }
      );
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues.student_id, scheduleProbeKey, scheduleLocked]);

  // Edit path: the bill row carries no schedule, so load its tranches and turn
  // them back into the share percentages this editor works in.
  useEffect(() => {
    if (!bill?.id) return;
    let cancelled = false;

    void (async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('billing_bill_instalments')
        .select('sequence_no, amount, due_date')
        .eq('bill_id', bill.id)
        .order('sequence_no', { ascending: true });

      // Supabase errors are plain objects. A schedule that cannot be read must
      // NOT silently render as "no schedule" and then be saved as a removal,
      // so bail out and leave the editor showing nothing to submit.
      if (error || cancelled || !data?.length) return;

      const total = Number(bill.final_amount) || 0;
      if (!(total > 0)) return;

      const rows = data as Array<{ amount: number; due_date: string }>;
      const shares = sharesFromAmounts(
        rows.map((row) => Number(row.amount)),
        total
      );
      form.setValue(
        'billing_items.0.instalments',
        rows.map((row, i) => ({
          share_percent: shares[i],
          due_date: row.due_date
        })),
        { shouldDirty: false, shouldValidate: false }
      );
      setScheduleSource((prev) => ({ ...prev, 0: 'Saved on this bill' }));
      // This bill already has a schedule; the prefill effect must not later
      // decide the item is empty and overwrite it.
      probedRef.current[0] = 'loaded-from-bill';
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill?.id]);

  // Calculate totals from all billing items
  const calculateTotals = () => {
    const items = watchedValues.billing_items || [];
    const subtotal = items.reduce((sum, item) => {
      return sum + item.unit_amount;
    }, 0);
    const totalTax = items.reduce((sum, item) => {
      return sum + (item.tax_amount || 0);
    }, 0);
    const finalAmount = subtotal + totalTax;

    return { subtotal, totalTax, finalAmount };
  };

  const { subtotal, totalTax, finalAmount } = calculateTotals();

  useEffect(() => {
    loadInstitutions();
  }, []);

  useEffect(() => {
    if (watchedValues.institution_id) {
      loadItemCategories(watchedValues.institution_id);
    } else {
      setItemCategories([]);
    }
  }, [watchedValues.institution_id]);

  // Reset form when bill changes (for edit mode)
  useEffect(() => {
    if (bill) {
      const formValues = {
        student_id: bill.student_id,
        institution_id: bill.institution_id,
        academic_year_id: bill.academic_year_id || '',
        due_date: bill.due_date ? new Date(bill.due_date) : new Date(),
        billing_items: [
          {
            item_category_id: bill.item_category_id || '',
            unit_amount: bill.unit_amount || 0,
            tax_amount: bill.tax_amount || 0,
            // Loaded from billing_bill_instalments by the effect below;
            // the bill row itself carries no schedule.
            instalments: []
          }
        ],
        overall_remarks: bill.remarks || '',
        is_recurring: bill.is_recurring || false,
        recurrence_pattern: bill.recurrence_pattern || undefined,
        number_of_recurrences: bill.number_of_recurrences || undefined
      };

      // Reset form with bill data
      form.reset(formValues);

      // Load item categories for the bill's institution
      if (bill.institution_id) {
        loadItemCategories(bill.institution_id);
      }

      // Use complete student data if available, otherwise fallback to bill.student
      const studentToUse = completeStudentData || bill.student;
      if (studentToUse) {
        setSelectedStudent(studentToUse);
        setStudentSearchQuery(
          `${
            [studentToUse.first_name, studentToUse.last_name]
              .filter(Boolean)
              .join(' ') || 'N/A'
          } (${studentToUse.roll_number || 'N/A'})`
        );
      }
    } else if (preSelectedStudent) {
      // Handle pre-selected student from query parameter
      const formValues = {
        student_id: preSelectedStudent.id,
        institution_id: preSelectedStudent.institution_id,
        academic_year_id: preSelectedStudent.academic_year_id || '',
        due_date: undefined,
        billing_items: [
          {
            item_category_id: '',
            unit_amount: 0,
            tax_amount: 0,
            instalments: []
          }
        ],
        overall_remarks: '',
        is_recurring: false,
        recurrence_pattern: undefined,
        number_of_recurrences: undefined
      };

      form.reset(formValues);
      setSelectedStudent(preSelectedStudent);
      setStudentSearchQuery(
        `${
          [preSelectedStudent.first_name, preSelectedStudent.last_name]
            .filter(Boolean)
            .join(' ') || 'N/A'
        } (${preSelectedStudent.roll_number || 'N/A'})`
      );
    }
  }, [bill, preSelectedStudent, form, completeStudentData]);

  const loadInstitutions = async () => {
    try {
      setIsLoadingInstitutions(true);
      setInstitutions(await fetchInstitutionsCached());
    } catch (error) {
      console.error('Error loading institutions:', error);
    } finally {
      setIsLoadingInstitutions(false);
    }
  };

  const loadItemCategories = async (_institutionId: string) => {
    try {
      setIsLoadingItemCategories(true);
      // 2026-04-28: Categories are now global; institution arg ignored.
      setItemCategories(await fetchBillingCategoriesCached());
    } catch (error) {
      console.error('Error loading billing categories:', error);
    } finally {
      setIsLoadingItemCategories(false);
    }
  };

  const handleStudentSelect = (student: any) => {
    setSelectedStudent(student);
    setStudentSearchQuery(
      `${
        [student.first_name, student.last_name].filter(Boolean).join(' ') ||
        'N/A'
      } (${student.roll_number || 'N/A'})`
    );
    form.setValue('student_id', student.id);
    if (student.academic_year_id) {
      form.setValue('academic_year_id', student.academic_year_id);
    }
  };

  const buildBillDto = (
    item: BillingItem,
    data: StudentBillFormData
  ): CreateStudentBillDto => {
    const selectedCategory = itemCategories.find(
      (cat) => cat.id === item.item_category_id
    );
    const defaultDescription = selectedCategory?.category_name || 'Billing Item';
    const taxAmount = item.tax_amount || 0;

    return {
      student_id: data.student_id,
      institution_id: data.institution_id,
      item_category_id: item.item_category_id,
      bill_description: defaultDescription,
      due_date: format(data.due_date, 'yyyy-MM-dd'),
      quantity: 1,
      unit_amount: item.unit_amount,
      tax_amount: taxAmount,
      total_amount: item.unit_amount,
      final_amount: item.unit_amount + taxAmount,
      remarks: data.overall_remarks,
      is_recurring: data.is_recurring,
      recurrence_pattern: data.recurrence_pattern,
      number_of_recurrences: data.number_of_recurrences,
      academic_year_id: data.academic_year_id || undefined,
    };
  };

  const onSubmit = async (data: StudentBillFormData) => {
    let createdCount = 0;
    try {
      if (bill) {
        await updateStudentBill.mutateAsync({
          id: bill.id,
          billData: buildBillDto(data.billing_items[0], data)
        });

        // Replace, not append: sequence_no is unique per bill and must stay
        // contiguous from 1. Skipped entirely once money has landed, since
        // the editor is read-only then and resubmitting the derived
        // percentages could re-round a schedule nobody asked to change.
        if (!scheduleLocked) {
          const item = data.billing_items[0];
          await replaceBillInstalments(
            createClientSupabaseClient(),
            bill.id,
            item.unit_amount + (item.tax_amount || 0),
            (item.instalments ?? []) as BillInstalmentLine[]
          );
        }

        if (onSuccess) {
          onSuccess();
        } else {
          router.push(returnTo || `/billing/schedule/students/${bill.student_id}`);
        }
        return;
      }

      // Ids of what was actually inserted, so the caller can offer to collect
      // payment on exactly these bills. Recurring bills contribute only their
      // parent row here — the future instalments are not yet collectable.
      const createdBillIds: string[] = [];
      for (const item of data.billing_items) {
        const created = await createStudentBill.mutateAsync(
          buildBillDto(item, data)
        );
        if (created?.id) createdBillIds.push(created.id);

        // The tranches need the bill's id, so they can only be written
        // after the insert resolves. An item with no lines writes nothing
        // and stays exactly the plain single-date bill it is today.
        const lines = (item.instalments ?? []) as BillInstalmentLine[];
        if (created?.id && lines.length > 0) {
          await writeBillInstalments(
            createClientSupabaseClient(),
            created.id,
            item.unit_amount + (item.tax_amount || 0),
            lines
          );
        }
        createdCount += 1;
      }

      if (onSuccess) {
        onSuccess(createdBillIds);
      } else if (returnTo) {
        router.push(returnTo);
      } else if (preSelectedStudent) {
        router.push(`/billing/schedule/students/${preSelectedStudent.id}`);
      } else {
        router.push('/billing/schedule');
      }
    } catch (error) {
      console.error('Error saving bill:', error);

      const action = bill ? 'update' : 'create';
      const total = data.billing_items.length;
      const progress =
        !bill && total > 1
          ? ` (${createdCount} of ${total} item${total > 1 ? 's' : ''} were created before the failure)`
          : '';

      alert(
        `Failed to ${action} bill${progress}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  };

  // ─── Load the whole fee structure into the form ───────────────────────────
  const [structurePreview, setStructurePreview] =
    useState<FeeStructurePreview | null>(null);
  const [loadingStructure, setLoadingStructure] = useState(false);

  const selectedStudentId = watchedValues.student_id;

  // Probe as soon as a learner is chosen, so the panel can say what WILL
  // happen (or why nothing can) before the operator commits to pressing it.
  useEffect(() => {
    if (bill || !selectedStudentId) {
      setStructurePreview(null);
      return;
    }
    let cancelled = false;
    setLoadingStructure(true);

    // The fee-structure panel is an ASSIST, never a prerequisite for raising
    // a bill. Anything that goes wrong reading it — a permission the operator
    // lacks, a network failure, a module that failed to load — must degrade to
    // "add the items by hand", not take the whole form down through the route
    // error boundary. An uncaught throw in an effect body does exactly that.
    void (async () => {
      try {
        const preview = await fetchFeeStructurePreview(
          createClientSupabaseClient() as never,
          selectedStudentId
        );
        if (cancelled) return;
        setStructurePreview(preview);
      } catch (err) {
        if (cancelled) return;
        setStructurePreview({
          items: [],
          isEmpty: true,
          error: getErrorMessage(err)
        });
      } finally {
        if (!cancelled) setLoadingStructure(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedStudentId, bill]);

  /**
   * Replaces the billing items with the learner's fee structure.
   *
   * REPLACES rather than appends: the form starts with one blank item, and
   * appending would leave that blank row to fail validation on save. Anything
   * the operator had already typed is theirs to re-add — which is why the
   * button says "Replace" once there is real content.
   *
   * Non-billable items (hostel/mess/transport) are deliberately dropped: those
   * bills belong to Campus Living and TMS, and raising them here would
   * double-bill the learner. The panel lists them so their absence is visible.
   */
  const applyFeeStructure = () => {
    const billable = (structurePreview?.items ?? []).filter((i) => i.is_billable);
    if (billable.length === 0) return;

    form.setValue(
      'billing_items',
      billable.map((item) => ({
        item_category_id: item.category_id,
        unit_amount: item.amount,
        tax_amount: 0,
        instalments: item.instalments
      })),
      { shouldDirty: true, shouldValidate: false }
    );

    // The earliest date the structure names becomes the bill-level due date;
    // scheduled items then have it overwritten per bill by the tranche sync
    // trigger anyway.
    const firstDue = billable
      .map((i) => i.instalments[0]?.due_date ?? i.due_date)
      .filter(Boolean)
      .sort()[0];
    if (firstDue) form.setValue('due_date', new Date(`${firstDue}T00:00:00`));

    // Everything below came from the structure, and the per-item prefill must
    // not later decide an item looks empty and re-probe over it.
    const sources: Record<number, string> = {};
    billable.forEach((item, i) => {
      probedRef.current[i] = 'loaded-from-structure';
      if (item.instalments.length > 0) sources[i] = 'From the fee structure';
    });
    setScheduleSource(sources);
    setStructureSplitAvailable(
      Object.fromEntries(
        billable
          .map((item, i) => [i, item.instalments] as const)
          .filter(([, lines]) => lines.length >= 2)
      )
    );
  };

  /**
   * The panel above the items list. Always explains itself — a button that
   * silently does nothing is the failure mode this replaces.
   *
   * A render FUNCTION, not a nested component: a component declared inside
   * render is a new type on every render, so React unmounts and remounts its
   * whole subtree each time the form state changes.
   */
  const renderFeeStructureLoader = () => {
    if (!selectedStudentId) return null;

    if (loadingStructure) {
      return (
        <div className='rounded-md border border-dashed p-3 text-xs text-muted-foreground'>
          Checking this learner&apos;s fee structure…
        </div>
      );
    }
    if (!structurePreview) return null;

    if (structurePreview.error) {
      return (
        <div className='rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100'>
          Could not read the fee structure: {structurePreview.error}
        </div>
      );
    }

    const billable = structurePreview.items.filter((i) => i.is_billable);
    const foreign = structurePreview.items.filter((i) => !i.is_billable);

    if (billable.length === 0) {
      return (
        <div className='rounded-md border border-dashed p-3 text-xs text-muted-foreground'>
          No fee structure matches this learner, so there is nothing to load.
          A structure is matched on admission year, quota and community together —
          the usual reason is that the learner&apos;s admission year has none configured.
          Check Admission → Settings → Fees Structure, or add the items by hand below.
        </div>
      );
    }

    const total = billable.reduce((sum, i) => sum + i.amount, 0);
    const hasContent = fields.length > 1 || !!watchedValues.billing_items?.[0]?.item_category_id;

    return (
      <div className='rounded-md border bg-muted/30'>
        <div className='flex flex-wrap items-center gap-2 border-b px-3 py-2'>
          <Calculator className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
          <span className='text-sm font-medium'>Fee structure</span>
          <Badge variant='secondary' className='font-normal'>
            {billable.length} item{billable.length > 1 ? 's' : ''} · ₹
            {total.toLocaleString('en-IN')}
          </Badge>
          <Button
            type='button'
            size='sm'
            className='ml-auto'
            onClick={applyFeeStructure}
          >
            {hasContent ? 'Replace items with fee structure' : 'Use fee structure'}
          </Button>
        </div>

        <ul className='divide-y text-xs'>
          {billable.map((item) => (
            <li key={item.category_id} className='flex flex-wrap items-center gap-2 px-3 py-1.5'>
              <span className='font-medium'>{item.category_name}</span>
              <span className='tabular-nums'>₹{item.amount.toLocaleString('en-IN')}</span>
              <span className='ml-auto text-muted-foreground'>
                {item.instalments.length > 1
                  ? `${item.instalments.length} instalments`
                  : item.due_date
                    ? `due ${item.due_date}`
                    : 'single payment'}
              </span>
            </li>
          ))}
        </ul>

        {foreign.length > 0 && (
          <p className='border-t px-3 py-1.5 text-[11px] text-muted-foreground'>
            Not added: {foreign.map((i) => i.category_name).join(', ')} — hostel,
            mess and transport are billed by their own modules.
          </p>
        )}
      </div>
    );
  };

  const addBillingItem = () => {
    append({
      item_category_id: '',
      unit_amount: 0,
      tax_amount: 0,
      instalments: []
    });
  };

  const removeBillingItem = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  const isLoading = createStudentBill.isPending || updateStudentBill.isPending;

  return (
    <div className='space-y-8'>
      {/* Student Information Header. Suppressed in compact (dialog) mode —
          the dialog already shows a one-line student header above the form. */}
      {selectedStudent && !compact && (
        <Card className='border-2 border-blue-200 dark:border-blue-800'>
          <CardHeader className='bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950'>
            <CardTitle className='flex items-center gap-3 text-xl'>
              <div className='p-2 bg-blue-100 dark:bg-blue-900 rounded-full'>
                <User className='h-6 w-6 text-blue-600 dark:text-blue-400' />
              </div>
              Student Information
              {isStudentPreSelected && (
                <Badge
                  variant='outline'
                  className='text-blue-700 border-blue-300 bg-blue-50'
                >
                  Pre-selected
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className='p-6'>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {/* Basic Information */}
              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Student Name
                </label>
                <p className='text-base font-semibold text-gray-900 dark:text-gray-100'>
                  {[selectedStudent.first_name, selectedStudent.last_name]
                    .filter(Boolean)
                    .join(' ') || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Roll Number
                </label>
                <p className='font-medium'>
                  {selectedStudent.roll_number || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Email
                </label>
                <p className='font-medium text-sm break-all'>
                  {selectedStudent.college_email || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Mobile
                </label>
                <p className='font-medium'>
                  {selectedStudent.mobile_number ||
                    selectedStudent.student_mobile ||
                    'N/A'}
                </p>
              </div>

              {/* Academic Information */}
              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Institution
                </label>
                <p className='font-medium'>
                  {selectedStudent.institution?.name || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Academic Year
                </label>
                <p className='font-medium'>
                  {selectedStudent.academic_year?.academic_year_name || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Degree
                </label>
                <p className='font-medium'>
                  {selectedStudent.degree?.degree_name || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Department
                </label>
                <p className='font-medium'>
                  {selectedStudent.department?.department_name || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Program
                </label>
                <p className='font-medium'>
                  {selectedStudent.program?.program_name || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Semester
                </label>
                <p className='font-medium'>
                  {selectedStudent.semester?.semester_name || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Section
                </label>
                <p className='font-medium'>
                  {selectedStudent.section?.section_name || 'N/A'}
                </p>
              </div>
            </div>

            <Separator className='my-4' />

            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-4'>
                <Badge
                  variant='outline'
                  className='text-orange-600 border-orange-300'
                >
                  Outstanding: ₹
                  {selectedStudent.outstanding_amount?.toLocaleString() || '0'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
          {/* Student Selection (only when not pre-selected) */}
          {!isStudentPreSelected && (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Search className='h-5 w-5' />
                  Select Student
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <FormField
                  control={form.control}
                  name='institution_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Institution</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedStudent(null);
                          setStudentSearchQuery('');
                          form.setValue('student_id', '');
                        }}
                        value={field.value}
                        disabled={isLoadingInstitutions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select institution' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {institutions.map((institution) => (
                            <SelectItem
                              key={institution.id}
                              value={institution.id}
                            >
                              {institution.name} ({institution.counselling_code}
                              )
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className='space-y-2'>
                  <FormLabel>Search Student</FormLabel>
                  <div className='relative'>
                    <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
                    <Input
                      placeholder='Search by name, roll number, mobile...'
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      className='pl-10'
                      disabled={!watchedValues.institution_id}
                    />
                  </div>

                  {searchResults &&
                    searchResults.length > 0 &&
                    studentSearchQuery && (
                      <div className='border rounded-md max-h-48 overflow-y-auto'>
                        {searchResults.map((student) => (
                          <div
                            key={student.id}
                            className='p-3 hover:bg-muted cursor-pointer border-b last:border-b-0'
                            onClick={() => handleStudentSelect(student)}
                          >
                            <div className='font-medium'>
                              {`${student.first_name} ${student.last_name}`}
                            </div>
                            <div className='text-sm text-muted-foreground'>
                              {student.institution?.name || 'N/A'}
                            </div>
                            <div className='text-sm text-muted-foreground'>
                              {student.roll_number} • Outstanding: ₹
                              {student.outstanding_amount}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Hidden form fields for pre-selected student */}
          {isStudentPreSelected && (
            <>
              <FormField
                control={form.control}
                name='institution_id'
                render={({ field }) => (
                  <FormItem className='hidden'>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='student_id'
                render={({ field }) => (
                  <FormItem className='hidden'>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </>
          )}

          {/* Bill Information */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <FileText className='h-5 w-5' />
                Bill Information
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <FormField
                control={form.control}
                name='academic_year_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Academic Year *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!watchedValues.institution_id}
                    >
                      <FormControl>
                        <SelectTrigger className='w-full max-w-sm'>
                          <SelectValue
                            placeholder={
                              !watchedValues.institution_id
                                ? 'Select a student/institution first'
                                : 'Select academic year'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {academicYears.map((ay: any) => (
                          <SelectItem key={ay.id} value={ay.id}>
                            {ay.academic_year_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Which academic year this bill is for. Defaults to the
                      student&apos;s current year — change it to bill a future year.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='due_date'
                render={({ field }) => (
                  <FormItem className='flex flex-col'>
                    <FormLabel>Due Date *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant='outline'
                            className={cn(
                              'w-full max-w-sm pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a due date</span>
                            )}
                            <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className='w-auto p-0' align='start'>
                        <Calendar
                          mode='single'
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Billing Items Table */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <ShoppingCart className='h-5 w-5' />
                  Billing Items
                </div>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={addBillingItem}
                  className='flex items-center gap-2'
                >
                  <Plus className='h-4 w-4' />
                  Add Item
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-6'>
                {/* Sits BEFORE the items: the usual act is "bill this learner
                    what their structure says", and picking each category by
                    hand first (then discovering the amount) is the slow path. */}
                {!bill && renderFeeStructureLoader()}

                {fields.map((field, index) => (
                  <Card key={field.id} className='border-l-4 border-l-blue-500'>
                    <CardHeader className='pb-3'>
                      <CardTitle className='flex items-center justify-between text-base'>
                        <span>Item #{index + 1}</span>
                        {fields.length > 1 && (
                          <Button
                            type='button'
                            variant='ghost'
                            size='sm'
                            onClick={() => removeBillingItem(index)}
                            className='text-red-600 hover:text-red-700 hover:bg-red-50'
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                      <FormField
                        control={form.control}
                        name={`billing_items.${index}.item_category_id`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Billing Category *</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={
                                !watchedValues.institution_id ||
                                isLoadingItemCategories
                              }
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder='Select category' />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {itemCategories.map((category) => (
                                  <SelectItem
                                    key={category.id}
                                    value={category.id}
                                  >
                                    {category.category_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`billing_items.${index}.unit_amount`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Billing Amount (₹) *</FormLabel>
                            <FormControl>
                              <Input
                                type='number'
                                min='0'
                                step='0.01'
                                placeholder='0.00'
                                {...field}
                                value={field.value?.toString() || ''}
                                onChange={(e) =>
                                  field.onChange(
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                onWheel={(e) => e.currentTarget.blur()}
                                className='[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Item Total Display */}
                      <div className='p-3 bg-gray-50 dark:bg-gray-800 rounded-lg'>
                        <div className='flex justify-between items-center text-sm'>
                          <span>Item Total:</span>
                          <span className='font-medium'>
                            ₹
                            {(
                              watchedValues.billing_items?.[index]?.unit_amount || 0
                            ).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Payment schedule. Shares are taken of the item's own
                          amount + tax — the final_amount its bill row will carry —
                          not of the grand total, because each item becomes its own
                          bill and the sum invariant is enforced per bill. */}
                      <FormField
                        control={form.control}
                        name={`billing_items.${index}.instalments`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <BillInstalmentEditor
                                amount={itemFinalAmount(index)}
                                value={(field.value ?? []) as BillInstalmentLine[]}
                                onChange={field.onChange}
                                readOnly={scheduleLocked}
                                sourceNote={scheduleSource[index] ?? null}
                                canApplyFeeStructure={
                                  // .length >= 2, NOT truthiness: an empty array is
                                  // truthy, so `!![]` showed this button for every item
                                  // that had NO split and the click then returned early —
                                  // a button that visibly did nothing.
                                  (structureSplitAvailable[index]?.length ?? 0) >= 2 &&
                                  !scheduleLocked
                                }
                                onApplyFeeStructure={() => applyFeeStructureSplit(index)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                ))}

                {/* Grand Total Summary */}
                <Card className='bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950 dark:to-blue-950 border-2 border-green-200 dark:border-green-800'>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2 text-green-800 dark:text-green-200'>
                      <Calculator className='h-5 w-5' />
                      Bill Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-3'>
                      <div className='flex justify-between text-sm'>
                        <span>Subtotal:</span>
                        <span className='font-medium'>
                          ₹{subtotal.toFixed(2)}
                        </span>
                      </div>
                      <Separator />
                      <div className='flex justify-between text-lg font-bold text-green-700 dark:text-green-300'>
                        <span>Final Amount:</span>
                        <span>₹{finalAmount.toFixed(2)}</span>
                      </div>
                      <div className='text-xs text-muted-foreground text-center'>
                        Total for {fields.length} item
                        {fields.length > 1 ? 's' : ''}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* Additional Settings */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {/* Recurring Settings */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <RefreshCw className='h-5 w-5' />
                  Recurring Settings
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <FormField
                  control={form.control}
                  name='is_recurring'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-start space-x-3 space-y-0'>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className='space-y-1 leading-none'>
                        <FormLabel>Make this a recurring bill</FormLabel>
                        <FormDescription>
                          Automatically create future bills based on the
                          recurrence pattern
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                {watchedValues.is_recurring && (
                  <>
                    <FormField
                      control={form.control}
                      name='recurrence_pattern'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Recurrence Pattern</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder='Select pattern' />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value='monthly'>Monthly</SelectItem>
                              <SelectItem value='quarterly'>
                                Quarterly
                              </SelectItem>
                              <SelectItem value='yearly'>Yearly</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='number_of_recurrences'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Number of Recurrences</FormLabel>
                          <FormControl>
                            <Input
                              type='number'
                              min='1'
                              max='100'
                              placeholder='e.g., 12 for 12 months'
                              {...field}
                              onChange={(e) =>
                                field.onChange(
                                  parseInt(e.target.value) || undefined
                                )
                              }
                              onWheel={(e) => e.currentTarget.blur()}
                              className='[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
                            />
                          </FormControl>
                          <FormDescription>
                            Total number of bills to create (including this one)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Overall Remarks */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <FileText className='h-5 w-5' />
                  Additional Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name='overall_remarks'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Overall Remarks</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='Any additional notes or remarks for the entire bill'
                          rows={4}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        These remarks will apply to the entire bill
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          {/* Form Actions */}
          <Card className='border-t-4 border-t-blue-500'>
            <CardContent className='pt-6'>
              <div className='flex flex-col sm:flex-row justify-end gap-4'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => (onCancel ? onCancel() : router.back())}
                  disabled={isLoading}
                  className='w-full sm:w-auto'
                >
                  Cancel
                </Button>
                <Button
                  type='submit'
                  disabled={isLoading || fields.length === 0}
                  className='w-full sm:w-auto min-w-[200px]'
                >
                  {isLoading ? (
                    <div className='flex items-center gap-2'>
                      <RefreshCw className='h-4 w-4 animate-spin' />
                      {bill ? 'Updating Bill...' : 'Creating Bill...'}
                    </div>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <IndianRupee className='h-4 w-4' />
                      {bill
                        ? 'Update Bill'
                        : `Create Bill (₹${finalAmount.toFixed(2)})`}
                    </div>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}
