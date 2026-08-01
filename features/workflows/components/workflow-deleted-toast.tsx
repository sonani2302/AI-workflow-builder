"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import { DELETED_PARAM } from "@/features/workflows/lib/deleted-param"

/**
 * Confirms a delete that happened on a page which no longer exists.
 *
 * The confirmation cannot be shown where the delete was made: the action
 * redirects to the dashboard, so by the time it has succeeded the workflow's
 * page — and any toast raised on it — is gone. So the fact travels in the URL
 * the action redirects to, and the dashboard reads it back.
 *
 * Renders nothing. It is a component only because reading the URL and raising a
 * toast are both client-side, and the dashboard around it is a server component
 * doing no server work.
 */
export function WorkflowDeletedToast() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Presence, not value: the action sets it to "1", but nothing should depend
  // on that being the string it stays.
  const deleted = searchParams.get(DELETED_PARAM) !== null

  useEffect(() => {
    if (!deleted) {
      return
    }

    // A fixed id rather than a ref guarding a one-shot: sonner replaces a toast
    // that carries an id it is already showing instead of stacking a second
    // one. That covers the double-invoked effect of development's strict mode
    // without leaving a latch that would have to be cleared before the next
    // delete could announce itself.
    toast.success("Workflow deleted", { id: "workflow-deleted" })

    // Strips the flag so it announces the delete once and not again on every
    // reload or back-navigation to this URL. replace rather than push, so the
    // dashboard does not appear twice in the history.
    router.replace("/")
  }, [deleted, router])

  return null
}
