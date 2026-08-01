"use client"

import { useTransition } from "react"
import { unstable_rethrow } from "next/navigation"
import { Plus } from "lucide-react"
import * as Sentry from "@sentry/nextjs"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { createWorkflowAction } from "@/features/workflows/lib/action"
import { generateSlug } from "@/features/workflows/lib/generate-slug"

/**
 * The dashboard empty state's "New workflow" button.
 *
 * Its own client component because the page around it is a server component
 * doing no server work — extracting the one interactive part keeps it that way,
 * rather than turning a static empty state into a client bundle for the sake of
 * an onClick.
 *
 * The name is generated here, the same way the sidebar's button does it, so a
 * workflow created from either place is named alike.
 */
export function CreateWorkflowButton() {
  const [isPending, startTransition] = useTransition()

  const handleCreate = () => {
    // The action redirects to the new workflow on success, so the pending flag
    // also stops a second click creating a second workflow in the gap before
    // the navigation lands.
    startTransition(async () => {
      try {
        await createWorkflowAction(generateSlug())
      } catch (error) {
        // The redirect to the new workflow arrives here as a thrown
        // NEXT_REDIRECT, so it goes back to the framework before anything below
        // treats it as a failed create. First line, for the same reason as in
        // the sidebar's copy of this handler.
        unstable_rethrow(error)

        // Already an issue server-side via onRequestError; this only records
        // that the empty state was the surface, which is what tells this button
        // apart from the sidebar's in the logs.
        Sentry.logger.warn("Create workflow failed in the client", {
          surface: "dashboard-empty-state",
          reason: error instanceof Error ? error.message : "unknown",
        })

        toast.error(
          error instanceof Error
            ? error.message
            : "Could not create the workflow"
        )
      }
    })
  }

  return (
    <Button onClick={handleCreate} disabled={isPending}>
      <Plus />
      {isPending ? "Creating…" : "New workflow"}
    </Button>
  )
}
