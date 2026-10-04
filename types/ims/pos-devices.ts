// Admin view of IMS counter payment terminals (ims_pos_devices).
// Safe for the browser: nothing here carries the Ezetap appKey — only whether one is saved.

export type ImsPosDeviceKind = 'razorpay_pos_soundbox' | 'ezetap_android';
export type ImsPosDeviceEnvironment = 'demo' | 'live';

export interface ImsPosDeviceRow {
  id: string;
  institutionId: string;
  institutionName: string | null;
  storeId: string;
  storeName: string | null;
  storeCode: string | null;
  label: string;
  serial: string;
  kind: ImsPosDeviceKind;
  username: string | null;
  hasCredentials: boolean;
  accountLabel: string | null;
  environment: ImsPosDeviceEnvironment;
  isActive: boolean;
  lastPushAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastErrorAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A selling counter a terminal can be placed on. */
export interface ImsPosDeviceStoreOption {
  id: string;
  name: string;
  code: string | null;
  institutionId: string;
  institutionName: string | null;
}

export interface ImsPosDeviceListResponse {
  devices: ImsPosDeviceRow[];
  stores: ImsPosDeviceStoreOption[];
  /** False when RAZORPAY_CREDENTIALS_MASTER_SECRET is unset: credentials cannot be saved or used. */
  vaultConfigured: boolean;
}

export interface ImsPosDeviceMetaInput {
  storeId: string;
  label: string;
  serial: string;
  kind: ImsPosDeviceKind;
  accountLabel: string | null;
  environment: ImsPosDeviceEnvironment;
}

export interface ImsPosDeviceTestResult {
  ok: boolean;
  p2pRequestId?: string;
  code?: string | null;
  message: string;
  /** Whether the ₹1 test was withdrawn from the terminal afterwards. */
  cancelled?: boolean;
}
