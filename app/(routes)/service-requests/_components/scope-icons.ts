import { Globe, Building2, GraduationCap, FolderTree, BookOpen } from 'lucide-react';
import type { ServiceTypeScopeLevel } from '@/types/service-request';

export const SCOPE_ICONS: Record<ServiceTypeScopeLevel, typeof Globe> = {
  common: Globe,
  institution: Building2,
  degree: GraduationCap,
  department: FolderTree,
  program: BookOpen,
};
