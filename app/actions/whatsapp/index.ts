// app/actions/whatsapp/index.ts
// Barrel export for WhatsApp server actions

export {
  getConnectionStatus,
  initializeConnection,
  refreshQrCode,
  disconnectWhatsApp,
  grantWhatsAppAccess,
  revokeWhatsAppAccess,
  getWhatsAppSettings,
  updateWhatsAppSettings
} from './connection-actions';
