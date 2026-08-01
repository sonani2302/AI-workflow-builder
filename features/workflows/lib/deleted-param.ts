/**
 * The query flag deleteWorkflowAction redirects with, and the dashboard turns
 * into a "Workflow deleted" toast.
 *
 * Its own module with no directive on it, because the two ends are on opposite
 * sides of the server/client boundary: a value exported from a "use client"
 * module and imported by a server action arrives there as a client reference
 * rather than the string itself, so the constant cannot live beside the toast
 * that reads it.
 */
export const DELETED_PARAM = "deleted"
