"use client"

import { useTransition } from "react"
import Link from "next/link"
import { unstable_rethrow, usePathname } from "next/navigation"
import { Lock, Plus, Workflow as WorkflowIcon } from "lucide-react"
import * as Sentry from "@sentry/nextjs"
import { toast } from "sonner"

import type { Workflow } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useProPlan } from "@/features/workflows/hooks/use-pro-plan"
import { generateSlug } from "@/features/workflows/lib/generate-slug"

export function WorkflowNav({
  workflows,
  createWorkflowAction,
}: {
  workflows: Workflow[]
  createWorkflowAction: (name: string) => Promise<void>
}) {
  const { state, isMobile } = useSidebar()
  const [isPending, startTransition] = useTransition()
  const pathname = usePathname()

  // The broad version of the gate on the Agent node: creating a workflow at all
  // is what the plan buys. As there, isLoaded is the difference between "no" and
  // "not yet known" — a bare !isPro would put a padlock on this button for a
  // moment on every load, for paying organizations included.
  const { isPro, isLoaded, upgrade } = useProPlan()
  const locked = isLoaded && !isPro

  // One handler behind both buttons below, because which of the two things a
  // click does is the entire gate.
  const handleCreate = () => {
    if (locked) {
      upgrade()
      return
    }

    // The action redirects on success, so the pending flag also guards against
    // a double click creating two workflows.
    startTransition(async () => {
      try {
        await createWorkflowAction(generateSlug())
      } catch (error) {
        // The redirect to the new workflow arrives here as a thrown
        // NEXT_REDIRECT, so it goes back to the framework before the pro-plan
        // handling below reads it as a refused create. First line, so nothing
        // after it ever sees a navigation.
        unstable_rethrow(error)

        // Reachable even from a button that is not locked: the action reads the
        // plan off the session token, so an organization that subscribed
        // seconds ago can be pro here and not yet pro there. A message beats
        // the error boundary that an uncaught throw would raise over the
        // sidebar.
        //
        // Logged rather than captured, and the distinction is the point: the
        // throw came out of a server action, so onRequestError already made an
        // issue of it with the server's context attached. A second capture here
        // would be the same fault twice, once with far less to go on. What this
        // adds is the half the server cannot see — that the click was made
        // while the sidebar believed the organization was pro, which is the
        // signal that the two disagreed.
        Sentry.logger.warn("Create workflow failed in the client", {
          surface: "sidebar",
          client_thinks_pro: isPro,
          plan_loaded: isLoaded,
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

  // Same wording on both, and on the tooltip, so the padlock is never the only
  // thing saying why the click did something else.
  const newWorkflowLabel = locked
    ? "Upgrade to pro to create workflows"
    : "New workflow"

  // Shared by the expanded list and the collapsed popover.
  const workflowList = (
    <SidebarMenu>
      {workflows.map((workflow) => {
        const href = `/workflows/${workflow.id}`

        return (
          <SidebarMenuItem key={workflow.id}>
            <SidebarMenuButton
              isActive={pathname === href}
              render={<Link href={href} />}
            >
              <span>{workflow.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )

  // The mobile sidebar always renders expanded inside a sheet.
  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <Popover>
                <SidebarMenuButton render={<PopoverTrigger />}>
                  <WorkflowIcon />
                  <span className="sr-only">Workflows</span>
                </SidebarMenuButton>
                <PopoverContent side="right" align="start">
                  {/* Disabled only while a create is in flight or the plan is
                      still unknown — never because it is locked, since the
                      click is what sends them to the pricing page. */}
                  <Button
                    onClick={handleCreate}
                    disabled={isPending || !isLoaded}
                    title={newWorkflowLabel}
                  >
                    {locked ? <Lock /> : <Plus />}
                    {newWorkflowLabel}
                  </Button>
                  {workflowList}
                </PopoverContent>
              </Popover>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Workflows</SidebarGroupLabel>
      {/* Icon only, so the label has to carry the whole explanation — it is
          both the accessible name and the tooltip. */}
      <SidebarGroupAction
        aria-label={newWorkflowLabel}
        title={newWorkflowLabel}
        onClick={handleCreate}
        disabled={isPending || !isLoaded}
      >
        {locked ? <Lock /> : <Plus />}
      </SidebarGroupAction>
      <SidebarGroupContent>{workflowList}</SidebarGroupContent>
    </SidebarGroup>
  )
}
