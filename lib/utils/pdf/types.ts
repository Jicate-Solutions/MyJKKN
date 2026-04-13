// Shared PDF generator types — re-exports from central types file
// Single source of truth: types/documents.ts

export type {
  DocumentBranding,
  DocumentMetadata,
  DocumentType,
  DocumentCategory,
  PageOrientation,
  PageSize,
  SignatureConfig,
} from '@/types/documents';

export type { RGBColor } from './brand-utils';
