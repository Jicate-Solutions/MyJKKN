/**
 * HR Templates Library — TypeScript Types
 *
 * Maps to migration: 20260526030000_hr_templates_table.sql
 */

export type TemplateCategory =
  | 'interview_questions'
  | 'email_templates'
  | 'process_guides'
  | 'checklists'
  | 'evaluation_forms'
  | 'policy_templates'
  | 'report_templates'
  | 'onboarding_docs'
  | 'offboarding_docs';

export type TemplateFileType = 'pdf' | 'docx' | 'xlsx' | 'md' | 'link';

export interface HRTemplate {
  id: string;
  title: string;
  description: string | null;
  category: TemplateCategory;
  file_url: string | null;
  file_type: TemplateFileType | null;
  tags: string[];
  is_active: boolean;
  uploaded_by: string | null;
  download_count: number;
  created_at: string;
  updated_at: string;
}

export interface HRTemplateInsert {
  title: string;
  description?: string | null;
  category: TemplateCategory;
  file_url?: string | null;
  file_type?: TemplateFileType | null;
  tags?: string[];
}

export interface HRTemplateUpdate {
  title?: string;
  description?: string | null;
  category?: TemplateCategory;
  file_url?: string | null;
  file_type?: TemplateFileType | null;
  tags?: string[];
  is_active?: boolean;
}

export interface TemplateFilters {
  category?: TemplateCategory;
  search?: string;
  is_active?: boolean;
}

export const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: 'interview_questions', label: 'Interview Questions' },
  { value: 'email_templates', label: 'Email Templates' },
  { value: 'process_guides', label: 'Process Guides' },
  { value: 'checklists', label: 'Checklists' },
  { value: 'evaluation_forms', label: 'Evaluation Forms' },
  { value: 'policy_templates', label: 'Policy Templates' },
  { value: 'report_templates', label: 'Report Templates' },
  { value: 'onboarding_docs', label: 'Onboarding Docs' },
  { value: 'offboarding_docs', label: 'Offboarding Docs' },
];
