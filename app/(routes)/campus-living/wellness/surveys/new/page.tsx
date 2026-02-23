'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ContentLayout } from '@/components/layout/content-layout'
import { PageBreadcrumb } from '@/components/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/hooks/use-auth'
import { useCreatePulseConfig } from '@/hooks/campus-living/use-wellness'
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks'
import type { PulseQuestion, PulseQuestionType } from '@/types/campus-living'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Smile,
  Star,
  ToggleLeft,
  MessageSquare,
  ArrowUp,
  ArrowDown,
  Loader2,
  Save,
} from 'lucide-react'

const questionTypeConfig: Record<string, { label: string; icon: typeof Smile }> = {
  emoji_scale: { label: 'Emoji Scale', icon: Smile },
  rating_5: { label: '5-Star Rating', icon: Star },
  yes_no: { label: 'Yes / No', icon: ToggleLeft },
  text: { label: 'Free Text', icon: MessageSquare },
}

function generateId() {
  return crypto.randomUUID()
}

export default function CreateWellnessSurveyPage() {
  const router = useRouter()
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const createMutation = useCreatePulseConfig()
  const { data: blocksData } = useHostelBlocks(institutionId)
  const blocks = (blocksData as any)?.data || []

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [frequency, setFrequency] = useState<string>('weekly')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [targetAllBlocks, setTargetAllBlocks] = useState(true)
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>([])

  // Questions state
  const [questions, setQuestions] = useState<PulseQuestion[]>([
    {
      id: generateId(),
      type: 'emoji_scale' as PulseQuestionType,
      question: 'How are you feeling today?',
      required: true,
      order: 1,
    },
  ])

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: generateId(),
        type: 'emoji_scale' as PulseQuestionType,
        question: '',
        required: false,
        order: prev.length + 1,
      },
    ])
  }

  const removeQuestion = (id: string) => {
    setQuestions((prev) =>
      prev
        .filter((q) => q.id !== id)
        .map((q, idx) => ({ ...q, order: idx + 1 }))
    )
  }

  const updateQuestion = (id: string, updates: Partial<PulseQuestion>) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...updates } : q))
    )
  }

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newQuestions = [...questions]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newQuestions.length) return
    ;[newQuestions[index], newQuestions[targetIndex]] = [
      newQuestions[targetIndex],
      newQuestions[index],
    ]
    setQuestions(newQuestions.map((q, idx) => ({ ...q, order: idx + 1 })))
  }

  const toggleBlock = (blockId: string) => {
    setSelectedBlocks((prev) =>
      prev.includes(blockId)
        ? prev.filter((id) => id !== blockId)
        : [...prev, blockId]
    )
  }

  const handleSubmit = async () => {
    if (!title.trim()) return
    if (questions.some((q) => !q.question.trim())) return

    createMutation.mutate(
      {
        institution_id: institutionId,
        title: title.trim(),
        description: description.trim() || null,
        frequency: frequency as any,
        questions,
        target_blocks: targetAllBlocks ? null : selectedBlocks.length > 0 ? selectedBlocks : null,
        status: 'draft',
        starts_at: startsAt || null,
        ends_at: endsAt || null,
        created_by: profile?.id || null,
      },
      {
        onSuccess: () => {
          router.push('/campus-living/wellness/surveys')
        },
      }
    )
  }

  const isValid = title.trim() && questions.length > 0 && questions.every((q) => q.question.trim())

  return (
    <ContentLayout title="Create Wellness Survey">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Student Wellness', href: '/campus-living/wellness' },
          { label: 'Surveys', href: '/campus-living/wellness/surveys' },
          { label: 'New Survey' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/campus-living/wellness/surveys">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create Wellness Survey</h1>
            <p className="text-muted-foreground">
              Set up a new pulse survey for student wellbeing tracking
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column: Survey details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle>Survey Details</CardTitle>
                <CardDescription>Basic information about this pulse survey</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    placeholder="e.g. Weekly Wellness Check"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of this survey's purpose..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Frequency *</Label>
                    <Select value={frequency} onValueChange={setFrequency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Bi-weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="starts_at">Start Date</Label>
                    <Input
                      id="starts_at"
                      type="date"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ends_at">End Date</Label>
                    <Input
                      id="ends_at"
                      type="date"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Questions */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Questions</CardTitle>
                  <CardDescription>
                    Define the questions students will answer each period
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={addQuestion}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add Question
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {questions.map((q, index) => {
                  const TypeIcon = questionTypeConfig[q.type]?.icon || Smile

                  return (
                    <div
                      key={q.id}
                      className="p-4 rounded-lg border space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            Q{q.order}
                          </Badge>
                          <TypeIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {questionTypeConfig[q.type]?.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={index === 0}
                            onClick={() => moveQuestion(index, 'up')}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={index === questions.length - 1}
                            onClick={() => moveQuestion(index, 'down')}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          {questions.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-600 hover:text-red-700"
                              onClick={() => removeQuestion(q.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Input
                          placeholder="Enter question text..."
                          value={q.question}
                          onChange={(e) =>
                            updateQuestion(q.id, { question: e.target.value })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Select
                          value={q.type}
                          onValueChange={(val) =>
                            updateQuestion(q.id, { type: val as PulseQuestionType })
                          }
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="emoji_scale">Emoji Scale</SelectItem>
                            <SelectItem value="rating_5">5-Star Rating</SelectItem>
                            <SelectItem value="yes_no">Yes / No</SelectItem>
                            <SelectItem value="text">Free Text</SelectItem>
                          </SelectContent>
                        </Select>

                        <div className="flex items-center gap-2">
                          <Label htmlFor={`required-${q.id}`} className="text-sm">
                            Required
                          </Label>
                          <Switch
                            id={`required-${q.id}`}
                            checked={q.required}
                            onCheckedChange={(checked) =>
                              updateQuestion(q.id, { required: checked })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}

                {questions.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground mb-2">
                      No questions added yet
                    </p>
                    <Button variant="outline" size="sm" onClick={addQuestion}>
                      <Plus className="mr-1 h-3 w-3" />
                      Add First Question
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: Target & Actions */}
          <div className="space-y-6">
            {/* Target Blocks */}
            <Card>
              <CardHeader>
                <CardTitle>Target Blocks</CardTitle>
                <CardDescription>
                  Choose which hostel blocks receive this survey
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="all-blocks" className="text-sm">
                    All Blocks
                  </Label>
                  <Switch
                    id="all-blocks"
                    checked={targetAllBlocks}
                    onCheckedChange={setTargetAllBlocks}
                  />
                </div>

                {!targetAllBlocks && (
                  <div className="space-y-2 pt-2 border-t">
                    {blocks.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No blocks available
                      </p>
                    ) : (
                      blocks.map((block: any) => (
                        <div
                          key={block.id}
                          className="flex items-center justify-between"
                        >
                          <Label
                            htmlFor={`block-${block.id}`}
                            className="text-sm cursor-pointer"
                          >
                            {block.name}
                          </Label>
                          <Switch
                            id={`block-${block.id}`}
                            checked={selectedBlocks.includes(block.id)}
                            onCheckedChange={() => toggleBlock(block.id)}
                          />
                        </div>
                      ))
                    )}
                    {selectedBlocks.length > 0 && (
                      <p className="text-xs text-muted-foreground pt-1">
                        {selectedBlocks.length} block{selectedBlocks.length !== 1 ? 's' : ''} selected
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Summary & Submit */}
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="secondary">Draft</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Questions</span>
                  <span className="font-medium">{questions.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Frequency</span>
                  <span className="font-medium capitalize">{frequency}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Target</span>
                  <span className="font-medium">
                    {targetAllBlocks ? 'All blocks' : `${selectedBlocks.length} blocks`}
                  </span>
                </div>

                <div className="pt-3 border-t space-y-2">
                  <Button
                    className="w-full"
                    onClick={handleSubmit}
                    disabled={!isValid || createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save as Draft
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    You can activate the survey after reviewing it
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  )
}
