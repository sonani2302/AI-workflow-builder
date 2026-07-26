import "server-only"

import { Liveblocks } from "@liveblocks/node"

let client: Liveblocks | undefined

/**
 * The Liveblocks server client, shared by the auth endpoints.
 *
 * Built on first use rather than at module scope: the constructor throws when
 * the secret is missing, and at import time that would take a whole route down
 * with it, before the route could even turn an unauthenticated caller away.
 */
export function getLiveblocks() {
  if (!client) {
    if (!process.env.LIVEBLOCKS_SECRET_KEY) {
      throw new Error("LIVEBLOCKS_SECRET_KEY is not set")
    }

    client = new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY })
  }

  return client
}
