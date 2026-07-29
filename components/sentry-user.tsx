"use client"

import { useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import * as Sentry from "@sentry/nextjs"

/**
 * Puts the signed-in user and their organization on client-side events.
 *
 * The dashboard layout does this for the server, but that scope does not reach
 * the browser: a client error, a log from the canvas, or a session replay would
 * otherwise arrive with no idea who it belonged to. Mounted in the same layout
 * so the two agree on scope — everything under the dashboard, nothing above it.
 *
 * Renders nothing. It is a component rather than a call in some existing one
 * because it needs an effect and Clerk's hook, and because putting it in the
 * layout keeps it from being tied to any one feature's tree.
 *
 * Ids only. Names and emails live in Clerk, and an issue is actionable from an
 * id without moving personal data into a third system.
 */
export function SentryUser() {
  const { isLoaded, userId, orgId } = useAuth()

  useEffect(() => {
    // Nothing until Clerk has resolved: an early write would set a null user
    // and then correct it, and events in between would claim to be anonymous.
    if (!isLoaded) {
      return
    }

    Sentry.setUser(userId ? { id: userId } : null)

    // On the global scope deliberately, unlike the server. There is one user in
    // a browser tab, so there is nothing here for a per-request scope to keep
    // apart — and this has to outlive the render that set it.
    Sentry.getGlobalScope().setAttributes({ org_id: orgId ?? "none" })
  }, [isLoaded, userId, orgId])

  return null
}
