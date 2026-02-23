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
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useCreateHealthCase } from '@/hooks/campus-living/use-health-cases'

export default function NewHealthCasePage() {
  const router = useRouter()
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''
  const createMutation = useCreateHealthCase()

  const [severity, setSeverity] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const payload = {
      institution_id: institutionId,
      learner_id: (formData.get('learner_id') as string) || '',
      block_id: (formData.get('block_id') as string) || null,
      symptoms: (formData.get('symptoms') as string) || '',
      severity: severity || 'minor',
      temperature: formData.get('temperature')
        ? Number(formData.get('temperature'))
        : null,
      first_aid_given: (formData.get('first_aid_given') as string) || null,
      first_aid_by: (formData.get('first_aid_by') as string) || null,
      reported_by: profile?.id || null,
    }

    try {
      await createMutation.mutateAsync(payload)
      toast.success('Health case reported successfully')
      router.push('/campus-living/health')
    } catch {
      toast.error('Failed to report health case')
    }
  }

  return (
    <ContentLayout title="Report Health Case">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/campus-living/health">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Report Unwell Student</h1>
            <p className="text-muted-foreground">
              Log a new student health case for tracking and follow-up
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Student & Location */}
          <Card>
            <CardHeader>
              <CardTitle>Student Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="learner_id">Student ID *</Label>
                <Input
                  id="learner_id"
                  name="learner_id"
                  placeholder="Enter student ID"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="block_id">Block ID</Label>
                <Input
                  id="block_id"
                  name="block_id"
                  placeholder="Enter block ID (optional)"
                />
              </div>
            </CardContent>
          </Card>

          {/* Health Details */}
          <Card>
            <CardHeader>
              <CardTitle>Health Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="symptoms">Symptoms *</Label>
                <Textarea
                  id="symptoms"
                  name="symptoms"
                  placeholder="Describe the symptoms observed (e.g., fever, headache, nausea...)"
                  rows={3}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Severity *</Label>
                <Select value={severity} onValueChange={setSeverity} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="serious">Serious</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature (°F)</Label>
                <Input
                  id="temperature"
                  name="temperature"
                  type="number"
                  step={0.1}
                  min={90}
                  max={110}
                  placeholder="e.g., 100.4"
                />
              </div>
            </CardContent>
          </Card>

          {/* First Aid (Optional) */}
          <Card>
            <CardHeader>
              <CardTitle>First Aid (Optional)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="first_aid_given">First Aid Given</Label>
                <Textarea
                  id="first_aid_given"
                  name="first_aid_given"
                  placeholder="Describe any first aid administered (e.g., paracetamol given, cold compress applied...)"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="first_aid_by">First Aid By</Label>
                <Input
                  id="first_aid_by"
                  name="first_aid_by"
                  placeholder="Name of person who gave first aid"
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/campus-living/health">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {createMutation.isPending ? 'Reporting...' : 'Report Case'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  )
}
