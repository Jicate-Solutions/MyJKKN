'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateAssessment,
  useUpdateAssessment,
  useAssessmentDetail,
  useAddQuestion,
  useDeleteAssessment,
} from '@/hooks/pde/use-pde';
import { useVACCourses, useVACLessons } from '@/hooks/vac/use-vac';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { BeatLoader } from 'react-spinners';
import { Plus, Trash2, Save, ArrowLeft, GripVertical } from 'lucide-react';
import type {

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/admin/pde/assessments',
} as const;

  CreateAssessmentInput,
  CreateQuestionInput,
  AssessmentType,
  QuestionType,
  FinksDimension,
  Difficulty,
  MCQOption,
} from '@/types/pde';

const ASSESSMENT_TYPES: { value: AssessmentType; label: string }[] = [
  { value: 'quiz', label: 'Quiz' },
  { value: 'demonstration', label: 'Demonstration' },
  { value: 'peer_review', label: 'Peer Review' },
  { value: 'portfolio_entry', label: 'Portfolio Entry' },
];

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'true_false', label: 'True / False' },
  { value: 'short_answer', label: 'Short Answer' },
  { value: 'fill_blank', label: 'Fill in the Blank' },
];

const FINKS_DIMENSIONS: { value: FinksDimension; label: string }[] = [
  { value: 'foundational_knowledge', label: 'Foundational Knowledge' },
  { value: 'application', label: 'Application' },
  { value: 'integration', label: 'Integration' },
  { value: 'human_dimension', label: 'Human Dimension' },
  { value: 'caring', label: 'Caring' },
  { value: 'learning_how_to_learn', label: 'Learning How to Learn' },
];

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'foundation', label: 'Foundation' },
  { value: 'standard', label: 'Standard' },
  { value: 'advanced', label: 'Advanced' },
];

interface QuestionDraft extends CreateQuestionInput {
  tempId: string;
}

export default function AssessmentCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const presetCourseId = searchParams.get('courseId') || '';
  const { toast } = useToast();
  const { profile: user } = useAuth();

  const isEditing = !!editId;

  // Fetch existing assessment if editing
  const { data: existingAssessment, isLoading: loadingExisting } = useAssessmentDetail(editId || undefined);

  // Courses and lessons
  const { data: coursesData } = useVACCourses();
  const courses = coursesData?.data || [];

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseId, setCourseId] = useState(presetCourseId);
  const [lessonId, setLessonId] = useState('');
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('quiz');
  const [timeLimit, setTimeLimit] = useState('');
  const [maxAttempts, setMaxAttempts] = useState('3');
  const [passThreshold, setPassThreshold] = useState('70');
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [showCorrectAfter, setShowCorrectAfter] = useState(true);

  // Questions
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);

  // Lessons for selected course
  const { data: lessonsData } = useVACLessons(courseId || undefined);
  const lessons = lessonsData || [];

  // Mutations
  const createAssessment = useCreateAssessment();
  const updateAssessment = useUpdateAssessment();
  const addQuestion = useAddQuestion();

  // Load existing data
  useEffect(() => {
    if (existingAssessment && isEditing) {
      setTitle(existingAssessment.title);
      setDescription(existingAssessment.description || '');
      setCourseId(existingAssessment.course_id);
      setLessonId(existingAssessment.lesson_id || '');
      setAssessmentType(existingAssessment.assessment_type);
      setTimeLimit(existingAssessment.time_limit_minutes?.toString() || '');
      setMaxAttempts(existingAssessment.max_attempts.toString());
      setPassThreshold(existingAssessment.pass_threshold.toString());
      setShuffleQuestions(existingAssessment.shuffle_questions);
      setShowCorrectAfter(existingAssessment.show_correct_after);
      setQuestions(
        existingAssessment.questions.map((q) => ({
          tempId: q.id,
          question_type: q.question_type,
          question_text: q.question_text,
          options: q.options || undefined,
          correct_answer: q.correct_answer || undefined,
          points: q.points,
          explanation: q.explanation || undefined,
          finks_dimension: q.finks_dimension || undefined,
          difficulty: q.difficulty || undefined,
          order_index: q.order_index,
        }))
      );
    }
  }, [existingAssessment, isEditing]);

  // Add blank question
  const addBlankQuestion = useCallback(() => {
    setQuestions((prev) => [
      ...prev,
      {
        tempId: crypto.randomUUID(),
        question_type: 'multiple_choice',
        question_text: '',
        options: [
          { text: '', is_correct: true },
          { text: '', is_correct: false },
          { text: '', is_correct: false },
          { text: '', is_correct: false },
        ],
        points: 1,
        order_index: prev.length,
      },
    ]);
  }, []);

  // Update a question field
  const updateQuestion = useCallback((tempId: string, field: string, value: unknown) => {
    setQuestions((prev) =>
      prev.map((q) => (q.tempId === tempId ? { ...q, [field]: value } : q))
    );
  }, []);

  // Update MCQ option
  const updateOption = useCallback((tempId: string, optIdx: number, field: string, value: unknown) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.tempId !== tempId || !q.options) return q;
        const newOptions = q.options.map((opt, i) => {
          if (i !== optIdx) {
            // If we're setting is_correct on another option, unset others
            if (field === 'is_correct' && value === true) {
              return { ...opt, is_correct: false };
            }
            return opt;
          }
          return { ...opt, [field]: value };
        });
        return { ...q, options: newOptions };
      })
    );
  }, []);

  // Remove question
  const removeQuestion = useCallback((tempId: string) => {
    setQuestions((prev) => prev.filter((q) => q.tempId !== tempId));
  }, []);

  // Add MCQ option
  const addOption = useCallback((tempId: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.tempId !== tempId || !q.options) return q;
        return { ...q, options: [...q.options, { text: '', is_correct: false }] };
      })
    );
  }, []);

  // Remove MCQ option
  const removeOption = useCallback((tempId: string, optIdx: number) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.tempId !== tempId || !q.options || q.options.length <= 2) return q;
        return { ...q, options: q.options.filter((_, i) => i !== optIdx) };
      })
    );
  }, []);

  // Save
  const handleSave = async () => {
    if (!title.trim() || !courseId) {
      toast({ title: 'Missing fields', description: 'Title and course are required.', variant: 'destructive' });
      return;
    }

    try {
      const input: CreateAssessmentInput = {
        course_id: courseId,
        title: title.trim(),
        description: description.trim() || undefined,
        lesson_id: lessonId || undefined,
        assessment_type: assessmentType,
        time_limit_minutes: timeLimit ? parseInt(timeLimit) : undefined,
        max_attempts: parseInt(maxAttempts) || 3,
        pass_threshold: parseFloat(passThreshold) || 70,
        shuffle_questions: shuffleQuestions,
        show_correct_after: showCorrectAfter,
      };

      let assessId: string;

      if (isEditing && editId) {
        const updated = await updateAssessment.mutateAsync({ id: editId, input });
        assessId = updated.id;
        toast({ title: 'Assessment updated' });
      } else {
        const created = await createAssessment.mutateAsync(input);
        assessId = created.id;

        // Save questions
        for (const q of questions) {
          if (!q.question_text.trim()) continue;
          await addQuestion.mutateAsync({
            assessmentId: assessId,
            input: {
              question_type: q.question_type,
              question_text: q.question_text,
              options: q.options,
              correct_answer: q.correct_answer,
              points: q.points,
              explanation: q.explanation,
              finks_dimension: q.finks_dimension,
              difficulty: q.difficulty,
              order_index: q.order_index,
            },
          });
        }
        toast({ title: 'Assessment created with ' + questions.length + ' questions' });
      }

      router.push('/admin/pde/assessments');
    } catch {
      toast({ title: 'Error saving assessment', variant: 'destructive' });
    }
  };

  const isSaving = createAssessment.isPending || updateAssessment.isPending || addQuestion.isPending;

  if (isEditing && loadingExisting) {
    return (
      <ContentLayout title="Edit Assessment">
        <div className="flex justify-center p-12">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={isEditing ? 'Edit Assessment' : 'Create Assessment'}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'Assessments', href: '/admin/pde/assessments' },
          { label: isEditing ? 'Edit' : 'Create' },
        ]}
      />

      <div className="max-w-4xl mx-auto mt-6 space-y-6">
        {/* Assessment Details */}
        <Card>
          <CardHeader>
            <CardTitle>Assessment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Module 1 Quiz"
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the assessment"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Course *</Label>
                <Select value={courseId} onValueChange={setCourseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select course..." />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Lesson (optional)</Label>
                <Select value={lessonId} onValueChange={setLessonId} disabled={!courseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select lesson..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific lesson</SelectItem>
                    {lessons.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Assessment Type</Label>
                <Select value={assessmentType} onValueChange={(v) => setAssessmentType(v as AssessmentType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSESSMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeLimit">Time Limit (minutes)</Label>
                <Input
                  id="timeLimit"
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  placeholder="No limit"
                  min={1}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxAttempts">Max Attempts</Label>
                <Input
                  id="maxAttempts"
                  type="number"
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(e.target.value)}
                  min={1}
                  max={10}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="passThreshold">Pass Threshold (%)</Label>
                <Input
                  id="passThreshold"
                  type="number"
                  value={passThreshold}
                  onChange={(e) => setPassThreshold(e.target.value)}
                  min={0}
                  max={100}
                />
              </div>
            </div>

            <div className="flex items-center gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="shuffle"
                  checked={shuffleQuestions}
                  onCheckedChange={setShuffleQuestions}
                />
                <Label htmlFor="shuffle" className="text-sm">Shuffle questions</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="showCorrect"
                  checked={showCorrectAfter}
                  onCheckedChange={setShowCorrectAfter}
                />
                <Label htmlFor="showCorrect" className="text-sm">Show correct answers after</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Questions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Questions ({questions.length})</CardTitle>
            <Button variant="outline" size="sm" onClick={addBlankQuestion}>
              <Plus className="h-4 w-4 mr-1" />
              Add Question
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {questions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No questions yet. Click &quot;Add Question&quot; to start building.
              </div>
            )}

            {questions.map((q, idx) => (
              <Card key={q.tempId} className="border-dashed">
                <CardContent className="pt-4 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="shrink-0">Q{idx + 1}</Badge>
                    <div className="flex-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeQuestion(q.tempId)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={q.question_type}
                        onValueChange={(v) => {
                          updateQuestion(q.tempId, 'question_type', v);
                          // Set default options for MCQ
                          if (v === 'multiple_choice' && !q.options) {
                            updateQuestion(q.tempId, 'options', [
                              { text: '', is_correct: true },
                              { text: '', is_correct: false },
                              { text: '', is_correct: false },
                              { text: '', is_correct: false },
                            ]);
                          }
                          if (v === 'true_false') {
                            updateQuestion(q.tempId, 'options', undefined);
                            updateQuestion(q.tempId, 'correct_answer', 'true');
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {QUESTION_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Fink&apos;s Dimension</Label>
                      <Select
                        value={q.finks_dimension || ''}
                        onValueChange={(v) => updateQuestion(q.tempId, 'finks_dimension', v || undefined)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Optional" />
                        </SelectTrigger>
                        <SelectContent>
                          {FINKS_DIMENSIONS.map((d) => (
                            <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2">
                      <div className="space-y-1 flex-1">
                        <Label className="text-xs">Points</Label>
                        <Input
                          type="number"
                          value={q.points || 1}
                          onChange={(e) => updateQuestion(q.tempId, 'points', parseInt(e.target.value) || 1)}
                          className="h-8 text-xs"
                          min={1}
                        />
                      </div>
                      <div className="space-y-1 flex-1">
                        <Label className="text-xs">Difficulty</Label>
                        <Select
                          value={q.difficulty || ''}
                          onValueChange={(v) => updateQuestion(q.tempId, 'difficulty', v || undefined)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="-" />
                          </SelectTrigger>
                          <SelectContent>
                            {DIFFICULTIES.map((d) => (
                              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Question Text */}
                  <div className="space-y-1">
                    <Label className="text-xs">Question Text *</Label>
                    <Textarea
                      value={q.question_text}
                      onChange={(e) => updateQuestion(q.tempId, 'question_text', e.target.value)}
                      placeholder="Enter the question..."
                      rows={2}
                      className="text-sm"
                    />
                  </div>

                  {/* MCQ Options */}
                  {q.question_type === 'multiple_choice' && q.options && (
                    <div className="space-y-2">
                      <Label className="text-xs">Options (click radio to set correct)</Label>
                      {q.options.map((opt: MCQOption, optIdx: number) => (
                        <div key={optIdx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${q.tempId}`}
                            checked={opt.is_correct}
                            onChange={() => updateOption(q.tempId, optIdx, 'is_correct', true)}
                            className="shrink-0"
                          />
                          <Input
                            value={opt.text}
                            onChange={(e) => updateOption(q.tempId, optIdx, 'text', e.target.value)}
                            placeholder={`Option ${optIdx + 1}`}
                            className="h-8 text-sm"
                          />
                          {q.options && q.options.length > 2 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeOption(q.tempId, optIdx)}
                              className="shrink-0 h-8 w-8 p-0 text-muted-foreground"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => addOption(q.tempId)}
                        className="text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Option
                      </Button>
                    </div>
                  )}

                  {/* True/False correct answer */}
                  {q.question_type === 'true_false' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Correct Answer</Label>
                      <Select
                        value={q.correct_answer || 'true'}
                        onValueChange={(v) => updateQuestion(q.tempId, 'correct_answer', v)}
                      >
                        <SelectTrigger className="h-8 text-xs w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">True</SelectItem>
                          <SelectItem value="false">False</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Short answer correct */}
                  {q.question_type === 'short_answer' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Expected Answer (for auto-grade reference)</Label>
                      <Input
                        value={q.correct_answer || ''}
                        onChange={(e) => updateQuestion(q.tempId, 'correct_answer', e.target.value)}
                        placeholder="Optional"
                        className="h-8 text-sm"
                      />
                    </div>
                  )}

                  {/* Explanation */}
                  <div className="space-y-1">
                    <Label className="text-xs">Explanation (shown after answer)</Label>
                    <Input
                      value={q.explanation || ''}
                      onChange={(e) => updateQuestion(q.tempId, 'explanation', e.target.value)}
                      placeholder="Optional explanation"
                      className="h-8 text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 pb-8">
          <Button variant="outline" onClick={() => router.back()} className="flex-1">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="flex-1">
            {isSaving ? (
              <BeatLoader color="#fff" size={8} />
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {isEditing ? 'Update Assessment' : 'Create Assessment'}
              </>
            )}
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
