import { Resend } from "resend"

let client: Resend | undefined

/**
 * The Resend client, shared by whatever sends mail.
 *
 * Built on first use rather than at module scope, for the same reason
 * getLiveblocks is: a missing key should fail the call that needed it rather
 * than the import, which happens before anything can decide what to do about it.
 *
 * No `import "server-only"` here, unlike lib/liveblocks.ts, and its absence is
 * deliberate. That package resolves to a module whose only statement is a throw
 * unless the bundler asks for the "react-server" condition — Next does for
 * server components, and the Trigger build that reaches this through the
 * send-email node does not, being an ordinary Node bundle. The marker would take
 * the task down at import, before a single step ran. What keeps the key off the
 * browser is that nothing in a client component imports this, and that Resend's
 * API answers without CORS headers, so a call from the page could not complete
 * even if one were made.
 */
export function getResend() {
  if (!client) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set")
    }

    client = new Resend(process.env.RESEND_API_KEY)
  }

  return client
}
