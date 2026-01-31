// app/(routes)/consultant-portal/profile/page.tsx
// Consultant profile management page

'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useUpdateConsultant } from '@/hooks/admission/use-consultants';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type { EducationConsultant } from '@/types/education-consultants';
import { toast } from 'sonner';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Building,
  CreditCard,
  Save,
  AlertCircle,
  Loader2,
  Shield,
  Award,
  Calendar,
} from 'lucide-react';

const indianStates = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Puducherry', 'Jammu and Kashmir', 'Ladakh',
];

const tierColors: Record<string, string> = {
  bronze: 'bg-amber-100 text-amber-800',
  silver: 'bg-gray-100 text-gray-800',
  gold: 'bg-yellow-100 text-yellow-800',
  platinum: 'bg-purple-100 text-purple-800',
  diamond: 'bg-cyan-100 text-cyan-800',
};

// Profile update schema (limited fields that consultant can update)
const profileSchema = z.object({
  contact_person: z.string().optional(),
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  alternate_phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  bank_ifsc: z.string().optional(),
  bank_account_holder: z.string().optional(),
  pan_number: z.string().optional(),
  gst_number: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function ConsultantProfilePage() {
  const { profile } = useAuth();
  const [consultant, setConsultant] = useState<EducationConsultant | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const updateConsultant = useUpdateConsultant();

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      contact_person: '',
      phone: '',
      alternate_phone: '',
      email: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      bank_name: '',
      bank_account_number: '',
      bank_ifsc: '',
      bank_account_holder: '',
      pan_number: '',
      gst_number: '',
    },
  });

  // Load consultant data
  useEffect(() => {
    async function loadConsultant() {
      if (!profile?.id || !profile?.institution_id) {
        setIsLoading(false);
        return;
      }

      try {
        const consultants = await ConsultantService.getConsultants({
          institution_id: profile.institution_id,
          limit: 100,
        });

        const myConsultant = consultants.data.find(
          (c) => c.referrer_user_id === profile.id
        );

        if (myConsultant) {
          setConsultant(myConsultant);
          // Pre-fill form
          form.reset({
            contact_person: myConsultant.contact_person || '',
            phone: myConsultant.phone || '',
            alternate_phone: myConsultant.alternate_phone || '',
            email: myConsultant.email || '',
            address: myConsultant.address || '',
            city: myConsultant.city || '',
            state: myConsultant.state || '',
            pincode: myConsultant.pincode || '',
            bank_name: myConsultant.bank_name || '',
            bank_account_number: myConsultant.bank_account_number || '',
            bank_ifsc: myConsultant.bank_ifsc || '',
            bank_account_holder: myConsultant.bank_account_holder || '',
            pan_number: myConsultant.pan_number || '',
            gst_number: myConsultant.gst_number || '',
          });
        }
      } catch (err) {
        console.error('Failed to load consultant:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadConsultant();
  }, [profile, form]);

  const onSubmit = async (data: ProfileFormData) => {
    if (!consultant) return;

    try {
      await updateConsultant.mutateAsync({
        id: consultant.id,
        data: data,
      });

      toast.success('Profile updated successfully!');

      // Refresh consultant data
      const updatedConsultant = await ConsultantService.getConsultantById(consultant.id);
      if (updatedConsultant) {
        setConsultant(updatedConsultant);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile';
      toast.error(message);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[600px] md:col-span-2" />
        </div>
      </div>
    );
  }

  if (!consultant) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <p className="text-muted-foreground">Unable to load consultant profile</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <User className="h-6 w-6" />
          My Profile
        </h1>
        <p className="text-muted-foreground">
          Manage your contact and payment information
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile Summary Card */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto p-4 rounded-full bg-primary/10 w-fit mb-2">
                <User className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>{consultant.name}</CardTitle>
              <CardDescription className="capitalize">{consultant.consultant_type} Partner</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <Badge className={tierColors[consultant.tier] || tierColors.bronze}>
                    <Award className="h-3 w-3 mr-1" />
                    {consultant.tier.charAt(0).toUpperCase() + consultant.tier.slice(1)} Tier
                  </Badge>
                </div>

                <Separator />

                <div className="space-y-2 text-sm">
                  {consultant.code && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Partner Code</span>
                      <span className="font-mono font-medium">{consultant.code}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      variant={consultant.status === 'active' ? 'default' : 'secondary'}
                      className="capitalize"
                    >
                      {consultant.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Leads</span>
                    <span className="font-medium">{consultant.total_leads_referred || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Conversions</span>
                    <span className="font-medium">{consultant.total_conversions || 0}</span>
                  </div>
                </div>

                {consultant.contract_start_date && (
                  <>
                    <Separator />
                    <div className="text-sm space-y-1">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        Contract Period
                      </div>
                      <p>
                        {new Date(consultant.contract_start_date).toLocaleDateString()} -{' '}
                        {consultant.contract_end_date
                          ? new Date(consultant.contract_end_date).toLocaleDateString()
                          : 'Ongoing'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Verification Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Verification Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {consultant.verified_at ? (
                <div className="text-center">
                  <Badge className="bg-green-100 text-green-800">
                    <Shield className="h-3 w-3 mr-1" />
                    Verified Partner
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-2">
                    Verified on {new Date(consultant.verified_at).toLocaleDateString()}
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <Badge variant="secondary">Pending Verification</Badge>
                  <p className="text-xs text-muted-foreground mt-2">
                    Please complete your profile for verification
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Profile Form */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Update your contact and payment details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                {/* Contact Information */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Contact Information
                  </h3>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="contact_person"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Person</FormLabel>
                          <FormControl>
                            <Input placeholder="Name of contact person" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="email@example.com"
                                className="pl-10"
                                {...field}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Primary Phone *</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="9876543210"
                                className="pl-10"
                                {...field}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="alternate_phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Alternate Phone</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Optional"
                                className="pl-10"
                                {...field}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Address
                  </h3>

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Street Address</FormLabel>
                        <FormControl>
                          <Input placeholder="Street address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="City" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select state" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {indianStates.map((state) => (
                                <SelectItem key={state} value={state}>
                                  {state}
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
                      name="pincode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pincode</FormLabel>
                          <FormControl>
                            <Input placeholder="600001" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Banking Information */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Banking Information
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Required for commission payouts. Keep this information accurate and up-to-date.
                  </p>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="bank_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bank Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., State Bank of India" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="bank_account_holder"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account Holder Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Name as in bank records" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="bank_account_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter account number"
                              type="password"
                              autoComplete="off"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            This will be encrypted and stored securely
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="bank_ifsc"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IFSC Code</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., SBIN0001234"
                              className="uppercase"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Tax Information */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    Tax Information
                  </h3>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="pan_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PAN Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="ABCDE1234F"
                              className="uppercase"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            />
                          </FormControl>
                          <FormDescription>Required for TDS deduction</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="gst_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>GST Number (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="22ABCDE1234F1Z5"
                              className="uppercase"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            />
                          </FormControl>
                          <FormDescription>If registered under GST</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Submit */}
                <div className="flex justify-end pt-4">
                  <Button
                    type="submit"
                    disabled={updateConsultant.isPending}
                    className="w-full md:w-auto"
                  >
                    {updateConsultant.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
