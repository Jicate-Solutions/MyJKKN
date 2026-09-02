# Razorpay POS — Integration Solution Documentation

> **Source:** `RazorpayPOS_p2p-dqr-sdk compressed.pdf` — *Razorpay POS Integration Solution Doc*
> (POS Bridge · DQR · Android SDK), 64 pages.
> **Transcribed:** 2026-08-27. Faithful Markdown rendering of the vendor PDF for use in-repo.
> **Vendor contact:** `pos-integrations@razorpay.com`
>
> **This file is reference material, not a design.** It records what Razorpay/Ezetap
> documents, including the places where the source is ambiguous or internally
> inconsistent — those are flagged in blockquotes marked **⚠ Source note** and are the
> transcriber's observation, not the vendor's text.
>
> For how MyJKKN intends to *use* this API, see
> [`specs/razorpay-pos-dqr-device-integration-2026-08-27.md`](../../specs/razorpay-pos-dqr-device-integration-2026-08-27.md).

---

## Table of contents

- [1. POS Bridge — Razorpay POS's integrated payment solution](#1-pos-bridge--razorpay-poss-integrated-payment-solution)
  - [1.1 Prerequisites](#11-prerequisites)
  - [1.2 What is the Android POS Bridge solution?](#12-what-is-the-android-pos-bridge-solution)
  - [1.3 Action flow for Android POS](#13-action-flow-for-android-pos)
  - [1.4 Getting started](#14-getting-started)
  - [1.5 Advantages](#15-advantages)
  - [1.6 API details](#16-api-details)
    - [1.6.1 Pay — send a POS Bridge notification](#161-pay--send-a-pos-bridge-notification)
    - [1.6.2 Status — get notification status](#162-status--get-notification-status)
    - [1.6.3 Cancel — cancel a notification](#163-cancel--cancel-a-notification)
  - [1.7 Best practices — the polling sequence](#17-best-practices--the-polling-sequence)
  - [1.8 Testing the integration](#18-testing-the-integration)
  - [1.9 Solution capabilities](#19-solution-capabilities)
  - [1.10 Steps to go live](#110-steps-to-go-live)
- [2. DQR — Razorpay POS's integrated Dynamic QR solution](#2-dqr--razorpay-poss-integrated-dynamic-qr-solution)
- [3. Razorpay POS Android SDK](#3-razorpay-pos-android-sdk)
- [Appendix A — Consolidated error codes](#appendix-a--consolidated-error-codes)
- [Appendix B — Consolidated message codes](#appendix-b--consolidated-message-codes)
- [Appendix C — Test amounts for error simulation](#appendix-c--test-amounts-for-error-simulation)

---

# 1. POS Bridge — Razorpay POS's integrated payment solution

## 1.1 Prerequisites

- The merchant system must have internet connectivity (Wi-Fi or mobile hotspot).
- The merchant system must be able to call/access an external API such as the Ezetap
  POS Bridge API from its own system using **minimum TLS 1.2**.

## 1.2 What is the Android POS Bridge solution?

Ezetap's POS Bridge solution allows integration with a customer's billing application
across any operating system (Web / Android / Linux and others) for payment processing.

**POS Bridge is server-to-server communication**, enabled by the billing application to
the POS terminal, which then receives a payment notification for completion.

POS Bridge is an integration tool devised to record all transactions performed on the POS
via the merchant billing system, irrespective of the payment mode — *integrated* (inside
the Ezetap terminal) and *non-integrated* (outside the Ezetap terminal). In addition to
recording all transactions, the solution assists merchants to integrate POS Bridge with
the merchant's billing system for better reconciliation and reporting needs (through
Ezetap VAS services).

### Architecture

```
 Billing            Merchant server              Razorpay server           Payment            Issuer
 application                                                              authorization        bank
 ───────────        ───────────────              ───────────────          ─────────────       ──────
     │  agent initiates      │                          │                       │                │
     ├── payment push ──────▶│                          │                       │                │
     │                       ├── calls PUSH2PAY API ───▶│                       │                │
     │                       │                          ├── payment ──────────▶ │  DQR / device  │
     │                       │                          │   notification        │                │
     │                       │                          │   to the device       │                │
     │                       │                          │                       ├── auth ──────▶ │
     │                       │                          │  device starts txn    │◀── validate ───┤
     │                       │                          │◀── & receives txn ────┤                │
     │                       │◀── txn response ─────────┤    response           │                │
     │◀── merchant calls ────┤                          │                       │                │
     │    P2P API to display │                          │                       │                │
     │    txn details        │                          │                       │                │
```

## 1.3 Action flow for Android POS

The Android POS is an Android-based smart device. It is a standalone SIM + Wi-Fi enabled
device which can enable various modes of payment:

- Cash
- Cards
- Wallets
- UPI
- Remote Pay — Payment Links

### The transaction flow for an Android POS

1. Agent logs into the device.
2. After billing is done on the billing system, **Pay** is pressed on the billing system
   (or billing application). The payment mode (e.g. CARD/UPI) can be selected on the
   billing system.
3. At this point an API call is made to the Ezetap server, which is routed to the payment
   device.
4. The device receives a notification along with the payment context (e.g. unique
   reference number, amount, etc.).
5. Considering card transactions here, the agent asks the customer to insert the card and
   the customer enters the PIN.
6. Authentication happens based on the PIN entry, and once the payment is authenticated
   the same response is updated back to the device.
7. The billing system is updated (if integrated) with the transaction details via an
   API call.

## 1.4 Getting started

Razorpay recommends starting with a **demo environment** test, validating the flow and use
cases, then moving to the production environment.

To start the demo integration you will need:

- **Demo merchant account** — provide a mobile number and address for Razorpay to create
  the merchant account.
- **Demo App Key** — used as part of the code to initiate the application (see
  [§1.6](#16-api-details)).
- **Demo device** — provide an address where Razorpay can deliver a demo device.

An Ezetap point of contact is available throughout the integration for support or
troubleshooting.

## 1.5 Advantages

- One-stop solution for collecting payment across multiple payment modes.
- Avoids manual intervention — accept payments faster and error-free.
- Reduces cash pilferage.
- Acts as a single source of truth for every transaction, for any payment mode present on
  the billing system.
- Saves effort and time for reconciliation, due to data availability across pay modes.
- Flexibility to record payment modes without any changes at the merchant end.

## 1.6 API details

> All requests and responses are of type `application/json`.

| Purpose | Demo URL | Production URL | Method |
|---|---|---|---|
| Pay | `https://demo.ezetap.com/api/3.0/p2padapter/pay` | `https://www.ezetap.com/api/3.0/p2padapter/pay` | `POST` |
| Status | `https://demo.ezetap.com/api/3.0/p2padapter/status` | `https://www.ezetap.com/api/3.0/p2padapter/status` | `POST` |
| Cancel | `https://demo.ezetap.com/api/3.0/p2padapter/cancel` | `https://www.ezetap.com/api/3.0/p2padapter/cancel` | `POST` |

Request HTTP headers: `Content-Type: application/json`

---

### 1.6.1 Pay — send a POS Bridge notification

**Description:** API to send a POS Bridge notification to an Ezetap device.

#### Request body

| Parameter | Datatype | Mandatory | Description |
|---|---|:---:|---|
| `appKey` | String(50) | **Yes** | API key shared by Ezetap. |
| `pushTo` | JSON with `deviceId` as String(250) | **Yes** | Destination info — the device id of the POS on which the notification will be sent. |
| `username` | String(20) | **Yes** | Username must be passed. |
| `description` | String(50) | No | Describes the notification purpose. |
| `amount` | BigDecimal | **Yes** | Transaction amount. |
| `amountCashBack` | BigDecimal | No | Cashback amount, if required. |
| `amountAdditional` | BigDecimal | No | Additional amount, if required. |
| `externalRefNumber` | String | **Yes** | Reference number of the bill. |
| `customerMobileNumber` | String | No | Customer mobile number. |
| `customerEmail` | String | No | Customer's email id. |
| `customerName` | String | No | Customer's name. |
| `accountLabel` | String | No | A tag, used for passing the MID/TID label in a multi-TID case. |
| `externalRefNumber2` | String | No | — |
| `externalRefNumber3` | String | No | — |
| `externalRefNumber4` | String | No | — |
| `externalRefNumbers` | JSON String | No | — |
| `additionalData` | String | No | `additionalData` is JSON. |
| `orgCode` | String | No | Merchant's `orgCode`. |
| `paymentBy` | String | No | For service-fee configuration: `DEBIT` \| `CREDIT`. |
| `mode` | String | **Yes** | Accepted values: `ALL`, `CARD`, `CASH`, `UPI`, `BHARATQR`, etc. `ALL` must be passed when every available payment mode is to be shown on the device. Specific non-integrated payment modes are configured case by case and the mode value must be provisioned. |
| `Emi Type` | String | No | `EMI`, to be used for CARD/NBFC-related EMI transactions. |

> **⚠ Source note — the unit of `amount` is never stated.** The datatype is declared
> `BigDecimal`, sample *requests* (§1.6.1, §2.3) send `"amount":"2100"`, and the sample
> *failure response* (§1.6.2) carries `"amount": 531.00` / `"amountOriginal": 531.00` /
> `"amountCashBack": 0.00`. Two decimal places and a `BigDecimal` type both point to
> **rupees**, but the PDF nowhere says so. Verify with a ₹1.00 transaction on the demo
> host before relying on either reading.

#### Response body

| Parameter | Datatype | Description |
|---|---|---|
| `success` | Boolean | Indicates whether the notification has been started successfully or not. |
| `errorCode` | String(48) | Error code if the notification has not been initiated, due to either a token issue or a wrong `deviceId`. Empty on successful creation. |
| `errorMessage` | String(256) | Descriptive error message for the above error code. Empty on successful initiation. |
| `p2pRequestId` | — | Unique identifier generated for each payment request sent to the device successfully. |

#### Sample request & response

```json
// Request
{
  "username": "",
  "appKey": "",
  "amount": "",
  "accountLabel": "",
  "customerMobileNumber": "",
  "externalRefNumber": "",
  "externalRefNumber2": "",
  "externalRefNumber4": "",
  "externalRefNumbers": [],
  "pushTo": { "deviceId": "<<enter device serial number>>|ezetap_android" },
  "mode": ""
}
```

```json
// Response
{
  "success": true,
  "messageCode": null,
  "message": null,
  "errorCode": null,
  "errorMessage": null,
  "realCode": null,
  "apiMessageTitle": null,
  "apiMessage": null,
  "apiMessageText": null,
  "apiWarning": null,
  "p2pRequestId": ""
}
```

#### Sample request & response for a multi-MID / multi-TID scenario using `accountLabel`

`accountLabel` is used when a single device settles payments to multiple settlement
accounts/TIDs. Each TID is marked to one account label; while initiating a payment request
the specific account label is passed in the Pay API request.

For instance, given two account labels — `AC1` corresponding to TID1 and `AC2`
corresponding to TID2:

```json
// Request for AC1
{
  "appKey": "demo app key",
  "username": "4444001234",
  "amount": "2100",
  "customerMobileNumber": "",
  "externalRefNumber": "Order ID",
  "externalRefNumber2": "",
  "externalRefNumber3": "",
  "accountLabel": "AC1",
  "customerEmail": "Testmail@gmail.com",
  "pushTo": { "deviceId": "1850319432|ezetap_android" },
  "mode": "CARD"
}
```

```json
// Response
{
  "success": true,
  "messageCode": null,
  "message": null,
  "errorCode": null,
  "errorMessage": null,
  "realCode": null,
  "apiMessageTitle": null,
  "apiMessage": null,
  "apiMessageText": null,
  "apiWarning": null,
  "p2pRequestId": "190124182233567E010078004"
}
```

The request for `AC2` is identical except `"accountLabel": "AC2"`, and returns
`"p2pRequestId": "190124182233567E010078005"`.

#### Error codes (Pay)

| Error code | Description | Resolution steps |
|---|---|---|
| `EZETAP_0000382` | Device not found — the correct device ID is not passed | Pass the correct device serial number |
| `EZETAP_0000385` | Device is not in the network | Check WiFi connectivity or mobile data, or whether the MPOS app is logged in |
| `EZETAP_0000039` | Payment amount unsupported | Pass the correct value for amount |
| `EZETAP_0000050` | Transaction amount greater than limit | Pass the correct value for amount |
| `EZETAP_0000162` | Transaction amount less than limit | Pass the correct value for amount |
| `EZETAP_0000048` | Payment tip not enabled | Check with the integration team (required only when a tip is collected at payment time) |
| `EZETAP_0000148` | Invalid org — device does not belong to the org | Check with the integration team |
| `EZETAP_0000047` | Payment tip amount error | Check with the integration team (required only when a tip is collected at payment time) |
| `EZETAP_0000387` | `ExternalRefNumber` field is empty | `ExternalRefNumber` is a mandatory parameter — pass a unique reference id |
| `EZETAP_6000001` | No such payment mode exists | Pass the correct payment mode |
| `EZETAP_0000623` | Device is busy with a pending notification | Before initiating a new request, complete or cancel the payment request on the device |

---

### 1.6.2 Status — get notification status

**Description:** API to get the status of a POS Bridge notification sent to an Ezetap
device.

- Demo: `https://demo.ezetap.com/api/3.0/p2padapter/status`
- Production: `https://www.ezetap.com/api/3.0/p2padapter/status`
- Method: `POST` · Headers: `Content-Type: application/json`

> The PDF highlights, in both the POS Bridge and DQR sections: **the `status = AUTHORIZED`
> field is the one to look for in the response.**

#### Request body

| Parameter | Datatype | Description |
|---|---|---|
| `username` | String | Any username (mandatory) |
| `appKey` | String | App key (mandatory) |
| `origP2pRequestId` | String | POS Bridge request ID returned by the Pay API call (mandatory) |

#### Response body

| Parameter | Datatype | Description |
|---|---|---|
| `success` | Boolean | Indicates the notification was found |
| `errorCode` | String(48) | Error code if the notification is not found |
| `errorMessage` | String(256) | Descriptive error message for the above error code. Empty for a successful initiation. |
| `message` | String | Descriptive information about the POS Bridge status; also tells what the current status is |
| `messageCode` | String | Message code, if the notification status is found |

#### Sample request

```json
{
  "username": "<Your username here>",
  "appKey": "<your appKey here>",
  "origP2pRequestId": "<Use the one returned by the pay API>"
}
```

#### Sample success response

```json
{
  "success": true,
  "messageCode": "P2P_DEVICE_TXN_DONE",
  "message": "Transaction done on device, Please look at Txn status.",
  "realCode": "P2P_DEVICE_TXN_DONE",
  "sessionKey": "",
  "username": "",
  "setting": {},
  "apps": [],
  "amount": "",
  "amountAdditional": 0.00,
  "amountOriginal": "",
  "amountCashBack": 0.00,
  "authCode": "",
  "batchNumber": "",
  "cardLastFourDigit": "",
  "currencyCode": "INR",
  "customerName": "",
  "customerMobile": "",
  "customerReceiptUrl": "http:/",
  "deviceSerial": "",
  "externalRefNumber": "",
  "externalRefNumber2": "",
  "externalRefNumber3": "",
  "externalRefNumber4": "",
  "externalRefNumber5": "",
  "externalRefNumbers": [""],
  "formattedPan": "4639-17XX-XXXX-2274",
  "txnId": "22101208102450 2E010066434",
  "latitude": "22.1046222",
  "longitude": "82.1480449",
  "merchantName": "",
  "mid": "",
  "nonceStatus": "OPEN",
  "orgCode": "",
  "merchantCode": "",
  "payerName": "",
  "paymentCardBin": "",
  "paymentCardBrand": "VISA",
  "paymentCardType": "CREDIT",
  "pgInvoiceNumber": "210",
  "postingDate": 1665582029000,
  "processCode": "_DEF_PROC",
  "rrNumber": "RR25071",
  "settlementStatus": "PENDING",
  "status": "AUTHORIZED",
  "states": ["AUTHORIZED"],
  "tid": "22223340",
  "userMobile": "",
  "txnType": "CHARGE",
  "dccOpted": false,
  "cardHolderCurrencyExponent": 0,
  "userAgreement": "I agree to pay as per the card issuer agreement and receive chargeslip by electronic means.",
  "signable": true,
  "voidable": true,
  "refundable": false,
  "chargeSlipDate": "2022-10-12T13:40:29+0530",
  "readableChargeSlipDate": "12/10/2022 13:40:29",
  "cardTxnTypeDesc": "EMV with Online PIN ByPass",
  "issuerCode": "HDFC",
  "maximumPayAttemptsAllowed": 1,
  "maximumSuccessfulPaymentAllowed": 1,
  "noExpiryFlag": false,
  "dxMode": "SERIAL",
  "receiptUrl": "http://d.eze.cc/r/o/R74xNQuJ/",
  "signReqd": true,
  "txnTypeDesc": "Charge",
  "acquirerCode": "DUMMY",
  "additionalParamJson": "{\"\":\"\"}",
  "createdTime": 1665582025000,
  "customerNameAvailable": true,
  "callbackEnabled": false,
  "accountLabel": "",
  "onlineRefundable": false,
  "additionalAmount": 0.00,
  "orderNumber": "",
  "reverseReferenceNumber": "",
  "totalAmount": 0,
  "displayPAN": "",
  "nameOnCard": "",
  "invoiceNumber": "210",
  "cardType": "VISA",
  "tipEnabled": false,
  "callTC": false,
  "acquisitionId": "",
  "acquisitionKey": "",
  "processCronOutput": false,
  "externalDevice": false,
  "tipAdjusted": false,
  "txnMetadata": [],
  "middlewareStanNumber": 0,
  "otpRequired": false,
  "p2pRequestId": "221012081009089E010092433",
  "mode": "CARD",
  "reload": false,
  "redirect": false,
  "twoStepConfirmPreAuth": false
}
```

#### Sample failure response

> **⚠ Source note — read this response carefully.** `success` is `true` and `messageCode`
> is `P2P_DEVICE_TXN_DONE`, yet the card was **declined**. `success` describes whether the
> status *lookup* worked, not whether money moved. Only `"status": "FAILED"` /
> `"AUTHORIZED"` answers that.

```json
{
  "success": true,
  "messageCode": "P2P_DEVICE_TXN_DONE",
  "message": "Transaction done on device, Please look at Txn status.",
  "errorCode": "EZETAP_1000003",
  "errorMessage": "Card Declined. Please try again. If the problem persists, please try another card or contact card issuer.",
  "realCode": "P2P_DEVICE_TXN_DONE",
  "sessionKey": "da3c872e-f922-4b71-a564-b7f0fb05659c",
  "username": "4488221103",
  "setting": {},
  "apps": [],
  "amount": 531.00,
  "amountAdditional": 0.00,
  "amountOriginal": 531.00,
  "amountCashBack": 0.00,
  "authCode": "N/A",
  "batchNumber": "1",
  "cardLastFourDigit": "2274",
  "currencyCode": "AED",
  "customerName": "SHASHANK A",
  "customerReceiptUrl": "",
  "deviceSerial": "0821260712",
  "externalRefNumber": "INVOICE_POS Bridge_070055",
  "formattedPan": "4639-17XX-XXXX-2274",
  "txnId": "2202211303210 31E010836798",
  "merchantName": "Test",
  "mid": "200599999029",
  "nonceStatus": "CLOSED",
  "orgCode": "Test_4952948",
  "merchantCode": "Test_4952948",
  "payerName": "SHASHANK A",
  "paymentCardBin": "463917",
  "paymentCardBrand": "VISA",
  "paymentCardType": "CREDIT",
  "paymentMode": "CARD",
  "pgInvoiceNumber": "2",
  "postingDate": 1645463002000,
  "processCode": "_DEF_PROC",
  "rrNumber": "N/A",
  "settlementStatus": "FAILED",
  "status": "FAILED",
  "states": ["FAILED"],
  "tid": "45200006",
  "userMobile": "4488221103",
  "txnType": "CHARGE",
  "dccOpted": false,
  "cardHolderCurrencyExponent": 0,
  "userAgreement": "",
  "signable": false,
  "voidable": false,
  "refundable": false,
  "chargeSlipDate": "2022-02-21T17:03:22+0400",
  "readableChargeSlipDate": "21/02/2022 17:03:22",
  "cardTxnTypeDesc": "EMV with Online PIN ByPass",
  "issuerCode": "HDFC",
  "maximumPayAttemptsAllowed": 1,
  "maximumSuccessfulPaymentAllowed": 1,
  "noExpiryFlag": false,
  "dxMode": "WIFI",
  "receiptUrl": "",
  "signReqd": false,
  "txnTypeDesc": "Charge",
  "acquirerCode": "MASHREQ",
  "additionalParamJson": "{\"FPIKSN\":\"FFFF005A610623000002\",\"MCC\":\"7399\"}",
  "createdTime": 1645463001000,
  "customerNameAvailable": true,
  "callbackEnabled": false,
  "onlineRefundable": false,
  "additionalAmount": 0.00,
  "orderNumber": "INVOICE_POS Bridge_070055",
  "reverseReferenceNumber": "N/A",
  "totalAmount": 531.00,
  "displayPAN": "2274",
  "nameOnCard": "SHASHANK A",
  "invoiceNumber": "2",
  "cardType": "VISA",
  "tipEnabled": false,
  "callTC": false,
  "acquisitionId": "",
  "acquisitionKey": "",
  "processCronOutput": false,
  "externalDevice": false,
  "tipAdjusted": false,
  "txnMetadata": [],
  "middlewareStanNumber": 0,
  "otpRequired": false,
  "p2pRequestId": "220221130328 0E010067797",
  "redirect": false,
  "reload": false,
  "twoStepConfirmPreAuth": false
}
```

#### Error codes (Status)

| Error code | Description |
|---|---|
| `EZETAP_0000383` | Notification not found for this refNumber |

#### Message codes

| Message code | Description |
|---|---|
| `P2P_DEVICE_RECEIVED` | Notification received on POS device |
| `P2P_DEVICE_SENT` | Notification is sent to the device |
| `P2P_STATUS_QUEUED` | Notification is queued on the server |
| `P2P_STATUS_IN_EXPIRED` | On notification expiration |
| `P2P_DEVICE_TXN_DONE` | Transaction completed on POS device — need to look at txn fields |
| `P2P_STATUS_UNKNOWN` | POS Bridge notification status is in an unknown state |
| `P2P_DEVICE_CANCELED` | POS Bridge notification has been cancelled on the receiving device |
| `P2P_STATUS_IN_CANCELED_FROM_EXTERNAL_SYSTEM` | Cancelled successfully by the POS Bridge Cancel API |

> **NOTE (verbatim from the PDF, pp. 23 & 43):** A success response will have a
> `Message_Code` which tells what the current status of the POS Bridge notification is.
> For any successful transaction please refer to the field called `Status` in the response
> of the status API. **If the `Status = AUTHORIZED` only then the payment is considered as
> successful.**

---

### 1.6.3 Cancel — cancel a notification

**Description:**

- API to cancel a notification that is queued up on the server or has been received on the
  device.
- Cancellation will happen even when the device has received the notification. In such a
  scenario it will prompt the user with a *"notification cancel"* message and remove the
  notification.
- If the device user went on with the flow of taking the PIN (in the case of a card
  transaction), then cancellation only happens on submission of payment, with an error
  prompt *"Notification canceled from billing system"*.
- In the above scenario the cancellation request will be accepted until the device has
  submitted payment. Otherwise it will respond with the `P2P_PAYMENT_INITIATED` error code.

- Demo: `https://demo.ezetap.com/api/3.0/p2padapter/cancel`
- Production: `https://www.ezetap.com/api/3.0/p2padapter/cancel`
- Method: `POST` · Headers: `Content-Type: application/json`

#### Request body

| Parameter | Datatype | Description |
|---|---|---|
| `username` | String | Any username (mandatory) |
| `appKey` | String | App key (mandatory) |
| `origP2pRequestId` | String | Request ID returned by the Pay API call (mandatory) |
| `pushTo` | JSON with `deviceId` as String(250) | Destination info — device id of the POS on which the notification will be sent (mandatory) |

#### Sample request & response

```json
// Request
{
  "username": "<Your username here>",
  "appKey": "<your appKey here>",
  "origP2pRequestId": "190113035348970E0200"
}
```

```json
// Response
{
  "success": true,
  "messageCode": null,
  "message": null,
  "errorCode": null,
  "errorMessage": null,
  "realCode": null,
  "apiMessageTitle": null,
  "apiMessage": null,
  "apiMessageText": null,
  "apiWarning": null,
  "origP2pRequestId": "1901131948341E010055004"
}
```

---

## 1.7 Best practices — the polling sequence

Razorpay suggests the following sequence for calling these APIs.

```
 T = 1s                    T = 30s … 150s                                    after T = 150s
 ──────                    ──────────────                                    ──────────────
 call Pay API   ─────▶  start calling Status API every 10s until the 150th
 to initiate a          second; from the 30th second look for the fields
 transaction            "status" and "messageCode" in your response
                                        │
                        ┌───────────────┴────────────────┐
                        ▼                                ▼
          "status" IS found in the       "status" NOT found in the response
           API response                              │
                        │                            ▼
                        ▼                   check the "messageCode" field
          status = Authorised / failed                │
                        │              ┌──────────────┴───────────────┐
                        │              ▼                              ▼
                        │   messageCode = P2P_DEVICE_CANCELLED    messageCode =
                        │              │                          P2P_DEVICE_RECEIVED
                        │              │                              │
                        ▼              ▼                              ▼
             TXN flow is complete. Calls to Status API can        TXN flow is not
             be stopped. A new TXN can be initiated.              complete — keep
                        ▲                                          calling the Status
                        │                                          API until the 150th
                        │                                          second
                        │                                              │
                        └──────────  call the Cancel API on the 150th second,  ◀────┘
                                     check for the "success" field in the
                                     API response → TXN flow is complete
```

Written out:

- Call the **Pay API** to initiate the transaction.
- Call the **Status Check API** every 10 seconds until the 150th second, starting from the
  30th second. Look for the status API response fields `status` and `messageCode`:
- If the `status` field is **not present**:
  - **Case 1:** if `messageCode = P2P_DEVICE_RECEIVED`, keep calling the status API
    further, until the 150th second, every 10 seconds.
  - **Case 2:** if `messageCode = P2P_DEVICE_CANCELED`, the transaction flow is complete.
    Calls to the status API can be stopped and a new transaction can be initiated.
- If `status = AUTHORIZED` and `messageCode = P2P_DEVICE_TXN_DONE`, the transaction flow is
  complete. Calls to the status API can be stopped and a new transaction can be initiated.
- If `status = FAILED` and `messageCode = P2P_DEVICE_TXN_DONE`, the transaction flow is
  complete. Calls to the status API can be stopped and a new transaction can be initiated.
- If the `status` field is **not present** and `messageCode = P2P_DEVICE_RECEIVED` even on
  the 150th-second instance, then call the **Cancel API** to cancel the notification
  present on the device at that instance.
- **Note:** the time instances above are *suggested best practices from Ezetap and are
  configurable.*

### Action to be taken, by status API response

| `messageCode` | `message` | `status` | Action to be taken | Txn status on Ezetap |
|---|---|---|---|---|
| `P2P_DEVICE_RECEIVED` | Notification has been received on POS Device. | *field not present* | Keep checking the status | Pending |
| `P2P_STATUS_QUEUED` | `P2P_STATUS_QUEUED` | *field not present* | Keep checking the status | Pending |
| `P2P_DEVICE_TXN_DONE` | Transaction done on device, Please look at Txn status. | `EXPIRED` | Stop calling status API | Expired |
| `P2P_DEVICE_TXN_DONE` | Transaction done on device, Please look at Txn status. | `FAILED` | Stop calling status API | Txn Failed |
| `P2P_DEVICE_TXN_DONE` | Transaction done on device, Please look at Txn status. | `AUTHORIZED` | Stop calling status API | **Txn performed successfully** |
| `P2P_DEVICE_CANCELED` | PushToPay Notification has been Canceled on Receiving device. | *field not present* | Stop calling status API | Txn notification has been cancelled |
| `P2P_STATUS_IN_CANCELED_FROM_EXTERNAL_SYSTEM` | PushToPay Notification has been Canceled from Billing/External System. | *field not present* | Stop calling status API | Txn notification has been cancelled |

> **⚠ Source note.** The "Action to be taken" column for the two `Pending` rows reads
> *"Keep checking the status calling Pay API"* in the PDF. That is a typo — the surrounding
> narrative (§1.7 above) says to keep calling the **Status** API. Re-calling Pay would open
> a second payment.

## 1.8 Testing the integration

A detailed testing scenario is a crucial and critical step before roll-out to production.
All payment-related integration features can be tested end-to-end — including failure cases
and PG errors — by using the accompanying amounts in the table below. Pass the amount value
(501, 505, etc.) as mentioned and the corresponding error message is returned.

See [Appendix C](#appendix-c--test-amounts-for-error-simulation).

## 1.9 Solution capabilities

The Ezetap POS Bridge solution works with all of the below platforms:

- Windows
- iOS
- Android
- Linux

## 1.10 Steps to go live

Having confirmed and tested the integration and various scenarios, these are the steps for
going live:

- Procure a production device via the bank / Ezetap as per your agreement.
- Inform Ezetap once the device has been procured.
- The Ezetap team will provide the production App Key — add the production App Key in your
  demo code to the current one.
- Replace the demo URLs with the production URLs.
- Replace your current username and appKey with the ones provided for the production
  environment.

> **Note:** Ezetap's POS Bridge supports Java JDK 1.7 and above. This is due to mandates
> from banks and certifying authorities to support a minimum standard of security
> certifications and ensure secure transactions and support.

### What is needed for go-live

- Ezetap needs a list of users who will access the Portal as well as the Device.
- Who is procuring the SIM cards? Confirm with your procurement team / decision makers who
  will be procuring the devices.
- Shipment address of all the stores where installation has to be done.

---

# 2. DQR — Razorpay POS's integrated Dynamic QR solution

## 2.1 What is the POS's DQR solution?

Razorpay POS has customer-facing **Dynamic QR devices**, wherein Dynamic QRs can be
generated from the billing system in an integrated mode itself. This ensures transparency
and smooth reconciliation of the transaction at the billing system's end.

## 2.2 API details

> All requests and responses are of type `application/json`.

**The endpoints, request bodies, response bodies, error codes and message codes are the
same as POS Bridge** (§1.6). The one difference is the `pushTo.deviceId` suffix and the
`mode`:

| | POS Bridge | DQR |
|---|---|---|
| `pushTo.deviceId` | `"<serial>\|ezetap_android"` | `"<serial>\|razorpay_pos_soundbox"` |
| `mode` | `CARD` / `ALL` / … | `UPI` |

### 2.3 Sample request & response (DQR)

```json
// Request
{
  "username": "",
  "appKey": "",
  "amount": "",
  "accountLabel": "",
  "customerMobileNumber": "",
  "externalRefNumber": "",
  "externalRefNumber2": "",
  "externalRefNumber4": "",
  "externalRefNumbers": [],
  "pushTo": { "deviceId": "<<enter device serial number>>|razorpay_pos_soundbox" },
  "mode": "UPI"
}
```

```json
// Response
{
  "success": true,
  "messageCode": null,
  "message": null,
  "errorCode": null,
  "errorMessage": null,
  "realCode": null,
  "apiMessageTitle": null,
  "apiMessage": null,
  "apiMessageText": null,
  "apiWarning": null,
  "p2pRequestId": ""
}
```

Multi-TID example with `accountLabel`:

```json
{
  "appKey": "demo app key",
  "username": "4444001234",
  "amount": "2100",
  "customerMobileNumber": "",
  "externalRefNumber": "Order ID",
  "externalRefNumber2": "",
  "externalRefNumber3": "",
  "customerEmail": "Testmail@gmail.com",
  "pushTo": { "deviceId": "38230908450035|razorpay_pos_soundbox" },
  "mode": "UPI"
}
```

### 2.4 Error codes (DQR Pay)

The DQR error table adds three device-transport codes to the POS Bridge list:

| Error code | Description |
|---|---|
| `EZETAP_0000382` | Device not found — the correct device ID is not passed |
| `EZETAP_0000381` | Android FCM token not found (Android device) |
| `EZETAP_0000384` | Firebase FCM error (Android device) |
| `EZETAP_0000385` | Device is not in the Network |
| `EZETAP_0000039` | Payment amount unsupported |
| `EZETAP_0000050` | Transaction amount greater than limit |
| `EZETAP_0000162` | Transaction amount less than limit |
| `EZETAP_0000048` | Payment tip not enabled |
| `EZETAP_0000148` | Invalid org — device does not belong to the org |
| `EZETAP_0000047` | Payment tip amount error |
| `EZETAP_0000387` | `ExternalRefNumber` field is empty |
| `EZETAP_6000001` | No such payment mode exists |
| `EZETAP_0000623` | Device is busy with a pending notification |

> **⚠ Source note.** In the PDF's DQR error table (p. 39) the *Resolution Steps* column is
> misaligned against the *Description* column from `EZETAP_0000050` downward — e.g.
> `EZETAP_0000148` ("Invalid Org") is paired with the resolution "ExternalRefNumber is a
> mandatory parameter". Use the POS Bridge table in §1.6.1, which is correctly aligned.

### 2.5 Status and Cancel (DQR)

Identical to §1.6.2 and §1.6.3 — same URLs, same request bodies (`username`, `appKey`,
`origP2pRequestId`, plus `pushTo` for cancel), same response shape, same message codes, and
the same `EZETAP_0000383` error.

> **Please note (verbatim, p. 46):** For the DQR solution, **Best Practices, Integration
> Testing, Solution Capabilities and Steps to Go-Live remain the same as for the POS Bridge
> solution.**

---

# 3. Razorpay POS Android SDK

> **Not applicable to a server-to-server web integration.** This section is transcribed for
> completeness; it requires shipping an Android application. The p2padapter API in §1–§2 is
> the server-to-server alternative.

## 3.1 Introduction

Razorpay POS is a digital payments platform that makes payment acceptance simple and
configurable. This universal payment acceptance platform is a smart, simple, end-to-end
payments platform which is unique in its vision and architecture. It can be deeply
integrated with any enterprise system / sales channel to offer a unified and seamless
payments experience to the end customer.

### Why Razorpay POS SDK?

- Enterprises who have a sales and collection application already built, and would like to
  accept digital payments via the application. Razorpay POS's Android SDKs are available to
  be plugged in to the existing application for payments acceptance.
- This integration is fast and easy, and typically takes around 2–3 days to complete.
- Enterprises can maintain one single application for business process as well as payments,
  and can future-proof their payments capabilities with easy enablement of newer modes of
  payments.
- **NOTE:** the Razorpay POS Android SDK only supports Android version 5.0 and above. This
  is due to PCI DSS compliance.

### What does the Razorpay POS Android SDK do?

The SDK enables an enterprise's field application for universal payments acceptance. It
helps you integrate with the Service Application of Razorpay by calling an API (which can
be initiated via a single "Pay" button on your application). The Razorpay POS Service
Application manages all interactions between the card, the device and the Razorpay POS
server, and encapsulates a smooth user experience during the entire payment cycle.

### Flow

```
 01  Merchant agent logs into the android app integrated with Razorpay SDK
 02  Merchant app fetches the detail from the merchant server
 03  Payment request is sent from SDK to Razorpay server
 4A  Payment authorization  →  4B  Authentication & validation (issuer bank)
 05  Payment response sent back from Razorpay server to app
 06  Updated merchant CRM with payment details
```

### How does the POS Android SDK work?

- Include the SDK in your mobile application to collect digital payments.
- The SDK interfaces with the Razorpay Service Application, which has the pet name
  **Service App**.
- The SDK inspects the availability of the Service App on the Android device and, if not
  present, it will be installed at run-time.
- The Service App interfaces with the card device (in the case of card payments) and the
  Razorpay POS servers to finish payment processing, and notifies the final status to the
  SDK / client app.

```
 Merchant business app  ──01 API call launches the service app──▶  Service app (APK)
        ▲   │                                                            │  │
        │   ▼                                                            │  02 communicates
   Ezetap SDK embedded                                                   │  with Razorpay
   in the merchant app                                                   ▼  ▲
        ▲                                                             Server
        └──04 service app finishes txn processing & notifies the SDK──┘  03 server sends the
                                                                            request back to
                                                                            the service app
```

## 3.2 Getting started with Android SDK integration

Razorpay recommends starting integration in the demo environment, validating the flow and
use cases in your application, then moving to the production environment.

You will receive from the Razorpay POS Solution Consultant, for demo integration:

- App key for authentication
- Credentials to access the demo portal

If you have not received these, share the following with your Sales or Solution Consultant
for a demo-environment account to be created:

- Your organisation's name
- Your organisation's address
- Contact number & email ID

> **Please note:** devices which are in debug mode have a watermark — *"DEBUG only, Not for
> Commercial"* — at the bottom right corner of the screen.

Razorpay POS payments SDK can be integrated with different types of Android SDK such as
Native, React Native, Cordova, etc. Step-by-step guides, a sample app, documentation for
creating a Cordova plugin for Android, and sample code for Native / Cordova / React Native
are on Razorpay's GitHub portal.

### Step 1: Initialising the SDK

The first API to be integrated with is the **Initialize** API. It performs three key
activities and one optional activity:

- Initializes the SDK with global configuration settings.
- Connects to the appropriate Razorpay POS server based on application mode
  (`AppMode = DEMO / PROD`).
- Connects to the appropriate merchant account — this depends on the app key entered.
- *Optionally* invokes `prepareDevice` to initialize the device (card reader) with the
  updated encryption keys from the corresponding bank.

Initialize is the first method to be called. It is recommended to call this method after
the user logs in to your application or, if login is not available, when they reach the
home screen.

### Step 2: Transaction payment response via server-to-server call-back

The transaction response can be provisioned back to the client application using the SDK
itself, via the `onResultActivity` method. However, if the client is looking for transaction
response provisioning in some other way, Razorpay POS can provide a server-to-server
callback for each and every successful transaction. There is a retrial mechanism to retry
posting up to **3 times** if HTTP status 200 is not received as an acknowledgement in the
previous attempts. The client will have to provide an endpoint on which the details will be
sent for successful transactions.

### Step 3: Universal Pay API for payment transaction

Razorpay POS has a universal Pay API through which all the payment modes (that are enabled
for the merchant) can be invoked through a single API call. With this API there is no need
to call the individual methods for different payment modes (Card, Remote Pay, QR, etc.).

### Step 4: Card Payment API for payment via card

In addition to the universal Pay API, a Card Payment API is also available for card-based
payment transactions.

### Step 5: How to identify a successful card transaction

For a card transaction, rely on the **Status field** in the Pay API or Card Payment API
response to identify a successful transaction.

| Status | What it means |
|---|---|
| `Authorized` | Transaction has been successfully executed |
| `Failed` | Transaction has not been executed and has failed; the money won't be deducted in this scenario |
| `Voided` | The transaction was authorized, and has now been voided |
| `Refunded` | The transaction was completed and after which it was refunded |

### APIs for other payment modes

APIs for other payment modes such as UPI, Cash, Cheque, etc. are also available, each
documented on the Razorpay portal (how to prepare input, how to invoke, how to handle the
response, sample request & response):

| API for payment method |
|---|
| Cash |
| Cheque |
| UPI |
| Remote Pay |
| QR Code |
| Wallet |

### Additional APIs for other operations

| API | Usage |
|---|---|
| Service Fee | To add a service fee |
| Accepting Meal Cards | To accept payment via meal cards |
| **Void Payment API** | **To process a refund on the same day** |
| Check for Incomplete Payment | To check for an incomplete transaction |
| Fetch Payment Details | To retrieve the details of a payment transaction |
| Sending Receipts | To send e-receipts via SMS / e-mail |
| Print Receipts | To print receipt / charge-slip / custom slip |
| Close SDK | To exit from the Razorpay POS SDK |

> **⚠ Source note.** *Void Payment* (same-day refund) is an **SDK-only** API. There is no
> refund or void endpoint in the p2padapter (POS Bridge / DQR) API set.

### Print custom receipts, bills, invoices, in any format

Razorpay POS provides a custom print SDK which allows printing of custom bills, invoices
and receipts in addition to the charge slip. Bills can be printed via the device in any
format or layout of your choice.

- Text size: `setTextSize(TypedValue.COMPLEX_UNIT_PX, 15sp)`
- Font family: `lato_bold`

The way to use the print-bitmap function is to arrange the details in XML format, then
generate a bitmap of the same and print it further using the printer SDK.

```java
JSONObject jsonRequest = new JSONObject();
JSONObject jsonImageObj = new JSONObject();
try {
  img.buildDrawingCache();
  Bitmap bmap = img.getDrawingCache();
  String encodedImageData = getEncoded64ImageStringFromBitmap(bmap);
  // Building Image Object
  jsonImageObj.put("imageData", encodedImageData);
  jsonImageObj.put("imageType", "JPEG");
  jsonImageObj.put("height", "");  // optional
  jsonImageObj.put("weight", "");  // optional
  jsonRequest.put("image", jsonImageObj); // Pass this attribute when you have a valid captured signature image
  EzeAPI.printBitmap(this, REQUEST_CODE_PRINT_BITMAP, jsonRequest);
} catch (JSONException e) {
  e.printStackTrace();
}
```

### Error codes (SDK)

Typically you will notice 4 types of errors during transactions:

- Common errors
- Server errors
- PG errors
- SDK errors

The full list of these error codes is available on the Razorpay portal.

### Steps for go-live (SDK)

**Testing the integration.** A detailed testing scenario is a crucial and critical step
before roll-out to production. All payment-related integration features can be tested
end-to-end including failure cases and payment gateway errors. To facilitate this on the
demo environment, Razorpay simulates errors mapped to certain amounts (see
[Appendix C](#appendix-c--test-amounts-for-error-simulation)).

> **Best practice:** Razorpay POS recommends testing at least **50%** of these scenarios to
> conclude your UAT.

**Go-live.** Once you have closed your integration and testing on the DEMO environment, you
should consult the Razorpay POS team and get your integration verified. After Razorpay has
confirmed and tested the integration and various scenarios, you will be eligible to go
live:

- Procure a production device via the bank (only for card payments).
- Inform Razorpay POS once the device has been procured.
- The Razorpay POS team will provide the production App Key — add it in your initialise API
  request.
- Change the App mode to `PROD`, from `DEMO`.

> **Best practice:** Razorpay POS recommends that you perform some test **Re.1**
> transactions and verify the transaction flow, portal information, etc.

---

# Appendix A — Consolidated error codes

| Error code | Description | Appears in |
|---|---|---|
| `EZETAP_0000039` | Payment amount unsupported | Pay (Bridge, DQR) |
| `EZETAP_0000047` | Payment tip amount error | Pay (Bridge, DQR) |
| `EZETAP_0000048` | Payment tip not enabled | Pay (Bridge, DQR) |
| `EZETAP_0000050` | Transaction amount greater than limit | Pay (Bridge, DQR) |
| `EZETAP_0000148` | Invalid org — device does not belong to the org | Pay (Bridge, DQR) |
| `EZETAP_0000162` | Transaction amount less than limit | Pay (Bridge, DQR) |
| `EZETAP_0000381` | Android FCM token not found (Android device) | Pay (DQR) |
| `EZETAP_0000382` | Device not found — the correct device ID is not passed | Pay (Bridge, DQR) |
| `EZETAP_0000383` | Notification not found for this refNumber | Status (Bridge, DQR) |
| `EZETAP_0000384` | Firebase FCM error (Android device) | Pay (DQR) |
| `EZETAP_0000385` | Device is not in the network | Pay (Bridge, DQR) |
| `EZETAP_0000387` | `ExternalRefNumber` field is empty | Pay (Bridge, DQR) |
| `EZETAP_0000623` | Device is busy with a pending notification | Pay (Bridge, DQR) |
| `EZETAP_1000003` | Card declined (seen in the sample failure response) | Status |
| `EZETAP_6000001` | No such payment mode exists | Pay (Bridge, DQR) |
| `P2P_PAYMENT_INITIATED` | Cancel refused — the device has already submitted payment | Cancel |

# Appendix B — Consolidated message codes

| Message code | Description | `status` present? | Terminal? |
|---|---|:---:|:---:|
| `P2P_STATUS_QUEUED` | Notification is queued on the server | No | No |
| `P2P_DEVICE_SENT` | Notification is sent to the device | No | No |
| `P2P_DEVICE_RECEIVED` | Notification received on POS device | No | No |
| `P2P_DEVICE_TXN_DONE` | Transaction completed on POS device — look at txn fields | Yes (`AUTHORIZED` / `FAILED` / `EXPIRED`) | Yes |
| `P2P_STATUS_IN_EXPIRED` | On notification expiration | No | Yes |
| `P2P_DEVICE_CANCELED` | Notification cancelled on the receiving device | No | Yes |
| `P2P_STATUS_IN_CANCELED_FROM_EXTERNAL_SYSTEM` | Cancelled successfully by the Cancel API | No | Yes |
| `P2P_STATUS_UNKNOWN` | Notification status is in an unknown state | No | — |

# Appendix C — Test amounts for error simulation

Pass these values as `amount` on the **demo** environment to trigger the corresponding
error case.

| Amount | Simulated result |
|---|---|
| 408 | Payment gateway takes 3 minutes to respond |
| 410 | Timeout |
| 501 | Call issuer |
| 502 | Call referral |
| 504 | Pick up |
| 505 | Do not honor |
| 508 | Honor with Id |
| 512 | Invalid transaction |
| 513 | Invalid amount |
| 514 | Invalid card number |
| 515 | No such issuer |
| 519 | Try after 1 min |
| 522 | Susp malfunction |
| 523 | Trans fee error |
| 526 | Duplicate record |
| 531 | Declined |
| 533 | Expired card |
| 534 | Suspected card |
| 535 | Contact acquirer |
| 536 | Restricted card |
| 539 | No credit account |
| 542 | Timeout |
| 556 | No card record |
| 561 | Above amount limit |
| 585 | Batch not found |
| 590 | Cutoff in process |
| 591 | Host unavailable |
| 592 | Routing problem |
| 596 | Err — invalid message |
| 598 | Kx required |
| 599 | Session expired |
| 666 | Payment gateway takes 1.5 minutes to respond |

---

*This document has been crafted to offer an in-depth exploration of the integration steps
and artefacts required for Razorpay POS integration. For any additional inquiries, contact
`pos-integrations@razorpay.com`.*
