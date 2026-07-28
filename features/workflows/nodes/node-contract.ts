import type { Stagehand } from "@browserbasehq/stagehand"

// What an executor is handed and what it may throw, kept apart from the
// registry that collects them. The registry imports every executor, so an
// executor reaching back into the registry for these would close a cycle —
// this module is imported by both and imports neither.

/**
 * The browser belongs to the run rather than to any one step: a workflow is a
 * sequence of steps against a single session, so whatever a step navigates to
 * or clicks is what the next step arrives on.
 */
export type NodeRunContext = {
  stagehand: Stagehand
}

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type JsonObject = { [key: string]: JsonValue }

/**
 * The work behind one node. The result is an open record rather than anything
 * narrower because each type reports its own shape — an Open URL says where it
 * landed, an extract says what it read — and the run logs whatever comes back.
 *
 * JSON rather than unknown values, because that record does not stay in
 * process: it is written to the run's metadata and returned as part of the
 * task's output, and both are serialized on the way out.
 */
export type NodeExecutor = (
  context: NodeRunContext,
  values: Record<string, string>
) => Promise<JsonObject>

/**
 * Thrown when a node's own fields are what is wrong — a URL left empty, an
 * address that is not one. Kept apart from the failures that come of the web
 * being unreliable because only one of the two is worth another attempt: a
 * typed-in field will still say the same thing on the retry.
 */
export class NodeInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NodeInputError"
  }
}
