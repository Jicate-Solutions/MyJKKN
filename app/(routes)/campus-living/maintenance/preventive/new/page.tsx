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
import { ArrowLeft, Save, Plus, X, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useCreatePmSchedule } from '@/hooks/campus-living/use-pm-schedules'
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks'
import type { CreatePmScheduleDTO, PmChecklistItem } from '@/types/campus-living'

export default function NewPmSchedulePage() {
  const router = useRouter()
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''
  const createMutation = useCreatePmSchedule()

  const { data: blocksData } = useHostelBlocks(institutionId)
  const blocks = blocksData?.data || blocksData || []

  const [frequency, setFrequency] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const [blockId, setBlockId] = useState('')
  const [checklist, setChecklist] = useState<string[]>([])
  const [newItem, setNewItem] = useState('')

  const addChecklistItem = () => {
    const trimmed = newItem.trim()
    if (trimmed) {
      setChecklist((prev) => [...prev, trimmed])
      setNewItem('')
    }
  }

  const removeChecklistItem = (index: number) => {
    setChecklist((prev) => prev.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addChecklistItem()
    }
  }

  const showDayOfWeek = frequency === 'weekly' || frequency === 'biweekly'
  const showDayOfMonth =
    frequency === 'monthly' ||
    frequency === 'quarterly' ||
    frequency === 'half_yearly' ||
    frequency === 'yearly'

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const checklistPayload: PmChecklistItem[] | null =
      checklist.length > 0 ? checklist.map((item) => ({ item, done: false })) : null

    const payload: CreatePmScheduleDTO = {
      institution_id: institutionId,
      block_id: blockId || null,
      title: (formData.get('title') as string) || '',
      description: (formData.get('description') as string) || null,
      category: (category || 'other') as CreatePmScheduleDTO['category'],
      priority: (priority || 'medium') as CreatePmScheduleDTO['priority'],
      frequency: (frequency || 'monthly') as CreatePmScheduleDTO['frequency'],
      day_of_week: showDayOfWeek ? Number(formData.get('day_of_week')) || null : null,
      day_of_month: showDayOfMonth ? Number(formData.get('day_of_month')) || null : null,
      month_of_year: null,
      time_of_day: (formData.get('time_of_day') as string) || '09:00',
      assigned_to_name: (formData.get('assigned_to_name') as string) || null,
      assigned_to_phone: (formData.get('assigned_to_phone') as string) || null,
      vendor_name: (formData.get('vendor_name') as string) || null,
      estimated_cost: formData.get('estimated_cost')
        ? Number(formData.get('estimated_cost'))
        : null,
      checklist: checklistPayload,
      next_due_date: (formData.get('next_due_date') as string) || '',
      status: 'active',
      created_by: profile?.id || null,
    }

    await createMutation.mutateAsync(payload)
    router.push('/campus-living/maintenance/preventive')
  }

  return (
    <ContentLayout title="Create PM Schedule">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/campus-living/maintenance/preventive">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create Preventive Maintenance Schedule</h1>
            <p className="text-muted-foreground">
              Set up a recurring maintenance schedule
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Details */}
          <Card>
            <CardHeader>
              <CardTitle>Schedule Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="e.g., Monthly fire extinguisher inspection"
                  required
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Detailed description of the maintenance task"
                  rows={3}
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
                <Label>Priority *</Label>
                <Select value={priority} onValueChange={setPriority} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Frequency & Timing */}
          <Card>
            <CardHeader>
              <CardTitle>Frequency & Timing</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Frequency *</Label>
                <Select value={frequency} onValueChange={setFrequency} required>
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

              {showDayOfWeek && (
                <div className="space-y-2">
                  <Label>Day of Week</Label>
                  <Select name="day_of_week">
                    <SelectTrigger>
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sunday</SelectItem>
                      <SelectItem value="1">Monday</SelectItem>
                      <SelectItem value="2">Tuesday</SelectItem>
                      <SelectItem value="3">Wednesday</SelectItem>
                      <SelectItem value="4">Thursday</SelectItem>
                      <SelectItem value="5">Friday</SelectItem>
                      <SelectItem value="6">Saturday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showDayOfMonth && (
                <div className="space-y-2">
                  <Label htmlFor="day_of_month">Day of Month</Label>
                  <Input
                    id="day_of_month"
                    name="day_of_month"
                    type="number"
                    min={1}
                    max={28}
                    placeholder="1-28"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="time_of_day">Time of Day</Label>
                <Input
                  id="time_of_day"
                  name="time_of_day"
                  type="time"
                  defaultValue="09:00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="next_due_date">Next Due Date *</Label>
                <Input
                  id="next_due_date"
                  name="next_due_date"
                  type="date"
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Location & Assignment */}
          <Card>
            <CardHeader>
              <CardTitle>Location & Assignment</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Block (optional)</Label>
                <Select value={blockId} onValueChange={setBlockId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All blocks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Blocks</SelectItem>
                    {Array.isArray(blocks) &&
                      blocks.map((block: { id: string; name: string; code?: string }) => (
                        <SelectItem key={block.id} value={block.id}>
                          {block.name}{block.code ? ` (${block.code})` : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assigned_to_name">Assigned To</Label>
                <Input
                  id="assigned_to_name"
                  name="assigned_to_name"
                  placeholder="Name of assigned person"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assigned_to_phone">Phone</Label>
                <Input
                  id="assigned_to_phone"
                  name="assigned_to_phone"
                  placeholder="Contact number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor_name">Vendor Name</Label>
                <Input
                  id="vendor_name"
                  name="vendor_name"
                  placeholder="External vendor (if applicable)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimated_cost">Estimated Cost (INR)</Label>
                <Input
                  id="estimated_cost"
                  name="estimated_cost"
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                />
              </div>
            </CardContent>
          </Card>

          {/* Checklist */}
          <Card>
            <CardHeader>
              <CardTitle>Checklist Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add a checklist item..."
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={addChecklistItem}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {checklist.length > 0 ? (
                <ul className="space-y-2">
                  {checklist.map((item, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <span className="text-sm">
                        {index + 1}. {item}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeChecklistItem(index)}
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No checklist items added yet. Add items that should be verified during each task.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/campus-living/maintenance/preventive">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {createMutation.isPending ? 'Creating...' : 'Create Schedule'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  )
}
