import * as Sentry from "@sentry/nextjs"

/**
 * Runs once per server instance, before the first request is handled. The
 * runtime decides which init to load, because the two are not
 * interchangeable — the Node config asks for the inspector, which the edge
 * runtime has no way to give it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

/**
 * Every server-side error Next.js catches arrives here — a throw while
 * rendering a server component, in a route handler, in a server action, or in
 * proxy.ts — with the route and the kind of request attached.
 *
 * This is why the call sites below it do not need a try/catch each to be
 * reported. Where one of them does catch, it is because the code carries on
 * afterwards, so Next.js never sees the error and something has to say so
 * explicitly.
 */
export const onRequestError = Sentry.captureRequestError
