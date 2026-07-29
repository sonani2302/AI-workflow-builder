import * as Sentry from "@sentry/nextjs"

/**
 * Node.js server runtime — loaded by instrumentation.ts.
 *
 * This covers the Next.js side only. The workflow task runs in Trigger.dev,
 * a separate process with its own environment, and is deliberately left
 * uninstrumented here: nothing under features/workflows/task or
 * features/workflows/nodes imports this file, and the shared graph helpers
 * (validate-graph, interpolate) stay free of Sentry so they can keep being
 * bundled into both.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Every trace locally, a tenth of them in production: enough to see which
  // routes are slow without buying a span for every request.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,

  // Turns on Sentry.logger.*, which is a no-op without it. The logs land
  // against the trace they were emitted in, so a run that failed to queue
  // reads in order rather than as scattered lines.
  enableLogs: true,

  // Most of the value of a server stack trace here is the local state around
  // the throw — which orgId, which workflow id.
  includeLocalVariables: true,

  dataCollection: {
    // Clerk's user id, so an issue says who hit it.
    userInfo: true,

    // Off deliberately, and the reason this block is spelled out at all:
    // cookies default to being sent, and Clerk's session cookie is a bearer
    // token. Sending it would put a usable credential in an issue.
    cookies: false,

    httpHeaders: {
      request: { deny: ["authorization", "cookie"] },
      response: { deny: ["set-cookie"] },
    },

    // A run request carries the entire canvas as its body and the Liveblocks
    // endpoints carry member lists. Neither is worth the size or the exposure.
    httpBodies: [],
  },
})
