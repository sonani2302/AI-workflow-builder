import * as React from "react"
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { WorkflowNav } from "@/features/workflows/components/workflow-nav"
import { listWorkflows } from "@/features/workflows/data"
import { createWorkflowAction } from "@/features/workflows/lib/action"

export async function AppSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { orgId } = await auth()
  const workflows = orgId ? await listWorkflows(orgId) : []

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="h-12 flex-row items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
        <div className="flex min-w-0 flex-1 items-center group-data-[collapsible=icon]:hidden">
          {/*
            Every route below the dashboard is scoped to the active
            organization, so each way of changing it sends the user back to the
            root. Staying put would leave a page that was rendered for the
            previous orgId: a workflow the new organization cannot open, or a
            sidebar listing the old organization's workflows.
          */}
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/"
            afterCreateOrganizationUrl="/"
            afterLeaveOrganizationUrl="/"
          />
        </div>
        <SidebarTrigger className="shrink-0" />
      </SidebarHeader>

      <SidebarContent>
        <WorkflowNav
          workflows={workflows}
          createWorkflowAction={createWorkflowAction}
        />
      </SidebarContent>

      <SidebarFooter className="flex-row items-center group-data-[collapsible=icon]:justify-center">
        <UserButton />
      </SidebarFooter>
    </Sidebar>
  )
}
