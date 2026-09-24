// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://e59e550dbdb5908d56c2577c651e10eb@o4511289378799616.ingest.us.sentry.io/4511289381814273",

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // A service-worker UPDATE check is best-effort and its failure is benign:
  // the already-active worker keeps serving the page, so nothing the person
  // is doing breaks. These were the top user-facing issues in Sentry anyway —
  // group 7459568684 (JAVASCRIPT-NEXTJS-1J, TypeError "An unknown error
  // occurred when fetching the script", 309 events / 23 users) and group
  // 7514970624 (JAVASCRIPT-NEXTJS-41, InvalidStateError, 20 events / 9 users).
  // The caller now catches and warns (components/pwa/sw-update.ts); this is
  // the second layer, for the browsers and extensions that raise the same
  // failure from outside our own call sites.
  ignoreErrors: [/Failed to update a ServiceWorker/],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.05,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
