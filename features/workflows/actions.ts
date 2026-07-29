"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"
import { runs, tasks } from "@trigger.dev/sdk"

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

  // Isolation scope, not global: it is unique per request, so two people
  // starting runs at the same time cannot end up labelled with each other's
  // organization. Set once here and every log below it carries these.
  Sentry.getIsolationScope().setAttributes({
    action: "runWorkflowAction",
    org_id: orgId,
    workflow_id: workflowId,
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
  })

  // Both the id and the graph arrive from the browser, so neither is taken on
  // trust: this confirms the workflow is this organization's before spending a
  // run on it.
  const workflow = await getWorkflow(orgId, workflowId)

  if (!workflow) {
    // Warn rather than error: reaching this means an id that is not this
    // organization's, which is the check doing its job. Worth a record because
    // the canvas only asks for ids it was given, so a burst of these is either
    // a stale tab or someone trying ids.
    Sentry.logger.warn("Run rejected: workflow not in organization")

    throw new Error("Workflow not found")
  }

  // The editor checks this too, for an answer without a round trip. Here it
  // keeps a graph that cannot run from being queued at all, so the caller gets
  // a message rather than a failed run to go and read.
  const validation = validateGraph(graph)

  if (!validation.ok) {
    // The editor checks the same graph before it gets here, so anything landing
    // in this branch means the two disagreed — a bug in one of them, or a tab
    // old enough to predate a rule. That is what makes the issue codes worth
    // recording rather than just the message the caller sees.
    Sentry.logger.warn("Run rejected: graph did not validate", {
      issue_count: validation.issues.length,
      issue_codes: validation.issues.map((issue) => issue.code).join(","),
    })

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

  // The handoff to Trigger.dev, and the last thing this side of the boundary
  // knows about the run. The task itself reports into Trigger.dev's own run
  // log, so this line is what connects a run id there to the request that
  // queued it here — until the two are wired together.
  Sentry.logger.info("Workflow run queued", { run_id: handle.id })

  // The id alone. The handle also carries a token scoped to read this one run,
  // but nothing subscribes that way any more: the page mints one token for the
  // workflow's tag, and everything showing a run reads that single
  // subscription — so the badge and the canvas cannot end up on different runs.
  return { runId: handle.id }
}

/**
 * Cancel one in-flight run of a workflow.
 *
 * Takes the workflow id as well as the run id, and needs both: the run id comes
 * from the browser, and a run id alone says nothing about who is allowed to stop
 * it. Trigger.dev would cancel any run this project's key can reach, so without
 * the pairing below one organization could stop another's run by its id.
 *
 * Cancelling is final — Trigger.dev stops the task, marks the run canceled, and
 * does not retry it — so this is the one action here that ends something rather
 * than starting it. There is nothing to revalidate afterwards: the canvas learns
 * the run stopped through the same tag subscription that showed it running.
 */
export async function cancelRunAction(workflowId: string, runId: string) {
  const { orgId } = await auth()

  if (!orgId) {
    throw new Error("No active organization")
  }

  Sentry.getIsolationScope().setAttributes({
    action: "cancelRunAction",
    org_id: orgId,
    workflow_id: workflowId,
    run_id: runId,
  })

  // First half of the pairing: the workflow has to be this organization's, the
  // same check runWorkflowAction makes before spending a run.
  const workflow = await getWorkflow(orgId, workflowId)

  if (!workflow) {
    Sentry.logger.warn("Cancel rejected: workflow not in organization")

    throw new Error("Workflow not found")
  }

  // Second half: the run has to be one of *that* workflow's. The tag is what
  // says so — it is written when the run is queued and is the same string the
  // canvas subscribes by — so checking it here is what stops a run id from
  // another workflow, or another organization, being cancelled through a
  // workflow the caller does happen to own.
  const run = await runs.retrieve(runId)

  // tags comes back as a string or a list depending on how many there are.
  const tags = Array.isArray(run.tags) ? run.tags : [run.tags]

  if (!tags.includes(workflowRunsTag(workflowId))) {
    Sentry.logger.warn("Cancel rejected: run does not belong to this workflow")

    throw new Error("Run not found")
  }

  await runs.cancel(runId)

  Sentry.logger.info("Workflow run cancelled")
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

  Sentry.getIsolationScope().setAttributes({
    action: "deleteWorkflowAction",
    org_id: orgId,
    workflow_id: workflowId,
  })

  // Scoped to the organization, and the result checked, so an id guessed from
  // outside the org removes nothing — and never reaches the room below.
  const deleted = await deleteWorkflow(orgId, workflowId)

  if (!deleted) {
    Sentry.logger.warn("Delete rejected: workflow not in organization")

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
    // The one place in this file that has to report an error itself. Everywhere
    // else the throw reaches onRequestError; here the whole point is that the
    // action carries on and redirects, so Next.js never sees this and without
    // the capture the orphaned room would be invisible.
    //
    // A workflow that was never opened has no room and lands here as a 404,
    // which is not worth an issue — so that case is separated out and logged
    // instead of captured.
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: unknown }).status)
        : undefined

    if (status === 404) {
      Sentry.logger.info("No Liveblocks room to delete", {
        reason: "workflow was never opened",
      })
    } else {
      Sentry.captureException(error, {
        tags: { surface: "liveblocks", operation: "deleteRoom" },
        // The row is already gone, so this is a storage leak rather than a
        // failed delete — nothing the caller could retry.
        extra: { consequence: "orphaned room, workflow row already deleted" },
      })
    }

    console.error(`Could not delete Liveblocks room ${workflowId}`, error)
  }

  // The workflow list lives in the (dashboard) layout, which sits at "/".
  revalidatePath("/", "layout")

  // redirect() throws NEXT_REDIRECT, so it must stay outside any try/catch.
  redirect("/")
}
