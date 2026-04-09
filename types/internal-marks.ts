// types/internal-marks.ts
// Stub types for internal-marks module (types file was missing from commit)

export interface CiaRound {
  id: string;
  round_number: number;
  name: string;
  components: CiaComponent[];
  [key: string]: any;
}

export interface CiaComponent {
  id: string;
  name: string;
  max_marks: number;
  mark_field: string;
  [key: string]: any;
}

export interface CiaSettings {
  id: string;
  institution_id: string;
  rounds: CiaRound[];
  [key: string]: any;
}

export interface ExamSession {
  id: string;
  name: string;
  [key: string]: any;
}

export interface LearnerForMarkEntry {
  id: string;
  learner_id: string;
  name: string;
  roll_number?: string;
  register_number?: string;
  marks?: Record<string, number | null>;
  [key: string]: any;
}

export interface CiaMarkSyncRecord {
  learner_id: string;
  marks: Record<string, number | null>;
  [key: string]: any;
}

export interface CiaMarksSyncRequest {
  course_id: string;
  round_id: string;
  section_id?: string;
  marks: CiaMarkSyncRecord[];
  [key: string]: any;
}

export interface CiaMarksSyncResponse {
  success: boolean;
  synced_count: number;
  errors?: string[];
  [key: string]: any;
}

export interface CiaReportLearner {
  id: string;
  name: string;
  roll_number?: string;
  register_number?: string;
  rounds: Record<string, Record<string, number | null>>;
  total?: number;
  [key: string]: any;
}

export interface CiaReportResponse {
  learners: CiaReportLearner[];
  rounds: CiaRound[];
  [key: string]: any;
}

export interface ConsolidatedReportData {
  learners: CiaReportLearner[];
  rounds: CiaRound[];
  course_name?: string;
  section_name?: string;
  [key: string]: any;
}

export type EntryWindowStatus = 'open' | 'closed' | 'upcoming' | 'expired';

export function getEntryWindowStatus(round?: CiaRound): EntryWindowStatus {
  if (!round) return 'closed';
  const now = new Date();
  const start = round.entry_start ? new Date(round.entry_start) : null;
  const end = round.entry_end ? new Date(round.entry_end) : null;
  if (start && now < start) return 'upcoming';
  if (end && now > end) return 'expired';
  if (start && end && now >= start && now <= end) return 'open';
  return 'closed';
}

export const COMPONENT_MARK_FIELDS: Record<string, string> = {
  assignment: 'assignment_marks',
  quiz: 'quiz_marks',
  seminar: 'seminar_marks',
  attendance: 'attendance_marks',
  midterm: 'midterm_marks',
  practical: 'practical_marks',
  viva: 'viva_marks',
  project: 'project_marks',
};
