import "server-only"

import { auth as triggerAuth } from "@trigger.dev/sdk"

import { workflowRunsTag } from "@/features/workflows/lib/run-tag"

// The credential the canvas reads its runs with. Minted on the server, where
// the secret key lives, and handed to the browser scoped to one workflow.

/**
 * How long a minted token lasts.
 *
 * Long enough to outlast the sitting a canvas usually gets, short enough that a
 * token read off the page is not worth much later. It is not long enough to
 * outlast every sitting, which is why the provider mints a new one before this
 * runs out rather than treating the first as good forever — see
 * REFRESH_RUNS_TOKEN_AFTER_MS, which has to stay under it.
 */
export const RUNS_TOKEN_EXPIRATION = "1h"

/**
 * A token that can read every run of one workflow.
 *
 * Read on one tag and nothing else: it reaches every run of this workflow,
 * including ones already going when the page opened, and no run of any other.
 *
 * Held here rather than written out at each call site because there are now two
 * — the page's first render and the refresh that follows it — and a scope or an
 * expiry that drifted between them would be a difference nobody would notice
 * until a canvas had been open for an hour.
 *
 * Says nothing about who is asking. Both callers check that the workflow
 * belongs to the caller's organization first; this only shapes the token.
 */
export function createRunsToken(workflowId: string) {
  return triggerAuth.createPublicToken({
    scopes: { read: { tags: [workflowRunsTag(workflowId)] } },
    expirationTime: RUNS_TOKEN_EXPIRATION,
    // The payload of these runs is the entire graph, and it would be sent again
    // on every update of every run for a canvas that only reads their steps.
    // The tag subscription takes no skipColumns of its own, so the token is the
    // one place this can be said.
    realtime: { skipColumns: ["payload"] },
  })
}
