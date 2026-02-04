'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Eye,
  Clock,
  CheckCircle,
  Code,
  BookOpen,
  Brain,
  AlertCircle,
  MessageSquare,
  Link as LinkIcon,
  Users
} from 'lucide-react';
import type { VACLessonFormData } from '@/types/vac';

interface LessonPreviewProps {
  lesson: VACLessonFormData;
  courseName?: string;
}

export function LessonPreview({ lesson, courseName }: LessonPreviewProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Eye className="mr-2 h-4 w-4" />
          Preview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Lesson Preview
          </DialogTitle>
          <DialogDescription>
            Preview how this lesson will appear to students
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 pb-6">
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">Week {lesson.week}</Badge>
                <Badge variant="outline">Hour #{lesson.hour}</Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {lesson.duration_minutes} min
                </Badge>
                <Badge variant={lesson.is_published ? 'default' : 'secondary'}>
                  {lesson.is_published ? 'Published' : 'Draft'}
                </Badge>
              </div>
              <h1 className="text-2xl font-bold">{lesson.title || 'Untitled Lesson'}</h1>
              {courseName && (
                <p className="text-muted-foreground">{courseName}</p>
              )}
            </div>

            {/* Prerequisites & Toolboxes */}
            {(lesson.prerequisites || lesson.toolboxes) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Prerequisites & Requirements</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {lesson.prerequisites && (
                    <div>
                      <span className="text-sm font-medium">Prerequisites:</span>
                      <p className="text-sm text-muted-foreground">{lesson.prerequisites}</p>
                    </div>
                  )}
                  {lesson.toolboxes && (
                    <div>
                      <span className="text-sm font-medium">Required Toolboxes:</span>
                      <p className="text-sm text-muted-foreground">{lesson.toolboxes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Learning Outcomes */}
            {lesson.learning_outcomes?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Learning Outcomes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {lesson.learning_outcomes.map((outcome, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{outcome}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Tabs for Content Sections */}
            <Tabs defaultValue="student" className="w-full">
              <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7">
                {lesson.student_content?.length > 0 && (
                  <TabsTrigger value="student">Content</TabsTrigger>
                )}
                {lesson.exercises?.length > 0 && (
                  <TabsTrigger value="exercises">Exercises</TabsTrigger>
                )}
                {lesson.gemini_prompts?.length > 0 && (
                  <TabsTrigger value="ai">AI Prompts</TabsTrigger>
                )}
                {lesson.error_troubleshooting?.length > 0 && (
                  <TabsTrigger value="errors">Errors</TabsTrigger>
                )}
                {lesson.interview_questions?.length > 0 && (
                  <TabsTrigger value="interview">Interview</TabsTrigger>
                )}
                {lesson.resources?.length > 0 && (
                  <TabsTrigger value="resources">Resources</TabsTrigger>
                )}
                {lesson.faculty_script?.length > 0 && (
                  <TabsTrigger value="faculty">Faculty</TabsTrigger>
                )}
              </TabsList>

              {/* Student Content */}
              {lesson.student_content?.length > 0 && (
                <TabsContent value="student" className="space-y-4 mt-4">
                  {lesson.student_content.map((block, i) => (
                    <Card key={i}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Code className="h-4 w-4" />
                          {block.title || `Content Block ${i + 1}`}
                          <Badge variant="outline">{block.type}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {block.type === 'code' ? (
                          <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm">
                            <code>{block.content}</code>
                          </pre>
                        ) : (
                          <div className="text-sm whitespace-pre-wrap">{block.content}</div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>
              )}

              {/* Exercises */}
              {lesson.exercises?.length > 0 && (
                <TabsContent value="exercises" className="space-y-4 mt-4">
                  {lesson.exercises.map((exercise, i) => (
                    <Card key={i}>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          {exercise.title}
                          <Badge
                            variant={
                              exercise.difficulty === 'required'
                                ? 'default'
                                : exercise.difficulty === 'medium'
                                ? 'secondary'
                                : 'outline'
                            }
                          >
                            {exercise.difficulty}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <span className="text-sm font-medium">Question:</span>
                          <div className="text-sm mt-1 whitespace-pre-wrap">{exercise.question}</div>
                        </div>
                        {exercise.solution && (
                          <div>
                            <span className="text-sm font-medium">Solution:</span>
                            <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm mt-1">
                              <code>{exercise.solution}</code>
                            </pre>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>
              )}

              {/* AI Prompts */}
              {lesson.gemini_prompts?.length > 0 && (
                <TabsContent value="ai" className="space-y-4 mt-4">
                  {lesson.gemini_prompts.map((prompt, i) => (
                    <Card key={i}>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Brain className="h-4 w-4 text-purple-600" />
                          {prompt.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg overflow-x-auto text-sm whitespace-pre-wrap">
                          {prompt.prompt}
                        </pre>
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>
              )}

              {/* Error Troubleshooting */}
              {lesson.error_troubleshooting?.length > 0 && (
                <TabsContent value="errors" className="space-y-4 mt-4">
                  {lesson.error_troubleshooting.map((item, i) => (
                    <Card key={i} className="border-destructive/20">
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                          <AlertCircle className="h-4 w-4" />
                          {item.error}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Problem:</span>
                            <p className="text-muted-foreground">{item.problem}</p>
                          </div>
                          <div>
                            <span className="font-medium">Cause:</span>
                            <p className="text-muted-foreground">{item.cause}</p>
                          </div>
                          <div>
                            <span className="font-medium text-green-600">Fix:</span>
                            <p className="text-muted-foreground">{item.fix}</p>
                          </div>
                          <div>
                            <span className="font-medium text-blue-600">Prevention:</span>
                            <p className="text-muted-foreground">{item.prevention}</p>
                          </div>
                        </div>
                        {item.code_example && (
                          <div>
                            <span className="text-sm font-medium">Code Example:</span>
                            <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm mt-1">
                              <code>{item.code_example}</code>
                            </pre>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>
              )}

              {/* Interview Questions */}
              {lesson.interview_questions?.length > 0 && (
                <TabsContent value="interview" className="space-y-4 mt-4">
                  {lesson.interview_questions.map((q, i) => (
                    <Card key={i}>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          Question {i + 1}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <span className="text-sm font-medium">Q:</span>
                          <p className="text-sm">{q.question}</p>
                        </div>
                        <Separator />
                        <div>
                          <span className="text-sm font-medium text-green-600">Model Answer:</span>
                          <div className="text-sm mt-1 whitespace-pre-wrap">{q.model_answer}</div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>
              )}

              {/* Resources */}
              {lesson.resources?.length > 0 && (
                <TabsContent value="resources" className="space-y-4 mt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {lesson.resources.map((resource, i) => (
                      <Card key={i}>
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-3">
                            <LinkIcon className="h-5 w-5 text-blue-600 mt-0.5" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{resource.title}</span>
                                <Badge variant="outline">{resource.type}</Badge>
                                {resource.duration && (
                                  <span className="text-xs text-muted-foreground">
                                    {resource.duration}
                                  </span>
                                )}
                              </div>
                              <a
                                href={resource.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:underline truncate block"
                              >
                                {resource.link}
                              </a>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              )}

              {/* Faculty Script */}
              {lesson.faculty_script?.length > 0 && (
                <TabsContent value="faculty" className="space-y-4 mt-4">
                  <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Users className="h-4 w-4 text-orange-600" />
                        Faculty Only Section
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        This section is only visible to faculty members.
                      </p>
                    </CardContent>
                  </Card>
                  {lesson.faculty_script.map((section, i) => (
                    <Card key={i}>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center justify-between">
                          <span>{section.title}</span>
                          <Badge variant="outline">{section.time_range}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="text-sm whitespace-pre-wrap">{section.content}</div>
                        {section.visuals && (
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium">Visuals:</span> {section.visuals}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>
              )}
            </Tabs>

            {/* Self-Check */}
            {lesson.self_check?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                    Self-Check Checklist
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {lesson.self_check.map((item, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <div className="h-4 w-4 border rounded flex-shrink-0" />
                        <span className="text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
