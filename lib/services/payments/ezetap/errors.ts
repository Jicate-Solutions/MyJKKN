// lib/services/payments/ezetap/errors.ts
//
// What the CASHIER is told when the terminal refuses a push.
//
// The vendor's errorMessage is written for integrators ("Android FCM token not
// found"). The person reading this is at a counter with a customer waiting, and
// needs one thing: what to do next. Every message should end in an action.
//
// Codes (docs/razorpay-pos/RazorpayPOS-P2P-DQR-API-Documentation.md §2.4):
//   EZETAP_0000382  device not found (wrong serial)
//   EZETAP_0000385  device not on the network
//   EZETAP_0000381 / EZETAP_0000384  FCM token missing / Firebase error
//   EZETAP_0000623  device busy with a pending notification
//   EZETAP_0000039 / 0000050 / 0000162  amount unsupported / above / below limit
//   EZETAP_0000148  device does not belong to the org
//   EZETAP_6000001  payment mode not provisioned

export function describePushError(
  code: string | null,
  vendorMessage: string,
  deviceLabel: string,
): string {
  // TODO(you): map the codes above to counter-facing wording. See the note in chat.
  return `${deviceLabel}: ${vendorMessage}${code ? ` (${code})` : ''}. Take payment another way.`;
}
