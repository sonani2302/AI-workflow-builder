/**
 * The tag every run of one workflow carries.
 *
 * A tag is a contract between two places that never see each other: the action
 * that queues a run writes it, and the canvas subscribes by it. Built here so
 * neither side can drift from the other, and so the token minted to read those
 * runs is scoped to the same string.
 *
 * Its own module rather than living beside either half — the action runs on the
 * server, the subscription in the browser, and this is the one thing they share.
 */
export function workflowRunsTag(workflowId: string) {
  return `workflow:${workflowId}`
}
