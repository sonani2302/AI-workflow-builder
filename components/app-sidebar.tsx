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

export async function AppSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { orgId } = await auth()
  const workflows = orgId ? await listWorkflows(orgId) : []

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="h-12 flex-row items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
        <div className="flex min-w-0 flex-1 items-center group-data-[collapsible=icon]:hidden">
          <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/" />
        </div>
        <SidebarTrigger className="shrink-0" />
      </SidebarHeader>

      <SidebarContent>
        <WorkflowNav workflows={workflows} />
      </SidebarContent>

      <SidebarFooter className="flex-row items-center group-data-[collapsible=icon]:justify-center">
        <UserButton />
      </SidebarFooter>
    </Sidebar>
  )
}
