import * as Sentry from "@sentry/nextjs";

// Sentry runtime instrumentation is skipped in local dev for speed: the
// @sentry/nextjs init pulls in @opentelemetry/instrumentation-* for pg,
// mysql2, tedious, kafkajs, fastify, hono, langchain, openai, anthropic-ai,
// etc., adding 5-15s to every cold dev-server start even though none of
// those drivers are used here. Mirror the build-time gate in next.config.ts
// (which already skips withSentryConfig outside CI).
//
// Run with `npm run dev:sentry` (sets LOCAL_SENTRY=1) when you actually need
// to test Sentry capture locally. CI and Vercel always run with Sentry on.
const sentryEnabled =
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.CI) ||
  Boolean(process.env.LOCAL_SENTRY);

export async function register() {
  if (!sentryEnabled) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Always exported so Next's instrumentation contract is preserved. When
// Sentry.init() never ran (local dev path above), captureRequestError is a
// no-op — it just falls back without raising.
export const onRequestError = Sentry.captureRequestError;
