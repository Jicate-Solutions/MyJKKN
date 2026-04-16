// components/okr/index.ts
// Central export for all OKR-related components

export { BlockedAlert, OKRBlockerWrapper, withOKRBlocker } from './blocked-alert';
export { OKRNotificationBell } from './okr-notification-bell';

// Social Features (Comments, Reactions, Attachments)
export { CommentThread, CommentCountBadge } from './comment-thread';
export { ReactionPicker, ReactionBadges } from './reaction-picker';
export { FileUpload, AttachmentCountBadge } from './file-upload';

// Analytics Widgets
export {
  MiniTrendWidget,
  SummaryStatsWidget,
  DepartmentComparisonWidget,
  AtRiskAlertWidget,
  ComplianceRateWidget,
  AnalyticsQuickLink,
} from './analytics-widgets';
