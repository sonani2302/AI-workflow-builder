"use client"

import { useTransition } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus, Workflow as WorkflowIcon } from "lucide-react"

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

  // The action redirects on success, so the pending flag also guards against
  // a double click creating two workflows.
  const handleCreate = () => {
    startTransition(async () => {
      await createWorkflowAction(generateSlug())
    })
  }

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
                  <Button onClick={handleCreate} disabled={isPending}>
                    <Plus />
                    New workflow
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
      <SidebarGroupAction
        aria-label="New workflow"
        onClick={handleCreate}
        disabled={isPending}
      >
        <Plus />
      </SidebarGroupAction>
      <SidebarGroupContent>{workflowList}</SidebarGroupContent>
    </SidebarGroup>
  )
}
