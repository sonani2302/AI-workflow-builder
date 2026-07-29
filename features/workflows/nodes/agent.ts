import {
  NodeInputError,
  requirePage,
  type NodeRunContext,
} from "@/features/workflows/nodes/node-contract"

// The executor behind the "agent" registry entry. Act carries out one
// instruction; this is handed a goal and works out the steps itself, looking at
// the page between each one — so a task nobody wants to draw as a dozen nodes
// can be one node and a sentence.

/**
 * How many steps the agent may take before it is stopped.
 *
 * A goal it cannot reach is the case worth bounding: left alone it will keep
 * trying until the run's maxDuration kills the whole workflow, taking every
 * step below it down too and holding a browser session for the full five
 * minutes. Stopping at a cap returns a result instead — completed false — which
 * the steps after it can read.
 *
 * Not a field on the node, because the number is about protecting the run
 * rather than describing the task.
 */
const MAX_STEPS = 20

export type AgentResultSummary = {
  /** Whether the agent finished the task it was given. */
  success: boolean
  /** Its own account of what it did, or of where it got stuck. */
  message: string
  /**
   * Whether it reached its own end rather than being cut off at MAX_STEPS.
   * Apart from success: a task can be abandoned deliberately after looking
   * around — completed, not successful — and one cut off mid-way is neither.
   */
  completed: boolean
}

/**
 * Runs an autonomous, multi-step browser task from a single instruction.
 *
 * No model is named, matching the other Stagehand nodes: the defaults are what
 * the session is already configured with, so inference stays wherever the rest
 * of this workflow's already goes rather than this one node reaching for a
 * provider of its own.
 */
export async function agent(
  context: NodeRunContext,
  values: Record<string, string>
): Promise<AgentResultSummary> {
  const instruction = values.instruction?.trim() ?? ""

  if (!instruction) {
    throw new NodeInputError("Agent needs an instruction to work towards.")
  }

  // The agent looks at the page to decide its first move, so there has to be
  // one. Nothing here opens a page of its own.
  requirePage(context, "Agent")

  const { stagehand } = context
  const result = await stagehand
    .agent()
    .execute({ instruction, maxSteps: MAX_STEPS })

  // Reported rather than thrown on, the same call act makes: an agent that
  // could not finish has still told the workflow something, and whether that is
  // fatal is for the steps below to decide by reading success. The full list of
  // actions it took is left out — it is long, it goes to run metadata and the
  // task's output, and no placeholder is going to want to walk into it.
  return {
    success: result.success,
    message: result.message,
    completed: result.completed,
  }
}
