# Institution × Fee-Head → Razorpay MID Mapping (HDFC live kit)

**Date:** 2026-06-13
**Purpose:** Reference map from each HDFC merchant DBA / MID to the MyJKKN
`(institution_id, fee_head)` routing slot, used to seed `razorpay_accounts`.
**Status:** CONFIRMED 2026-06-13 (A&S=Self; DENTAL-AHS=Allied Health; Trust=SKIP;
UF=University Fee). **All 14 accounts are now staged as DRAFTS** in
`/billing/payment-accounts` (institution + fee-head + MID/TID/DBA set, NO keys —
inert, those institutions use the env fallback until activated). Establishment head
added (D2 done). **To go live:** open the panel → each draft row → "Activate" →
paste that account's key_id / key_secret / webhook_secret → it returns the webhook
URL to configure in Razorpay. (Or fill the seed template below + run the seeder.)

> Routing reminder: a bill routes to its `(institution_id, billing_categories.kind)`
> account; if none, to that institution's **default** account (`fee_head = NULL`);
> if still none, to the **common env** account. So a college only needs fee-head
> rows for heads that have their own MID — everything else uses its default row.

## Mapping (15 rows from the live-kit screenshot — list is truncated, see §Pending)

| # | DBA name | MID | TID | institution_id | institution | fee_head | confidence |
|--|--|--|--|--|--|--|--|
| 1 | JKKN CLG OF ARTS AND SCIENCE AUTONOMOUS | SnzjAmEWfFjEpG | 70508967 | b0b8a724-7c65-4f07-8047-2a38e8100ad5 | Arts & Science (Self) | _(default)_ | ✅ Self (confirmed) |
| 2 | JKK NATTARAJA COLLEGE OF PHARMACY | T0iCX5lDTjrZgl | 70508968 | 5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334 | Pharmacy | _(default)_ | ✅ |
| 3 | SRESAKTHIMAYEIL INS OF NURSING AND RES | T0iCi9WHmycSXF | 70508969 | 70e54e51-9b98-4e07-9534-a85310609bfd | Nursing & Research | _(default)_ | ✅ |
| 4 | JKK NATARAJA DENTAL COLLEGE AND HOSPITAL | T0iCruBUUsTT1q | 70508970 | e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5 | Dental | _(default)_ | ✅ |
| 5 | JKKN CLG OF ENGINEERING AND TECHNOLOGY | T0iD1OQ5bUsesl | 70508971 | 5de4fba1-4564-41ed-8c73-5d948b74b843 | Engineering & Technology | _(default)_ | ✅ |
| 6 | JKK NATTRAJA COLLEGE OF EDUCATION | T0iDBT3lucxfkC | 70508972 | 9380358f-7020-4c23-89c3-e9538b47cf33 | College of Education | _(default)_ | ✅ |
| 7 | JKKN MATRIC HR SEC SCHOOL | T0iDM4tijFESV5 | 70508973 | e04b8a7f-1445-4ef1-92e9-bde3d32b1f44 | Matric Hr Sec School | _(default)_ | ✅ |
| 8 | NATTRAJA VIDHYALYA | T0iDVnArzlIPKo | 70508974 | 29c221d1-b918-4c46-9d67-857273b0b553 | Nattraja Vidhyalya CBSE | _(default)_ | ✅ |
| 9 | JKKN DENTAL CLG AND HOSPITAL-AHS | T0iDhK9sudh6Xl | 70508975 | 9c1554e8-12a2-4b76-a9d6-8242bb05eba1 | Allied Health Sciences | _(default)_ | ✅ AHS (confirmed) |
| 10 | J K K RANGAMMAL CHARITABLE TRUST | T0iDsMKMVPPCcX | 70508976 | — | — | — | ⛔ SKIP (confirmed — not seeded; no student bills route here) |
| 11 | JKKN CLG OF ARTS AND SCI AUTO-BUS FEE | T0iE28PvbVFtnj | 70508977 | b0b8a724-7c65-4f07-8047-2a38e8100ad5 | Arts & Science (Self) | transport | ✅ (Self) |
| 12 | JKKN CLG OF ENG AND TECH-UNIVERSITY FEE | T0iEBcF4dUim9F | 70508978 | 5de4fba1-4564-41ed-8c73-5d948b74b843 | Engineering & Technology | university_fee | ✅ |
| 13 | JKKN DENTAL CLG AND HOSPITAL-UNI FEE | T0iELW5GyxikQf | 70508979 | e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5 | Dental | university_fee | ✅ |
| 14 | SRESAKTHIMAYEIL INS OF NUR AND RES-UF | T0iEV1qA7sBZp9 | 70508980 | 70e54e51-9b98-4e07-9534-a85310609bfd | Nursing & Research | university_fee | ✅ University Fee (confirmed) |
| 15 | JKKN DENTAL CLG AND HOSPITAL-ESTAB FEE | T0iEeTnTGx8pYe | 70508981 | e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5 | Dental | establishment | ✅ head added (D2); needs estab bills tagged to "Establishment Fee" |

Learner / bill volumes (for prioritising): A&S Self 1630/3550, Engineering 1374/720,
Pharmacy 943/1153, Dental 594/729, Nursing 447/286, A&S Aided 387/0, AHS 383/164,
Matric 299/0, NV 157/0, Education 9/7.

## Decisions — resolved 2026-06-13
1. ✅ **#1 / #11 Arts & Science** → **Self** (`b0b8a724`).
2. ✅ **#9 DENTAL-AHS** → **Allied Health Sciences** (`9c1554e8`), settles independently.
3. ✅ **#10 Trust** → **SKIP** (not seeded; no student bills route there).
4. ✅ **#14 "UF"** → **University Fee** (`university_fee`).

Done:
5. ✅ **#15 Establishment** → D2 complete: `establishment` added to `billing_category_kind` + "Establishment Fee" category created (`4b60ed7d-32f4-451e-8c12-8b821f4e01d1`). Included in the seed template below. **Remaining data step:** tag the bills that belong to the Dental establishment MID with the "Establishment Fee" category (via the billing UI), or give the criteria for a backfill — until tagged, those payments route to Dental's default MID.

Still open:
6. **Truncation** → the kit screenshot stops at #15; supply any further rows (other colleges' bus/university/estab, hostel/mess MIDs).

## fee_head vocabulary
`fee_head` is a `billing_categories.kind` value. Current kinds: `application_fee, tuition,
hostel, transport, exam, library, other, university_fee, mess`. `transport` = "bus fee".
`establishment` is NOT yet a kind (D2). `NULL` = the institution default account.

## Seed file template
Copy to the gitignored `razorpay-accounts.seed.json` at repo root, fill `keyId` /
`keySecret` / `webhookSecret` per account from each Razorpay account's dashboard, then
run `npm run seed:razorpay`. 14 accounts (9 college defaults + 3 university-fee + 1 bus-fee + 1 establishment).
Trust (#10) is skipped.

```json
[
  { "institutionId": "b0b8a724-7c65-4f07-8047-2a38e8100ad5", "feeHead": null,            "mid": "SnzjAmEWfFjEpG", "tid": "70508967", "dbaName": "JKKN CLG OF ARTS AND SCIENCE AUTONOMOUS", "label": "Arts & Science (Self)",        "mode": "live", "keyId": "<FILL>", "keySecret": "<FILL>", "webhookSecret": "<FILL>" },
  { "institutionId": "5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334", "feeHead": null,            "mid": "T0iCX5lDTjrZgl", "tid": "70508968", "dbaName": "JKK NATTARAJA COLLEGE OF PHARMACY",      "label": "Pharmacy",                  "mode": "live", "keyId": "<FILL>", "keySecret": "<FILL>", "webhookSecret": "<FILL>" },
  { "institutionId": "70e54e51-9b98-4e07-9534-a85310609bfd", "feeHead": null,            "mid": "T0iCi9WHmycSXF", "tid": "70508969", "dbaName": "SRESAKTHIMAYEIL INS OF NURSING AND RES","label": "Nursing & Research",        "mode": "live", "keyId": "<FILL>", "keySecret": "<FILL>", "webhookSecret": "<FILL>" },
  { "institutionId": "e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5", "feeHead": null,            "mid": "T0iCruBUUsTT1q", "tid": "70508970", "dbaName": "JKK NATARAJA DENTAL COLLEGE AND HOSPITAL","label": "Dental",                  "mode": "live", "keyId": "<FILL>", "keySecret": "<FILL>", "webhookSecret": "<FILL>" },
  { "institutionId": "5de4fba1-4564-41ed-8c73-5d948b74b843", "feeHead": null,            "mid": "T0iD1OQ5bUsesl", "tid": "70508971", "dbaName": "JKKN CLG OF ENGINEERING AND TECHNOLOGY","label": "Engineering & Technology", "mode": "live", "keyId": "<FILL>", "keySecret": "<FILL>", "webhookSecret": "<FILL>" },
  { "institutionId": "9380358f-7020-4c23-89c3-e9538b47cf33", "feeHead": null,            "mid": "T0iDBT3lucxfkC", "tid": "70508972", "dbaName": "JKK NATTRAJA COLLEGE OF EDUCATION",    "label": "College of Education",      "mode": "live", "keyId": "<FILL>", "keySecret": "<FILL>", "webhookSecret": "<FILL>" },
  { "institutionId": "e04b8a7f-1445-4ef1-92e9-bde3d32b1f44", "feeHead": null,            "mid": "T0iDM4tijFESV5", "tid": "70508973", "dbaName": "JKKN MATRIC HR SEC SCHOOL",          "label": "Matric Hr Sec School",      "mode": "live", "keyId": "<FILL>", "keySecret": "<FILL>", "webhookSecret": "<FILL>" },
  { "institutionId": "29c221d1-b918-4c46-9d67-857273b0b553", "feeHead": null,            "mid": "T0iDVnArzlIPKo", "tid": "70508974", "dbaName": "NATTRAJA VIDHYALYA",                 "label": "Nattraja Vidhyalya CBSE",   "mode": "live", "keyId": "<FILL>", "keySecret": "<FILL>", "webhookSecret": "<FILL>" },
  { "institutionId": "9c1554e8-12a2-4b76-a9d6-8242bb05eba1", "feeHead": null,            "mid": "T0iDhK9sudh6Xl", "tid": "70508975", "dbaName": "JKKN DENTAL CLG AND HOSPITAL-AHS",   "label": "Allied Health Sciences",    "mode": "live", "keyId": "<FILL>", "keySecret": "<FILL>", "webhookSecret": "<FILL>" },
  { "institutionId": "b0b8a724-7c65-4f07-8047-2a38e8100ad5", "feeHead": "transport",     "mid": "T0iE28PvbVFtnj", "tid": "70508977", "dbaName": "JKKN CLG OF ARTS AND SCI AUTO-BUS FEE","label": "Arts & Science — Bus Fee", "mode": "live", "keyId": "<FILL>", "keySecret": "<FILL>", "webhookSecret": "<FILL>" },
  { "institutionId": "5de4fba1-4564-41ed-8c73-5d948b74b843", "feeHead": "university_fee", "mid": "T0iEBcF4dUim9F", "tid": "70508978", "dbaName": "JKKN CLG OF ENG AND TECH-UNIVERSITY FEE","label": "Engineering — University Fee","mode":"live","keyId": "<FILL>", "keySecret": "<FILL>", "webhookSecret": "<FILL>" },
  { "institutionId": "e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5", "feeHead": "university_fee", "mid": "T0iELW5GyxikQf", "tid": "70508979", "dbaName": "JKKN DENTAL CLG AND HOSPITAL-UNI FEE","label": "Dental — University Fee",   "mode": "live", "keyId": "<FILL>", "keySecret": "<FILL>", "webhookSecret": "<FILL>" },
  { "institutionId": "70e54e51-9b98-4e07-9534-a85310609bfd", "feeHead": "university_fee", "mid": "T0iEV1qA7sBZp9", "tid": "70508980", "dbaName": "SRESAKTHIMAYEIL INS OF NUR AND RES-UF","label": "Nursing — University Fee",  "mode": "live", "keyId": "<FILL>", "keySecret": "<FILL>", "webhookSecret": "<FILL>" },
  { "institutionId": "e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5", "feeHead": "establishment", "mid": "T0iEeTnTGx8pYe", "tid": "70508981", "dbaName": "JKKN DENTAL CLG AND HOSPITAL-ESTAB FEE","label": "Dental — Establishment Fee","mode": "live", "keyId": "<FILL>", "keySecret": "<FILL>", "webhookSecret": "<FILL>" }
]
```
