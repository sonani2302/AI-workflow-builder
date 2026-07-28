"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { tasks } from "@trigger.dev/sdk"

import { getLiveblocks } from "@/lib/liveblocks"
import { deleteWorkflow, getWorkflow } from "@/features/workflows/data"
import { workflowRunsTag } from "@/features/workflows/lib/run-tag"
import { validateGraph } from "@/features/workflows/lib/validate-graph"
import type { WorkflowGraph } from "@/features/workflows/nodes/node-registry"

// Type-only: triggering by id keeps the task code out of the Next.js bundle.
import type { runWorkflowTask } from "@/features/workflows/task/run-workflow"

/**
 * Queue a background run for one workflow. Returns the run id instead of
 * waiting for the task, so the caller can subscribe to its progress.
 *
 * The graph comes from the caller because that is where it lives: the canvas
 * is held in Liveblocks storage, and the row's graph column is only written
 * on a save.
 */
export async function runWorkflowAction(
  workflowId: string,
  graph: WorkflowGraph
) {
  const { orgId } = await auth()

  if (!orgId) {
    throw new Error("No active organization")
  }

  // Both the id and the graph arrive from the browser, so neither is taken on
  // trust: this confirms the workflow is this organization's before spending a
  // run on it.
  const workflow = await getWorkflow(orgId, workflowId)

  if (!workflow) {
    throw new Error("Workflow not found")
  }

  // The editor checks this too, for an answer without a round trip. Here it
  // keeps a graph that cannot run from being queued at all, so the caller gets
  // a message rather than a failed run to go and read.
  const validation = validateGraph(graph)

  if (!validation.ok) {
    throw new Error(validation.issues[0].message)
  }

  // Tagged so the canvas can subscribe to this workflow's runs without knowing
  // any run id — including runs it did not start, and ones already going when
  // the page was opened.
  const handle = await tasks.trigger<typeof runWorkflowTask>(
    "run-workflow",
    { workflowId, graph },
    { tags: [workflowRunsTag(workflowId)] }
  )

  // The handle's token is already scoped to read this one run, which is all a
  // realtime subscription needs. It expires after 15 minutes.
  return { runId: handle.id, accessToken: handle.publicAccessToken }
}

/**
 * Delete one workflow along with the room holding its canvas, then send the
 * caller back to the dashboard.
 */
export async function deleteWorkflowAction(workflowId: string) {
  const { orgId } = await auth()

  if (!orgId) {
    throw new Error("No active organization")
  }

  // Scoped to the organization, and the result checked, so an id guessed from
  // outside the org removes nothing — and never reaches the room below.
  const deleted = await deleteWorkflow(orgId, workflowId)

  if (!deleted) {
    throw new Error("Workflow not found")
  }

  // The room id is the workflow id, set when the page created the room.
  //
  // Deleting the row first decides which way this can fail: a problem here
  // strands a room nothing can reach any more, where the other order would
  // empty the canvas out from under a workflow that still exists and still
  // opens. So this only logs — the workflow is gone either way, and there is
  // nothing the caller could do with the error. A workflow that was never
  // opened has no room at all, and lands here as a 404.
  try {
    await getLiveblocks().deleteRoom(workflowId)
  } catch (error) {
    console.error(`Could not delete Liveblocks room ${workflowId}`, error)
  }

  // The workflow list lives in the (dashboard) layout, which sits at "/".
  revalidatePath("/", "layout")

  // redirect() throws NEXT_REDIRECT, so it must stay outside any try/catch.
  redirect("/")
}
