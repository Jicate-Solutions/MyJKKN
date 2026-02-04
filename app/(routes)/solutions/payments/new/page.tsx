'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import {
  Save,
  ArrowLeft,
  CreditCard,
  Building2,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';

export default function NewPaymentPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      router.push('/solutions/payments');
    }, 1000);
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
                  <Label htmlFor="client">Client *</Label>
                  <select id="client" className="w-full rounded-md border p-2" required>
                    <option value="">Select client</option>
                    <option value="1">ABC University</option>
                    <option value="2">XYZ Corp</option>
                    <option value="3">DEF Institute</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="solution">Solution / Project *</Label>
                  <select id="solution" className="w-full rounded-md border p-2" required>
                    <option value="">Select solution</option>
                    <option value="1">Student Portal Development</option>
                    <option value="2">HR Management System</option>
                    <option value="3">Video Production Package</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invoice">Invoice Reference</Label>
                  <Input
                    id="invoice"
                    placeholder="INV-2026-001"
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
                  <Label htmlFor="amount">Amount (₹) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="Enter amount"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_date">Payment Date *</Label>
                  <Input
                    id="payment_date"
                    type="date"
                    defaultValue={format(new Date(), 'yyyy-MM-dd')}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_mode">Payment Mode *</Label>
                  <select id="payment_mode" className="w-full rounded-md border p-2" required>
                    <option value="">Select mode</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="upi">UPI</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transaction_id">Transaction ID / Reference</Label>
                  <Input
                    id="transaction_id"
                    placeholder="Transaction reference number"
                  />
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
                  <Label htmlFor="payment_type">Payment Type</Label>
                  <select id="payment_type" className="w-full rounded-md border p-2">
                    <option value="milestone">Milestone Payment</option>
                    <option value="advance">Advance Payment</option>
                    <option value="final">Final Payment</option>
                    <option value="partial">Partial Payment</option>
                    <option value="full">Full Payment</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional notes about this payment"
                    rows={3}
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
            <Button type="submit" disabled={isSubmitting}>
              <Save className="mr-2 h-4 w-4" />
              {isSubmitting ? 'Recording...' : 'Record Payment'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
