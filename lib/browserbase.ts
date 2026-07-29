import "server-only"

import { Browserbase } from "@browserbasehq/sdk"

let client: Browserbase | undefined

/**
 * The Browserbase API client, for the parts of Browserbase that are not browser
 * automation: recordings, replays, live views, logs.
 *
 * The core SDK rather than Stagehand. Stagehand drives a session and knows its
 * id, but it is a browser library and has nothing to say about a session that
 * has already closed — everything read back about one comes from here.
 *
 * server-only, and that is the whole point of the module. This client is built
 * on the secret API key, which is the same key that can open sessions and spend
 * money, so it must never be reachable from a bundle the browser receives. The
 * import throws at build time if a client component ever reaches for it.
 *
 * Built on first use rather than at module scope, matching getLiveblocks: the
 * constructor throws when the key is missing, and at import time that would take
 * a route down before it could turn an unauthenticated caller away.
 */
export function getBrowserbase() {
  if (!client) {
    if (!process.env.BROWSERBASE_API_KEY) {
      throw new Error("BROWSERBASE_API_KEY is not set")
    }

    client = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY })
  }

  return client
}
