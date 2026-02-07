'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useMemo } from 'react';
import {
  Save,
  ArrowLeft,
  CreditCard,
  Building2,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { useCreatePayment } from '@/hooks/solutions/use-payments';
import { useClients } from '@/hooks/solutions/use-clients';
import { useSolutions } from '@/hooks/solutions/use-solutions';
import type { PaymentType } from '@/lib/services/solutions/types';

const paymentTypeOptions: { value: PaymentType; label: string }[] = [
  { value: 'milestone', label: 'Milestone Payment' },
  { value: 'advance', label: 'Advance Payment' },
  { value: 'completion', label: 'Completion Payment' },
  { value: 'mou_signing', label: 'MoU Signing' },
  { value: 'deployment', label: 'Deployment' },
  { value: 'acceptance', label: 'Acceptance' },
  { value: 'amc', label: 'AMC' },
];

export default function NewPaymentPage() {
  const router = useRouter();
  const createPayment = useCreatePayment();

  // Fetch real clients and solutions
  const { data: clientsData, isLoading: clientsLoading } = useClients({ limit: 100 });
  const { data: solutionsData, isLoading: solutionsLoading } = useSolutions({ limit: 200 });

  const clients = clientsData?.data || [];
  const allSolutions = solutionsData?.data || [];

  // Form state
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSolutionId, setSelectedSolutionId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentMethod, setPaymentMethod] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('milestone');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Filter solutions by selected client
  const filteredSolutions = useMemo(() => {
    if (!selectedClientId) return allSolutions;
    return allSolutions.filter((s: any) => s.client_id === selectedClientId);
  }, [selectedClientId, allSolutions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!amount || Number(amount) <= 0) {
      setSubmitError('Please enter a valid amount');
      return;
    }

    try {
      await createPayment.mutateAsync({
        solution_id: selectedSolutionId || undefined,
        client_id: selectedClientId || undefined,
        amount: Number(amount),
        payment_type: paymentType,
        payment_method: paymentMethod || undefined,
        reference_number: referenceNumber || undefined,
        payment_date: paymentDate || undefined,
        status: 'completed',
        notes: notes || undefined,
      });
      router.push('/solutions/payments');
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to create payment. Please try again.');
    }
  };

  return (
    <ContentLayout title="Record Payment">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Payments', href: '/solutions/payments' },
          { label: 'New Payment' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Record Payment</h1>
            <p className="text-sm text-muted-foreground">
              Record a payment received from a client
            </p>
          </div>
        </div>

        {submitError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Client & Solution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Client & Solution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="client">Client</Label>
                  {clientsLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <select
                      id="client"
                      className="w-full rounded-md border p-2"
                      value={selectedClientId}
                      onChange={(e) => {
                        setSelectedClientId(e.target.value);
                        setSelectedSolutionId('');
                      }}
                    >
                      <option value="">Select client (optional)</option>
                      {clients.map((client: any) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="solution">Solution / Project</Label>
                  {solutionsLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <select
                      id="solution"
                      className="w-full rounded-md border p-2"
                      value={selectedSolutionId}
                      onChange={(e) => setSelectedSolutionId(e.target.value)}
                    >
                      <option value="">Select solution (optional)</option>
                      {filteredSolutions.map((sol: any) => (
                        <option key={sol.id} value={sol.id}>
                          {sol.solution_code ? `[${sol.solution_code}] ` : ''}{sol.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reference">Reference / Invoice Number</Label>
                  <Input
                    id="reference"
                    placeholder="INV-2026-001"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Payment Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (INR) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="Enter amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_date">Payment Date *</Label>
                  <Input
                    id="payment_date"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_mode">Payment Mode</Label>
                  <select
                    id="payment_mode"
                    className="w-full rounded-md border p-2"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="">Select mode</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="upi">UPI</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="online">Online</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Additional Details */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Additional Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="payment_type">Payment Type *</Label>
                  <select
                    id="payment_type"
                    className="w-full rounded-md border p-2"
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as PaymentType)}
                    required
                  >
                    {paymentTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional notes about this payment"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 mt-6">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={createPayment.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {createPayment.isPending ? 'Recording...' : 'Record Payment'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
