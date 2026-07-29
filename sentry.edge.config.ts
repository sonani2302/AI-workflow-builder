import * as Sentry from "@sentry/nextjs"

/**
 * Edge runtime — loaded by instrumentation.ts.
 *
 * proxy.ts runs clerkMiddleware on every matched request, so this is what
 * reports a failure there. No includeLocalVariables: that needs the Node
 * inspector, which the edge runtime does not have.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,

  enableLogs: true,

  dataCollection: {
    userInfo: true,

    // Same reasoning as the server config: the Clerk session cookie is a
    // bearer token, and this runtime sees it on every request proxy.ts matches.
    cookies: false,

    httpHeaders: {
      request: { deny: ["authorization", "cookie"] },
      response: { deny: ["set-cookie"] },
    },

    httpBodies: [],
  },
})
