import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"

import { AppSidebar } from "@/components/app-sidebar"
import { SentryUser } from "@/components/sentry-user"
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
  const { userId, orgId } = await auth()

  if (!orgId) {
    redirect("/choose-organization")
  }

  // Every route under this layout renders through here, so this is the one
  // place identity can be attached once rather than at each call site. The
  // isolation scope is per-request, which is what makes this safe on a server
  // handling several organizations at once — the global scope would let one
  // request's org leak onto another's events.
  //
  // Id only, no email or name: Clerk holds those, and an issue does not need
  // them to be actionable.
  Sentry.setUser({ id: userId ?? undefined })
  Sentry.getIsolationScope().setAttributes({ org_id: orgId })

  return (
    <TooltipProvider>
      {/* The browser half of the identity set above. Renders nothing. */}
      <SentryUser />
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
