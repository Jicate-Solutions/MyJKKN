// types/cdc/career-guidance.ts
// AI Career Guidance (BUG-004057) — counsellor tool.
// A CDC staff member picks a learner; the server aggregates the learner's
// career-relevant data (profile + OBE marks + placements + internships +
// training) and an AI returns suggested career paths, skill gaps and next
// steps. Empty data sources are surfaced as a "data completeness" panel so
// CDC can see exactly what to record to sharpen the guidance.

export interface CareerGuidanceSignal {
  key: string;          // 'profile' | 'aspirations' | 'capabilities' | 'prior_marks' | 'readiness' | 'obe_marks' | 'placements' | 'internships' | 'training'
  label: string;        // human label, e.g. 'Internship history'
  present: boolean;     // is there usable data?
  detail: string;       // e.g. '0 records — add via Internships', or '12th: 92%'
  fillHint: string | null; // where to add it, e.g. 'Record under CDC → Internships'
}

export interface CareerPathSuggestion {
  title: string;        // e.g. 'Data Analyst'
  why: string;          // one-line rationale grounded in the student's data
}

export interface CareerGuidance {
  summary: string;
  careerPaths: CareerPathSuggestion[];
  skillGaps: string[];
  nextSteps: string[];
  dataToImprove: string[];   // what to record to make future guidance sharper
}

export interface CareerGuidanceResult {
  learner: {
    id: string;
    name: string;
    program: string | null;
    department: string | null;
    year: string | null;
  };
  signals: CareerGuidanceSignal[];
  completenessPct: number;      // 0-100, share of signals present
  guidance: CareerGuidance;
  generatedAt: string;          // ISO
  model: string;
}

export interface GenerateCareerGuidanceRequest {
  learnerId: string;
}
