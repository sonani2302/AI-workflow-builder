import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { AppSidebar } from "@/components/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Everything below reads organization-scoped data, starting with the
  // sidebar's workflow list, so gate the whole group here. Redirects to the
  // sign-in URL when there is no session.
  await auth.protect()

  // Workflows belong to an organization, so a member without an active one has
  // nothing to read or create. /choose-organization sits outside this layout,
  // so this cannot loop.
  const { orgId } = await auth()

  if (!orgId) {
    redirect("/choose-organization")
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/*
            Below `md` the sidebar renders as an off-canvas sheet, so its own
            trigger is unreachable while it is closed.
          */}
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 md:hidden">
            <SidebarTrigger />
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
