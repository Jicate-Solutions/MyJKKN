'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useVACLesson } from '@/hooks/vac/use-vac';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock,
  Target,
  Video,
  FileText,
  Code2,
  Brain,
  AlertTriangle,
  MessageSquare,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  Lightbulb,
  Play,
  ChevronRight,
  Sparkles,
  Bug,
  GraduationCap,
  ListChecks,
  Zap,
} from 'lucide-react';
import type {
  FacultyScriptSection,
  ContentBlock,
  Exercise,
  GeminiPrompt,
  TroubleshootingItem,
  InterviewQuestion,
  Resource,
} from '@/types/vac';

// JKKN Brand Colors
const JKKN_GREEN = '#0b6d41';
const JKKN_YELLOW = '#ffde59';
const JKKN_CREAM = '#fbfbee';

// Difficulty badge colors
const difficultyColors = {
  required: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  optional: 'bg-green-100 text-green-800 border-green-200',
};

// Resource type icons
const resourceIcons: Record<string, React.ReactNode> = {
  Video: <Video className="h-4 w-4" />,
  Guide: <FileText className="h-4 w-4" />,
  Documentation: <BookOpen className="h-4 w-4" />,
  Code: <Code2 className="h-4 w-4" />,
  default: <ExternalLink className="h-4 w-4" />,
};

// Code syntax highlighter (simple version - can be enhanced with Prism/highlight.js)
function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative group">
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-8 w-8 p-0"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
        {language && (
          <div className="text-xs text-gray-500 mb-2 uppercase">{language}</div>
        )}
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Copy to clipboard button component
function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="gap-2"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-green-500" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          {label}
        </>
      )}
    </Button>
  );
}

// Tab components for each section
function OutcomesTab({ outcomes }: { outcomes: string[] }) {
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  const toggleItem = (index: number) => {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(index)) {
      newChecked.delete(index);
    } else {
      newChecked.add(index);
    }
    setCheckedItems(newChecked);
  };

  const progress = outcomes.length > 0 ? (checkedItems.size / outcomes.length) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Target className="h-5 w-5" style={{ color: JKKN_GREEN }} />
          Learning Outcomes
        </h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{checkedItems.size}/{outcomes.length} completed</span>
          <Progress value={progress} className="w-24 h-2" indicatorClassName="bg-[#0b6d41]" />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {outcomes.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No learning outcomes defined yet.</p>
          ) : (
            <ul className="space-y-4">
              {outcomes.map((outcome, index) => (
                <li key={index} className="flex items-start gap-3">
                  <Checkbox
                    id={`outcome-${index}`}
                    checked={checkedItems.has(index)}
                    onCheckedChange={() => toggleItem(index)}
                    className="mt-0.5"
                  />
                  <label
                    htmlFor={`outcome-${index}`}
                    className={`text-sm cursor-pointer ${
                      checkedItems.has(index) ? 'text-muted-foreground line-through' : ''
                    }`}
                  >
                    {outcome}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FacultyScriptTab({ script }: { script: FacultyScriptSection[] }) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Video className="h-5 w-5" style={{ color: JKKN_GREEN }} />
        Faculty Script
      </h3>

      {script.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No faculty script available yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {script.map((section, index) => (
            <Card key={index} className="overflow-hidden">
              <CardHeader className="py-4 bg-gradient-to-r from-[#0b6d41]/5 to-transparent">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium">{section.title}</CardTitle>
                  <Badge variant="outline" className="font-mono text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {section.time_range}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <p className="whitespace-pre-wrap">{section.content}</p>
                </div>
                {section.visuals && (
                  <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" />
                      <span className="font-medium">Visual Aid:</span> {section.visuals}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ContentTab({ content }: { content: ContentBlock[] }) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <FileText className="h-5 w-5" style={{ color: JKKN_GREEN }} />
        Student Content
      </h3>

      {content.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No content available yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {content.map((block, index) => (
            <Card key={index}>
              {block.title && (
                <CardHeader className="py-4">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    {block.type === 'code' && <Code2 className="h-4 w-4" />}
                    {block.type === 'text' && <FileText className="h-4 w-4" />}
                    {block.type === 'checklist' && <ListChecks className="h-4 w-4" />}
                    {block.title}
                  </CardTitle>
                </CardHeader>
              )}
              <CardContent className={block.title ? 'pt-0' : 'pt-6'}>
                {block.type === 'code' ? (
                  <CodeBlock code={block.content} language={block.language} />
                ) : block.type === 'checklist' ? (
                  <ul className="space-y-2">
                    {block.content.split('\n').map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500" />
                        {item.replace(/^[-*]\s*/, '')}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <p className="whitespace-pre-wrap">{block.content}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ExercisesTab({ exercises }: { exercises: Exercise[] }) {
  const [expandedSolutions, setExpandedSolutions] = useState<Set<string>>(new Set());
  const [showHints, setShowHints] = useState<Set<string>>(new Set());

  const toggleSolution = (id: string) => {
    const newExpanded = new Set(expandedSolutions);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedSolutions(newExpanded);
  };

  const toggleHints = (id: string) => {
    const newHints = new Set(showHints);
    if (newHints.has(id)) {
      newHints.delete(id);
    } else {
      newHints.add(id);
    }
    setShowHints(newHints);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Code2 className="h-5 w-5" style={{ color: JKKN_GREEN }} />
        Exercises
      </h3>

      {exercises.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No exercises available yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {exercises.map((exercise, index) => (
            <Card key={exercise.id || index} className="overflow-hidden">
              <CardHeader className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white"
                      style={{ backgroundColor: JKKN_GREEN }}
                    >
                      {index + 1}
                    </div>
                    <div>
                      <CardTitle className="text-base font-medium">{exercise.title}</CardTitle>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={difficultyColors[exercise.difficulty] || difficultyColors.optional}
                  >
                    {exercise.difficulty}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="prose prose-sm max-w-none dark:prose-invert bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <p className="whitespace-pre-wrap">{exercise.question}</p>
                </div>

                {exercise.hints && exercise.hints.length > 0 && (
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleHints(exercise.id)}
                      className="text-yellow-600 hover:text-yellow-700"
                    >
                      <Lightbulb className="h-4 w-4 mr-2" />
                      {showHints.has(exercise.id) ? 'Hide Hints' : 'Show Hints'}
                    </Button>
                    {showHints.has(exercise.id) && (
                      <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                        <ul className="space-y-1 text-sm">
                          {exercise.hints.map((hint, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-yellow-600">Hint {i + 1}:</span> {hint}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {exercise.solution && (
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleSolution(exercise.id)}
                      className="gap-2"
                    >
                      <ChevronRight
                        className={`h-4 w-4 transition-transform ${
                          expandedSolutions.has(exercise.id) ? 'rotate-90' : ''
                        }`}
                      />
                      {expandedSolutions.has(exercise.id) ? 'Hide Solution' : 'Show Solution'}
                    </Button>
                    {expandedSolutions.has(exercise.id) && (
                      <div className="mt-4">
                        <CodeBlock code={exercise.solution} language="matlab" />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AIPromptsTab({ prompts }: { prompts: GeminiPrompt[] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5" style={{ color: JKKN_GREEN }} />
          AI Prompts for Gemini
        </h3>
        <Badge className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
          <Brain className="h-3 w-3 mr-1" />
          AI-Powered
        </Badge>
      </div>

      {prompts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No AI prompts available yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {prompts.map((prompt, index) => (
            <Card key={index} className="overflow-hidden border-2 hover:border-[#0b6d41]/30 transition-colors">
              <CardHeader className="py-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-purple-500" />
                  {prompt.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-sm font-mono whitespace-pre-wrap">
                  {prompt.prompt}
                </div>
                <CopyButton text={prompt.prompt} label="Copy Prompt" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TroubleshootingTab({ items }: { items: TroubleshootingItem[] }) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Bug className="h-5 w-5" style={{ color: JKKN_GREEN }} />
        Error Troubleshooting
      </h3>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No troubleshooting items available yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {items.map((item, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="border rounded-lg overflow-hidden"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800">
                <div className="flex items-center gap-3 text-left">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-red-600 dark:text-red-400 font-mono text-sm">
                      {item.error}
                    </p>
                    <p className="text-sm text-muted-foreground">{item.problem}</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-4 pt-2">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">Cause</p>
                      <p className="text-sm text-red-700 dark:text-red-300">{item.cause}</p>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">Fix</p>
                      <p className="text-sm text-green-700 dark:text-green-300">{item.fix}</p>
                    </div>
                  </div>
                  {item.prevention && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">Prevention</p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">{item.prevention}</p>
                    </div>
                  )}
                  {item.code_example && (
                    <div>
                      <p className="text-sm font-medium mb-2">Code Example</p>
                      <CodeBlock code={item.code_example} language="matlab" />
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

function InterviewPrepTab({ questions }: { questions: InterviewQuestion[] }) {
  const [revealedAnswers, setRevealedAnswers] = useState<Set<number>>(new Set());

  const toggleAnswer = (index: number) => {
    const newRevealed = new Set(revealedAnswers);
    if (newRevealed.has(index)) {
      newRevealed.delete(index);
    } else {
      newRevealed.add(index);
    }
    setRevealedAnswers(newRevealed);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <GraduationCap className="h-5 w-5" style={{ color: JKKN_GREEN }} />
        Interview Questions
      </h3>

      {questions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No interview questions available yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {questions.map((q, index) => (
            <Card key={index} className="overflow-hidden">
              <CardHeader className="py-4 bg-gradient-to-r from-[#0b6d41]/5 to-transparent">
                <div className="flex items-start gap-3">
                  <div
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white"
                    style={{ backgroundColor: JKKN_GREEN }}
                  >
                    Q{index + 1}
                  </div>
                  <CardTitle className="text-base font-medium pt-1">{q.question}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {revealedAnswers.has(index) ? (
                  <div className="space-y-4">
                    <div className="prose prose-sm max-w-none dark:prose-invert p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="whitespace-pre-wrap">{q.model_answer}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => toggleAnswer(index)}>
                      Hide Answer
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => toggleAnswer(index)}
                    className="gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Reveal Model Answer
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ResourcesTab({ resources }: { resources: Resource[] }) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <ExternalLink className="h-5 w-5" style={{ color: JKKN_GREEN }} />
        Additional Resources
      </h3>

      {resources.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No resources available yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {resources.map((resource, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader className="py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    {resourceIcons[resource.type] || resourceIcons.default}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base font-medium truncate">
                      {resource.title}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {resource.type}
                      </Badge>
                      {resource.duration && (
                        <span className="text-xs flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {resource.duration}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <a
                  href={resource.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex"
                >
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Open Resource
                  </Button>
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SelfCheckTab({ items }: { items: string[] }) {
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  const toggleItem = (index: number) => {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(index)) {
      newChecked.delete(index);
    } else {
      newChecked.add(index);
    }
    setCheckedItems(newChecked);
  };

  const progress = items.length > 0 ? (checkedItems.size / items.length) * 100 : 0;
  const allComplete = checkedItems.size === items.length && items.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <ListChecks className="h-5 w-5" style={{ color: JKKN_GREEN }} />
          Self-Check Checklist
        </h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{checkedItems.size}/{items.length}</span>
          <Progress value={progress} className="w-24 h-2" indicatorClassName="bg-[#0b6d41]" />
        </div>
      </div>

      <Card className={allComplete ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10' : ''}>
        <CardContent className="pt-6">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No self-check items available yet.</p>
          ) : (
            <>
              <ul className="space-y-4">
                {items.map((item, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Checkbox
                      id={`self-check-${index}`}
                      checked={checkedItems.has(index)}
                      onCheckedChange={() => toggleItem(index)}
                      className="mt-0.5"
                    />
                    <label
                      htmlFor={`self-check-${index}`}
                      className={`text-sm cursor-pointer ${
                        checkedItems.has(index) ? 'text-muted-foreground line-through' : ''
                      }`}
                    >
                      {item}
                    </label>
                  </li>
                ))}
              </ul>
              {allComplete && (
                <div className="mt-6 p-4 bg-green-100 dark:bg-green-900/30 rounded-lg text-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <p className="text-green-800 dark:text-green-200 font-medium">
                    Congratulations! You've completed all self-check items.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Loading skeleton
function LessonSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="border-b bg-white dark:bg-gray-900 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <Skeleton className="h-8 w-48" />
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-3/4 mb-4" />
        <Skeleton className="h-4 w-1/2 mb-8" />
        <div className="flex gap-2 mb-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-24" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </main>
    </div>
  );
}

// Props interface
interface LessonViewerContentProps {
  courseId: string;
  lessonId: string;
}

// Main component
export default function LessonViewerContent({ courseId, lessonId }: LessonViewerContentProps) {

  const { data, isLoading, error } = useVACLesson(lessonId);

  if (isLoading) {
    return <LessonSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Lesson Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The lesson you're looking for doesn't exist or has been removed.
          </p>
          <Link href={`/courses/${courseId}`}>
            <Button>Back to Course</Button>
          </Link>
        </div>
      </div>
    );
  }

  const { lesson, course, prev_lesson, next_lesson } = data;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        {/* Header */}
        <header className="border-b bg-white dark:bg-gray-900 sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href={`/courses/${courseId}`}>
                  <Button variant="ghost" size="sm">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Course
                  </Button>
                </Link>
                <Separator orientation="vertical" className="h-6" />
                <div className="hidden md:block">
                  <p className="text-sm font-medium">{course.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Week {lesson.week} - Hour {lesson.hour}
                  </p>
                </div>
              </div>

              {/* Progress indicator */}
              <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{lesson.duration_minutes || 60} min</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          {/* Lesson Header */}
          <div className="mb-8">
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="secondary">Week {lesson.week}</Badge>
              <Badge variant="outline">Hour {lesson.hour}</Badge>
              {lesson.is_published ? (
                <Badge className="bg-green-100 text-green-800">Published</Badge>
              ) : (
                <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                  Draft
                </Badge>
              )}
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              {lesson.title}
            </h1>
            {lesson.prerequisites && (
              <div className="flex items-start gap-2 text-sm text-muted-foreground mb-2">
                <BookOpen className="h-4 w-4 mt-0.5" />
                <span>
                  <strong>Prerequisites:</strong> {lesson.prerequisites}
                </span>
              </div>
            )}
            {lesson.toolboxes && (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Code2 className="h-4 w-4 mt-0.5" />
                <span>
                  <strong>Required Toolboxes:</strong> {lesson.toolboxes}
                </span>
              </div>
            )}
          </div>

          {/* Tabs Content */}
          <Tabs defaultValue="outcomes" className="w-full">
            <ScrollArea className="w-full whitespace-nowrap rounded-md border mb-6">
              <TabsList className="inline-flex h-12 items-center justify-start rounded-none border-none bg-transparent p-1">
                <TabsTrigger
                  value="outcomes"
                  className="data-[state=active]:bg-[#0b6d41] data-[state=active]:text-white rounded-md px-4"
                >
                  <Target className="h-4 w-4 mr-2" />
                  Outcomes
                </TabsTrigger>
                <TabsTrigger
                  value="faculty"
                  className="data-[state=active]:bg-[#0b6d41] data-[state=active]:text-white rounded-md px-4"
                >
                  <Video className="h-4 w-4 mr-2" />
                  Faculty Script
                </TabsTrigger>
                <TabsTrigger
                  value="content"
                  className="data-[state=active]:bg-[#0b6d41] data-[state=active]:text-white rounded-md px-4"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Content
                </TabsTrigger>
                <TabsTrigger
                  value="exercises"
                  className="data-[state=active]:bg-[#0b6d41] data-[state=active]:text-white rounded-md px-4"
                >
                  <Code2 className="h-4 w-4 mr-2" />
                  Exercises
                </TabsTrigger>
                <TabsTrigger
                  value="ai-prompts"
                  className="data-[state=active]:bg-[#0b6d41] data-[state=active]:text-white rounded-md px-4"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI Prompts
                </TabsTrigger>
                <TabsTrigger
                  value="troubleshooting"
                  className="data-[state=active]:bg-[#0b6d41] data-[state=active]:text-white rounded-md px-4"
                >
                  <Bug className="h-4 w-4 mr-2" />
                  Troubleshooting
                </TabsTrigger>
                <TabsTrigger
                  value="interview"
                  className="data-[state=active]:bg-[#0b6d41] data-[state=active]:text-white rounded-md px-4"
                >
                  <GraduationCap className="h-4 w-4 mr-2" />
                  Interview Prep
                </TabsTrigger>
                <TabsTrigger
                  value="resources"
                  className="data-[state=active]:bg-[#0b6d41] data-[state=active]:text-white rounded-md px-4"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Resources
                </TabsTrigger>
              </TabsList>
            </ScrollArea>

            <TabsContent value="outcomes">
              <OutcomesTab outcomes={lesson.learning_outcomes || []} />
            </TabsContent>
            <TabsContent value="faculty">
              <FacultyScriptTab script={lesson.faculty_script || []} />
            </TabsContent>
            <TabsContent value="content">
              <ContentTab content={lesson.student_content || []} />
            </TabsContent>
            <TabsContent value="exercises">
              <ExercisesTab exercises={lesson.exercises || []} />
            </TabsContent>
            <TabsContent value="ai-prompts">
              <AIPromptsTab prompts={lesson.gemini_prompts || []} />
            </TabsContent>
            <TabsContent value="troubleshooting">
              <TroubleshootingTab items={lesson.error_troubleshooting || []} />
            </TabsContent>
            <TabsContent value="interview">
              <InterviewPrepTab questions={lesson.interview_questions || []} />
            </TabsContent>
            <TabsContent value="resources">
              <ResourcesTab resources={lesson.resources || []} />
            </TabsContent>
          </Tabs>

          {/* Self-Check Section (always visible at bottom) */}
          <div className="mt-12 mb-8">
            <Separator className="mb-8" />
            <SelfCheckTab items={lesson.self_check || []} />
          </div>

          {/* Navigation Footer */}
          <div className="mt-12 border-t pt-8">
            <div className="flex items-center justify-between">
              {prev_lesson ? (
                <Link href={`/courses/${courseId}/${prev_lesson.id}`}>
                  <Button variant="outline" className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    <div className="text-left">
                      <p className="text-xs text-muted-foreground">Previous</p>
                      <p className="text-sm font-medium">Hour {prev_lesson.hour}: {prev_lesson.title}</p>
                    </div>
                  </Button>
                </Link>
              ) : (
                <div />
              )}

              {next_lesson ? (
                <Link href={`/courses/${courseId}/${next_lesson.id}`}>
                  <Button className="gap-2" style={{ backgroundColor: JKKN_GREEN }}>
                    <div className="text-right">
                      <p className="text-xs opacity-80">Next</p>
                      <p className="text-sm font-medium">Hour {next_lesson.hour}: {next_lesson.title}</p>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <Link href={`/courses/${courseId}`}>
                  <Button className="gap-2" style={{ backgroundColor: JKKN_GREEN }}>
                    <CheckCircle2 className="h-4 w-4" />
                    Complete Course
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t py-8 bg-gray-50 dark:bg-gray-900">
          <div className="container mx-auto px-4 text-center text-gray-500">
            <p>&copy; 2026 JKKN Institutions. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
