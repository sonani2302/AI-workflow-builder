"use server"

import { auth } from "@clerk/nextjs/server"
import { tasks } from "@trigger.dev/sdk"

// Type-only: triggering by id keeps the task code out of the Next.js bundle.
import type { helloWorldTask } from "@/trigger/example"

/**
 * Queue a background run for one workflow. Returns the run id instead of
 * waiting for the task, so the caller can subscribe to its progress.
 */
export async function runWorkflowAction(workflowId: string) {
  const { orgId } = await auth()

  if (!orgId) {
    throw new Error("No active organization")
  }

  const handle = await tasks.trigger<typeof helloWorldTask>("hello-world", {
    message: `Running workflow ${workflowId}`,
  })

  // The handle's token is already scoped to read this one run, which is all a
  // realtime subscription needs. It expires after 15 minutes.
  return { runId: handle.id, accessToken: handle.publicAccessToken }
}
