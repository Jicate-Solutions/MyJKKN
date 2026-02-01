// Stakeholder NPS Hooks - Barrel Export

// Survey hooks
export {
  useNPSSurveys,
  useNPSSurvey,
  useActiveSurveys,
  useCreateNPSSurvey,
  useUpdateNPSSurvey,
  useActivateSurvey,
  useCloseSurvey,
  useArchiveSurvey,
  useDeleteNPSSurvey,
  npsSurveyKeys
} from './use-nps-surveys';

// Response hooks
export {
  useNPSResponses,
  useNPSResponse,
  useSurveyResponseSummary,
  useSubmitNPSResponse,
  useExportResponses,
  npsResponseKeys
} from './use-nps-responses';

// Analytics hooks
export {
  useNPSAnalytics,
  useNPSDashboard,
  useRecalculateAnalytics,
  npsAnalyticsKeys
} from './use-nps-analytics';
