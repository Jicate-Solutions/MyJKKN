// Admission Services Index

export { AdmissionService } from './admission-service';
export { AdmissionAIService } from './admission-ai-service';
export { ConsultantService } from './consultant-service';

// Simple DateRange type for admission services
export interface DateRange {
  from: string;
  to: string;
  label?: string;
}
