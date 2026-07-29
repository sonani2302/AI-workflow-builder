import * as Sentry from "@sentry/nextjs"

/**
 * Browser runtime. Next.js loads this after the document and before React
 * hydrates, so an error thrown during the first render is already covered.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,

  enableLogs: true,

  // A tenth of all sittings, and all of the ones that hit an error. The canvas
  // is a direct-manipulation UI where "it went wrong" is hard to write down,
  // so the replay of the error is worth more here than the sampled baseline.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,

  integrations: [
    Sentry.replayIntegration({
      // Both are the integration's defaults, set out here because a replay of
      // this app frames the privacy question: the canvas shows workflow names,
      // prompts and extracted page content, and cursors carry the names of
      // everyone else in the room.
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  dataCollection: {
    // Clerk's user id, so a replay and an issue can be tied to a person.
    userInfo: true,

    // The Clerk session cookie is readable from here too.
    cookies: false,

    // Keeps graph payloads out of the fetch breadcrumbs the SDK records for
    // the Liveblocks and server-action calls.
    httpBodies: [],
  },
})

/**
 * Ties client-side navigation to the trace it belongs to. Without it a
 * transition between workflows starts a span with no parent, so a slow page
 * cannot be read back to the click that asked for it.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
