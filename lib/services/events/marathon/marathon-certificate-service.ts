// lib/services/events/marathon/marathon-certificate-service.ts
// BACKWARD-COMPAT SHIM (Events Platform Promotion PR6). Certificates were promoted to the shared events
// layer; this re-exports the canonical EventCertificateService (generate / list / stats / public verify
// with the winners-photo split) so existing marathon imports keep working unchanged. Remove in cleanup PR.
export {
  EventCertificateService as MarathonCertificateService,
  certificateVerifyUrl,
  isWinnerTier,
} from '@/lib/services/events/shared/event-certificate-service';
export type {
  GenerateCertificatesResult,
  CertificateStats,
  CertificateListRow,
  EventCertificateVerification,
} from '@/lib/services/events/shared/event-certificate-service';
