"use client"

import * as React from "react"
import { Plus, Workflow } from "lucide-react"

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

// Placeholder data until workflows are wired up to the backend.
const workflows = [
  "dominant-wasp",
  "honest-reindeer",
  "expected-llama",
  "essential-ocelot",
  "creepy-echidna",
  "eastern-silkworm",
  "cultural-lion",
  "proud-weasel",
  "regional-bonobo",
]

export function WorkflowNav() {
  const { state, isMobile } = useSidebar()
  const [activeWorkflow, setActiveWorkflow] = React.useState(workflows[0])

  const workflowList = (
    <SidebarMenu>
      {workflows.map((workflow) => (
        <SidebarMenuItem key={workflow}>
          <SidebarMenuButton
            isActive={workflow === activeWorkflow}
            onClick={() => setActiveWorkflow(workflow)}
          >
            <span>{workflow}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
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
                  <Workflow />
                  <span className="sr-only">Workflows</span>
                </SidebarMenuButton>
                <PopoverContent side="right" align="start">
                  <Button>
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
      <SidebarGroupAction aria-label="New workflow">
        <Plus />
      </SidebarGroupAction>
      <SidebarGroupContent>{workflowList}</SidebarGroupContent>
    </SidebarGroup>
  )
}
