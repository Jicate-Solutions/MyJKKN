/**
 * VAC Lessons Import Script
 * -------------------------
 * Imports lesson content from markdown files into the VAC system.
 *
 * Usage: npx tsx scripts/import-vac-lessons.ts
 *
 * This script:
 * - Reads markdown lesson files from the vault
 * - Parses the structured content into JSONB fields
 * - Gets the CSE-MATLAB course ID from the database
 * - Inserts lessons with all content properly populated
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, readdirSync } from 'fs';

// Load environment variables from .env.local
config({ path: resolve(__dirname, '../.env.local') });

// Initialize Supabase client with service role key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// ===== TYPE DEFINITIONS =====

interface FacultyScriptSection {
  time_range: string;
  title: string;
  content: string;
  visuals?: string;
}

interface ContentBlock {
  type: 'text' | 'code' | 'table' | 'diagram' | 'checklist';
  title?: string;
  content: string;
  language?: string;
}

interface Exercise {
  id: string;
  title: string;
  difficulty: 'required' | 'medium' | 'optional';
  question: string;
  solution?: string;
  hints?: string[];
}

interface GeminiPrompt {
  title: string;
  prompt: string;
}

interface TroubleshootingItem {
  error: string;
  problem: string;
  cause: string;
  fix: string;
  prevention: string;
  code_example?: string;
}

interface InterviewQuestion {
  question: string;
  model_answer: string;
}

interface Resource {
  type: string;
  title: string;
  link: string;
  duration?: string;
}

interface ParsedLesson {
  week: number;
  hour: number;
  title: string;
  duration_minutes: number;
  prerequisites: string;
  toolboxes: string;
  learning_outcomes: string[];
  faculty_script: FacultyScriptSection[];
  student_content: ContentBlock[];
  exercises: Exercise[];
  gemini_prompts: GeminiPrompt[];
  error_troubleshooting: TroubleshootingItem[];
  interview_questions: InterviewQuestion[];
  resources: Resource[];
  self_check: string[];
  is_published: boolean;
}

// ===== PARSING FUNCTIONS =====

function extractMetadata(content: string): { week: number; hour: number; title: string; prerequisites: string; toolboxes: string } {
  const titleMatch = content.match(/^#\s+CSE-MATLAB\s+-\s+Week\s+(\d+)\s+Hour\s+(\d+):\s+(.+)$/m);
  const week = titleMatch ? parseInt(titleMatch[1]) : 1;
  const hour = titleMatch ? parseInt(titleMatch[2]) : 1;
  const title = titleMatch ? titleMatch[3].trim() : 'Unknown';

  const prerequisitesMatch = content.match(/\|\s*Prerequisites\s*\|\s*(.+?)\s*\|/i);
  const prerequisites = prerequisitesMatch ? prerequisitesMatch[1].trim() : '';

  const toolboxesMatch = content.match(/\|\s*MATLAB Toolboxes\s*\|\s*(.+?)\s*\|/i);
  const toolboxes = toolboxesMatch ? toolboxesMatch[1].trim() : 'None (core MATLAB)';

  return { week, hour, title, prerequisites, toolboxes };
}

function extractLearningOutcomes(content: string): string[] {
  const section = extractSection(content, '## Learning Outcomes', '---');
  if (!section) return [];

  const outcomes: string[] = [];
  const lines = section.split('\n');

  for (const line of lines) {
    // Match numbered items with bold action words
    const match = line.match(/^\d+\.\s+\*\*(.+?)\*\*\s+(.+)$/);
    if (match) {
      outcomes.push(`${match[1]} ${match[2]}`);
    }
  }

  return outcomes;
}

function extractFacultyScript(content: string): FacultyScriptSection[] {
  const section = extractSection(content, '## Faculty Script', '## Student Content');
  if (!section) return [];

  const sections: FacultyScriptSection[] = [];
  // Match time-range headers like ### [0:00-0:05] Opening
  const timeRegex = /###\s+\[(\d+:\d+-\d+:\d+)\]\s+(.+?)(?=\n)/g;
  let match;

  const positions: { start: number; end: number; time_range: string; title: string }[] = [];

  while ((match = timeRegex.exec(section)) !== null) {
    positions.push({
      start: match.index + match[0].length,
      time_range: `[${match[1]}]`,
      title: match[2].trim(),
      end: 0
    });
  }

  // Set end positions
  for (let i = 0; i < positions.length; i++) {
    positions[i].end = i < positions.length - 1 ?
      section.indexOf('### [', positions[i].start) :
      section.length;
  }

  // Extract content for each section
  for (const pos of positions) {
    const sectionContent = section.substring(pos.start, pos.end).trim();

    // Extract visuals
    const visualsMatch = sectionContent.match(/\*\*Visual:\*\*\s*(.+?)(?=\n\n|\*\*|$)/s);
    const visuals = visualsMatch ? visualsMatch[1].trim() : undefined;

    sections.push({
      time_range: pos.time_range,
      title: pos.title,
      content: sectionContent,
      visuals
    });
  }

  return sections;
}

function extractStudentContent(content: string): ContentBlock[] {
  const section = extractSection(content, '## Student Content', '## Code Examples');
  if (!section) return [];

  const blocks: ContentBlock[] = [];

  // Split by ### headers
  const parts = section.split(/(?=###\s+)/);

  for (const part of parts) {
    if (!part.trim()) continue;

    const headerMatch = part.match(/^###\s+(.+?)(?:\n|$)/);
    const title = headerMatch ? headerMatch[1].trim() : undefined;
    const content = headerMatch ? part.substring(headerMatch[0].length).trim() : part.trim();

    if (content) {
      // Check if it contains code blocks
      if (content.includes('```')) {
        blocks.push({
          type: 'code',
          title,
          content,
          language: 'matlab'
        });
      } else if (content.includes('|') && content.split('|').length > 3) {
        blocks.push({
          type: 'table',
          title,
          content
        });
      } else {
        blocks.push({
          type: 'text',
          title,
          content
        });
      }
    }
  }

  return blocks;
}

function extractExercises(content: string): Exercise[] {
  const section = extractSection(content, '## Exercises', '## Gemini Prompts');
  if (!section) return [];

  const exercises: Exercise[] = [];

  // Split by ### Exercise headers
  const parts = section.split(/(?=###\s+Exercise\s+\d+)/);

  for (const part of parts) {
    const headerMatch = part.match(/^###\s+Exercise\s+(\d+):\s*(.+?)\s*\((\w+)\)/);
    if (!headerMatch) continue;

    const id = `exercise-${headerMatch[1]}`;
    const title = headerMatch[2].trim();
    const difficultyRaw = headerMatch[3].toLowerCase();
    const difficulty: 'required' | 'medium' | 'optional' =
      difficultyRaw === 'easy' ? 'required' :
      difficultyRaw === 'medium' ? 'medium' : 'optional';

    // Extract question
    const questionMatch = part.match(/\*\*Question:\*\*\s*([\s\S]+?)(?=\*\*Hints:\*\*|\*\*Solution:\*\*|$)/);
    const question = questionMatch ? questionMatch[1].trim() : '';

    // Extract hints
    const hintsMatch = part.match(/\*\*Hints:\*\*\s*([\s\S]+?)(?=\*\*Solution:\*\*|$)/);
    const hints: string[] = [];
    if (hintsMatch) {
      const hintLines = hintsMatch[1].split('\n');
      for (const line of hintLines) {
        const hintMatch = line.match(/^\d+\.\s+(.+)/);
        if (hintMatch) {
          hints.push(hintMatch[1].trim());
        }
      }
    }

    // Extract solution
    const solutionMatch = part.match(/\*\*Solution:\*\*\s*([\s\S]+?)(?=\*\*Solution Explanation:\*\*|###|$)/);
    const solution = solutionMatch ? solutionMatch[1].trim() : undefined;

    exercises.push({
      id,
      title,
      difficulty,
      question,
      solution,
      hints: hints.length > 0 ? hints : undefined
    });
  }

  return exercises;
}

function extractGeminiPrompts(content: string): GeminiPrompt[] {
  const section = extractSection(content, '## Gemini Prompts', '## Error Troubleshooting');
  if (!section) return [];

  const prompts: GeminiPrompt[] = [];

  // Split by ### Prompt headers
  const parts = section.split(/(?=###\s+Prompt\s+\d+)/);

  for (const part of parts) {
    const headerMatch = part.match(/^###\s+Prompt\s+\d+:\s*(.+?)(?:\n|$)/);
    if (!headerMatch) continue;

    const title = headerMatch[1].trim();

    // Extract the code block content
    const codeMatch = part.match(/```\n?([\s\S]+?)```/);
    const prompt = codeMatch ? codeMatch[1].trim() : '';

    if (prompt) {
      prompts.push({ title, prompt });
    }
  }

  return prompts;
}

function extractErrorTroubleshooting(content: string): TroubleshootingItem[] {
  const section = extractSection(content, '## Error Troubleshooting', '## Interview Questions');
  if (!section) return [];

  const items: TroubleshootingItem[] = [];

  // Split by ### Error headers
  const parts = section.split(/(?=###\s+Error\s+\d+)/);

  for (const part of parts) {
    const headerMatch = part.match(/^###\s+Error\s+\d+:\s*["""](.+?)["""]/);
    if (!headerMatch) continue;

    const error = headerMatch[1].trim();

    // Extract table rows
    const errorMsgMatch = part.match(/\*\*Error Message\*\*\s*\|\s*`(.+?)`/);
    const causeMatch = part.match(/\*\*Cause\*\*\s*\|\s*(.+?)\s*\|/);
    const fixMatch = part.match(/\*\*Fix\*\*\s*\|\s*(.+?)\s*\|/);
    const preventionMatch = part.match(/\*\*Prevention\*\*\s*\|\s*(.+?)\s*\|/);

    items.push({
      error,
      problem: errorMsgMatch ? errorMsgMatch[1].trim() : error,
      cause: causeMatch ? causeMatch[1].trim() : '',
      fix: fixMatch ? fixMatch[1].trim() : '',
      prevention: preventionMatch ? preventionMatch[1].trim() : ''
    });
  }

  return items;
}

function extractInterviewQuestions(content: string): InterviewQuestion[] {
  const section = extractSection(content, '## Interview Questions', '## Resources');
  if (!section) return [];

  const questions: InterviewQuestion[] = [];

  // Split by ### Question headers
  const parts = section.split(/(?=###\s+Question\s+\d+)/);

  for (const part of parts) {
    // Extract the quoted question
    const questionMatch = part.match(/\*\*Q:\*\*\s*["""](.+?)["""]/s);
    if (!questionMatch) continue;

    const question = questionMatch[1].trim();

    // Extract model answer
    const answerMatch = part.match(/\*\*Model Answer:\*\*\s*([\s\S]+?)(?=\*\*Company Context:\*\*|###|$)/);
    const model_answer = answerMatch ? answerMatch[1].trim() : '';

    questions.push({ question, model_answer });
  }

  return questions;
}

function extractResources(content: string): Resource[] {
  const section = extractSection(content, '## Resources', '## Self-Check');
  if (!section) return [];

  const resources: Resource[] = [];

  // Parse table rows
  const lines = section.split('\n');

  for (const line of lines) {
    // Skip header and separator rows
    if (line.includes('Type') && line.includes('Title')) continue;
    if (line.match(/^\|[-\s|]+\|$/)) continue;

    // Parse data rows
    const parts = line.split('|').map(p => p.trim()).filter(p => p);
    if (parts.length >= 3) {
      const type = parts[0];
      const title = parts[1];

      // Extract link from markdown format [text](url)
      const linkMatch = parts[2].match(/\[.+?\]\((.+?)\)/);
      const link = linkMatch ? linkMatch[1] : parts[2];

      const duration = parts.length > 3 ? parts[3] : undefined;

      if (type && title && link && !type.includes('---')) {
        resources.push({
          type,
          title,
          link,
          duration: duration && duration !== '-' ? duration : undefined
        });
      }
    }
  }

  return resources;
}

function extractSelfCheck(content: string): string[] {
  const section = extractSection(content, '## Self-Check', '---');
  if (!section) return [];

  const checks: string[] = [];
  const lines = section.split('\n');

  for (const line of lines) {
    const match = line.match(/^-\s*\[\s*\]\s*(.+)$/);
    if (match) {
      checks.push(match[1].trim());
    }
  }

  return checks;
}

function extractSection(content: string, startMarker: string, endMarker: string): string | null {
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) return null;

  let endIndex = content.indexOf(endMarker, startIndex + startMarker.length);
  if (endIndex === -1) {
    // If end marker not found, try next ## section
    const nextSection = content.indexOf('\n## ', startIndex + startMarker.length);
    endIndex = nextSection !== -1 ? nextSection : content.length;
  }

  return content.substring(startIndex + startMarker.length, endIndex).trim();
}

function parseLesson(fileContent: string): ParsedLesson {
  const metadata = extractMetadata(fileContent);

  return {
    week: metadata.week,
    hour: metadata.hour,
    title: metadata.title,
    duration_minutes: 60,
    prerequisites: metadata.prerequisites,
    toolboxes: metadata.toolboxes,
    learning_outcomes: extractLearningOutcomes(fileContent),
    faculty_script: extractFacultyScript(fileContent),
    student_content: extractStudentContent(fileContent),
    exercises: extractExercises(fileContent),
    gemini_prompts: extractGeminiPrompts(fileContent),
    error_troubleshooting: extractErrorTroubleshooting(fileContent),
    interview_questions: extractInterviewQuestions(fileContent),
    resources: extractResources(fileContent),
    self_check: extractSelfCheck(fileContent),
    is_published: true
  };
}

// ===== MAIN IMPORT FUNCTION =====

async function importLessons() {
  console.log('VAC Lessons Import Script');
  console.log('=========================\n');

  // Course ID from task specification
  const COURSE_ID = '6005719d-e12e-45f0-a61f-927bdb7c160e';

  // 1. Verify course exists
  console.log('1. Verifying CSE-MATLAB course...');
  const { data: course, error: courseError } = await supabase
    .from('vac_courses')
    .select('id, code, name')
    .eq('id', COURSE_ID)
    .single();

  if (courseError || !course) {
    console.error('Error: Could not find CSE-MATLAB course');
    console.error(courseError);
    process.exit(1);
  }

  console.log(`   Found course: ${course.name} (ID: ${course.id})\n`);

  // 2. Check what's already imported
  console.log('2. Checking existing lessons...');
  const { data: existingLessons } = await supabase
    .from('vac_lessons')
    .select('hour')
    .eq('course_id', COURSE_ID);

  const existingHours = new Set((existingLessons || []).map(l => l.hour));
  console.log(`   Found ${existingHours.size} existing lessons: Hours ${Array.from(existingHours).sort((a,b) => a-b).join(', ')}\n`);

  // 3. Build list of all lesson files
  const baseDir = '/Users/omm/Vaults/JKKNKB/Initiatives/MATLAB-Campus-Wide/04-Course-Content/01-CSE';
  const allLessons: { filepath: string; hour: number }[] = [];

  // Week 1: Hours 1-10
  for (let hour = 1; hour <= 10; hour++) {
    allLessons.push({
      filepath: `${baseDir}/week-1/hour-${hour.toString().padStart(2, '0')}.md`,
      hour
    });
  }
  // Week 2: Hours 11-20
  for (let hour = 11; hour <= 20; hour++) {
    allLessons.push({
      filepath: `${baseDir}/week-2/hour-${hour.toString().padStart(2, '0')}.md`,
      hour
    });
  }
  // Week 3: Hours 21-30
  for (let hour = 21; hour <= 30; hour++) {
    allLessons.push({
      filepath: `${baseDir}/week-3/hour-${hour.toString().padStart(2, '0')}.md`,
      hour
    });
  }

  // Filter to only import missing lessons
  const lessonsToImport = allLessons.filter(l => !existingHours.has(l.hour));
  console.log(`3. Will import ${lessonsToImport.length} new lessons (Hours: ${lessonsToImport.map(l => l.hour).join(', ')})\n`);

  if (lessonsToImport.length === 0) {
    console.log('All lessons already imported!');
    process.exit(0);
  }

  // 4. Parse lesson files
  console.log('4. Parsing lesson files...');
  const parsedLessons: ParsedLesson[] = [];

  for (const lesson of lessonsToImport) {
    console.log(`   Reading hour-${lesson.hour.toString().padStart(2, '0')}.md...`);

    try {
      const content = readFileSync(lesson.filepath, 'utf-8');
      const parsed = parseLesson(content);
      parsedLessons.push(parsed);
      console.log(`   ✓ Parsed: Week ${parsed.week}, Hour ${parsed.hour} - ${parsed.title}`);
      console.log(`     - ${parsed.learning_outcomes.length} learning outcomes`);
      console.log(`     - ${parsed.faculty_script.length} faculty script sections`);
      console.log(`     - ${parsed.exercises.length} exercises`);
      console.log(`     - ${parsed.gemini_prompts.length} Gemini prompts`);
    } catch (err) {
      console.error(`   ✗ Error reading hour ${lesson.hour}:`, err);
    }
  }

  console.log(`\n   Total lessons parsed: ${parsedLessons.length}\n`);

  // 5. Insert lessons in batches
  console.log('5. Inserting lessons...');

  const lessonsWithCourseId = parsedLessons.map(lesson => ({
    course_id: COURSE_ID,
    ...lesson
  }));

  // Insert in batches of 5 to avoid timeout
  const batchSize = 5;
  let insertedCount = 0;

  for (let i = 0; i < lessonsWithCourseId.length; i += batchSize) {
    const batch = lessonsWithCourseId.slice(i, i + batchSize);
    console.log(`   Inserting batch ${Math.floor(i/batchSize) + 1} (hours ${batch.map(l => l.hour).join(', ')})...`);

    const { data: insertedLessons, error: insertError } = await supabase
      .from('vac_lessons')
      .insert(batch)
      .select('id, hour, title');

    if (insertError) {
      console.error(`   ✗ Error inserting batch:`, insertError);
      // Continue with next batch instead of failing completely
    } else {
      insertedCount += insertedLessons?.length || 0;
      for (const lesson of insertedLessons || []) {
        console.log(`   ✓ Hour ${lesson.hour}: ${lesson.title}`);
      }
    }
  }

  console.log(`\n   ✓ Inserted ${insertedCount} lessons\n`);

  // 6. Final verification
  console.log('6. Verifying final state...');
  const { data: finalLessons } = await supabase
    .from('vac_lessons')
    .select('hour, title')
    .eq('course_id', COURSE_ID)
    .order('hour');

  console.log(`   Total lessons in database: ${finalLessons?.length || 0}\n`);

  // 7. Summary
  console.log('=========================');
  console.log('Import Complete!');
  console.log('=========================\n');

  console.log('Lessons in database:');
  for (const lesson of finalLessons || []) {
    console.log(`  Hour ${lesson.hour.toString().padStart(2, ' ')}: ${lesson.title}`);
  }
}

// Run the import
importLessons()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
