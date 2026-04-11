'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useLogSF100PaidUser } from '@/hooks/startup-studio';

// ── Schema ────────────────────────────────────────────────────────────────────

const paidUserSchema = z.object({
  user_identifier: z.string().min(1, 'User identifier is required.'),
  user_name: z.string().optional(),
  is_internal: z.boolean().default(false),
  amount: z.coerce
    .number({ invalid_type_error: 'Amount must be a number.' })
    .min(50, 'Minimum amount is ₹50.'),
  payment_gateway: z.enum([
    'razorpay_jicate',
    'razorpay_custom',
    'upi',
    'stripe',
    'cash',
    'other',
  ]),
  transaction_id: z.string().optional(),
  transaction_date: z.string().optional(),
  is_recurring: z.boolean().default(false),
  proof_url: z.string().url('Must be a valid URL.').optional().or(z.literal('')),
  proof_description: z.string().optional(),
});

type PaidUserFormValues = z.infer<typeof paidUserSchema>;

const GATEWAY_OPTIONS = [
  { value: 'razorpay_jicate', label: 'Razorpay (JICATE)' },
  { value: 'razorpay_custom', label: 'Razorpay (Custom)' },
  { value: 'upi', label: 'UPI' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

// ── Form Content ──────────────────────────────────────────────────────────────

function PaidUserFormContent({
  enrollmentId,
  onSuccess,
}: {
  enrollmentId: string;
  onSuccess: () => void;
}) {
  const { mutate: logPaidUser, isPending } = useLogSF100PaidUser(enrollmentId);

  const form = useForm<PaidUserFormValues>({
    resolver: zodResolver(paidUserSchema),
    defaultValues: {
      user_identifier: '',
      user_name: '',
      is_internal: false,
      amount: undefined as any,
      payment_gateway: 'razorpay_jicate',
      transaction_id: '',
      transaction_date: '',
      is_recurring: false,
      proof_url: '',
      proof_description: '',
    },
  });

  const isInternal = form.watch('is_internal');

  const onSubmit = (values: PaidUserFormValues) => {
    // Clean empty optional strings
    const payload = {
      ...values,
      transaction_id: values.transaction_id || undefined,
      transaction_date: values.transaction_date || undefined,
      proof_url: values.proof_url || undefined,
      proof_description: values.proof_description || undefined,
      user_name: values.user_name || undefined,
    };

    logPaidUser(payload, {
      onSuccess: () => {
        toast.success('Paid user logged successfully.');
        form.reset();
        onSuccess();
      },
      onError: () => toast.error('Failed to log paid user. Please try again.'),
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
        {/* Identity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="user_identifier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  User Identifier <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="email / phone / ID" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="user_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>User Name</FormLabel>
                <FormControl>
                  <Input placeholder="Full name (optional)" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Internal user warning */}
        <FormField
          control={form.control}
          name="is_internal"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Internal User</FormLabel>
                <FormDescription>
                  Check if this user is a team member, faculty, or internal tester.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {isInternal && (
          <Alert className="bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 text-sm">
              Internal users are tracked separately and excluded from the official paid user count
              towards your Solve for 100 goal.
            </AlertDescription>
          </Alert>
        )}

        {/* Payment details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Amount (₹) <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={50}
                    placeholder="e.g. 499"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="payment_gateway"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Payment Gateway <span className="text-destructive">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gateway" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {GATEWAY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="transaction_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Transaction ID</FormLabel>
                <FormControl>
                  <Input placeholder="TXN / UTR number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="transaction_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Transaction Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Recurring */}
        <FormField
          control={form.control}
          name="is_recurring"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Recurring Payment</FormLabel>
                <FormDescription>
                  This user pays on a recurring (subscription) basis.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {/* Proof */}
        <FormField
          control={form.control}
          name="proof_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Proof URL</FormLabel>
              <FormControl>
                <Input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Link to screenshot, receipt, or payment confirmation.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="proof_description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Proof Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Any context about this payment..."
                  className="resize-none h-20"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending} className="flex-1 sm:flex-none">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Log Paid User
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ── Trigger + Dialog ──────────────────────────────────────────────────────────

interface SF100PaidUserFormProps {
  enrollmentId: string;
}

export function SF100PaidUserForm({ enrollmentId }: SF100PaidUserFormProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="flex items-center gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        Log User
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Paid User</DialogTitle>
            <DialogDescription>
              Record a new paying customer. Submissions pending admin verification will be marked
              as <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>.
            </DialogDescription>
          </DialogHeader>
          <PaidUserFormContent
            enrollmentId={enrollmentId}
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
