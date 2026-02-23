'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useCreateAmcContract } from '@/hooks/campus-living/use-amc-contracts'
import type { CreateAmcContractDTO, MaintenanceCategory, PmFrequency } from '@/types/campus-living'

export default function NewAmcContractPage() {
  const router = useRouter()
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''
  const createMutation = useCreateAmcContract()

  const [category, setCategory] = useState('')
  const [serviceFrequency, setServiceFrequency] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const payload: CreateAmcContractDTO = {
      institution_id: institutionId,
      title: (formData.get('title') as string) || '',
      vendor_name: (formData.get('vendor_name') as string) || '',
      vendor_phone: (formData.get('vendor_phone') as string) || undefined,
      vendor_email: (formData.get('vendor_email') as string) || undefined,
      category: (category || 'other') as MaintenanceCategory,
      contract_number: (formData.get('contract_number') as string) || undefined,
      start_date: (formData.get('start_date') as string) || '',
      end_date: (formData.get('end_date') as string) || '',
      renewal_reminder_days: formData.get('renewal_reminder_days')
        ? Number(formData.get('renewal_reminder_days'))
        : 30,
      annual_cost: formData.get('annual_cost')
        ? Number(formData.get('annual_cost'))
        : undefined,
      coverage_details: (formData.get('coverage_details') as string) || undefined,
      service_frequency: serviceFrequency ? (serviceFrequency as PmFrequency) : undefined,
      notes: (formData.get('notes') as string) || undefined,
      created_by: profile?.id || undefined,
    }

    await createMutation.mutateAsync(payload)
    router.push('/campus-living/maintenance/contracts')
  }

  return (
    <ContentLayout title="New AMC Contract">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/campus-living/maintenance/contracts">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create AMC Contract</h1>
            <p className="text-muted-foreground">
              Add a new annual maintenance contract
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Contract Details */}
          <Card>
            <CardHeader>
              <CardTitle>Contract Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="e.g., Elevator Maintenance Contract"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={category} onValueChange={setCategory} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="civil">Civil</SelectItem>
                    <SelectItem value="pest_control">Pest Control</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                    <SelectItem value="internet">Internet</SelectItem>
                    <SelectItem value="water_supply">Water Supply</SelectItem>
                    <SelectItem value="furniture">Furniture</SelectItem>
                    <SelectItem value="safety">Safety</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contract_number">Contract Number</Label>
                <Input
                  id="contract_number"
                  name="contract_number"
                  placeholder="e.g., AMC-2026-001"
                />
              </div>
            </CardContent>
          </Card>

          {/* Vendor Information */}
          <Card>
            <CardHeader>
              <CardTitle>Vendor Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="vendor_name">Vendor Name *</Label>
                <Input
                  id="vendor_name"
                  name="vendor_name"
                  placeholder="e.g., ABC Maintenance Services"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor_phone">Vendor Phone</Label>
                <Input
                  id="vendor_phone"
                  name="vendor_phone"
                  placeholder="e.g., +91 98765 43210"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor_email">Vendor Email</Label>
                <Input
                  id="vendor_email"
                  name="vendor_email"
                  type="email"
                  placeholder="e.g., contact@vendor.com"
                />
              </div>
            </CardContent>
          </Card>

          {/* Duration & Cost */}
          <Card>
            <CardHeader>
              <CardTitle>Duration & Cost</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date *</Label>
                <Input
                  id="start_date"
                  name="start_date"
                  type="date"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">End Date *</Label>
                <Input
                  id="end_date"
                  name="end_date"
                  type="date"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="renewal_reminder_days">Renewal Reminder (days before)</Label>
                <Input
                  id="renewal_reminder_days"
                  name="renewal_reminder_days"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={30}
                  placeholder="30"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="annual_cost">Annual Cost (INR)</Label>
                <Input
                  id="annual_cost"
                  name="annual_cost"
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Service Frequency</Label>
                <Select value={serviceFrequency} onValueChange={setServiceFrequency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="half_yearly">Half Yearly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Coverage & Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Coverage & Notes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="coverage_details">Coverage Details</Label>
                <Textarea
                  id="coverage_details"
                  name="coverage_details"
                  placeholder="Describe what is covered under this contract, SLA terms, exclusions, etc."
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Any additional notes or remarks"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/campus-living/maintenance/contracts">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {createMutation.isPending ? 'Creating...' : 'Create Contract'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  )
}
