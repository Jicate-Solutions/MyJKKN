'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import {
  ArrowLeft,
  Save,
  Loader2,
  Search,
  User,
  Building2,
  BedDouble,
  Phone,
  Heart
} from 'lucide-react';

export default function NewAllocationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState({
    learner_id: '',
    student_name: '',
    block_id: searchParams.get('block') ?? '',
    room_id: searchParams.get('room') ?? '',
    bed_id: searchParams.get('bed') ?? '',
    allocation_type: 'fresh',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relation: '',
    medical_conditions: '',
    food_preference: 'vegetarian',
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // TODO: Replace with actual mutation
      console.log('Creating allocation:', formData);
      await new Promise((r) => setTimeout(r, 1000));
      router.push('/campus-living/allocations');
    } catch (error) {
      console.error('Failed to create allocation:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Placeholder data for dropdowns
  const blocks = [
    { id: '1', name: 'Boys Hostel A (BHA)' },
    { id: '2', name: 'Boys Hostel B (BHB)' },
    { id: '3', name: 'Girls Hostel A (GHA)' },
    { id: '4', name: 'Girls Hostel B (GHB)' },
  ];

  const rooms = [
    { id: 'r1', label: 'G-101 (Double, 1 bed available)' },
    { id: 'r2', label: 'G-102 (Double, 1 bed available)' },
    { id: 'r3', label: 'G-103 (Triple, 3 beds available)' },
  ];

  const beds = [
    { id: 'b1', label: 'Bed A (Single)' },
    { id: 'b2', label: 'Bed B (Single)' },
  ];

  return (
    <ContentLayout title="New Allocation">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: 'New Allocation' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Allocate Bed</h1>
            <p className="text-sm text-muted-foreground">
              Assign a student to a hostel bed
            </p>
          </div>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center gap-2">
          {[
            { num: 1, label: 'Student', icon: User },
            { num: 2, label: 'Room & Bed', icon: Building2 },
            { num: 3, label: 'Emergency Contact', icon: Phone },
          ].map((s, idx) => (
            <div key={s.num} className="flex items-center">
              <button
                onClick={() => setStep(s.num)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  step === s.num
                    ? 'bg-primary text-primary-foreground'
                    : step > s.num
                    ? 'bg-green-100 text-green-800'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <s.icon className="h-4 w-4" />
                {s.label}
              </button>
              {idx < 2 && <div className="w-8 h-px bg-border mx-1" />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Student Selection */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Select Student
                </CardTitle>
                <CardDescription>Search and select the student to allocate</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, roll number, or phone..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Search Results (Placeholder) */}
                <div className="space-y-2">
                  {[
                    { id: 'l1', name: 'Amit Kumar', roll: 'CS2025001', dept: 'Computer Science', semester: '2nd Sem' },
                    { id: 'l2', name: 'Sneha Gupta', roll: 'EC2025010', dept: 'Electronics', semester: '2nd Sem' },
                    { id: 'l3', name: 'Rohan Das', roll: 'ME2025008', dept: 'Mechanical', semester: '2nd Sem' },
                  ].filter((s) =>
                    studentSearch.length > 0 &&
                    (s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
                     s.roll.toLowerCase().includes(studentSearch.toLowerCase()))
                  ).map((student) => (
                    <div
                      key={student.id}
                      onClick={() => {
                        handleChange('learner_id', student.id);
                        handleChange('student_name', student.name);
                      }}
                      className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                        formData.learner_id === student.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{student.name}</p>
                          <p className="text-sm text-muted-foreground">{student.roll} &middot; {student.dept} &middot; {student.semester}</p>
                        </div>
                      </div>
                      {formData.learner_id === student.id && (
                        <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                  {studentSearch.length > 0 && studentSearch.length < 2 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Type at least 2 characters to search</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Allocation Type</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.allocation_type}
                      onChange={(e) => handleChange('allocation_type', e.target.value)}
                    >
                      <option value="fresh">Fresh Allocation</option>
                      <option value="renewal">Renewal</option>
                      <option value="transfer">Transfer</option>
                      <option value="temporary">Temporary</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Food Preference</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.food_preference}
                      onChange={(e) => handleChange('food_preference', e.target.value)}
                    >
                      <option value="vegetarian">Vegetarian</option>
                      <option value="non_vegetarian">Non-Vegetarian</option>
                      <option value="vegan">Vegan</option>
                      <option value="jain">Jain</option>
                      <option value="eggetarian">Eggetarian</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="button" onClick={() => setStep(2)} disabled={!formData.learner_id}>
                    Next: Select Room
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Room & Bed Selection */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Select Room & Bed
                </CardTitle>
                <CardDescription>Choose the hostel block, room, and bed</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Hostel Block *</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.block_id}
                      onChange={(e) => handleChange('block_id', e.target.value)}
                      required
                    >
                      <option value="">Select Block</option>
                      {blocks.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Room *</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.room_id}
                      onChange={(e) => handleChange('room_id', e.target.value)}
                      required
                    >
                      <option value="">Select Room</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Bed *</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.bed_id}
                      onChange={(e) => handleChange('bed_id', e.target.value)}
                      required
                    >
                      <option value="">Select Bed</option>
                      {beds.map((b) => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="medical">Medical Conditions (if any)</Label>
                  <Textarea
                    id="medical"
                    placeholder="Allergies, medications, health conditions..."
                    value={formData.medical_conditions}
                    onChange={(e) => handleChange('medical_conditions', e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button type="button" onClick={() => setStep(3)} disabled={!formData.block_id || !formData.room_id || !formData.bed_id}>
                    Next: Emergency Contact
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Emergency Contact */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Emergency Contact
                </CardTitle>
                <CardDescription>Required emergency contact information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ec_name">Contact Name *</Label>
                    <Input
                      id="ec_name"
                      placeholder="Parent/Guardian name"
                      value={formData.emergency_contact_name}
                      onChange={(e) => handleChange('emergency_contact_name', e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ec_phone">Contact Phone *</Label>
                    <Input
                      id="ec_phone"
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={formData.emergency_contact_phone}
                      onChange={(e) => handleChange('emergency_contact_phone', e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ec_relation">Relation *</Label>
                    <select
                      id="ec_relation"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.emergency_contact_relation}
                      onChange={(e) => handleChange('emergency_contact_relation', e.target.value)}
                      required
                    >
                      <option value="">Select Relation</option>
                      <option value="father">Father</option>
                      <option value="mother">Mother</option>
                      <option value="guardian">Guardian</option>
                      <option value="sibling">Sibling</option>
                      <option value="spouse">Spouse</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-muted/50 rounded-lg p-4 mt-4">
                  <p className="text-sm font-medium mb-2">Allocation Summary</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <p className="text-muted-foreground">Student: <span className="text-foreground">{formData.student_name || 'Not selected'}</span></p>
                    <p className="text-muted-foreground">Type: <span className="text-foreground capitalize">{formData.allocation_type}</span></p>
                    <p className="text-muted-foreground">Block: <span className="text-foreground">{blocks.find((b) => b.id === formData.block_id)?.name || 'Not selected'}</span></p>
                    <p className="text-muted-foreground">Room: <span className="text-foreground">{rooms.find((r) => r.id === formData.room_id)?.label || 'Not selected'}</span></p>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || !formData.emergency_contact_name || !formData.emergency_contact_phone || !formData.emergency_contact_relation}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Allocating...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Confirm Allocation
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </form>
      </div>
    </ContentLayout>
  );
}
