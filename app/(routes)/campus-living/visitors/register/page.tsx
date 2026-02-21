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
import { ArrowLeft, Save, UserPlus } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCheckInVisitor } from '@/hooks/campus-living/use-hostel-visitors';
import type { CreateHostelVisitorDTO } from '@/types/campus-living';

export default function VisitorRegistrationPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const checkInMutation = useCheckInVisitor();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const payload: CreateHostelVisitorDTO = {
      institution_id: profile?.institution_id || '',
      learner_id: '', // Will be resolved from student lookup
      block_id: formData.get('block') as string || '',
      visitor_name: formData.get('name') as string || '',
      visitor_phone: formData.get('phone') as string || '',
      visitor_relationship: (formData.get('relationship') as string || 'other') as CreateHostelVisitorDTO['visitor_relationship'],
      visitor_gender: 'male' as CreateHostelVisitorDTO['visitor_gender'],
      id_proof_type: (formData.get('id_type') as string || null) as CreateHostelVisitorDTO['id_proof_type'],
      id_proof_number: formData.get('id_number') as string || null,
      visitor_photo_url: null,
      purpose: formData.get('purpose') as string || '',
      number_of_visitors: parseInt(formData.get('num_visitors') as string || '1', 10),
      check_in_time: new Date().toISOString(),
      meeting_location: 'common_area' as CreateHostelVisitorDTO['meeting_location'],
      approved_by: null,
      is_overnight_stay: false,
      guest_room_id: null,
      vehicle_number: formData.get('vehicle_number') as string || null,
      items_brought: formData.get('notes') as string || null,
      status: 'checked_in' as CreateHostelVisitorDTO['status'],
      rejection_reason: null,
    };

    await checkInMutation.mutateAsync(payload);
    router.push('/campus-living/visitors');
  };

  return (
    <ContentLayout title="Register Visitor">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/campus-living/visitors">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Register New Visitor</h1>
            <p className="text-muted-foreground">Check in a visitor at the hostel gate</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Visitor Details */}
          <Card>
            <CardHeader>
              <CardTitle>Visitor Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input id="name" name="name" placeholder="Visitor full name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input id="phone" name="phone" type="tel" placeholder="+91 XXXXX XXXXX" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="id_type">ID Proof Type *</Label>
                <Select name="id_type" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ID type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aadhaar">Aadhaar Card</SelectItem>
                    <SelectItem value="voter">Voter ID</SelectItem>
                    <SelectItem value="driving">Driving License</SelectItem>
                    <SelectItem value="passport">Passport</SelectItem>
                    <SelectItem value="company">Company ID</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="id_number">ID Number *</Label>
                <Input id="id_number" name="id_number" placeholder="ID proof number" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="relationship">Relationship</Label>
                <Select name="relationship">
                  <SelectTrigger>
                    <SelectValue placeholder="Select relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parent">Parent</SelectItem>
                    <SelectItem value="guardian">Guardian</SelectItem>
                    <SelectItem value="sibling">Sibling</SelectItem>
                    <SelectItem value="relative">Relative</SelectItem>
                    <SelectItem value="friend">Friend</SelectItem>
                    <SelectItem value="vendor">Vendor/Service</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicle_number">Vehicle Number (if any)</Label>
                <Input id="vehicle_number" name="vehicle_number" placeholder="TN 00 AB 0000" />
              </div>
            </CardContent>
          </Card>

          {/* Visit Details */}
          <Card>
            <CardHeader>
              <CardTitle>Visit Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="visiting_student">Student Being Visited *</Label>
                <Input id="visiting_student" name="visiting_student" placeholder="Student name or roll number" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="block">Hostel Block *</Label>
                <Select name="block" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select block" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block_a">Block A</SelectItem>
                    <SelectItem value="block_b">Block B</SelectItem>
                    <SelectItem value="block_c">Block C</SelectItem>
                    <SelectItem value="block_d">Block D</SelectItem>
                    <SelectItem value="block_e">Block E</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="purpose">Purpose of Visit *</Label>
                <Select name="purpose" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parent_visit">Parent Visit</SelectItem>
                    <SelectItem value="guardian_visit">Guardian Visit</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="medical">Medical</SelectItem>
                    <SelectItem value="official">Official</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="num_visitors">Number of Visitors</Label>
                <Input id="num_visitors" name="num_visitors" type="number" min="1" defaultValue="1" />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea id="notes" name="notes" placeholder="Any additional notes about the visit" rows={3} />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/campus-living/visitors">Cancel</Link>
            </Button>
            <Button type="submit" disabled={checkInMutation.isPending}>
              <UserPlus className="mr-2 h-4 w-4" />
              {checkInMutation.isPending ? 'Registering...' : 'Register & Check-in'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
