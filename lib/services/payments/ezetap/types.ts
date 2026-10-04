// lib/services/payments/ezetap/types.ts
//
// Wire types for the Razorpay POS (Ezetap) p2padapter API — the server-to-server
// "push a payment to a physical terminal" contract used by the DQR soundbox.
//
// Vendor contract: docs/razorpay-pos/RazorpayPOS-P2P-DQR-API-Documentation.md
//
// NAMING: "DQR" already means the admission Data Quality Report in this codebase
// (lib/services/admission/dqr-service.ts), so nothing here is called dqr-*.

/** demo → demo.ezetap.com (SIMULATED money); live → www.ezetap.com. */
export type EzetapEnvironment = 'demo' | 'live';

/** The pushTo.deviceId suffix. Soundbox = DQR; android = POS Bridge handheld. */
export type EzetapDeviceKind = 'razorpay_pos_soundbox' | 'ezetap_android';

/** Everything needed to talk to one terminal. appKey never leaves the server. */
export interface EzetapDeviceCredentials {
  deviceId: string;          // ims_pos_devices.id
  institutionId: string;
  storeId: string;
  label: string;
  serial: string;
  kind: EzetapDeviceKind;
  username: string;
  appKey: string;
  accountLabel: string | null;
  environment: EzetapEnvironment;
  isActive: boolean;
}

/** Fields common to every p2padapter response. */
export interface EzetapBaseResponse {
  success?: boolean;
  messageCode?: string | null;
  message?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  realCode?: string | null;
}

export interface EzetapPayResponse extends EzetapBaseResponse {
  p2pRequestId?: string | null;
}

export interface EzetapCancelResponse extends EzetapBaseResponse {
  origP2pRequestId?: string | null;
}

/**
 * The status response is a large payment object; only the fields we act on or
 * store for the receipt are typed. The whole body is kept in gateway_response.
 */
export interface EzetapStatusResponse extends EzetapBaseResponse {
  /** ABSENT until the device finishes. AUTHORIZED is the only "paid". */
  status?: string | null;
  states?: string[] | null;
  txnId?: string | null;
  amount?: string | number | null;
  totalAmount?: string | number | null;
  amountOriginal?: string | number | null;
  paymentMode?: string | null;
  mode?: string | null;
  rrNumber?: string | null;
  authCode?: string | null;
  payerName?: string | null;
  customerMobile?: string | null;
  customerName?: string | null;
  externalRefNumber?: string | null;
  deviceSerial?: string | null;
  settlementStatus?: string | null;
  postingDate?: number | null;
  receiptUrl?: string | null;
  p2pRequestId?: string | null;
  [key: string]: unknown;
}
