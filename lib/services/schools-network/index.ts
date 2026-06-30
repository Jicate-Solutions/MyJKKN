// lib/services/schools-network/index.ts
// Barrel exports for the Schools Network module service layer.
export { SchoolsService } from './schools-service';
export { SchoolSessionsService } from './sessions-service';
export { SchoolContributionsService } from './contributions-service';
export { ProgramPartnersService } from './partners-service';
export { SchoolContactsService } from './contacts-service';
export type {
  CreateContactInput,
  UpdateContactInput,
} from './contacts-service';
export { SchoolJkknOwnersService } from './jkkn-owners-service';
