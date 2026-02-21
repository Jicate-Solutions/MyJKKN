'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Save } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useCreateMessCaterer } from '@/hooks/campus-living/use-mess-caterers';

export default function NewCatererPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const createCaterer = useCreateMessCaterer();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    try {
      await createCaterer.mutateAsync({
        institution_id: institutionId,
        name: formData.get('name') as string,
        owner_name: formData.get('contact_person') as string,
        phone: formData.get('phone') as string,
        email: (formData.get('email') as string) || null,
        fssai_license_number: (formData.get('fssai_number') as string) || null,
        fssai_expiry_date: (formData.get('fssai_expiry') as string) || null,
        gst_number: (formData.get('gst_number') as string) || null,
        contract_start_date: formData.get('contract_start') as string,
        contract_end_date: formData.get('contract_end') as string,
        contract_amount_monthly: parseFloat(formData.get('monthly_rate') as string) || null,
        billing_model: 'monthly' as any,
        status: 'active' as any,
        bank_details: null,
        metadata: {
          pan_number: formData.get('pan_number') || null,
          meal_type: formData.get('meal_type') || null,
          contract_notes: formData.get('contract_notes') || null,
        },
      });
      router.push('/campus-living/mess/caterers');
    } catch {
      // Error handled by mutation hook
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title="New Caterer">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/campus-living/mess/caterers">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Add New Caterer</h1>
            <p className="text-muted-foreground">Register a new catering vendor</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Company Name *</Label>
                <Input id="name" name="name" placeholder="Enter caterer company name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_person">Contact Person *</Label>
                <Input id="contact_person" name="contact_person" placeholder="Primary contact name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input id="phone" name="phone" type="tel" placeholder="+91 XXXXX XXXXX" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="email@example.com" />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea id="address" name="address" placeholder="Full business address" rows={3} />
              </div>
            </CardContent>
          </Card>

          {/* FSSAI Details */}
          <Card>
            <CardHeader>
              <CardTitle>FSSAI & Compliance</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fssai_number">FSSAI License Number *</Label>
                <Input id="fssai_number" name="fssai_number" placeholder="14-digit FSSAI number" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fssai_expiry">FSSAI Expiry Date *</Label>
                <Input id="fssai_expiry" name="fssai_expiry" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gst_number">GST Number</Label>
                <Input id="gst_number" name="gst_number" placeholder="GST registration number" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pan_number">PAN Number</Label>
                <Input id="pan_number" name="pan_number" placeholder="PAN number" />
              </div>
            </CardContent>
          </Card>

          {/* Contract Details */}
          <Card>
            <CardHeader>
              <CardTitle>Contract Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contract_start">Contract Start Date *</Label>
                <Input id="contract_start" name="contract_start" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contract_end">Contract End Date *</Label>
                <Input id="contract_end" name="contract_end" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthly_rate">Monthly Rate per Student (INR) *</Label>
                <Input id="monthly_rate" name="monthly_rate" type="number" placeholder="4500" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meal_type">Meal Service Type</Label>
                <Select name="meal_type">
                  <SelectTrigger>
                    <SelectValue placeholder="Select meal type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="veg">Vegetarian Only</SelectItem>
                    <SelectItem value="nonveg">Non-Vegetarian</SelectItem>
                    <SelectItem value="both">Both Veg & Non-Veg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="contract_notes">Contract Notes</Label>
                <Textarea
                  id="contract_notes"
                  name="contract_notes"
                  placeholder="Special terms, conditions, or notes about the contract"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/campus-living/mess/caterers">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="mr-2 h-4 w-4" />
              {isSubmitting ? 'Saving...' : 'Save Caterer'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
