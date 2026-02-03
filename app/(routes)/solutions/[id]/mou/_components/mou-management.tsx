'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollText, Calendar, DollarSign, Upload, FileText, AlertTriangle } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';

// TODO: Replace with real hooks after service migration
// import { useMouBySolution, useCreateMou, useUpdateMou } from '@/hooks/solutions/use-mous';

interface MouManagementProps {
  solutionId: string;
}

function formatCurrency(amount: number | null): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function MouManagement({ solutionId }: MouManagementProps) {
  const [isEditing, setIsEditing] = useState(false);

  // Placeholder - no MoU exists yet
  const mou = null;
  const isLoading = false;

  // Form state for creating/editing
  const [dealValue, setDealValue] = useState('');
  const [amcValue, setAmcValue] = useState('');
  const [signedDate, setSignedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement with actual mutation
    console.log('Creating/updating MoU:', {
      deal_value: dealValue,
      amc_value: amcValue,
      signed_date: signedDate,
      expiry_date: expiryDate,
      payment_terms: paymentTerms,
    });
    toast.success(mou ? 'MoU updated' : 'MoU created');
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!mou && !isEditing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            No MoU Created
          </CardTitle>
          <CardDescription>
            Create a Memorandum of Understanding to formalize the agreement with the client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setIsEditing(true)}>
            <ScrollText className="mr-2 h-4 w-4" />
            Create MoU
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isEditing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{mou ? 'Edit MoU' : 'Create MoU'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="deal_value">Deal Value (INR) *</Label>
                <Input
                  id="deal_value"
                  type="number"
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value)}
                  placeholder="Total deal value"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="amc_value">AMC Value (INR)</Label>
                <Input
                  id="amc_value"
                  type="number"
                  value={amcValue}
                  onChange={(e) => setAmcValue(e.target.value)}
                  placeholder="Annual maintenance cost"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signed_date">Signed Date</Label>
                <Input
                  id="signed_date"
                  type="date"
                  value={signedDate}
                  onChange={(e) => setSignedDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiry_date">Expiry Date</Label>
                <Input
                  id="expiry_date"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_terms">Payment Terms</Label>
              <Textarea
                id="payment_terms"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Describe payment schedule and terms..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Upload MoU Document</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag and drop or click to upload MoU document
                </p>
                <Input type="file" className="hidden" accept=".pdf,.doc,.docx" />
                <Button type="button" variant="outline" size="sm" className="mt-2">
                  Choose File
                </Button>
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {mou ? 'Update MoU' : 'Create MoU'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  // Display existing MoU
  const daysUntilExpiry = mou?.expiry_date
    ? differenceInDays(new Date(mou.expiry_date), new Date())
    : null;
  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30;

  return (
    <div className="space-y-4">
      {isExpiringSoon && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800">MoU Expiring Soon</p>
              <p className="text-sm text-amber-700">
                This MoU expires in {daysUntilExpiry} days. Consider renewal.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5" />
              MoU Details
            </CardTitle>
            <CardDescription>
              Memorandum of Understanding for this solution
            </CardDescription>
          </div>
          <Badge variant={mou?.status === 'signed' ? 'default' : 'secondary'}>
            {mou?.status || 'Draft'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Deal Value
              </p>
              <p className="text-xl font-semibold">{formatCurrency(mou?.deal_value)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> AMC Value
              </p>
              <p className="text-xl font-semibold">{formatCurrency(mou?.amc_value)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Signed Date
              </p>
              <p>
                {mou?.signed_date
                  ? format(new Date(mou.signed_date), 'PPP')
                  : 'Not signed'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Expiry Date
              </p>
              <p className={isExpiringSoon ? 'text-amber-600 font-medium' : ''}>
                {mou?.expiry_date
                  ? format(new Date(mou.expiry_date), 'PPP')
                  : 'Not set'}
              </p>
            </div>
          </div>

          {mou?.payment_terms && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Payment Terms
              </p>
              <p className="text-sm">{mou.payment_terms}</p>
            </div>
          )}

          {mou?.mou_document_url && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                MoU Document
              </p>
              <Button variant="outline" asChild>
                <a href={mou.mou_document_url} target="_blank" rel="noopener noreferrer">
                  <FileText className="mr-2 h-4 w-4" />
                  View Document
                </a>
              </Button>
            </div>
          )}

          <div className="flex gap-4 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              Edit MoU
            </Button>
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Upload New Document
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
